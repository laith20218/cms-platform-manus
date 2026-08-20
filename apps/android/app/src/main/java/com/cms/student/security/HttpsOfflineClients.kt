package com.cms.student.security

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.time.Instant
import java.util.UUID
import javax.net.ssl.HttpsURLConnection

/**
 * HTTPS-only implementation of every backend endpoint consumed by the Android Offline flow.
 * Callers must invoke it off the Android main thread. Tokens and envelopes are never logged.
 */
class HttpsOfflinePackageClient(baseApiUrl: String) : IOfflinePackageClient, ISyncClient {
    private val baseUri: URI = normalizeBaseUri(baseApiUrl)
    private val gson = Gson()

    /** Login establishes an in-memory OfflineSession; neither password nor refresh token is persisted here. */
    fun login(phone: String, password: String, installationId: String, deviceName: String?): OfflineSession {
        require(phone.isNotBlank() && password.isNotBlank() && installationId.isNotBlank()) { "Login inputs are required" }
        val body = JsonObject().apply {
            addProperty("phone", phone)
            addProperty("password", password)
            addProperty("deviceFingerprint", installationId)
            deviceName?.takeIf(String::isNotBlank)?.let { addProperty("deviceName", it) }
        }
        val response = unauthenticatedRequest("POST", "auth/login", gson.toJson(body))
        val accessToken = response.requiredString("accessToken")
        val studentId = UUID.fromString(response.getAsJsonObject("user")?.requiredString("id")
            ?: throw OfflineTransportException(message = "Login response omitted student identity"))
        return OfflineSession(studentId, accessToken, installationId)
    }

    override fun issueEntitlement(session: OfflineSession): String {
        val response = request("POST", "entitlements/issue", session, null, emptyMap())
        return response.get("token")?.asString?.takeIf(String::isNotBlank)
            ?: throw OfflineTransportException(message = "Entitlement response did not contain a token")
    }

    override fun download(
        session: OfflineSession,
        entitlementToken: String,
        request: OfflinePackageRequest,
        devicePublicKeySpkiBase64: String
    ): OfflinePackageEnvelope {
        require(entitlementToken.isNotBlank()) { "Entitlement token is required" }
        require(devicePublicKeySpkiBase64.isNotBlank()) { "Android package public key is required" }
        val body = JsonObject().apply {
            addProperty("subjectId", request.subjectId.toString())
            request.examId?.let { addProperty("examId", it.toString()) }
        }
        val response = request(
            "POST",
            "offline/download",
            session,
            gson.toJson(body),
            mapOf(
                "X-Entitlement" to entitlementToken,
                "X-Idempotency-Key" to request.idempotencyKey,
                "X-Offline-Package-Public-Key" to devicePublicKeySpkiBase64
            )
        )
        return parseEnvelope(response)
    }

    override fun sync(session: OfflineSession, request: OfflineSyncRequest): OfflineSyncResult {
        val body = JsonObject().apply {
            addProperty("packageId", request.packageId.toString())
            request.examSessionId?.let { addProperty("examSessionId", it.toString()) }
            add("answers", gson.toJsonTree(request.answers.map { answer ->
                mapOf(
                    "questionId" to answer.questionId.toString(),
                    "selectedOptionId" to answer.selectedOptionId.toString(),
                    "durationSeconds" to answer.durationSeconds,
                    "answeredAt" to answer.answeredAt.toString(),
                    // The server, not the client, calculates correctness. This field is kept false.
                    "isCorrect" to false
                )
            }))
        }
        val response = request(
            "POST",
            "offline/sync",
            session,
            gson.toJson(body),
            mapOf("X-Idempotency-Key" to request.idempotencyKey)
        )
        return OfflineSyncResult(
            totalSynced = response.requiredInt("totalSynced"),
            successCount = response.requiredInt("successCount"),
            failedCount = response.requiredInt("failedCount"),
            errors = response.getAsJsonArray("errors")?.mapNotNull { if (it.isJsonPrimitive) it.asString else null } ?: emptyList()
        )
    }

    fun status(session: OfflineSession, packageId: UUID): OfflinePackageStatus {
        val response = request("GET", "offline/packages/$packageId/status", session, null, emptyMap())
        return OfflinePackageStatus(
            packageId = UUID.fromString(response.requiredString("packageId")),
            status = response.requiredString("status"),
            expiresAt = Instant.parse(response.requiredString("expiresAt")),
            revokedAt = response.get("revokedAt")?.takeUnless { it.isJsonNull }?.asString?.let(Instant::parse),
            confirmedAt = Instant.parse(response.requiredString("confirmedAt"))
        )
    }

    private fun unauthenticatedRequest(method: String, relativePath: String, body: String): JsonObject {
        val url = baseUri.resolve(relativePath).toURL()
        val connection = (url.openConnection() as? HttpsURLConnection)
            ?: throw OfflineTransportException(message = "Authentication transport requires HTTPS")
        try {
            connection.requestMethod = method
            connection.instanceFollowRedirects = false
            connection.connectTimeout = CONNECT_TIMEOUT_MILLIS
            connection.readTimeout = READ_TIMEOUT_MILLIS
            connection.useCaches = false
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            val code = connection.responseCode
            if (code !in 200..299) {
                connection.errorStream?.close()
                throw OfflineTransportException(code, "Authentication endpoint rejected request with HTTP $code")
            }
            val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            return JsonParser.parseString(text).takeIf { it.isJsonObject }?.asJsonObject
                ?: throw OfflineTransportException(code, "Authentication endpoint returned invalid JSON")
        } catch (error: OfflineTransportException) {
            throw error
        } catch (error: Exception) {
            throw OfflineTransportException(cause = error, message = "Authentication HTTPS transport failed")
        } finally {
            connection.disconnect()
        }
    }

