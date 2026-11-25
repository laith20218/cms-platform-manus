package com.cms.student.bridge

import android.webkit.JavascriptInterface
import com.cms.student.shell.ShellUrlPolicy
import com.google.gson.JsonParser
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * W3 (UX 2A) JVM tests for [OfflineExamBridge] — pure logic, no Robolectric (the
 * project does not use it). The current-URL provider is a fake lambda standing in
 * for `webView.url`, exactly like CmsJsBridgeTest; the payload provider / capture /
 * submit / sync-status seams are recording fakes standing in for the activity's
 * runner wiring.
 */
class OfflineExamBridgeTest {

    private val policy = ShellUrlPolicy.fromBaseUrl("https://app.cms.example.com")
        ?: error("fixture base URL must be usable")
    private val allowedUrl = "https://app.cms.example.com/offline-exam/55555555-5555-5555-5555-555555555555"
    private val packageId = "55555555-5555-5555-5555-555555555555"
    private val subjectId = "22222222-2222-4222-8222-222222222222"
    private val questionId = UUID.fromString("11111111-2222-4333-8444-555555555555")
    private val questionIdString = "11111111-2222-4333-8444-555555555555"
    private val optionId = UUID.fromString("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
    private val optionIdString = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    private val otherOptionIdString = "99999999-8888-4777-8666-555555555555"

    private val captureCalls = mutableListOf<Triple<UUID, UUID, Int>>()
    private var captureResult = true
    private var captureThrows = false
    private var submitCount = 0
    private var submitThrows = false
    private var syncAnswer = OfflineExamSessionRunner.SYNC_IDLE
    private var syncThrows = false

    private fun bridge(
        currentUrl: () -> String?,
        state: ExamPayloadState = ExamPayloadState.Loading
    ): OfflineExamBridge = OfflineExamBridge(
        currentUrl = currentUrl,
        urlPolicy = policy,
        payloadProvider = { state },
        answerCapture = { question, option, durationSeconds ->
            if (captureThrows) error("boom")
            captureCalls.add(Triple(question, option, durationSeconds))
            captureResult
        },
        submitRequest = {
            if (submitThrows) error("boom")
            submitCount++
        },
        syncStatus = {
            if (syncThrows) error("boom")
            syncAnswer
        }
    )

    private fun payloadFixture(): ExamPayload = ExamPayload(
        packageId = packageId,
        subjectIds = listOf(subjectId),
        expiresAt = "2027-01-01T00:00:00Z",
        questions = listOf(
            ExamQuestionPayload(
                id = questionIdString,
                text = "ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟",
                type = "Mcq",
                difficulty = "medium",
                tags = listOf("cardiology"),
                options = listOf(
                    ExamQuestionOptionPayload(optionIdString, "A", "ألم صدري ضاغط"),
                    ExamQuestionOptionPayload(otherOptionIdString, "B", "طنين في الأذن")
                )
            )
        ),
        pendingAnswers = listOf(
            ExamPendingAnswerPayload(questionIdString, otherOptionIdString)
        )
    )

    // ------------------------------------------------------------------
    // Payload JSON — the exact W3 web contract shape
    // ------------------------------------------------------------------

    @Test
    fun `payload json carries the exact web contract field names for every phase`() {
        val loadingRoot = JsonParser.parseString(bridge({ allowedUrl }).getOfflineExamPayload()).asJsonObject
        assertEquals(OfflineExamBridge.PHASE_LOADING, loadingRoot.get(OfflineExamBridge.PHASE).asString)
        assertEquals(1, loadingRoot.size())

        val deniedRoot = JsonParser.parseString(
            bridge({ allowedUrl }, ExamPayloadState.Denied(OfflineExamSessionRunner.DENIED_SESSION)).getOfflineExamPayload()
        ).asJsonObject
        assertEquals(OfflineExamBridge.PHASE_DENIED, deniedRoot.get(OfflineExamBridge.PHASE).asString)
        assertEquals(OfflineExamSessionRunner.DENIED_SESSION, deniedRoot.get("code").asString)

        val readyRoot = JsonParser.parseString(
            bridge({ allowedUrl }, ExamPayloadState.Ready(payloadFixture())).getOfflineExamPayload()
        ).asJsonObject
        assertEquals(OfflineExamBridge.PHASE_READY, readyRoot.get(OfflineExamBridge.PHASE).asString)
        val payload = readyRoot.get("payload").asJsonObject
        assertEquals(packageId, payload.get("packageId").asString)
        assertEquals(listOf(subjectId), payload.get("subjectIds").asJsonArray.map { it.asString })
        assertEquals("2027-01-01T00:00:00Z", payload.get("expiresAt").asString)

        val question = payload.get("questions").asJsonArray.single().asJsonObject
        assertEquals(questionIdString, question.get("id").asString)
        assertEquals("ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟", question.get("text").asString)
        assertEquals("Mcq", question.get("type").asString)
        assertEquals("medium", question.get("difficulty").asString)
        assertEquals(listOf("cardiology"), question.get("tags").asJsonArray.map { it.asString })
        val option = question.get("options").asJsonArray[0].asJsonObject
        assertEquals(optionIdString, option.get("id").asString)
        assertEquals("A", option.get("letter").asString)
        assertEquals("ألم صدري ضاغط", option.get("text").asString)

        val pending = payload.get("pendingAnswers").asJsonArray.single().asJsonObject
        assertEquals(questionIdString, pending.get("questionId").asString)
        assertEquals(otherOptionIdString, pending.get("selectedOptionId").asString)

        // No token, path, or envelope material ever crosses in a payload.
        val serialized = readyRoot.toString().lowercase()
        assertFalse(serialized.contains("token"))
        assertFalse(serialized.contains("ciphertext"))
        assertFalse(serialized.contains("wrapped"))
    }

    @Test
    fun `a throwing payload provider degrades to the denied phase instead of surfacing to js`() {
        val throwing = OfflineExamBridge(
            currentUrl = { allowedUrl },
            urlPolicy = policy,
            payloadProvider = { error("boom") },
            answerCapture = { _, _, _ -> true },
            submitRequest = {},
            syncStatus = { OfflineExamSessionRunner.SYNC_IDLE }
        )
        val root = JsonParser.parseString(throwing.getOfflineExamPayload()).asJsonObject
        assertEquals(OfflineExamBridge.PHASE_DENIED, root.get(OfflineExamBridge.PHASE).asString)
        assertEquals(OfflineExamBridge.DENIED, root.get("code").asString)
    }

    // ------------------------------------------------------------------
    // Origin guard — every method fails closed outside the allowlist
    // ------------------------------------------------------------------

    @Test
    fun `every method returns safe defaults when the current origin is not allowlisted`() {
        val deniedUrls = listOf(
            "https://evil.example.com/offline-exam/$packageId",
            "https://app.cms.example.com.evil.com/",
            "http://app.cms.example.com/offline-exam/$packageId",
            "https://app.cms.example.com:8443/offline-exam/$packageId",
            "file:///etc/passwd",
            "",
            null
        )
        deniedUrls.forEach { url ->
            val bridge = bridge({ url }, ExamPayloadState.Ready(payloadFixture()))
            val root = JsonParser.parseString(bridge.getOfflineExamPayload()).asJsonObject
            assertEquals("payload must deny for '$url'", OfflineExamBridge.PHASE_DENIED, root.get(OfflineExamBridge.PHASE).asString)
            assertEquals("payload must carry the origin code for '$url'", OfflineExamBridge.DENIED_ORIGIN, root.get("code").asString)
            assertEquals("capture must be denied for '$url'", OfflineExamBridge.DENIED, bridge.captureOfflineAnswer(questionIdString, optionIdString, 0))
            assertEquals("submit must be denied for '$url'", OfflineExamBridge.DENIED, bridge.submitOfflineExam())
            assertEquals("sync status must stay idle for '$url'", OfflineExamSessionRunner.SYNC_IDLE, bridge.getOfflineExamSyncStatus())
        }
        assertTrue(captureCalls.isEmpty())
        assertEquals(0, submitCount)
    }

    @Test
    fun `origin guard fails closed with a blocking policy even for the configured origin`() {
        val blockingPolicy = ShellUrlPolicy.allowNothing()
        val bridge = OfflineExamBridge(
            currentUrl = { allowedUrl },
            urlPolicy = blockingPolicy,
            payloadProvider = { ExamPayloadState.Ready(payloadFixture()) },
            answerCapture = { _, _, _ -> true },
            submitRequest = { submitCount++ },
            syncStatus = { "synced" }
        )
        val root = JsonParser.parseString(bridge.getOfflineExamPayload()).asJsonObject
        assertEquals(OfflineExamBridge.PHASE_DENIED, root.get(OfflineExamBridge.PHASE).asString)
        assertEquals(OfflineExamBridge.DENIED, bridge.captureOfflineAnswer(questionIdString, optionIdString, 0))
        assertEquals(OfflineExamBridge.DENIED, bridge.submitOfflineExam())
        assertEquals(OfflineExamSessionRunner.SYNC_IDLE, bridge.getOfflineExamSyncStatus())
        assertEquals(0, submitCount)
    }

    // ------------------------------------------------------------------
    // captureOfflineAnswer — arg validation + result mapping
    // ------------------------------------------------------------------

    @Test
    fun `malformed uuid or out of bounds duration answers invalid_args and never reaches the runner`() {
        val bridge = bridge({ allowedUrl })
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer(null, optionIdString, 0))
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer("", optionIdString, 0))
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer("not-a-uuid", optionIdString, 0))
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer("../../etc/passwd", optionIdString, 0))
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer("x".repeat(300), optionIdString, 0))
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer(" $questionIdString ", null, 0))
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer(questionIdString, "not-a-uuid", 0))
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer(questionIdString, optionIdString, -1))
        assertEquals(OfflineExamBridge.INVALID_ARGS, bridge.captureOfflineAnswer(questionIdString, optionIdString, OfflineExamBridge.MAX_DURATION_SECONDS + 1))
        assertTrue(captureCalls.isEmpty())
    }

    @Test
    fun `the duration bounds accept zero and the full day cap with trimmed uuids`() {
        val bridge = bridge({ allowedUrl })
        assertEquals(OfflineExamBridge.RECORDED, bridge.captureOfflineAnswer("  $questionIdString ", "\t$optionIdString", 0))
        assertEquals(OfflineExamBridge.RECORDED, bridge.captureOfflineAnswer(questionIdString, optionIdString, OfflineExamBridge.MAX_DURATION_SECONDS))
        assertEquals(
            listOf(Triple(questionId, optionId, 0), Triple(questionId, optionId, OfflineExamBridge.MAX_DURATION_SECONDS)),
            captureCalls
        )
    }

    @Test
    fun `capture success and denial map to recorded and denied`() {
        val bridge = bridge({ allowedUrl })
        assertEquals(OfflineExamBridge.RECORDED, bridge.captureOfflineAnswer(questionIdString, optionIdString, 42))
        captureResult = false
        assertEquals(OfflineExamBridge.DENIED, bridge.captureOfflineAnswer(questionIdString, optionIdString, 42))
        assertEquals(2, captureCalls.size)
    }

    @Test
    fun `a throwing capture degrades to denied instead of surfacing to js`() {
        captureThrows = true
        val bridge = bridge({ allowedUrl })
        assertEquals(OfflineExamBridge.DENIED, bridge.captureOfflineAnswer(questionIdString, optionIdString, 42))
    }

    // ------------------------------------------------------------------
    // submitOfflineExam + getOfflineExamSyncStatus
    // ------------------------------------------------------------------

    @Test
    fun `submit answers submitting and invokes the activity submit request exactly once`() {
        val bridge = bridge({ allowedUrl })
        assertEquals(OfflineExamBridge.SUBMITTING, bridge.submitOfflineExam())
        assertEquals(1, submitCount)
    }

    @Test
    fun `a throwing submit request degrades to denied`() {
        submitThrows = true
        val bridge = bridge({ allowedUrl })
        assertEquals(OfflineExamBridge.DENIED, bridge.submitOfflineExam())
        assertEquals(0, submitCount)
    }

    @Test
    fun `sync status passes the runner answer through unchanged`() {
        val bridge = bridge({ allowedUrl })
        assertEquals(OfflineExamSessionRunner.SYNC_IDLE, bridge.getOfflineExamSyncStatus())
        listOf("submitting", "synced", "auth_rejected", "forbidden", "conflict", "rate_limited", "network_failure", "retryable_failure", "no_pending_answers").forEach { code ->
            syncAnswer = code
            assertEquals(code, bridge.getOfflineExamSyncStatus())
        }
    }

    @Test
    fun `a throwing sync status degrades to idle`() {
        syncThrows = true
        assertEquals(OfflineExamSessionRunner.SYNC_IDLE, bridge({ allowedUrl }).getOfflineExamSyncStatus())
    }

    // ------------------------------------------------------------------
    // Surface audit — name + exact method set
    // ------------------------------------------------------------------

    @Test
    fun `js name and surface are stable for the documented web contract`() {
        assertEquals("CmsOfflineExam", OfflineExamBridge.JS_NAME)
        val jsMethodNames = OfflineExamBridge::class.java.methods
            .filter { it.isAnnotationPresent(JavascriptInterface::class.java) }
            .map { it.name }
            .toSet()
        assertEquals(
            setOf("getOfflineExamPayload", "captureOfflineAnswer", "submitOfflineExam", "getOfflineExamSyncStatus"),
            jsMethodNames
        )
    }
}
