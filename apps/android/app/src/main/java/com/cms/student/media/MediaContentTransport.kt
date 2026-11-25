package com.cms.student.media

import com.cms.student.security.OfflineCertificatePinning
import com.cms.student.security.OfflineRequestHeaders
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineTransportException
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.io.OutputStream
import java.net.URI
import java.net.URL
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.HttpsURLConnection

/**
 * Transport seam the [MediaCacheService] (and, since Wave 5b-i, the hosted
 * course-episode bridge service through its adapter) talks to; fakes drive the
 * JVM tests.
 *
 * Contract (all methods run on the CALLER's thread — the service executor for
 * downloads, the WebView bridge thread for the bounded on-open re-check):
 *  - [currentEntitlementToken] issues/caches the signed entitlement (`POST entitlements/issue`).
 *  - [isAuthorized] performs a bounded HEAD-style entitlement re-check of the content URL.
 *  - [download] streams the object to [sink] and reports progress; a 401/403 surfaces
 *    as [TransportAuthorizationException], any other failure as an exception.
 *
 * Wave 5b-i adds the frozen hosted-course route: [ContentSource.COURSE_EPISODE]
 * targets `GET {base}/media/course-episode/{id}/content` — identical header and
 * entitlement flow, with one extension: course entitlement issuance carries the
 * EPISODE'S SUBJECT id (the library flow relies on the student-wide token; the
 * course-episode gate validates the entitlement against the course's subject,
 * so the issue call sends `{"subjectId":"<uuid>"}` — the caller supplies it via
 * the [download]/[isAuthorized] subjectId parameter). The legacy four-argument
 * [download]/[isAuthorized] signatures delegate to the new overloads with
 * [ContentSource.LIBRARY] and no subject — the library path is byte-for-byte
 * unchanged.
 */
interface MediaContentTransport {

    /** Signed entitlement token for the current session, or null when it cannot be obtained. */
    fun currentEntitlementToken(): String?

    /**
     * Server-issued expiry (`expiresAt` claim) of the current signed entitlement, or
     * null when the token carries none / cannot be obtained. Persisted with the cache
     * entry as [MediaCacheEntry.entitlementExpiresAt] — the ONLY offline-open bound
     * under the durable policy (Owner decision 2026-11-23).
     */
    fun currentEntitlementExpiresAt(): Instant?

    /**
     * HEAD-style authorization check for `GET {base}/library/{contentId}/content`.
     * Allowed/Denied/Unavailable; never throws. Delegates to the source-aware
     * overload with [ContentSource.LIBRARY].
     */
    fun isAuthorized(contentId: String): AuthorizationResult =
        isAuthorized(ContentSource.LIBRARY, contentId, subjectId = null)

    /**
     * HEAD-style authorization check for the content URL of [source]:
     * LIBRARY → `library/{contentId}/content`; COURSE_EPISODE →
     * `media/course-episode/{contentId}/content` (subject-scoped entitlement).
     * Allowed/Denied/Unavailable; never throws.
     */
    fun isAuthorized(source: ContentSource, contentId: String, subjectId: UUID?): AuthorizationResult

    /**
     * Streams the object at `GET {base}/library/{contentId}/content` into [sink].
     * Delegates to the source-aware overload with [ContentSource.LIBRARY].
     * [onProgress] receives 0..100; [isCanceled] is polled between chunks (cooperative
     * cancel — the loop aborts with [MediaDownloadCanceledException]). Returns the
     * copied byte count.
     */
    fun download(
        contentId: String,
        sink: () -> OutputStream,
        onProgress: (percent: Int) -> Unit,
        isCanceled: () -> Boolean
    ): Long = download(ContentSource.LIBRARY, contentId, subjectId = null, sink = sink, onProgress = onProgress, isCanceled = isCanceled)

    /**
     * Streams the object of [source] into [sink] — same headers (Bearer,
     * X-Installation-Id, X-Device-Fingerprint, X-Entitlement), same entitlement
     * issue/renew flow, same 401/403 mapping, same cooperative cancel and 64 KB
     * buffer loop as the library path. [subjectId] is REQUIRED-in-practice for
     * COURSE_EPISODE (entitlement issuance is subject-scoped there); it is ignored
     * for LIBRARY. [onContentType] receives the server MIME of the response (used
     * for display metadata only). Returns the copied byte count.
     */
    fun download(
        source: ContentSource,
        contentId: String,
        subjectId: UUID?,
        sink: () -> OutputStream,
        onProgress: (percent: Int) -> Unit,
        isCanceled: () -> Boolean,
        onContentType: (String) -> Unit = {}
    ): Long
}

/**
 * Which frozen content route a download/authorization targets:
 *  - [LIBRARY] → `GET {base}/library/{id}/content` (Batch 4 media cache).
 *  - [COURSE_EPISODE] → `GET {base}/media/course-episode/{id}/content`
 *    (Wave 5b-i hosted course episodes).
 */
enum class ContentSource(val pathPrefix: String) {
    LIBRARY("library"),
    COURSE_EPISODE("media/course-episode")
}

/**
 * Pure URL builder for the two frozen content routes (JVM-tested):
 * `LIBRARY` → `{base}/library/{id}/content`;
 * `COURSE_EPISODE` → `{base}/media/course-episode/{id}/content`.
 * The base is normalized to end with exactly one `/`; ids are UUID-validated
 * upstream, so no path tricks can enter here.
 */
