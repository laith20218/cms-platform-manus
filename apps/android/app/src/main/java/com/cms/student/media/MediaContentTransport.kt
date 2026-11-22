package com.cms.student.media

import com.cms.student.security.OfflineCertificatePinning
import com.cms.student.security.OfflineRequestHeaders
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineTransportException
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * Transport seam the [MediaCacheService] talks to; fakes drive the JVM tests.
 *
 * Contract (all methods run on the CALLER's thread — the service executor for
 * downloads, the WebView bridge thread for the bounded on-open re-check):
 *  - [currentEntitlementToken] issues/caches the signed entitlement (`POST entitlements/issue`).
 *  - [isAuthorized] performs a bounded HEAD-style entitlement re-check of the content URL.
 *  - [download] streams the object to [sink] and reports progress; a 401/403 surfaces
 *    as [TransportAuthorizationException], any other failure as an exception.
 */
interface MediaContentTransport {

    /** Signed entitlement token for the current session, or null when it cannot be obtained. */
    fun currentEntitlementToken(): String?

    /**
     * HEAD-style authorization check for `GET {base}/library/{contentId}/content`.
     * Allowed/Denied/Unavailable; never throws.
     */
    fun isAuthorized(contentId: String): AuthorizationResult

    /**
     * Streams the object at `GET {base}/library/{contentId}/content` into [sink].
     * [onProgress] receives 0..100; [isCanceled] is polled between chunks (cooperative
     * cancel — [cancelDownload] sets the flag and the loop aborts with
     * [MediaDownloadCanceledException]). Returns the copied byte count.
     */
    fun download(
        contentId: String,
        sink: () -> OutputStream,
        onProgress: (percent: Int) -> Unit,
        isCanceled: () -> Boolean
    ): Long
}

enum class AuthorizationResult { ALLOWED, DENIED, UNAVAILABLE }

/** 401/403 from the content or entitlement endpoints. */
class TransportAuthorizationException(val statusCode: Int) : RuntimeException("media transport rejected with HTTP $statusCode")

/** Cooperative cancellation signal for in-flight media downloads. */
class MediaDownloadCanceledException : RuntimeException("media download canceled")

/** The 1 GiB cap cannot hold the fresh object even after LRU eviction (see [CacheQuota]). */
class MediaQuotaExceededException : RuntimeException("media cache quota exceeded")

/**
 * HTTPS-only media transport, mirroring [com.cms.student.security.HttpsOfflinePackageClient]:
 * HttpsURLConnection (no redirects, no caches), optional SPKI pinning, and the single
 * header place [OfflineRequestHeaders] — Authorization Bearer + X-Installation-Id +
 * X-Device-Fingerprint — plus the `X-Entitlement` token the library controller requires.
 *
 * The entitlement token is cached in-process and renewed 60s before expiry, exactly
 * like the student-web sessionStorage cache (`entitlement-api.ts`).
 */
