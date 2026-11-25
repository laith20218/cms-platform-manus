package com.cms.student.bridge

import android.webkit.JavascriptInterface
import com.cms.student.security.OfflineSyncDisposition
import com.cms.student.shell.ShellUrlPolicy
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import java.util.UUID

/**
 * The decrypted exam payload served to the offline-exam page. Pure data, JVM-only
 * (no Android types) so the runner and its tests can build/assert it directly.
 *
 * W3 web CONTRACT — the exact JSON field names the student-web wrapper validates:
 *
 * ```
 * { "packageId": "…", "subjectIds": ["…"], "expiresAt": "…",
 *   "questions": [ { "id": "…", "text": "…", "type": "…", "difficulty": "…",
 *                    "tags": ["…"], "options": [ { "id": "…", "letter": "…", "text": "…" } ] } ],
 *   "pendingAnswers": [ { "questionId": "…", "selectedOptionId": "…" } ] }
 * ```
 *
 * Rows carry ONLY decrypted question display fields plus the local pending-answer
 * restoration map — never envelope material, paths, key bytes, or tokens.
 */
data class ExamPayload(
    val packageId: String,
    val subjectIds: List<String>,
    val expiresAt: String,
    val questions: List<ExamQuestionPayload>,
    val pendingAnswers: List<ExamPendingAnswerPayload>
)

data class ExamQuestionPayload(
    val id: String,
    val text: String,
    val type: String,
    val difficulty: String,
    val tags: List<String>,
    val options: List<ExamQuestionOptionPayload>
)

data class ExamQuestionOptionPayload(val id: String, val letter: String, val text: String)

data class ExamPendingAnswerPayload(val questionId: String, val selectedOptionId: String)

/**
 * Phase machine served by [getOfflineExamPayload] — the runner (W3
 * [OfflineExamSessionRunner]) publishes exactly one of these onto a volatile
 * field. [Ready] serializes its payload ONCE at construction so the JavaBridge
 * thread never re-serializes per poll.
 */
sealed interface ExamPayloadState {
    /** The runner is still resolving/decrypting the package on its executor. */
    data object Loading : ExamPayloadState

    /** Terminal fail-closed code: denied_session | denied_package | absent. */
    data class Denied(val code: String) : ExamPayloadState

    /** The verified, decrypted payload (with its cached JSON serialization). */
    class Ready(val payload: ExamPayload, val json: String = serializeExamPayload(payload)) : ExamPayloadState
}

/** Gson tree-builder serialization — explicit field names, no reflection surprises. */
internal fun serializeExamPayload(payload: ExamPayload): String {
    val root = JsonObject()
    root.addProperty("packageId", payload.packageId)
    root.add("subjectIds", JsonArray().apply { payload.subjectIds.forEach { add(it) } })
    root.addProperty("expiresAt", payload.expiresAt)
    root.add(
        "questions",
        JsonArray().apply {
            payload.questions.forEach { question ->
                add(
                    JsonObject().apply {
                        addProperty("id", question.id)
                        addProperty("text", question.text)
                        addProperty("type", question.type)
                        addProperty("difficulty", question.difficulty)
                        add("tags", JsonArray().apply { question.tags.forEach { add(it) } })
                        add(
                            "options",
                            JsonArray().apply {
                                question.options.forEach { option ->
                                    add(
                                        JsonObject().apply {
                                            addProperty("id", option.id)
                                            addProperty("letter", option.letter)
                                            addProperty("text", option.text)
                                        }
                                    )
                                }
                            }
                        )
                    }
                )
            }
        }
    )
    root.add(
        "pendingAnswers",
        JsonArray().apply {
            payload.pendingAnswers.forEach { answer ->
                add(
                    JsonObject().apply {
                        addProperty("questionId", answer.questionId)
                        addProperty("selectedOptionId", answer.selectedOptionId)
                    }
                )
            }
        }
    )
    return root.toString()
}

/**
 * W3 (UX 2A) — the DEDICATED `@JavascriptInterface` bridge of the offline-exam
 * WebView (OfflineExamWebActivity). It is a DIFFERENT interface on a DIFFERENT
 * WebView than the shell's [CmsJsBridge] (`window.CmsNative`): the exam webview's
 * ONLY injected interface is [JS_NAME] ("CmsOfflineExam") — one audited interface
 * per WebView, never two in the same view (see WebViewHost.attachExamBridge).
 *
 * Exact JS surface — nothing else is reachable from JavaScript:
 *
 * ```
 * window.CmsOfflineExam.getOfflineExamPayload()  // {"phase":"loading"} | {"phase":"denied","code":…} | {"phase":"ready","payload":{…}}
 * window.CmsOfflineExam.captureOfflineAnswer(questionId, optionId, durationSeconds) // recorded|denied|invalid_args
 * window.CmsOfflineExam.submitOfflineExam()      // submitting
 * window.CmsOfflineExam.getOfflineExamSyncStatus() // idle|submitting|<disposition lowercase>
 * ```
 *
 * Origin guard (mandatory, mirrors [CmsJsBridge]): every method resolves the exam
 * WebView's current URL via [currentUrl] and consults [urlPolicy] — the same HTTPS
 * allowlist that governs navigation. Outside the allowlist (foreign host, non-HTTPS
 * scheme, credentials, odd port, blank/not-yet-loaded) every method answers its
 * fail-closed default: the payload degrades to a denied phase, captures answer
 * "denied", submit answers "denied", and sync status stays "idle". The bridge never
 * throws and never leaks partial values.
 *
 * Threat model (student-web XSS in the exam webview): the readable surface is the
 * DECRYPTED question payload the current student is already entitled to — the runner
 * verified + decrypted the package through the trusted offline runtime BEFORE
 * publishing [ExamPayloadState.Ready], so no plaintext crosses this bridge without
 * signature, expiry, revocation, and binding checks passing first. The action
 * surface can record option selections for the OPEN package and enqueue its sync —
 * both re-validated against the encrypted store (recordAnswer rejects non-indexed
 * questions, expired windows, and non-ACTIVE confirmations). No tokens, no envelope
 * bytes, no filesystem paths, no arbitrary URLs are readable or writable.
 */
