package com.cms.student.security

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Runtime dependency graph for the real Android Offline flow. Application code obtains this
 * coordinator from CmsApplication after an authenticated student session is available.
 */
class OfflineRuntimeCoordinator(
    private val trustConfiguration: OfflineTrustConfiguration,
    private val verifier: IOfflinePackageDecryptor?,
    private val packageClient: IOfflinePackageClient,
    private val syncClient: ISyncClient,
    private val packageStore: IOfflinePackageStore,
    private val revocationCache: CachedOfflineRevocationStatusProvider,
    private val revocationRefresher: OfflineRevocationRefresher,
    private val publicKeyProvider: () -> String,
    private val policy: OfflineUsePolicy = OfflineUsePolicy()
) {
    private val gson = Gson()

    /**
     * Authenticated online download. A server-confirmed active status is required before the
     * package can be opened. Envelope persistence is encrypted and initially UNKNOWN.
     */
    fun download(session: OfflineSession, subjectId: UUID, examId: UUID? = null): UUID? {
        val activeVerifier = enabledVerifierOrNull() ?: return null
        val entitlement = packageClient.issueEntitlement(session)
        val request = OfflinePackageRequest(subjectId, examId, UUID.randomUUID().toString())
        val envelope = packageClient.download(session, entitlement, request, publicKeyProvider())
        if (!manifestMatches(envelope.manifest, session, subjectId)) return null
        packageStore.saveEnvelope(envelope, session.studentId, session.installationId)
        if (!refreshStatus(session, envelope.manifest.packageId)) return null
        // Ensures the verifier is part of the runtime path before returning a downloadable package.
        if (activeVerifier.decrypt(envelope, session.studentId, session.installationId, subjectId, Instant.now()) == null) {
            packageStore.invalidate(envelope.manifest.packageId, session.studentId, session.installationId)
            return null
        }
        return envelope.manifest.packageId
    }

    /** Online package opening forces a fresh status confirmation before decrypting. */
    fun openOnline(session: OfflineSession, packageId: UUID, subjectId: UUID): List<OfflineQuestion>? {
        if (!refreshStatus(session, packageId)) return null
        return decryptAndParse(session, packageId, subjectId)
    }

    /**
     * Network-free continuation is deliberately narrower than initial opening: only a package
     * with a recent explicitly ACTIVE server confirmation can be opened, and it never refreshes
     * in a loop. UNKNOWN, REVOKED, expired, mismatched, or stale packages are rejected.
     */
    fun continueOffline(session: OfflineSession, packageId: UUID, subjectId: UUID, now: Instant = Instant.now()): List<OfflineQuestion>? {
        val stored = packageStore.load(packageId, session.studentId, session.installationId) ?: return null
        val confirmedAt = stored.lastConfirmedAt ?: return null
        if (
            stored.lastConfirmedStatus != RevocationStatus.ACTIVE ||
            !stored.envelope.manifest.expiresAt.isAfter(now) ||
            confirmedAt.plus(policy.maximumOfflineUseAfterConfirmation).isBefore(now)
        ) return null
        revocationCache.applyConfirmedStatus(packageId, RevocationStatus.ACTIVE)
        return decryptAndParse(session, packageId, subjectId)
    }

    /** Captures a user-selected option only after the package and question index are validated. */
    fun captureAnswer(
        session: OfflineSession,
        packageId: UUID,
        questionId: UUID,
        selectedOptionId: UUID,
        durationSeconds: Int,
        answeredAt: Instant = Instant.now()
    ): Boolean {
        if (durationSeconds < 0) return false
        return packageStore.recordAnswer(
            OfflineAnswer(
                localAttemptId = UUID.randomUUID(),
                packageId = packageId,
                questionId = questionId,
                selectedOptionId = selectedOptionId,
                answeredAt = answeredAt,
                durationSeconds = durationSeconds,
                installationId = session.installationId
            ),
            session.studentId,
            session.installationId
        )
    }

    /** Returns encrypted-store answers for Activity recreation; the caller receives no plaintext package key. */
    fun pendingAnswers(session: OfflineSession, packageId: UUID): List<OfflineAnswer> =
        packageStore.pendingAnswers(packageId, session.studentId, session.installationId)

    /** Refreshes revocation before any online sync and uses a stable per-batch idempotency key. */
    fun sync(session: OfflineSession, packageId: UUID, examSessionId: UUID? = null): OfflineSyncOutcome {
        if (!refreshStatus(session, packageId)) return OfflineSyncOutcome(OfflineSyncDisposition.FORBIDDEN)
        val answers = packageStore.pendingAnswers(packageId, session.studentId, session.installationId)
        if (answers.isEmpty()) return OfflineSyncOutcome(OfflineSyncDisposition.NO_PENDING_ANSWERS)
        val idempotencyKey = stableSyncIdempotencyKey(packageId, answers)
        return try {
            val result = syncClient.sync(session, OfflineSyncRequest(packageId, examSessionId, idempotencyKey, answers))
            packageStore.markAnswersSynced(packageId, answers.map(OfflineAnswer::localAttemptId), session.studentId, session.installationId)
            OfflineSyncOutcome(OfflineSyncDisposition.SYNCED, result)
        } catch (error: OfflineTransportException) {
            OfflineSyncOutcome(error.toSyncDisposition())
        }
    }

    /** Returns false and invalidates local envelope on revoke, expiry, mismatch, or transport error. */
    fun refreshStatus(session: OfflineSession, packageId: UUID, now: Instant = Instant.now()): Boolean {
        val active = revocationRefresher.refresh(packageId, session.installationId, now)
        val state = revocationCache.status(packageId)
        packageStore.updateConfirmedStatus(packageId, state, if (active) now else null, session.studentId, session.installationId)
        if (!active && state == RevocationStatus.REVOKED) packageStore.invalidate(packageId, session.studentId, session.installationId)
        return active
    }

    private fun decryptAndParse(session: OfflineSession, packageId: UUID, subjectId: UUID): List<OfflineQuestion>? {
        val activeVerifier = enabledVerifierOrNull() ?: return null
        val stored = packageStore.load(packageId, session.studentId, session.installationId) ?: return null
        val plaintext = activeVerifier.decrypt(stored.envelope, session.studentId, session.installationId, subjectId, Instant.now()) ?: return null
        try {
            val questions: List<OfflineQuestion> = gson.fromJson(
                plaintext.toString(StandardCharsets.UTF_8),
                object : TypeToken<List<OfflineQuestion>>() {}.type
            ) ?: return null
            if (!validQuestions(questions)) return null
            packageStore.replaceQuestionIndex(packageId, questions.map(OfflineQuestion::id), session.studentId, session.installationId)
            return questions
        } catch (_: Exception) {
            return null
        } finally {
            plaintext.fill(0)
        }
    }

    private fun enabledVerifierOrNull(): IOfflinePackageDecryptor? =
        if (trustConfiguration.offlineEnabled) verifier else null

    private fun manifestMatches(manifest: OfflinePackageManifest, session: OfflineSession, subjectId: UUID): Boolean =
        manifest.userId == session.studentId &&
            manifest.installationId == session.installationId &&
            manifest.contentVersion >= 1 &&
            subjectId in manifest.allowedSubjects &&
            manifest.expiresAt.isAfter(Instant.now())

    private fun validQuestions(questions: List<OfflineQuestion>): Boolean =
        questions.isNotEmpty() &&
            questions.map(OfflineQuestion::id).distinct().size == questions.size &&
            questions.all { question ->
                question.text.isNotBlank() &&
                    question.options.isNotEmpty() &&
                    question.options.map(OfflineQuestionOption::id).distinct().size == question.options.size &&
                    question.options.all { it.letter.isNotBlank() && it.text.isNotBlank() }
            }

    private fun stableSyncIdempotencyKey(packageId: UUID, answers: List<OfflineAnswer>): String {
        val material = buildString {
            append(packageId)
            answers.sortedBy { it.localAttemptId.toString() }.forEach { append(':').append(it.localAttemptId) }
        }
        return UUID.nameUUIDFromBytes(material.toByteArray(StandardCharsets.UTF_8)).toString()
    }

    private fun OfflineTransportException.toSyncDisposition(): OfflineSyncDisposition = when (statusCode) {
        401 -> OfflineSyncDisposition.AUTH_REJECTED
        403 -> OfflineSyncDisposition.FORBIDDEN
        409 -> OfflineSyncDisposition.CONFLICT
        429 -> OfflineSyncDisposition.RATE_LIMITED
        null -> OfflineSyncDisposition.NETWORK_FAILURE
        else -> OfflineSyncDisposition.RETRYABLE_FAILURE
    }
}

data class OfflineUsePolicy(
    val maximumOfflineUseAfterConfirmation: Duration = Duration.ofMinutes(15)
)
