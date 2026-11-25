package com.cms.student.bridge

import com.cms.student.security.OfflineAnswer
import com.cms.student.security.OfflinePackageEnvelope
import com.cms.student.security.OfflinePackageManifest
import com.cms.student.security.OfflineQuestion
import com.cms.student.security.OfflineQuestionOption
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineSyncDisposition
import com.cms.student.security.OfflineSyncOutcome
import com.cms.student.security.RevocationStatus
import com.cms.student.security.StoredOfflinePackage
import com.google.gson.JsonParser
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * W3 (UX 2A) JVM tests for [OfflineExamSessionRunner] — the pure state machine
 * OfflineExamWebActivity delegates to. All runtime seams are recording fakes
 * (exactly the lambdas the activity builds over its resolved binding); the store
 * fake mirrors OfflinePackageBridgeServiceTest's binding-checked in-memory store.
 */
class OfflineExamSessionRunnerTest {

    private val userId = UUID.fromString("11111111-1111-1111-1111-111111111111")
    private val subjectId = UUID.fromString("22222222-2222-4222-8222-222222222222")
    private val packageId = UUID.fromString("55555555-5555-5555-5555-555555555555")
    private val questionId = UUID.fromString("aaaaaaaa-1111-4222-8333-444444444444")
    private val optionId = UUID.fromString("bbbbbbbb-1111-4222-8333-444444444444")
    private val installation = "installation-a"
    private val now = Instant.parse("2026-12-01T12:00:00Z")
    private val session = OfflineSession(userId, "native-token", installation)

    // ------------------------------------------------------------------
    // Fakes
    // ------------------------------------------------------------------

    /** Binding-checked in-memory store with a load counter (absent-path assertions). */
    private class FakeStore(initial: List<StoredOfflinePackage> = emptyList()) : com.cms.student.security.IOfflinePackageStore {
        private val records = initial.associateBy { it.envelope.manifest.packageId }.toMutableMap()
        var loadCalls = 0
        var wipeAllCalls = 0
            private set

        val size: Int get() = records.size

        private fun binding(record: StoredOfflinePackage, userId: UUID, installationId: String) =
            record.envelope.manifest.userId == userId && record.envelope.manifest.installationId == installationId

        override fun saveEnvelope(envelope: OfflinePackageEnvelope, userId: UUID, installationId: String) {
            records[envelope.manifest.packageId] = StoredOfflinePackage(1, envelope, RevocationStatus.UNKNOWN, null, emptyList())
        }

        override fun load(packageId: UUID, userId: UUID, installationId: String): StoredOfflinePackage? {
            loadCalls++
            return records[packageId]?.takeIf { binding(it, userId, installationId) }
        }

        override fun listAll(userId: UUID, installationId: String): List<StoredOfflinePackage> =
            records.values.filter { binding(it, userId, installationId) }.sortedByDescending { it.envelope.manifest.issuedAt }

        override fun replaceQuestionIndex(packageId: UUID, questionIds: Collection<UUID>, userId: UUID, installationId: String) = Unit

        override fun recordAnswer(answer: OfflineAnswer, userId: UUID, installationId: String): Boolean = false

        override fun pendingAnswers(packageId: UUID, userId: UUID, installationId: String): List<OfflineAnswer> = emptyList()

        override fun markAnswersSynced(packageId: UUID, localAttemptIds: Collection<UUID>, userId: UUID, installationId: String) = Unit

        override fun updateConfirmedStatus(packageId: UUID, status: RevocationStatus, confirmedAt: Instant?, userId: UUID, installationId: String) = Unit

        override fun invalidate(packageId: UUID, userId: UUID, installationId: String) = Unit

        /** Phase P (containment): counted wipe — the runner never calls it, the
         *  count stays 0 and proves no hidden full-wipe path exists. */
        override fun wipeAll() {
            wipeAllCalls++
            records.clear()
        }
    }

    /** One recorded capture facade call (package, question, option, duration). */
    private data class CaptureCall(val pkg: UUID, val question: UUID, val option: UUID, val duration: Int)