internal fun buildContentUrl(base: String, source: ContentSource, contentId: String): String {
    val normalized = base.trim().let { if (it.endsWith('/')) it else "$it/" }
    return "$normalized${source.pathPrefix}/$contentId/content"
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
 * like the student-web sessionStorage cache (`entitlement-api.ts`). Wave 5b-i: the
 * cache is keyed per entitlement scope — the library-wide token, plus one
 * subject-scoped token per course subject (`POST entitlements/issue` with a
 * `{"subjectId":"<uuid>"}` body for the course-episode route).
 */
class HttpsMediaContentTransport(
    baseApiUrl: String,
    certificatePins: Set<String> = emptySet(),
    private val sessionProvider: () -> OfflineSession?
) : MediaContentTransport {

    private val baseUri: URI = normalizeBaseUri(baseApiUrl)
    private val pinnedSocketFactory = OfflineCertificatePinning.socketFactoryIfPinned(certificatePins)

    /** Signed-token cache per entitlement scope ("library" | "subject:{uuid}"). */
    private val entitlementCache = ConcurrentHashMap<String, CachedEntitlement>()

    private class CachedEntitlement(val token: String, val renewalBoundaryMs: Long)

    override fun currentEntitlementToken(): String? = currentEntitlementToken(null)

    /**
     * Subject-scoped token for the course-episode route (null subject = the
     * library-wide token). Null when no session exists or issuance fails.
     */
    fun currentEntitlementToken(subjectId: UUID?): String? {
        val scope = entitlementScope(subjectId)
        entitlementCache[scope]?.let { cached ->
            if (System.currentTimeMillis() < cached.renewalBoundaryMs) return cached.token
        }
        val session = sessionProvider() ?: return null
        return runCatching {
            val body = subjectId?.let { """{"subjectId":"$it"}""" }
            val response = jsonRequest("POST", "entitlements/issue", body, session, emptyMap())
            val token = response["token"]?.takeUnless { it.isJsonNull }?.asString?.takeIf(String::isNotBlank)
                ?: return null
            entitlementCache[scope] = CachedEntitlement(token, parseEntitlementExpiryMs(token))
            token
        }.getOrNull()
    }

    override fun currentEntitlementExpiresAt(): Instant? = currentEntitlementExpiresAt(null)

    /** Server-issued expiry of the subject-scoped (or library-wide) entitlement token. */
    fun currentEntitlementExpiresAt(subjectId: UUID?): Instant? = runCatching {
        val token = currentEntitlementToken(subjectId) ?: return null
        parseEntitlementExpiresAt(token)
    }.getOrNull()

    override fun isAuthorized(source: ContentSource, contentId: String, subjectId: UUID?): AuthorizationResult = runCatching {
        val session = sessionProvider() ?: return AuthorizationResult.DENIED
        val token = currentEntitlementToken(subjectId) ?: return AuthorizationResult.DENIED
        val url = URI(buildContentUrl(baseUri.toString(), source, contentId)).toURL()
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
        source: ContentSource,
        contentId: String,
        subjectId: UUID?,
        sink: () -> OutputStream,
        onProgress: (percent: Int) -> Unit,
        isCanceled: () -> Boolean,
        onContentType: (String) -> Unit
    ): Long {
        val session = sessionProvider() ?: throw TransportAuthorizationException(401)
        val token = currentEntitlementToken(subjectId) ?: throw TransportAuthorizationException(401)
        val url = URI(buildContentUrl(baseUri.toString(), source, contentId)).toURL()
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

            connection.getHeaderField("Content-Type")?.takeIf { it.isNotBlank() }?.let(onContentType)
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

    private fun entitlementScope(subjectId: UUID?): String =
        subjectId?.let { "subject:$it" } ?: "library"

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
        const val BUFFER_BYTES = 64 * 1024

        /** JWT-shaped signed entitlement: `payload.signature`; the payload carries `expiresAt`. */
        fun parseEntitlementExpiryMs(token: String): Long {
            return runCatching {
                val expiresAt = parseEntitlementExpiresAt(token) ?: return Long.MAX_VALUE
                val parsedExpiry = expiresAt.toEpochMilli()
                if (parsedExpiry <= 0) Long.MAX_VALUE else parsedExpiry - CachePolicy.ENTITLEMENT_RENEWAL_SKEW_SECONDS * 1000
            }.getOrDefault(0L)
        }

        /** Raw server-issued `expiresAt` claim (no renewal skew) — the durable offline bound. */
        fun parseEntitlementExpiresAt(token: String): Instant? {
            return runCatching {
                val payloadSegment = token.substringBefore('.')
                val normalized = payloadSegment.replace('-', '+').replace('_', '/')
                val padded = normalized.padEnd((normalized.length + 3) / 4 * 4, '=')
                val decoded = java.util.Base64.getDecoder().decode(padded).toString(Charsets.UTF_8)
                val parsed = JsonParser.parseString(decoded).asJsonObject
                parsed.get("expiresAt")?.takeUnless { it.isJsonNull }?.asString
                    ?.takeIf(String::isNotBlank)
                    ?.let { Instant.parse(it) }
            }.getOrNull()
        }
    }
}
