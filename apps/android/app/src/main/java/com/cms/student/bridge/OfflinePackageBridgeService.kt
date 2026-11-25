package com.cms.student.bridge

import com.cms.student.security.IOfflinePackageStore
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineTransportException
import com.cms.student.security.RevocationStatus
import com.cms.student.security.StoredOfflinePackage
import com.cms.student.security.WebJwtClaims
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor

/**
 * W2 (UX 3C) — the online package-download facade the bridge service adapts
 * onto the existing [com.cms.student.security.OfflineRuntimeCoordinator] graph.
 * A null facade result is a security/download rejection; transport failures
 * propagate as [OfflineTransportException] for the caller's status mapping.
 * CmsApplication builds this lambda from its nullable runtime — null runtime
 * (BuildConfig OFFLINE_TRUSTED_CLIENT_IMPLEMENTED=false) means the whole
 * surface fails closed with `denied_disabled`.
 */
fun interface AuthenticatedOfflineRuntimeFacade {
    /** Server-side package acquisition; returns the persisted packageId, or null on rejection. */
    fun download(session: OfflineSession, subjectId: UUID, examId: UUID?): UUID?
}

/** Download bookkeeping for one subjectId(+optional examId) request key. */
internal class PackageDownloadState(val key: PackageDownloadKey) {
    enum class Phase { QUEUED, DOWNLOADING, READY, DENIED_AUTH, ERROR }

    @Volatile var phase: Phase = Phase.QUEUED
    @Volatile var packageId: UUID? = null
    @Volatile var errorCode: String? = null
}

/** Requests are keyed by subject scope exactly like MediaCacheService keys by contentId. */
internal data class PackageDownloadKey(val subjectId: UUID, val examId: UUID?)

/**
 * W2 (UX 3C) — orchestrator for the five offline-package bridge methods. Pure
 * JVM (all dependencies are injectable lambdas/interfaces — no Android types),
 * mirroring [com.cms.student.media.MediaCacheService]: a ConcurrentHashMap of
 * download states keyed by subject scope, an executor for network work, stable
 * string status codes, and fail-closed deny codes.
 *
 * Sessions, honestly:
 *  - Native session ([sessionProvider], the same source the media cache uses)
 *    always wins for downloads.
 *  - Otherwise the WEB page may supply its own accessToken (the W1 CTA passes
 *    it from student-web's session store). [WebJwtClaims] turns it into an
 *    EPHEMERAL [OfflineSession] that lives in memory only for the duration of
 *    one download — the token is never stored, logged, or returned to JS, and
 *    the SERVER remains its verifier (web→native direction is allowed; the
 *    native→web token direction stays forbidden, D1).
 *  - With no resolvable session a download answers `denied_native_session` —
 *    nothing is faked.
 *  - Store listing (`listOfflinePackages` / status / remove) resolves the
 *    store-bound student as `sessionProvider()?.studentId` else the LAST
 *    web-bound student of a successful web-session download (in-memory only).
 *    When both are null the listing answers `[]` / `absent` / `denied_native_session`
 *    — an honest empty: the store is installation-bound anyway, and logout
 *    wipes it (Wave 4). Process death forgets the last web student; the web
 *    page re-passes its token on the next CTA, which restores the binding.
 *
 * Threading model: every public method may run on the WebView JavaBridge
 * thread; none of them performs unbounded work — `downloadOfflinePackage`
 * only enqueues onto [executor], and list/status/remove perform at most
 * bounded encrypted-store reads (the same contract `listCached` already
 * follows). Network work (entitlement issue + package download + status
 * refresh) runs on [executor] (single-threaded in production, distinct from
 * the media executor).
 *
 * Rows NEVER carry tokens, filesystem paths, or key material — only the safe
 * metadata the W1 web contract validates (packageId, subjectIds, status,
 * expiresAt, questionCount, pendingAnswerCount, downloadedAt).
 */
