package com.cms.student.bridge

import com.cms.student.security.IOfflinePackageStore
import com.cms.student.security.OfflineAnswer
import com.cms.student.security.OfflineQuestion
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineSyncDisposition
import com.cms.student.security.OfflineSyncOutcome
import com.cms.student.security.StoredOfflinePackage
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executor
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

/**
 * W3 (UX 2A) — pure-JVM state machine behind OfflineExamWebActivity. The activity
 * stays thin: it resolves the session/runtime binding from CmsApplication, injects
 * the runtime facade lambdas, and delegates every bridge action here (mirrors how
 * OfflinePackageBridgeService keeps all decisions out of the WebView layer).
 *
 * Lifecycle mirrors the native OfflineExamActivity flow it replaces:
 *  1. [start] resolves the package's subject from the encrypted store FIRST
 *     (manifest.allowedSubjects.first()) — no record → denied "absent".
 *  2. No session (native or last web-bound) → denied "denied_session".
 *  3. `openOnline` (fresh revocation refresh) ?: `continueOffline` (already-confirmed
 *     ACTIVE package inside the manifest window) — both null → denied "denied_package".
 *  4. Ready publishes the decrypted payload + the pending-answer restoration map;
 *     answers survive process death through the encrypted store (pendingAnswers).
 *
 * Threading: [start] and [requestSubmit] enqueue onto [executor] (single-threaded in
 * production — the same contract OfflineExamActivity used). [captureAnswer] runs the
 * encrypted-store write on [executor] too and waits a BOUNDED interval for its
 * boolean: the wait can only queue behind the initial load or one in-flight sync,
 * and on timeout/interruption it fails closed to "denied" (the page reverts the
 * selection with its honest Arabic message — never a fake success).
 *
 * Sync dispositions surface as [OfflineSyncDisposition] names, lowercase — the exact
 * contract the student-web OFFLINE_EXAM_SYNC_MESSAGES map consumes.
 */
