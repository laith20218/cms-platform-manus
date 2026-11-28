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
) {
    /** Tokens must never leak into logs, crash reports, or error messages. */
    override fun toString(): String =
        "OfflineSession(studentId=$studentId, accessToken=<redacted>, installationId=$installationId)"
}

/** Login outcome for the native session path; the refresh token is persisted encrypted, never logged. */
data class OfflineLoginResult(
    val studentId: UUID,
    val accessToken: String,
    val refreshToken: String,
    val installationId: String
) {
    /** Tokens must never leak into logs, crash reports, or error messages. */
    override fun toString(): String =
        "OfflineLoginResult(studentId=$studentId, accessToken=<redacted>, refreshToken=<redacted>, installationId=$installationId)"
}

/** Rotated token pair returned by `/auth/refresh`; persisted encrypted, never logged. */
data class OfflineTokenPair(
    val accessToken: String,
    val refreshToken: String
) {
    /** Tokens must never leak into logs, crash reports, or error messages. */
    override fun toString(): String =
        "OfflineTokenPair(accessToken=<redacted>, refreshToken=<redacted>)"
}

/**
 * Owner decision (offline-experience implementation, 2026-11-28) — the
 * ACCESS-ONLY native session issued by POST auth/native-exchange. Carries no
 * refresh token: renewal re-runs the exchange with a fresh web access token.
 * Expiry gates new downloads/online opens only — saved offline content stays
 * usable (durable offline policy).
 */
data class OfflineExchangeSession(
    val accessToken: String,
    val studentId: UUID,
    val expiresInSeconds: Int
) {
    /** Tokens must never leak into logs, crash reports, or error messages. */
    override fun toString(): String =
        "OfflineExchangeSession(studentId=$studentId, accessToken=<redacted>, expiresInSeconds=$expiresInSeconds)"
}

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
    val answers: List<OfflineAnswer>,
    /** Question ids written by the first decrypt/open; empty until then (W2 listing rows omit the count). */
    val questionIds: List<UUID> = emptyList()
)

interface IOfflinePackageStore {
    fun saveEnvelope(envelope: OfflinePackageEnvelope, userId: UUID, installationId: String)
    fun load(packageId: UUID, userId: UUID, installationId: String): StoredOfflinePackage?

    /**
     * Every persisted package bound to `userId` + `installationId`, newest first
     * (manifest.issuedAt descending). W2 (UX 3C) — rows for the bridge package
     * listing; unparseable store files are skipped silently (fail closed, never throw).
     */
    fun listAll(userId: UUID, installationId: String): List<StoredOfflinePackage>
    fun replaceQuestionIndex(packageId: UUID, questionIds: Collection<UUID>, userId: UUID, installationId: String)
    fun recordAnswer(answer: OfflineAnswer, userId: UUID, installationId: String): Boolean
    fun pendingAnswers(packageId: UUID, userId: UUID, installationId: String): List<OfflineAnswer>
    fun markAnswersSynced(packageId: UUID, localAttemptIds: Collection<UUID>, userId: UUID, installationId: String)
    fun updateConfirmedStatus(packageId: UUID, status: RevocationStatus, confirmedAt: Instant?, userId: UUID, installationId: String)
    fun invalidate(packageId: UUID, userId: UUID, installationId: String)

    /**
     * Phase P (containment) — deletes EVERY persisted record in the store
     * directory (all users, all packages: every `.bin` envelope plus any `.tmp`
     * write leftovers), unconditionally — a session death is not
     * binding-filterable. Never throws: a wipe is fail-closed, and any file
     * that cannot be deleted is simply gone from the next read's perspective
     * (the record was already rejected as unbound/orphaned by then).
     */
    fun wipeAll()

    /**
     * Owner decision 2026-11-28 — total at-rest bytes of the store directory
     * (all users, all packages), for the SHARED 10 GiB offline quota and the
     * truthful per-type storage summary. Read-only; never throws.
     */
    fun totalBytes(): Long
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