    /** Recording facade standing in for the activity's AuthenticatedOfflineRuntime lambdas. */
    private class RuntimeFakes(questions: List<OfflineQuestion>, pending: List<OfflineAnswer>) {
        var openOnlineResult: List<OfflineQuestion>? = questions
        var continueOfflineResult: List<OfflineQuestion>? = null
        var captureResult = true
        var captureThrows = false
        var syncOutcome = OfflineSyncOutcome(OfflineSyncDisposition.SYNCED)
        var syncThrows = false
        val captureCalls = mutableListOf<CaptureCall>()
        var openOnlineCalls = 0
        var continueOfflineCalls = 0
        var pendingCalls = 0
        var syncCalls = 0
        val pending: List<OfflineAnswer> = pending
    }

    private fun runner(
        store: com.cms.student.security.IOfflinePackageStore,
        session: OfflineSession?,
        fakes: RuntimeFakes,
        executor: Executor = Executor { it.run() }
    ): OfflineExamSessionRunner = OfflineExamSessionRunner(
        packageId = packageId,
        session = session,
        store = store,
        openOnline = { pkg, subject ->
            fakes.openOnlineCalls++
            assertEquals(packageId, pkg)
            assertEquals(subjectId, subject)
            fakes.openOnlineResult
        },
        continueOffline = { _, _ ->
            fakes.continueOfflineCalls++
            fakes.continueOfflineResult
        },
        captureAnswer = { pkg, question, option, duration ->
            if (fakes.captureThrows) error("boom")
            fakes.captureCalls.add(CaptureCall(pkg, question, option, duration))
            fakes.captureResult
        },
        pendingAnswers = { _ ->
            fakes.pendingCalls++
            fakes.pending
        },
        sync = { _ ->
            fakes.syncCalls++
            if (fakes.syncThrows) error("boom")
            fakes.syncOutcome
        },
        executor = executor,
        clock = { now }
    )

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    private fun questions(): List<OfflineQuestion> = listOf(
        OfflineQuestion(
            id = questionId,
            text = "ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟",
            type = "Mcq",
            difficulty = "medium",
            tags = listOf("cardiology"),
            options = listOf(
                OfflineQuestionOption(optionId, "A", "ألم صدري ضاغط"),
                OfflineQuestionOption(UUID.randomUUID(), "B", "طنين في الأذن")
            )
        )
    )

    private fun pendingAnswer(question: UUID = questionId, option: UUID = optionId): OfflineAnswer = OfflineAnswer(
        localAttemptId = UUID.randomUUID(),
        packageId = packageId,
        questionId = question,
        selectedOptionId = option,
        answeredAt = now,
        durationSeconds = 12,
        installationId = installation,
        synced = false
    )

    private fun storedPackage(
        expiresAt: Instant = now.plusSeconds(3600),
        subjects: List<UUID> = listOf(subjectId)
    ): StoredOfflinePackage {
        val envelope = OfflinePackageEnvelope(
            OfflinePackageManifest(packageId, userId, installation, 1, subjects, now.minusSeconds(60), expiresAt, "nonce", "aad", "signature"),
            "ciphertext", "tag", "wrapped", "release-token"
        )
        return StoredOfflinePackage(1, envelope, RevocationStatus.ACTIVE, now, emptyList())
    }

    // ------------------------------------------------------------------
    // State machine — absent / denied_session / denied_package / ready
    // ------------------------------------------------------------------

    @Test
    fun `an absent store record denies with absent before any runtime work`() {
        val store = FakeStore()
        val fakes = RuntimeFakes(questions(), listOf(pendingAnswer()))
        val runner = runner(store, session, fakes)
        runner.start()
        assertEquals(OfflineExamSessionRunner.DENIED_ABSENT, (runner.stateSnapshot() as ExamPayloadState.Denied).code)
        assertEquals(1, store.loadCalls)
        assertEquals(0, fakes.openOnlineCalls)
        assertEquals(0, fakes.continueOfflineCalls)
    }

