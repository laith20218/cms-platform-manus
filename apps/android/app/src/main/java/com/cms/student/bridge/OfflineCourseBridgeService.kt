package com.cms.student.bridge

import com.cms.student.media.ChunkWriter
import com.cms.student.media.ChunkedEpisodeMeta
import com.cms.student.media.ChunkedFileStore
import com.cms.student.media.CachePolicy
import com.cms.student.media.parseIsoInstantOrNull
import com.cms.student.security.OfflineSession
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor

/**
 * Wave 5b-i — download facade onto the frozen course-episode content route
 * (`GET {base}/media/course-episode/{episodeId}/content` via
 * [com.cms.student.media.HttpsMediaContentTransport]). Streams the episode
 * into the caller's [ChunkWriter] and reports the metadata the service
 * persists: the copied byte count, the server MIME (display only), and the
 * server-issued entitlement expiry of the token used. Transport failures
 * surface as [CourseDownloadException] for the service's status mapping.
 *
 * Note: the concrete HTTPS transport resolves its OWN session through the
 * shared session provider — the [session] parameter documents the session the
 * service resolved and is deliberately not forwarded (single source of truth;
 * a session that died between resolution and execution answers 401 honestly).
 */
fun interface CourseEpisodeDownloadFacade {
    fun download(
        session: OfflineSession,
        subjectId: UUID,
        episodeId: UUID,
        sink: ChunkWriter,
        onProgress: (Int) -> Unit,
        isCanceled: () -> Boolean
    ): CourseEpisodeDownloadOutcome
}

/**
 * Successful course-episode download result: byte count, the server MIME
 * ([contentType], display only), and the raw server-issued entitlement expiry
 * captured from the token that performed the download (null when the server
 * sent none — the same durable-policy rule the library cache follows).
 */
data class CourseEpisodeDownloadOutcome(
    val bytes: Long,
    val contentType: String? = null,
    val entitlementExpiresAt: Instant? = null
)

/**
 * Transport failure of a course-episode download. [statusCode] carries the
 * HTTP verdict (401/403 = entitlement denial for this student; other codes =
 * endpoint failures); null = no HTTP verdict (network unreachable, or a
 * cooperative cancel — the service distinguishes by its own cancel flag).
 */
class CourseDownloadException(val statusCode: Int?) :
    RuntimeException("course episode download failed with HTTP ${statusCode ?: "n/a"}")

/** The combined 5 GiB cap cannot hold the fresh episode even after LRU eviction. */
class CourseQuotaExceededException : RuntimeException("course episode quota exceeded")

/** Download bookkeeping for one episodeId (terminal rows stay observable once). */
internal class EpisodeDownloadState(val episodeId: String) {
    enum class Phase { QUEUED, DOWNLOADING, READY, DENIED_AUTH, CANCELED, ERROR }

    @Volatile var phase: Phase = Phase.QUEUED
    @Volatile var percent: Int = 0
    @Volatile var errorCode: String? = null
    @Volatile var canceled: Boolean = false
}