class OfflinePackageBridgeService(
    private val runtime: () -> AuthenticatedOfflineRuntimeFacade?,
    private val packageStore: IOfflinePackageStore,
    private val sessionProvider: () -> OfflineSession?,
    private val installationId: () -> String,
    private val executor: Executor,
    private val clock: () -> Instant,
    private val packageListMax: Int = DEFAULT_PACKAGE_LIST_MAX
) : OfflinePackageBridgeSurface {

    private val states = ConcurrentHashMap<PackageDownloadKey, PackageDownloadState>()
    private val packageIdToKey = ConcurrentHashMap<UUID, PackageDownloadKey>()

    /** Last student bound by a successful web-session download (memory only, never persisted). */
    @Volatile private var lastWebStudentId: UUID? = null

    // =====================================================================
    // Bridge-facing API (string codes — see companion constants)
    // =====================================================================

    override fun listOfflinePackages(): String {
        val user = storeBoundStudentId() ?: return EMPTY_LIST_JSON
        val stored = runCatching { packageStore.listAll(user, installationId()) }.getOrDefault(emptyList())
        if (stored.isEmpty()) return EMPTY_LIST_JSON
        val rows = stored.asSequence()
            .take(packageListMax.coerceAtLeast(0))
            .map(::rowJson)
            .toList()
        if (rows.isEmpty()) return EMPTY_LIST_JSON
        return rows.joinToString(separator = ",", prefix = "[", postfix = "]")
    }

    override fun downloadOfflinePackage(requestJson: String?): String {
        val request = parseDownloadRequest(requestJson) ?: return INVALID_ARGS
        val key = PackageDownloadKey(request.subjectId, request.examId)

        states[key]?.let { state ->
            when (state.phase) {
                PackageDownloadState.Phase.QUEUED, PackageDownloadState.Phase.DOWNLOADING -> return DOWNLOADING
                // A completed download answers ready without re-hitting the server.
                PackageDownloadState.Phase.READY -> return READY
                // Terminal failure rows stay observable exactly once — the next CTA
                // click surfaces the deny/error code (the packages analog of
                // MediaCacheService's observable terminal rows; a package download
                // has no id the page could poll). The call after that retries fresh.
                PackageDownloadState.Phase.DENIED_AUTH -> {
                    states.remove(key)
                    return DENIED_AUTH
                }
                PackageDownloadState.Phase.ERROR -> {
                    states.remove(key)
                    return "$ERROR:${state.errorCode ?: "unknown"}"
                }
            }
        }

        // Fast path (Owner UX decision, honest by construction): a package the
        // SERVER already confirmed ACTIVE, whose manifest expiry is still in
        // the future and whose allowedSubjects covers the request, answers
        // "ready" with a PURE STORE READ — no network, no executor, no facade.
        // Exam-scoped requests are treated the same: manifest scope is by
        // subject; exam binding is a server-side concern.
        if (readyPackageInStore(request)) {
            // The fast path re-confirms the store binding for this student — a
            // web-token-resolved student is remembered so status/list/remove
            // keep answering without any live session (binding = memory only).
            if (sessionProvider() == null) {
                resolveSession(request.accessToken)?.let { lastWebStudentId = it.studentId }
            }
            return READY
        }

        // Fail-closed feature gate first: a disabled runtime denies regardless of session.
        val facade = runtime() ?: return DENIED_DISABLED
        val session = resolveSession(request.accessToken) ?: return DENIED_NATIVE_SESSION

        val state = PackageDownloadState(key)
        states[key] = state
        val fromWebSession = sessionProvider() == null
        executor.execute { runDownload(facade, session, state, fromWebSession) }
        return QUEUED
    }

    override fun offlinePackageStatus(packageId: String?): String {
        val id = packageUuid(packageId) ?: return INVALID_ARGS
        packageIdToKey[id]?.let { key -> states[key]?.let { return stateCode(it) } }
        // No in-process state: a package persisted by an earlier download/process.
        val user = storeBoundStudentId() ?: return ABSENT
        val stored = runCatching { packageStore.load(id, user, installationId()) }.getOrNull() ?: return ABSENT
        return if (stored.envelope.manifest.expiresAt.isAfter(clock())) READY else ABSENT
    }

    override fun removeOfflinePackage(packageId: String?): String {
        val id = packageUuid(packageId) ?: return INVALID_ARGS
        packageIdToKey.remove(id)?.let { key -> states.remove(key) }
        val user = storeBoundStudentId() ?: return DENIED_NATIVE_SESSION
        runCatching { packageStore.load(id, user, installationId()) }.getOrNull() ?: return ABSENT
        runCatching { packageStore.invalidate(id, user, installationId()) }
        return REMOVED
    }

    override fun openOfflineExam(packageId: String?): String {
        if (packageUuid(packageId) == null) return INVALID_ARGS
        // Wave 3 owns the offline exam player (decrypted-package webview). This
        // build answers the honest interim code — the W1 web deny map carries a
        // dedicated Arabic message for it; no exam is ever faked as opened.
        return ERROR_EXAM_UI_PENDING
    }

    // =====================================================================
    // Download engine (executor thread)
    // =====================================================================

    private fun runDownload(
        facade: AuthenticatedOfflineRuntimeFacade,
        session: OfflineSession,
        state: PackageDownloadState,
        fromWebSession: Boolean
    ) {
        if (states[state.key] !== state) return // removed while queued — abandon silently
        state.phase = PackageDownloadState.Phase.DOWNLOADING
        try {
            val packageId = facade.download(session, state.key.subjectId, state.key.examId)
                ?: return fail(state, ERROR_DOWNLOAD_FAILED)
            state.packageId = packageId
            packageIdToKey[packageId] = state.key
            state.phase = PackageDownloadState.Phase.READY
            if (fromWebSession) lastWebStudentId = session.studentId
        } catch (transport: OfflineTransportException) {
            when (transport.statusCode) {
                401, 403 -> state.phase = PackageDownloadState.Phase.DENIED_AUTH
                429 -> fail(state, ERROR_RATE_LIMITED)
                null -> fail(state, ERROR_NETWORK)
                else -> fail(state, "$ERROR_HTTP_PREFIX${transport.statusCode}")
            }
        } catch (error: Exception) {
            fail(state, ERROR_DOWNLOAD_FAILED)
        }
    }

    private fun fail(state: PackageDownloadState, errorCode: String) {
        state.phase = PackageDownloadState.Phase.ERROR
        state.errorCode = errorCode
    }

    // =====================================================================
    // Session + store binding resolution
    // =====================================================================

    /** Native session wins; else the web token routes an ephemeral session (server verifies it). */
    private fun resolveSession(accessToken: String?): OfflineSession? {
        sessionProvider()?.let { return it }
        val token = accessToken ?: return null
        val claims = WebJwtClaims.parse(token) ?: return null
        if (!WebJwtClaims.SUBJECT_UUID_PATTERN.matches(claims.subject)) return null
        val studentId = runCatching { UUID.fromString(claims.subject) }.getOrNull() ?: return null
        return OfflineSession(studentId, token, installationId())
    }

    /** Student binding for store reads: native session, else the last web-bound student. */
    private fun storeBoundStudentId(): UUID? = sessionProvider()?.studentId ?: lastWebStudentId

    /**
     * Pure store read behind the download fast path. Uses the same identity
     * resolution as the listing (native session, last web student, or the
     * request's own ephemeral web session) — the read is bounded and never
     * touches the network, the facade, or the executor.
     */
    private fun readyPackageInStore(request: DownloadRequest): Boolean {
        val user = resolveSession(request.accessToken)?.studentId ?: lastWebStudentId ?: return false
        val now = clock()
        return runCatching {
            packageStore.listAll(user, installationId()).any { stored ->
                request.subjectId in stored.envelope.manifest.allowedSubjects &&
                    stored.lastConfirmedStatus == RevocationStatus.ACTIVE &&
                    stored.envelope.manifest.expiresAt.isAfter(now)
            }
        }.getOrDefault(false)
    }

    // =====================================================================
    // Request parsing + row serialization (lenient where the contract is
    // optional, fail-closed on anything malformed)
    // =====================================================================

    private data class DownloadRequest(val subjectId: UUID, val examId: UUID?, val accessToken: String?)

    private fun parseDownloadRequest(raw: String?): DownloadRequest? {
        if (raw.isNullOrBlank() || raw.length > MAX_REQUEST_JSON_CHARS) return null
        val root = runCatching { JsonParser.parseString(raw) }.getOrNull() ?: return null
        if (!root.isJsonObject) return null
        val parsed = root.asJsonObject

        val subjectElement = parsed.get("subjectId") ?: return null
        if (subjectElement.isJsonNull || !subjectElement.isJsonPrimitive) return null
        val subjectId = uuidOrNull(subjectElement.asString.trim()) ?: return null

        var examId: UUID? = null
        parsed.get("examId")?.takeUnless { it.isJsonNull }?.let { element ->
            if (!element.isJsonPrimitive) return null
            examId = uuidOrNull(element.asString.trim()) ?: return null
        }

        var accessToken: String? = null
        parsed.get("accessToken")?.takeUnless { it.isJsonNull }?.let { element ->
            if (!element.isJsonPrimitive) return null
            val token = element.asString.trim()
            if (token.length > MAX_ACCESS_TOKEN_CHARS) return null
            accessToken = token.takeIf { it.isNotBlank() }
        }

        // Display hint only: shape-validated (≤256 chars), then deliberately
        // ignored — the envelope carries no display title and the W1 web row
        // makes `title` optional.
        parsed.get("title")?.takeUnless { it.isJsonNull }?.let { element ->
            if (!element.isJsonPrimitive) return null
            if (element.asString.trim().length > MAX_TITLE_CHARS) return null
        }

        return DownloadRequest(subjectId, examId, accessToken)
    }

    /** W1 web contract row: safe metadata only; `questionCount` omitted while the index is empty. */
    private fun rowJson(stored: StoredOfflinePackage): String {
        val manifest = stored.envelope.manifest
        val row = JsonObject()
        row.addProperty("packageId", manifest.packageId.toString())
        row.add(
            "subjectIds",
            JsonArray().apply { manifest.allowedSubjects.forEach { add(it.toString()) } }
        )
        row.addProperty("status", stored.lastConfirmedStatus.name.lowercase())
        row.addProperty("expiresAt", manifest.expiresAt.toString())
        if (stored.questionIds.isNotEmpty()) row.addProperty("questionCount", stored.questionIds.size)
        row.addProperty("pendingAnswerCount", stored.answers.count { !it.synced })
        row.addProperty("downloadedAt", manifest.issuedAt.toString())
        return row.toString()
    }

    private fun stateCode(state: PackageDownloadState): String = when (state.phase) {
        PackageDownloadState.Phase.QUEUED -> QUEUED
        PackageDownloadState.Phase.DOWNLOADING -> DOWNLOADING
        PackageDownloadState.Phase.READY -> READY
        PackageDownloadState.Phase.DENIED_AUTH -> DENIED_AUTH
        PackageDownloadState.Phase.ERROR -> "$ERROR:${state.errorCode ?: "unknown"}"
    }

    private fun packageUuid(raw: String?): UUID? {
        if (raw.isNullOrBlank()) return null
        val trimmed = raw.trim()
        if (trimmed.length > MAX_PACKAGE_ID_CHARS || !PACKAGE_ID_PATTERN.matches(trimmed)) return null
        return runCatching { UUID.fromString(trimmed) }.getOrNull()
    }

    private fun uuidOrNull(raw: String): UUID? =
        if (raw.isBlank() || raw.length > MAX_PACKAGE_ID_CHARS || !PACKAGE_ID_PATTERN.matches(raw)) null
        else runCatching { UUID.fromString(raw) }.getOrNull()

    companion object {
        // downloadOfflinePackage(requestJson) →
        const val INVALID_ARGS = "invalid_args"                 // blank/oversized/malformed request or ids
        const val DENIED_NATIVE_SESSION = "denied_native_session" // no native session AND no usable web token
        const val DENIED_DISABLED = "denied_disabled"           // BuildConfig offline trusted client is OFF (fail closed)
        const val DENIED_AUTH = "denied_auth"                   // server answered 401/403 for the resolved session
        const val QUEUED = "queued"                             // download enqueued on the executor
        const val DOWNLOADING = "downloading"                   // already in flight for this subject scope
        const val READY = "ready"                               // stored, server-confirmed ACTIVE, expiry in the future
        const val ERROR = "error"                               // terminal engine failure ("error:<code>")

        // offlinePackageStatus(packageId) → (plus the codes above)
        const val ABSENT = "absent"

        // removeOfflinePackage(packageId) →
        const val REMOVED = "removed"

        // openOfflineExam(packageId) → Wave 3 delivers the player; until then the honest interim code
        const val ERROR_EXAM_UI_PENDING = "error:exam_ui_pending"

        /** Empty JSON array — the safe `listOfflinePackages()` answer without a store binding. */
        const val EMPTY_LIST_JSON = "[]"

        /** Row cap for one listing (defensive; the W1 web side caps again at 500). */
        const val DEFAULT_PACKAGE_LIST_MAX = 200

        /** Bridge request payload bound (subject/exam UUIDs + web token + title fit comfortably). */
        const val MAX_REQUEST_JSON_CHARS = 8 * 1024

        /** Web session token bound — mirrors the bridge-level request cap. */
        const val MAX_ACCESS_TOKEN_CHARS = 8 * 1024

        /** Display-title bound (validated then ignored). */
        const val MAX_TITLE_CHARS = 256

        /** Package id bound (the W1 web contract accepts the same 256-char opaque cap). */
        const val MAX_PACKAGE_ID_CHARS = 256

        /** Canonical hyphenated UUID shape — blocks path tricks before UUID parsing. */
        val PACKAGE_ID_PATTERN: Regex =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

        private const val ERROR_DOWNLOAD_FAILED = "download_failed"
        private const val ERROR_RATE_LIMITED = "rate_limited"
        private const val ERROR_NETWORK = "network"
        private const val ERROR_HTTP_PREFIX = "http_"
    }
}