class OfflineExamBridge(
    private val currentUrl: () -> String?,
    private val urlPolicy: ShellUrlPolicy,
    private val payloadProvider: () -> ExamPayloadState,
    private val answerCapture: (questionId: UUID, optionId: UUID, durationSeconds: Int) -> Boolean,
    private val submitRequest: () -> Unit,
    private val syncStatus: () -> String
) {

    /** True only when the exam page sits on the allowlisted HTTPS origin. */
    internal fun isOriginAllowed(): Boolean = urlPolicy.isAllowed(currentUrl())

    /** The phase JSON for the current payload state; never throws, never partial. */
    @JavascriptInterface
    fun getOfflineExamPayload(): String =
        if (isOriginAllowed()) {
            guarded(
                {
                    when (val state = payloadProvider()) {
                        is ExamPayloadState.Loading -> LOADING_JSON
                        is ExamPayloadState.Denied -> deniedJson(state.code)
                        is ExamPayloadState.Ready -> state.json
                    }
                },
                deniedJson(DENIED)
            )
        } else {
            deniedJson(DENIED_ORIGIN)
        }

    /** Records one option selection after bridge-level UUID + duration validation. */
    @JavascriptInterface
    fun captureOfflineAnswer(questionId: String?, optionId: String?, durationSeconds: Int): String =
        if (isOriginAllowed()) {
            val question = uuidArgument(questionId)
            val option = uuidArgument(optionId)
            when {
                question == null || option == null -> INVALID_ARGS
                durationSeconds !in 0..MAX_DURATION_SECONDS -> INVALID_ARGS
                else -> if (guarded({ answerCapture(question, option, durationSeconds) }, false)) RECORDED else DENIED
            }
        } else {
            DENIED
        }

    /** Enqueues the package sync on the runner's executor; the page polls the status. */
    @JavascriptInterface
    fun submitOfflineExam(): String =
        if (isOriginAllowed()) guarded({ submitRequest(); SUBMITTING }, DENIED) else DENIED

    /** "idle" | "submitting" | [OfflineSyncDisposition] names, lowercase. */
    @JavascriptInterface
    fun getOfflineExamSyncStatus(): String =
        if (isOriginAllowed()) guarded(syncStatus, SYNC_IDLE) else SYNC_IDLE

    /**
     * Canonical hyphenated UUID ids only — the SAME defense-in-depth pattern the
     * W2 packages surface applies (see [OfflinePackageBridgeService.PACKAGE_ID_PATTERN]);
     * blank, oversized, or path-shaped arguments never reach the runner.
     */
    private fun uuidArgument(raw: String?): UUID? {
        if (raw.isNullOrBlank() || raw.length > MAX_ID_CHARS) return null
        val trimmed = raw.trim()
        if (!OfflinePackageBridgeService.PACKAGE_ID_PATTERN.matches(trimmed)) return null
        return runCatching { UUID.fromString(trimmed) }.getOrNull()
    }

    /** The bridge never propagates an exception to JS — every call degrades to [fallback]. */
    private inline fun guarded(action: () -> String, fallback: String): String =
        runCatching(action).getOrDefault(fallback)

    private inline fun guarded(action: () -> Boolean, fallback: Boolean): Boolean =
        runCatching(action).getOrDefault(fallback)

    private fun deniedJson(code: String): String =
        JsonObject().apply {
            addProperty(PHASE, PHASE_DENIED)
            addProperty("code", code)
        }.toString()

    companion object {
        /** The object name the exam WebView injects this bridge under: `window.CmsOfflineExam`. */
        const val JS_NAME = "CmsOfflineExam"

        const val PHASE = "phase"
        const val PHASE_LOADING = "loading"
        const val PHASE_DENIED = "denied"
        const val PHASE_READY = "ready"

        /** captureOfflineAnswer results — recorded is the only success code. */
        const val RECORDED = "recorded"
        const val DENIED = "denied"
        const val INVALID_ARGS = "invalid_args"

        /** submitOfflineExam result + the initial sync-status codes. */
        const val SUBMITTING = "submitting"
        const val SYNC_IDLE = "idle"

        /** Denied-phase code when the current origin is not allowlisted (or a provider fails). */
        const val DENIED_ORIGIN = "denied_origin"

        /** Answer-duration bound: 0..86400 seconds (a full day; the runner caps again). */
        const val MAX_DURATION_SECONDS = 86_400

        /** Bridge id bound — canonical UUIDs are 36 chars; hostile oversized ids stop here. */
        const val MAX_ID_CHARS = 256

        private val LOADING_JSON: String =
            JsonObject().apply { addProperty(PHASE, PHASE_LOADING) }.toString()
    }
}