class HttpsMediaContentTransport(
    baseApiUrl: String,
    certificatePins: Set<String> = emptySet(),
    private val sessionProvider: () -> OfflineSession?
) : MediaContentTransport {

    private val baseUri: URI = normalizeBaseUri(baseApiUrl)
    private val pinnedSocketFactory = OfflineCertificatePinning.socketFactoryIfPinned(certificatePins)

    @Volatile private var cachedEntitlementToken: String? = null
    @Volatile private var cachedEntitlementExpiryMs: Long = 0L

    override fun currentEntitlementToken(): String? {
        cachedEntitlementToken?.let { token ->
            if (System.currentTimeMillis() < cachedEntitlementExpiryMs) return token
        }
        val session = sessionProvider() ?: return null
        return runCatching {
            val response = jsonRequest("POST", "entitlements/issue", null, session, emptyMap())
            val token = response["token"]?.takeUnless { it.isJsonNull }?.asString?.takeIf(String::isNotBlank)
                ?: return null
            cacheToken(token)
            token
        }.getOrNull()
    }

    override fun isAuthorized(contentId: String): AuthorizationResult = runCatching {
        val session = sessionProvider() ?: return AuthorizationResult.DENIED
        val token = currentEntitlementToken() ?: return AuthorizationResult.DENIED
        val url = contentUrl(contentId)
        val connection = (url.openConnection() as? HttpsURLConnection) ?: return AuthorizationResult.DENIED
        try {
            connection.requestMethod = "HEAD"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = CachePolicy.VERIFY_TIMEOUT_MILLIS
            connection.readTimeout = CachePolicy.VERIFY_TIMEOUT_MILLIS
            connection.useCaches = false
            OfflineCertificatePinning.applyTo(connection, pinnedSocketFactory)
            OfflineRequestHeaders.authenticated(session).forEach { (name, value) -> connection.setRequestProperty(name, value) }
            connection.setRequestProperty(HEADER_ENTITLEMENT, token)
            return when (connection.responseCode) {
                in 200..299 -> AuthorizationResult.ALLOWED
                401, 403 -> AuthorizationResult.DENIED
                else -> AuthorizationResult.UNAVAILABLE
            }
        } finally {
            connection.disconnect()
        }
    }.getOrDefault(AuthorizationResult.UNAVAILABLE)

    override fun download(
        contentId: String,
        sink: () -> OutputStream,
        onProgress: (percent: Int) -> Unit,
        isCanceled: () -> Boolean
    ): Long {
        val session = sessionProvider() ?: throw TransportAuthorizationException(401)
        val token = currentEntitlementToken() ?: throw TransportAuthorizationException(401)
        val url = contentUrl(contentId)
        val connection = (url.openConnection() as? HttpsURLConnection)
            ?: throw OfflineTransportException(message = "Media transport requires HTTPS")
        try {
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = CachePolicy.DOWNLOAD_CONNECT_TIMEOUT_MILLIS
            connection.readTimeout = CachePolicy.DOWNLOAD_READ_TIMEOUT_MILLIS
            connection.useCaches = false
            connection.setRequestProperty("Accept", "*/*")
            OfflineCertificatePinning.applyTo(connection, pinnedSocketFactory)
            OfflineRequestHeaders.authenticated(session).forEach { (name, value) -> connection.setRequestProperty(name, value) }
            connection.setRequestProperty(HEADER_ENTITLEMENT, token)

            val code = connection.responseCode
            if (code == 401 || code == 403) throw TransportAuthorizationException(code)
            if (code !in 200..299) throw OfflineTransportException(code, "Media endpoint rejected request with HTTP $code")

            val expected = connection.contentLengthLong
            var copied = 0L
            connection.inputStream.use { input ->
                sink().use { output ->
                    val buffer = ByteArray(BUFFER_BYTES)
                    while (true) {
                        if (isCanceled()) throw MediaDownloadCanceledException()
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        copied += read
                        if (expected > 0) onProgress(((copied * 100) / expected).toInt().coerceIn(0, 100))
                    }
                }
            }
            onProgress(100)
            return copied
        } catch (error: TransportAuthorizationException) {
            throw error
        } catch (error: MediaDownloadCanceledException) {
            throw error
        } catch (error: Exception) {
            throw OfflineTransportException(cause = error, message = "Media HTTPS transport failed")
        } finally {
            connection.disconnect()
        }
    }

    private fun cacheToken(token: String) {
        val expiryMs = parseEntitlementExpiryMs(token)
        cachedEntitlementToken = token
        cachedEntitlementExpiryMs = expiryMs
    }

    private fun contentUrl(contentId: String): URL = baseUri.resolve("$CONTENT_PATH_PREFIX$contentId/content").toURL()

    private fun jsonRequest(
        method: String,
        relativePath: String,
        body: String?,
        session: OfflineSession,
        extraHeaders: Map<String, String>
    ): JsonObject {
        val url = baseUri.resolve(relativePath).toURL()
        val connection = (url.openConnection() as? HttpsURLConnection)
            ?: throw OfflineTransportException(message = "Media transport requires HTTPS")
        try {
            connection.requestMethod = method
            connection.instanceFollowRedirects = false
            connection.connectTimeout = CachePolicy.DOWNLOAD_CONNECT_TIMEOUT_MILLIS
            connection.readTimeout = CachePolicy.VERIFY_TIMEOUT_MILLIS
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            OfflineCertificatePinning.applyTo(connection, pinnedSocketFactory)
            OfflineRequestHeaders.authenticated(session).forEach { (name, value) -> connection.setRequestProperty(name, value) }
            extraHeaders.forEach { (name, value) -> connection.setRequestProperty(name, value) }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            }
            val code = connection.responseCode
            if (code == 401 || code == 403) throw TransportAuthorizationException(code)
            if (code !in 200..299) throw OfflineTransportException(code, "Media endpoint rejected request with HTTP $code")
            val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            return JsonParser.parseString(text).takeIf { it.isJsonObject }?.asJsonObject
                ?: throw OfflineTransportException(code, "Media endpoint returned invalid JSON")
        } finally {
            connection.disconnect()
        }
    }

    private fun normalizeBaseUri(value: String): URI {
        val parsed = URI(value.trim().let { if (it.endsWith('/')) it else "$it/" })
        require(parsed.scheme == "https" && !parsed.host.isNullOrBlank() && parsed.userInfo == null) {
            "Media API base URL must be an absolute HTTPS URL"
        }
        return parsed
    }

    private companion object {
        const val HEADER_ENTITLEMENT = "X-Entitlement"
        const val CONTENT_PATH_PREFIX = "library/"
        const val BUFFER_BYTES = 64 * 1024

        /** JWT-shaped signed entitlement: `payload.signature`; the payload carries `expiresAt`. */
        fun parseEntitlementExpiryMs(token: String): Long {
            return runCatching {
                val payloadSegment = token.substringBefore('.')
                val normalized = payloadSegment.replace('-', '+').replace('_', '/')
                val padded = normalized.padEnd((normalized.length + 3) / 4 * 4, '=')
                val decoded = java.util.Base64.getDecoder().decode(padded).toString(Charsets.UTF_8)
                val parsed = JsonParser.parseString(decoded).asJsonObject
                val expiresAt = parsed.get("expiresAt")?.takeUnless { it.isJsonNull }?.asString
                    ?: return Long.MAX_VALUE
                val parsedExpiry = java.time.Instant.parse(expiresAt).toEpochMilli()
                if (parsedExpiry <= 0) Long.MAX_VALUE else parsedExpiry - CachePolicy.ENTITLEMENT_RENEWAL_SKEW_SECONDS * 1000
            }.getOrDefault(0L)
        }
    }
}