    private fun request(
        method: String,
        relativePath: String,
        session: OfflineSession,
        body: String?,
        extraHeaders: Map<String, String>
    ): JsonObject {
        if (session.accessToken.isBlank() || session.installationId.isBlank()) {
            throw OfflineTransportException(message = "Authenticated installation session is required")
        }
        val url = baseUri.resolve(relativePath).toURL()
        val connection = (url.openConnection() as? HttpsURLConnection)
            ?: throw OfflineTransportException(message = "Offline transport requires HTTPS")
        try {
            connection.requestMethod = method
            connection.instanceFollowRedirects = false
            connection.connectTimeout = CONNECT_TIMEOUT_MILLIS
            connection.readTimeout = READ_TIMEOUT_MILLIS
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Authorization", "Bearer ${session.accessToken}")
            connection.setRequestProperty("X-Installation-Id", session.installationId)
            extraHeaders.forEach { (name, value) ->
                if (value.isBlank()) throw OfflineTransportException(message = "Required Offline request header is blank")
                connection.setRequestProperty(name, value)
            }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            }
            val code = connection.responseCode
            if (code !in 200..299) {
                connection.errorStream?.close()
                throw OfflineTransportException(code, "Offline endpoint rejected request with HTTP $code")
            }
            val contentType = connection.contentType.orEmpty().lowercase()
            if (!contentType.startsWith("application/json")) throw OfflineTransportException(code, "Offline endpoint returned an unexpected content type")
            val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            return JsonParser.parseString(text).takeIf { it.isJsonObject }?.asJsonObject
                ?: throw OfflineTransportException(code, "Offline endpoint returned an invalid JSON object")
        } catch (error: OfflineTransportException) {
            throw error
        } catch (error: Exception) {
            throw OfflineTransportException(cause = error, message = "Offline HTTPS transport failed")
        } finally {
            connection.disconnect()
        }
    }

    private fun parseEnvelope(response: JsonObject): OfflinePackageEnvelope {
        val manifestObject = response.getAsJsonObject("manifest")
            ?: throw OfflineTransportException(message = "Offline download response omitted manifest")
        val manifest = OfflinePackageManifest(
            packageId = UUID.fromString(manifestObject.requiredString("packageId")),
            userId = UUID.fromString(manifestObject.requiredString("userId")),
            installationId = manifestObject.requiredString("installationId"),
            contentVersion = manifestObject.requiredInt("contentVersion"),
            allowedSubjects = manifestObject.getAsJsonArray("allowedSubjects")?.map { UUID.fromString(it.asString) } ?: emptyList(),
            issuedAt = Instant.parse(manifestObject.requiredString("issuedAt")),
            expiresAt = Instant.parse(manifestObject.requiredString("expiresAt")),
            nonceBase64Url = manifestObject.requiredString("nonceBase64Url"),
            aadHashBase64Url = manifestObject.requiredString("aadHashBase64Url"),
            signatureBase64Url = manifestObject.requiredString("signatureBase64Url")
        )
        val envelope = OfflinePackageEnvelope(
            manifest = manifest,
            ciphertextBase64Url = response.requiredString("ciphertextBase64Url"),
            tagBase64Url = response.requiredString("tagBase64Url"),
            wrappedKeyBase64Url = response.requiredString("wrappedKeyBase64Url"),
            keyReleaseToken = response.requiredString("keyReleaseToken")
        )
        if (manifest.packageId != UUID.fromString(response.requiredString("packageId"))) {
            throw OfflineTransportException(message = "Offline response package identifier mismatch")
        }
        return envelope
    }

    private fun JsonObject.requiredString(name: String): String = get(name)?.takeUnless { it.isJsonNull }?.asString?.takeIf(String::isNotBlank)
        ?: throw OfflineTransportException(message = "Offline JSON field '$name' is missing")

    private fun JsonObject.requiredInt(name: String): Int = get(name)?.takeUnless { it.isJsonNull }?.asInt
        ?: throw OfflineTransportException(message = "Offline JSON field '$name' is missing")

    private fun normalizeBaseUri(value: String): URI {
        val parsed = URI(value.trim().let { if (it.endsWith('/')) it else "$it/" })
        require(parsed.scheme == "https" && !parsed.host.isNullOrBlank() && parsed.userInfo == null) { "Offline API base URL must be an absolute HTTPS URL" }
        return parsed
    }

    private companion object {
        const val CONNECT_TIMEOUT_MILLIS = 10_000
        const val READ_TIMEOUT_MILLIS = 15_000
    }
}

/** Authenticated status endpoint adapter consumed by OfflineRevocationRefresher. */
class AuthenticatedOfflinePackageStatusApi(
    private val client: HttpsOfflinePackageClient,
    private val sessionProvider: () -> OfflineSession?
) : OfflinePackageStatusApi {
    override fun getStatus(packageId: UUID, installationId: String): OfflinePackageStatus {
        val session = sessionProvider() ?: throw OfflineTransportException(message = "Offline session is unavailable")
        if (session.installationId != installationId) throw OfflineTransportException(message = "Offline status installation mismatch")
        return client.status(session, packageId)
    }
}