    @Test
    fun `a null session denies with denied_session before any store read`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), listOf(pendingAnswer()))
        val runner = runner(store, null, fakes)
        runner.start()
        assertEquals(OfflineExamSessionRunner.DENIED_SESSION, (runner.stateSnapshot() as ExamPayloadState.Denied).code)
        assertEquals(0, store.loadCalls)
        assertEquals(0, fakes.openOnlineCalls)
    }

    @Test
    fun `openOnline success publishes a ready payload with pending answers`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), listOf(pendingAnswer()))
        val runner = runner(store, session, fakes)
        runner.start()
        val ready = runner.stateSnapshot() as ExamPayloadState.Ready
        val root = JsonParser.parseString(ready.json).asJsonObject
        assertEquals(packageId.toString(), root.get("packageId").asString)
        assertEquals(listOf(subjectId.toString()), root.get("subjectIds").asJsonArray.map { it.asString })
        assertEquals(now.plusSeconds(3600).toString(), root.get("expiresAt").asString)
        val question = root.get("questions").asJsonArray.single().asJsonObject
        assertEquals(questionId.toString(), question.get("id").asString)
        assertEquals("ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟", question.get("text").asString)
        assertEquals("Mcq", question.get("type").asString)
        assertEquals("medium", question.get("difficulty").asString)
        assertEquals(listOf("cardiology"), question.get("tags").asJsonArray.map { it.asString })
        val option = question.get("options").asJsonArray[0].asJsonObject
        assertEquals(optionId.toString(), option.get("id").asString)
        assertEquals("A", option.get("letter").asString)
        assertEquals("ألم صدري ضاغط", option.get("text").asString)
        val pending = root.get("pendingAnswers").asJsonArray.single().asJsonObject
        assertEquals(questionId.toString(), pending.get("questionId").asString)
        assertEquals(optionId.toString(), pending.get("selectedOptionId").asString)
        // Online opening won: the offline continuation was never attempted.
        assertEquals(1, fakes.openOnlineCalls)
        assertEquals(0, fakes.continueOfflineCalls)
        assertEquals(1, fakes.pendingCalls)
    }

    @Test
    fun `openOnline null falls back to continueOffline and still publishes ready`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), emptyList())
        fakes.openOnlineResult = null
        fakes.continueOfflineResult = questions()
        val runner = runner(store, session, fakes)
        runner.start()
        val ready = runner.stateSnapshot() as ExamPayloadState.Ready
        assertTrue(ready.json.contains("\"pendingAnswers\":[]"))
        assertEquals(1, fakes.openOnlineCalls)
        assertEquals(1, fakes.continueOfflineCalls)
    }

    @Test
    fun `both open paths null deny with denied_package`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), emptyList())
        fakes.openOnlineResult = null
        fakes.continueOfflineResult = null
        val runner = runner(store, session, fakes)
        runner.start()
        assertEquals(OfflineExamSessionRunner.DENIED_PACKAGE, (runner.stateSnapshot() as ExamPayloadState.Denied).code)
        assertEquals(1, fakes.openOnlineCalls)
        assertEquals(1, fakes.continueOfflineCalls)
    }

    @Test
    fun `an expired manifest denies without attempting any open`() {
        val store = FakeStore(listOf(storedPackage(expiresAt = now.minusSeconds(1))))
        val fakes = RuntimeFakes(questions(), emptyList())
        val runner = runner(store, session, fakes)
        runner.start()
        assertEquals(OfflineExamSessionRunner.DENIED_PACKAGE, (runner.stateSnapshot() as ExamPayloadState.Denied).code)
        assertEquals(1, store.loadCalls)
        assertEquals(0, fakes.openOnlineCalls)
        assertEquals(0, fakes.continueOfflineCalls)
    }

    @Test
    fun `a store record without allowed subjects denies with denied_package`() {
        val store = FakeStore(listOf(storedPackage(subjects = emptyList())))
        val fakes = RuntimeFakes(questions(), emptyList())
        val runner = runner(store, session, fakes)
        runner.start()
        assertEquals(OfflineExamSessionRunner.DENIED_PACKAGE, (runner.stateSnapshot() as ExamPayloadState.Denied).code)
        assertEquals(0, fakes.openOnlineCalls)
    }

    @Test
    fun `a throwing store read denies closed instead of surfacing`() {
        val fakes = RuntimeFakes(questions(), emptyList())
        val runner = runner(ThrowingStore(), session, fakes)
        runner.start()
        assertEquals(OfflineExamSessionRunner.DENIED_ABSENT, (runner.stateSnapshot() as ExamPayloadState.Denied).code)
        assertEquals(0, fakes.openOnlineCalls)
    }

    // ------------------------------------------------------------------
    // Capture — facade passthrough + bound validation
    // ------------------------------------------------------------------

    @Test
    fun `capture passes ids and duration to the facade and returns its boolean`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), emptyList())
        val runner = runner(store, session, fakes)
        assertTrue(runner.captureAnswer(questionId, optionId, 30))
        assertEquals(listOf(CaptureCall(packageId, questionId, optionId, 30)), fakes.captureCalls)
        fakes.captureResult = false
        assertFalse(runner.captureAnswer(questionId, optionId, 30))
        assertEquals(2, fakes.captureCalls.size)
    }

    @Test
    fun `out of bounds duration fails closed without a facade call`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), emptyList())
        val runner = runner(store, session, fakes)
        assertFalse(runner.captureAnswer(questionId, optionId, -1))
        assertFalse(runner.captureAnswer(questionId, optionId, OfflineExamSessionRunner.MAX_DURATION_SECONDS + 1))
        assertTrue(fakes.captureCalls.isEmpty())
    }

    @Test
    fun `a throwing capture degrades to denied`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), emptyList())
        fakes.captureThrows = true
        val runner = runner(store, session, fakes)
        assertFalse(runner.captureAnswer(questionId, optionId, 5))
    }

    // ------------------------------------------------------------------
    // Submit — disposition mapping onto syncStatus
    // ------------------------------------------------------------------

    @Test
    fun `sync dispositions surface lowercase on syncStatus`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), emptyList())
        val runner = runner(store, session, fakes)
        assertEquals(OfflineExamSessionRunner.SYNC_IDLE, runner.syncStatus())
        OfflineSyncDisposition.entries.forEach { disposition ->
            fakes.syncOutcome = OfflineSyncOutcome(disposition)
            runner.requestSubmit()
            assertEquals(disposition.name.lowercase(), runner.syncStatus())
        }
        assertEquals(OfflineSyncDisposition.entries.size, fakes.syncCalls)
    }

    @Test
    fun `a throwing sync surfaces retryable_failure and keeps the answers local`() {
        val store = FakeStore(listOf(storedPackage()))
        val fakes = RuntimeFakes(questions(), emptyList())
        fakes.syncThrows = true
        val runner = runner(store, session, fakes)
        runner.requestSubmit()
        assertEquals("retryable_failure", runner.syncStatus())
    }

    /** A store whose load() throws — proves the runner's runCatching fail-closed posture. */
    private class ThrowingStore : com.cms.student.security.IOfflinePackageStore {
        override fun saveEnvelope(envelope: OfflinePackageEnvelope, userId: UUID, installationId: String) = Unit
        override fun load(packageId: UUID, userId: UUID, installationId: String): StoredOfflinePackage? = error("boom")
        override fun listAll(userId: UUID, installationId: String): List<StoredOfflinePackage> = emptyList()
        override fun replaceQuestionIndex(packageId: UUID, questionIds: Collection<UUID>, userId: UUID, installationId: String) = Unit
        override fun recordAnswer(answer: OfflineAnswer, userId: UUID, installationId: String): Boolean = false
        override fun pendingAnswers(packageId: UUID, userId: UUID, installationId: String): List<OfflineAnswer> = emptyList()
        override fun markAnswersSynced(packageId: UUID, localAttemptIds: Collection<UUID>, userId: UUID, installationId: String) = Unit
        override fun updateConfirmedStatus(packageId: UUID, status: RevocationStatus, confirmedAt: Instant?, userId: UUID, installationId: String) = Unit
        override fun invalidate(packageId: UUID, userId: UUID, installationId: String) = Unit
        override fun wipeAll() = Unit
    }
}