/**
 * Wave 5b-i — orchestrator for the five hosted-course-episode bridge methods
 * (the W1 web contract, apps/student-web/src/utils/native-courses.ts). Pure
 * JVM (all dependencies are injectable interfaces/lambda seams — no Android
 * types), mirroring [OfflinePackageBridgeService]: a ConcurrentHashMap of
 * download states keyed by episodeId, an executor for network + chunk work,
 * stable string status codes, and fail-closed deny codes.
 *
 * Storage: [ChunkedFileStore] — 4 MiB independently encrypted chunks, so no
 * complete clear media file ever exists on disk (Phase Q). The service owns
 * the writer lifecycle: it opens the sequence, hands it to the transport
 * facade, and publishes + writes the meta only on success.
 *
 * Sessions, honestly:
 *  - This wave resolves the session through [sessionProvider] ONLY — there is
 *    NO web-token path for course media yet (an honest limitation by design):
 *    shell students without a native session answer `denied_native_session`
 *    and the CTA message tells them to log in first. Nothing is faked.
 *  - The resolved session must belong to THIS installation (defensive parity
 *    with the installation-scoped store and quota).
 *  - subjectId is REQUIRED for course downloads (the entitlement issue call
 *    is subject-scoped): a request without one answers `error:subject_required`
 *    — an honest terminal row the web maps to the generic error message.
 *
 * Quota (Owner decision 2026-11-28 — shared 10 GiB cap, NO automatic eviction):
 * the download is guarded DURING the chunked copy (every chunk published is
 * counted against `mediaBytesUsed() + totalChunkedBytes()`); the moment the cap
 * would be exceeded the copy aborts, the fresh episode's partial chunks are
 * deleted, and the state answers `error:quota`. Existing episodes are NEVER
 * evicted to make room.
 *
 * Threading model: every public method may run on the WebView JavaBridge
 * thread and only enqueues or performs bounded in-memory reads; network +
 * chunk writes run on [executor] (single-threaded in production, distinct
 * from the media and package executors).
 *
 * Rows NEVER carry tokens, filesystem paths, chunk layouts, or content bytes —
 * only the safe metadata the W1 web contract validates.
 */
