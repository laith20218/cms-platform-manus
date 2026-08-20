package com.cms.student.security

import java.time.Instant
import java.util.UUID

/** The encrypted backend envelope. It never contains plaintext questions or a raw package AES key. */
data class OfflinePackageEnvelope(
    val manifest: OfflinePackageManifest,
    val ciphertextBase64Url: String,
    val tagBase64Url: String,
    val wrappedKeyBase64Url: String,
    val keyReleaseToken: String
)

data class OfflinePackageManifest(
    val packageId: UUID,
    val userId: UUID,
    val installationId: String,
    val contentVersion: Int,
    val allowedSubjects: List<UUID>,
    val issuedAt: Instant,
    val expiresAt: Instant,
    val nonceBase64Url: String,
    val aadHashBase64Url: String,
    val signatureBase64Url: String
)

enum class RevocationStatus { ACTIVE, REVOKED, UNKNOWN }

/**
 * Production trust contracts. Each is consumed by OfflineRuntimeCoordinator; no contract is a
 * stand-alone marker. Compatibility aliases below preserve the Phase 45 verifier test vectors.
 */
fun interface IManifestSignatureVerifier { fun verify(manifest: OfflinePackageManifest): Boolean }
fun interface IKeyReleaseTokenVerifier { fun verify(envelope: OfflinePackageEnvelope): Boolean }
fun interface IRevocationStatusProvider { fun status(packageId: UUID): RevocationStatus }
fun interface IPackageKeyProvider {
    /** Calls [use] with a transient 32-byte package key and must wipe it before returning. */
    fun withPackageKey(envelope: OfflinePackageEnvelope, use: (ByteArray) -> ByteArray): ByteArray?
}

/** Backwards-compatible names used by the pre-existing verifier and contract tests. */
typealias ManifestSignatureVerifier = IManifestSignatureVerifier
typealias KeyReleaseTokenVerifier = IKeyReleaseTokenVerifier
typealias RevocationStatusProvider = IRevocationStatusProvider
typealias PackageKeyProvider = IPackageKeyProvider

/** The only decryptor consumed by the app flow. A null result is a security rejection. */
fun interface IOfflinePackageDecryptor {
    fun decrypt(
        envelope: OfflinePackageEnvelope,
        userId: UUID,
        installationId: String,
        subjectId: UUID,
        now: Instant
    ): ByteArray?
}

data class OfflineQuestionOption(val id: UUID, val letter: String, val text: String)
data class OfflineQuestion(
    val id: UUID,
    val text: String,
    val type: String,
    val difficulty: String,
    val tags: List<String>,
    val options: List<OfflineQuestionOption>
)

data class OfflineAnswer(
    val localAttemptId: UUID,
    val packageId: UUID,
    val questionId: UUID,
    val selectedOptionId: UUID,
    val answeredAt: Instant,
    val durationSeconds: Int,
    val installationId: String,
    val synced: Boolean = false
)

data class OfflineSession(
    val studentId: UUID,
    val accessToken: String,
    val installationId: String
)

data class OfflinePackageStatus(
    val packageId: UUID,
    val status: String,
    val expiresAt: Instant,
    val revokedAt: Instant?,
    val confirmedAt: Instant
)

/** Persisted only inside the authenticated, installation-bound encrypted file store. */
data class StoredOfflinePackage(
    val version: Int,
    val envelope: OfflinePackageEnvelope,
    val lastConfirmedStatus: RevocationStatus,
    val lastConfirmedAt: Instant?,
    val answers: List<OfflineAnswer>
)

interface IOfflinePackageStore {
    fun saveEnvelope(envelope: OfflinePackageEnvelope, userId: UUID, installationId: String)
    fun load(packageId: UUID, userId: UUID, installationId: String): StoredOfflinePackage?
    fun replaceQuestionIndex(packageId: UUID, questionIds: Collection<UUID>, userId: UUID, installationId: String)
    fun recordAnswer(answer: OfflineAnswer, userId: UUID, installationId: String): Boolean
    fun pendingAnswers(packageId: UUID, userId: UUID, installationId: String): List<OfflineAnswer>
    fun markAnswersSynced(packageId: UUID, localAttemptIds: Collection<UUID>, userId: UUID, installationId: String)
    fun updateConfirmedStatus(packageId: UUID, status: RevocationStatus, confirmedAt: Instant?, userId: UUID, installationId: String)
    fun invalidate(packageId: UUID, userId: UUID, installationId: String)
}

data class OfflinePackageRequest(val subjectId: UUID, val examId: UUID? = null, val idempotencyKey: String)
data class OfflineSyncRequest(val packageId: UUID, val examSessionId: UUID?, val idempotencyKey: String, val answers: List<OfflineAnswer>)

data class OfflineSyncResult(val totalSynced: Int, val successCount: Int, val failedCount: Int, val errors: List<String>)

enum class OfflineSyncDisposition { SYNCED, AUTH_REJECTED, FORBIDDEN, CONFLICT, RATE_LIMITED, RETRYABLE_FAILURE, NETWORK_FAILURE, NO_PENDING_ANSWERS }
data class OfflineSyncOutcome(val disposition: OfflineSyncDisposition, val result: OfflineSyncResult? = null)

interface ISyncClient {
    @Throws(OfflineTransportException::class)
    fun sync(session: OfflineSession, request: OfflineSyncRequest): OfflineSyncResult
}

interface IOfflinePackageClient {
    @Throws(OfflineTransportException::class)
    fun issueEntitlement(session: OfflineSession): String

    @Throws(OfflineTransportException::class)
    fun download(session: OfflineSession, entitlementToken: String, request: OfflinePackageRequest, devicePublicKeySpkiBase64: String): OfflinePackageEnvelope
}

class OfflineTransportException(val statusCode: Int? = null, message: String, cause: Throwable? = null) : Exception(message, cause)

fun interface OfflinePackageStatusApi {
    @Throws(Exception::class)
    fun getStatus(packageId: UUID, installationId: String): OfflinePackageStatus
}