class OfflineExamSessionRunner(
    private val packageId: UUID,
    private val session: OfflineSession?,
    private val store: IOfflinePackageStore,
    private val openOnline: (packageId: UUID, subjectId: UUID) -> List<OfflineQuestion>?,
    private val continueOffline: (packageId: UUID, subjectId: UUID) -> List<OfflineQuestion>?,
    private val captureAnswer: (packageId: UUID, questionId: UUID, selectedOptionId: UUID, durationSeconds: Int) -> Boolean,
    private val pendingAnswers: (packageId: UUID) -> List<OfflineAnswer>,
    private val sync: (packageId: UUID) -> OfflineSyncOutcome,
    private val executor: Executor,
    private val clock: () -> Instant = Instant::now
) {

    @Volatile private var state: ExamPayloadState = ExamPayloadState.Loading
    @Volatile private var syncCode: String = SYNC_IDLE

    /** The bridge reads this (JavaBridge thread); volatile for cross-thread publication. */
    fun stateSnapshot(): ExamPayloadState = state

    /** "idle" | "submitting" | lowercase disposition names. */
    fun syncStatus(): String = syncCode

    /** Resolves and publishes the payload state on [executor]; safe to call once per activity. */
    fun start() {
        executor.execute {
            state = runCatching { resolveState() }.getOrNull() ?: ExamPayloadState.Denied(DENIED_PACKAGE)
        }
    }

    private fun resolveState(): ExamPayloadState {
        val resolvedSession = session ?: return ExamPayloadState.Denied(DENIED_SESSION)
        val stored = runCatching { store.load(packageId, resolvedSession.studentId, resolvedSession.installationId) }
            .getOrNull()
            ?: return ExamPayloadState.Denied(DENIED_ABSENT)
        val manifest = stored.envelope.manifest
        val subjectId = manifest.allowedSubjects.firstOrNull()
            ?: return ExamPayloadState.Denied(DENIED_PACKAGE)
        // Honest pre-gate: an already-expired manifest needs no decrypt attempt —
        // both open paths reject it anyway (the verifier re-checks with its own clock).
        if (!manifest.expiresAt.isAfter(clock())) return ExamPayloadState.Denied(DENIED_PACKAGE)
        // Online opening refreshes revocation. If disconnected, only an
        // already-confirmed ACTIVE package inside the policy window may continue;
        // no retry loop is created (same contract as OfflineExamActivity).
        val questions = runCatching { openOnline(packageId, subjectId) }.getOrNull()
            ?: runCatching { continueOffline(packageId, subjectId) }.getOrNull()
            ?: return ExamPayloadState.Denied(DENIED_PACKAGE)
        val pending = runCatching { pendingAnswers(packageId) }.getOrDefault(emptyList())
        return ExamPayloadState.Ready(payload(manifest, questions, pending))
    }

    /** The W3 web-contract payload: decrypted display fields + pending-answer restoration. */
    private fun payload(
        manifest: com.cms.student.security.OfflinePackageManifest,
        questions: List<OfflineQuestion>,
        pending: List<OfflineAnswer>
    ): ExamPayload = ExamPayload(
        packageId = packageId.toString(),
        subjectIds = manifest.allowedSubjects.map(UUID::toString),
        expiresAt = manifest.expiresAt.toString(),
        questions = questions.map { question ->
            ExamQuestionPayload(
                id = question.id.toString(),
                text = question.text,
                type = question.type,
                difficulty = question.difficulty,
                tags = question.tags,
                options = question.options.map { option ->
                    ExamQuestionOptionPayload(option.id.toString(), option.letter, option.text)
                }
            )
        },
        pendingAnswers = pending.map { answer ->
            ExamPendingAnswerPayload(answer.questionId.toString(), answer.selectedOptionId.toString())
        }
    )

    /**
     * Records one selection via the runtime on [executor] and returns its boolean
     * (bounded wait; fail closed on timeout/error). The encrypted store re-validates
     * the question index, expiry window, and ACTIVE confirmation — a "false" here is
     * always a genuine rejection, never a guess.
     */
    fun captureAnswer(questionId: UUID, selectedOptionId: UUID, durationSeconds: Int): Boolean {
        if (durationSeconds !in 0..MAX_DURATION_SECONDS) return false
        val task = FutureTask {
            runCatching { captureAnswer(packageId, questionId, selectedOptionId, durationSeconds) }.getOrDefault(false)
        }
        return try {
            executor.execute(task)
            task.get(CAPTURE_WAIT_SECONDS, TimeUnit.SECONDS)
        } catch (_: Exception) {
            false
        }
    }

    /** Enqueues the package sync; the disposition lands on [syncStatus] when done. */
    fun requestSubmit() {
        executor.execute {
            syncCode = SYNC_SUBMITTING
            val outcome = runCatching { sync(packageId) }.getOrNull()
            syncCode = outcome?.disposition?.name?.lowercase()
                ?: OfflineSyncDisposition.RETRYABLE_FAILURE.name.lowercase()
        }
    }

    companion object {
        /** Denied-phase codes — the student-web page maps each to an Arabic message. */
        const val DENIED_SESSION = "denied_session"
        const val DENIED_PACKAGE = "denied_package"
        const val DENIED_ABSENT = "absent"

        /** Sync status codes outside the disposition set. */
        const val SYNC_IDLE = "idle"
        const val SYNC_SUBMITTING = "submitting"

        /** Answer-duration bound (the bridge validates the same range first). */
        const val MAX_DURATION_SECONDS = 86_400

        /**
         * Bounded wait for one capture behind a single-threaded executor: the only
         * long-running predecessors are the initial load and one network sync, so
         * 15s covers worst-case HTTP timeouts while never hanging the JavaBridge
         * thread indefinitely.
         */
        const val CAPTURE_WAIT_SECONDS = 15L
    }
}