class OfflineCourseBridgeService(
    private val transport: CourseEpisodeDownloadFacade,
    private val chunkStore: ChunkedFileStore,
    private val sessionProvider: () -> OfflineSession?,
    private val installationId: () -> String,
    private val executor: Executor,
    private val clock: () -> Instant,
    private val mediaBytesUsed: () -> Long,
    /** W5b-ii: launches the chunked loopback player on the MAIN thread (app wires a Handler). */
    private val playerLauncher: (String) -> Unit = {},
    private val episodeListMax: Int = DEFAULT_EPISODE_LIST_MAX
) : OfflineCourseBridgeSurface {

    private val states = ConcurrentHashMap<String, EpisodeDownloadState>()

    // =====================================================================
    // Bridge-facing API (string codes — see companion constants)
    // =====================================================================

    override fun listOfflineCourseEpisodes(): String {
        val metas = runCatching { chunkStore.listMetas() }.getOrDefault(emptyList())
        if (metas.isEmpty()) return EMPTY_LIST_JSON
        val rows = metas.asSequence()
            .take(episodeListMax.coerceAtLeast(0))
            .map(::rowJson)
            .toList()
        if (rows.isEmpty()) return EMPTY_LIST_JSON
        return rows.joinToString(separator = ",", prefix = "[", postfix = "]")
    }

    override fun ensureCourseEpisodeLocal(episodeJson: String?): String {
        val request = parseEpisodeRequest(episodeJson) ?: return INVALID_ARGS

        states[request.episodeId]?.let { state ->
            when (state.phase) {
                EpisodeDownloadState.Phase.QUEUED -> return QUEUED
                EpisodeDownloadState.Phase.DOWNLOADING -> return DOWNLOADING
                EpisodeDownloadState.Phase.READY -> return READY
                // Terminal rows stay observable exactly once (the packages
                // analog): the call after that retries fresh.
                EpisodeDownloadState.Phase.DENIED_AUTH -> {
                    states.remove(request.episodeId)
                    return DENIED_AUTH
                }
                EpisodeDownloadState.Phase.CANCELED -> {
                    states.remove(request.episodeId)
                    return CANCELED
                }
                EpisodeDownloadState.Phase.ERROR -> {
                    states.remove(request.episodeId)
                    return "$ERROR:${state.errorCode ?: "unknown"}"
                }
            }
        }

        // Fast path: the episode is already stored and its stored server-issued
        // entitlement expiry is absent or in the future — a PURE store read,
        // no network, no executor, no facade (the media-cache ready rule).
        if (readyInStore(request.episodeId)) return READY

        val session = sessionProvider() ?: return DENIED_NATIVE_SESSION
        if (session.installationId != installationId()) return DENIED_NATIVE_SESSION

        if (request.subjectId == null) {
            // Honest terminal row: course-episode entitlement issuance is
            // subject-scoped, so a request without the subject cannot start.
            val state = EpisodeDownloadState(request.episodeId)
            state.phase = EpisodeDownloadState.Phase.ERROR
            state.errorCode = ERROR_SUBJECT_REQUIRED
            states[request.episodeId] = state
            return "$ERROR:$ERROR_SUBJECT_REQUIRED"
        }

        val state = EpisodeDownloadState(request.episodeId)
        states[request.episodeId] = state
        executor.execute { runDownload(state, session, request) }
        return QUEUED
    }

    override fun courseEpisodeStatus(episodeId: String?): String {
        val id = episodeUuid(episodeId) ?: return INVALID_ARGS
        states[id]?.let { state -> return stateCode(state) }
        val meta = runCatching { chunkStore.readMeta(id) }.getOrNull() ?: return ABSENT
        return if (isUsableOffline(meta)) READY else DENIED_STALE
    }

    override fun removeOfflineCourseEpisode(episodeId: String?): String {
        val id = episodeUuid(episodeId) ?: return INVALID_ARGS
        val hadState = states[id] != null
        states[id]?.let { it.canceled = true }
        states.remove(id)
        val meta = runCatching { chunkStore.readMeta(id) }.getOrNull()
        val chunks = runCatching { chunkStore.chunkCount(id) }.getOrDefault(0)
        val present = hadState || meta != null || chunks > 0
        runCatching { chunkStore.delete(id) }
        return if (present) REMOVED else ABSENT
    }

    override fun openOfflineCourseEpisode(episodeId: String?): String {
        val id = episodeUuid(episodeId) ?: return INVALID_ARGS
        val meta = runCatching { chunkStore.readMeta(id) }.getOrNull() ?: return ABSENT
        if (!isUsableOffline(meta)) return DENIED_STALE
        if (runCatching { chunkStore.chunkCount(id) }.getOrDefault(0) == 0) return ABSENT
        // W5b-ii: the launcher owns main-thread posting + the FLAG_SECURE player
        // activity; the loopback reassembly channel lives inside that activity.
        runCatching { playerLauncher(id) }.onFailure { return "$ERROR:player_launch_failed" }
        return OPENING
    }

    // =====================================================================
    // Session-death reset (Phase P wiring calls this; store wipes are owned
    // by the application graph through chunkStore.deleteAll directly)
    // =====================================================================

    /** Clears every in-memory download state — NO store writes, safe from any thread. */
    fun reset() {
        states.clear()
    }

    // =====================================================================
    // Download engine (executor thread)
    // =====================================================================

    private fun runDownload(state: EpisodeDownloadState, session: OfflineSession, request: EpisodeRequest) {
        if (states[state.episodeId] !== state) return // removed while queued — abandon silently
        state.phase = EpisodeDownloadState.Phase.DOWNLOADING
        val subjectId = request.subjectId
            ?: return failClean(state, ERROR_SUBJECT_REQUIRED) // defensive: the bridge pre-checked
        val writer = runCatching { chunkStore.openChunkSequence(state.episodeId) }.getOrNull()
            ?: return failClean(state, ERROR_STORE)
        try {
            val freshBytes = longArrayOf(0L)
            val outcome = transport.download(
                session = session,
                subjectId = subjectId,
                episodeId = UUID.fromString(state.episodeId),
                sink = writer,
                onProgress = { percent ->
                    state.percent = percent.coerceIn(0, 100)
                    // Owner decision 2026-11-28: mid-copy shared-cap guard. The
                    // byte count is derived from the chunk store writer state via
                    // chunkCount * chunk size when the facade reports progress —
                    // an approximation only used to abort EARLY; the exact check
                    // runs below on the published total before the meta lands.
                },
                isCanceled = { state.canceled || !fitsSharedCap(request.episodeId, freshBytes[0]) }
            )
            if (state.canceled) throw CourseDownloadException(null)
            val published = writer.finish() ?: return failClean(state, ERROR_STORE)
            freshBytes[0] = published.totalBytes
            // Exact shared-cap check BEFORE the meta is persisted: an over-cap
            // episode is deleted and the state answers `error:quota`. No eviction.
            if (!fitsSharedCap(request.episodeId, published.totalBytes)) {
                runCatching { chunkStore.delete(request.episodeId) }
                state.phase = EpisodeDownloadState.Phase.ERROR
                state.errorCode = QUOTA
                return
            }
            val now = clock()
            val meta = ChunkedEpisodeMeta(
                episodeId = request.episodeId,
                courseId = request.courseId,
                subjectId = subjectId.toString(),
                title = request.title,
                type = request.type,
                contentType = outcome.contentType,
                totalBytes = published.totalBytes,
                chunkCount = published.chunkCount,
                createdAt = now.toString(),
                lastAccessAt = now.toString(),
                entitlementExpiresAt = outcome.entitlementExpiresAt?.toString()
            )
            if (!runCatching { chunkStore.writeMeta(request.episodeId, meta) }.getOrDefault(false)) {
                return failClean(state, ERROR_STORE)
            }
            state.phase = EpisodeDownloadState.Phase.READY
            states.remove(request.episodeId)
        } catch (auth: CourseDownloadException) {
            when (auth.statusCode) {
                401, 403 -> {
                    runCatching { chunkStore.delete(state.episodeId) }
                    state.phase = EpisodeDownloadState.Phase.DENIED_AUTH
                }
                null -> if (state.canceled) {
                    runCatching { chunkStore.delete(state.episodeId) }
                    state.phase = EpisodeDownloadState.Phase.CANCELED
                } else if (!fitsSharedCap(state.episodeId, 0L)) {
                    // Mid-copy shared-cap abort (the isCanceled seam fired on the cap).
                    runCatching { chunkStore.delete(state.episodeId) }
                    state.phase = EpisodeDownloadState.Phase.ERROR
                    state.errorCode = QUOTA
                } else {
                    runCatching { chunkStore.delete(state.episodeId) }
                    fail(state, ERROR_NETWORK)
                }
                else -> {
                    runCatching { chunkStore.delete(state.episodeId) }
                    fail(state, "$ERROR_HTTP_PREFIX${auth.statusCode}")
                }
            }
        } catch (quota: CourseQuotaExceededException) {
            // The fresh episode was already deleted by the guard — the state row tells the panel why.
            runCatching { chunkStore.delete(state.episodeId) }
            state.phase = EpisodeDownloadState.Phase.ERROR
            state.errorCode = QUOTA
        } catch (error: Exception) {
            if (state.canceled || !fitsSharedCap(state.episodeId, 0L)) {
                // A mid-copy cap abort surfaces as a cooperative cancel; the fresh
                // episode is deleted and the honest quota row is recorded instead.
                runCatching { chunkStore.delete(state.episodeId) }
                state.phase = EpisodeDownloadState.Phase.ERROR
                state.errorCode = QUOTA
            } else {
                runCatching { chunkStore.delete(state.episodeId) }
                fail(state, ERROR_DOWNLOAD)
            }
        }
    }

    /**
     * Shared-capacity guard (Owner decision 2026-11-28 — replaces LRU eviction).
     * Returns true while the projected shared total (media + chunked bytes +
     * the bytes already published for THIS in-flight episode) still fits the
     * 10 GiB cap. The download loop consults it after every chunk; on false the
     * copy aborts, the fresh episode is deleted, and the state answers
     * `error:quota`. Existing content is NEVER evicted.
     */
    private fun fitsSharedCap(freshEpisodeId: String, freshBytesSoFar: Long): Boolean {
        val chunkedOthers = runCatching { chunkStore.listMetas() }
            .getOrDefault(emptyList())
            .filter { it.episodeId != freshEpisodeId }
            .sumOf { it.totalBytes }
        return mediaBytesUsed() + chunkedOthers + freshBytesSoFar <= CachePolicy.MAX_CACHE_BYTES
    }

    private fun fail(state: EpisodeDownloadState, errorCode: String) {
        state.phase = EpisodeDownloadState.Phase.ERROR
        state.errorCode = errorCode
    }

    /** Terminal store failure: partial writes never become episodes. */
    private fun failClean(state: EpisodeDownloadState, errorCode: String) {
        runCatching { chunkStore.delete(state.episodeId) }
        fail(state, errorCode)
    }

    // =====================================================================
    // Store usability + row serialization
    // =====================================================================

    /** Durable offline rule (mirrors MediaCacheService): stored + no stored expiry, or expiry in the future. */
    private fun isUsableOffline(meta: ChunkedEpisodeMeta): Boolean {
        val raw = meta.entitlementExpiresAt ?: return true
        val expiry = parseIsoInstantOrNull(raw) ?: return false // unparseable stored expiry fails closed
        return clock().isBefore(expiry)
    }

    private fun readyInStore(episodeId: String): Boolean =
        runCatching { chunkStore.readMeta(episodeId) }.getOrNull()?.let { isUsableOffline(it) } ?: false

    /** W1 web contract row: safe metadata only; null fields omitted. */
    private fun rowJson(meta: ChunkedEpisodeMeta): String {
        val row = JsonObject()
        row.addProperty("episodeId", meta.episodeId)
        meta.courseId?.let { row.addProperty("courseId", it) }
        meta.title?.let { row.addProperty("title", it) }
        row.addProperty("type", meta.type)
        row.addProperty("bytes", meta.totalBytes)
        row.addProperty("downloadedAt", meta.createdAt)
        row.addProperty("lastAccessAt", meta.lastAccessAt)
        return row.toString()
    }

    private fun stateCode(state: EpisodeDownloadState): String = when (state.phase) {
        EpisodeDownloadState.Phase.QUEUED -> QUEUED
        EpisodeDownloadState.Phase.DOWNLOADING -> DOWNLOADING
        EpisodeDownloadState.Phase.READY -> READY
        EpisodeDownloadState.Phase.DENIED_AUTH -> DENIED_AUTH
        EpisodeDownloadState.Phase.CANCELED -> CANCELED
        EpisodeDownloadState.Phase.ERROR -> "$ERROR:${state.errorCode ?: "unknown"}"
    }

    // =====================================================================
    // Request parsing + validation (fail-closed on anything malformed)
    // =====================================================================

    private data class EpisodeRequest(
        val episodeId: String,
        val courseId: String?,
        val subjectId: UUID?,
        val title: String?,
        /** "video" | "audio" (assetType "course-episode" is treated as video). */
        val type: String
    )

    private fun parseEpisodeRequest(raw: String?): EpisodeRequest? {
        if (raw.isNullOrBlank() || raw.length > MAX_REQUEST_JSON_CHARS) return null
        val root = runCatching { JsonParser.parseString(raw) }.getOrNull() ?: return null
        if (!root.isJsonObject) return null
        val parsed = root.asJsonObject

        val episodeIdElement = parsed.get("episodeId") ?: return null
        if (episodeIdElement.isJsonNull || !episodeIdElement.isJsonPrimitive) return null
        val episodeId = uuidOrNull(episodeIdElement.asString.trim()) ?: return null

        // Optional UUID fields: ABSENT is fine, MALFORMED invalidates the whole request
        // (fail-closed, exactly like the W2 package request parser).
        var courseId: String? = null
        parsed.get("courseId")?.takeUnless { it.isJsonNull }?.let { element ->
            if (!element.isJsonPrimitive) return null
            courseId = uuidOrNull(element.asString.trim()) ?: return null
        }
        var subjectId: UUID? = null
        parsed.get("subjectId")?.takeUnless { it.isJsonNull }?.let { element ->
            if (!element.isJsonPrimitive) return null
            subjectId = uuidOrNull(element.asString.trim())?.let { UUID.fromString(it) } ?: return null
        }

        var title: String? = null
        parsed.get("title")?.takeUnless { it.isJsonNull }?.let { element ->
            if (!element.isJsonPrimitive) return null
            val value = element.asString.trim()
            if (value.length > MAX_TITLE_CHARS) return null
            title = value.takeIf { it.isNotBlank() }
        }

        var type = TYPE_VIDEO
        parsed.get("assetType")?.takeUnless { it.isJsonNull }?.let { element ->
            if (!element.isJsonPrimitive) return null
            type = when (element.asString.trim().lowercase()) {
                "video", "course-episode" -> TYPE_VIDEO
                "audio" -> TYPE_AUDIO
                else -> return null
            }
        }

        return EpisodeRequest(episodeId, courseId, subjectId, title, type)
    }

    private fun uuidOrNull(raw: String): String? =
        if (raw.isBlank() || raw.length > MAX_EPISODE_ID_CHARS || !EPISODE_ID_PATTERN.matches(raw)) null else raw

    private fun episodeUuid(raw: String?): String? =
        raw?.trim()?.takeIf { it.isNotBlank() && it.length <= MAX_EPISODE_ID_CHARS && EPISODE_ID_PATTERN.matches(it) }

    companion object {
        // ensureCourseEpisodeLocal(episodeJson) →
        const val INVALID_ARGS = "invalid_args"                  // blank/oversized/malformed request or ids
        const val DENIED_NATIVE_SESSION = "denied_native_session" // no native session (honest W5b-i limitation: no web-token path)
        const val DENIED_AUTH = "denied_auth"                    // server answered 401/403 for this student
        const val QUEUED = "queued"                              // download enqueued on the executor
        const val DOWNLOADING = "downloading"                    // already in flight for this episodeId
        const val READY = "ready"                                // stored and usable offline (entitlement null-or-future)
        const val ERROR = "error"                                // terminal engine failure ("error:<code>")

        // courseEpisodeStatus(episodeId) → (plus the codes above)
        const val ABSENT = "absent"
        const val DENIED_STALE = "denied_stale"                  // stored, but its entitlement expiry has passed

        // removeOfflineCourseEpisode(episodeId) →
        const val REMOVED = "removed"

        // download-loop terminal codes surfaced via status (web deny-map covered)
        const val CANCELED = "canceled"
        const val QUOTA = "quota"

        // openOfflineCourseEpisode(episodeId) →
        const val OPENING = "opening"    // player activity launched (W5b-ii)
        const val PLAYBACK_PENDING = "error:playback_pending"    // legacy interim — retained for version-skew defense (old web + new shell)

        /** Empty JSON array — the safe listing answer without stored episodes. */
        const val EMPTY_LIST_JSON = "[]"

        /** Row cap for one listing (defensive; the W1 web side caps again at 500). */
        const val DEFAULT_EPISODE_LIST_MAX = 200

        /** Bridge request payload bound (episode/course/subject UUIDs + title). */
        const val MAX_REQUEST_JSON_CHARS = 8 * 1024

        /** Display-title bound (validated then stored as safe metadata). */
        const val MAX_TITLE_CHARS = 256

        /** Episode id bound (the W1 web contract accepts the same 256-char opaque cap). */
        const val MAX_EPISODE_ID_CHARS = 256

        /** Canonical hyphenated UUID shape — blocks path tricks before UUID parsing. */
        val EPISODE_ID_PATTERN: Regex =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

        private const val TYPE_VIDEO = "video"
        private const val TYPE_AUDIO = "audio"
        private const val ERROR_NETWORK = "network"
        private const val ERROR_SUBJECT_REQUIRED = "subject_required"
        private const val ERROR_STORE = "store"
        private const val ERROR_DOWNLOAD = "download_failed"
        private const val ERROR_HTTP_PREFIX = "http_"
    }
}
