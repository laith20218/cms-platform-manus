package com.cms.student.media

import com.cms.student.bridge.CmsNativeCacheApi
import com.cms.student.security.OfflineSession
import com.google.gson.JsonParser
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor

/** Native opener seam — launches the in-app viewer for one entry (Android impl starts the Activity). */
fun interface MediaOpener {
    /** Returns false only when the viewer could not be launched at all. */
    fun open(entry: MediaCacheEntry): Boolean
}

/**
 * Mutable download bookkeeping for one contentId. Guarded by [MediaCacheService.states]
 * (a ConcurrentHashMap keyed by contentId; terminal error rows stay observable via
 * `cacheStatus` until the next ensureLocal/openLocal clears them).
 */
internal class DownloadState(val contentId: String) {
    @Volatile var phase: CacheProgressBus.Phase = CacheProgressBus.Phase.QUEUED
    @Volatile var percent: Int = 0
    @Volatile var errorCode: String? = null
    @Volatile var canceled: Boolean = false
}

/**
 * Batch 4 orchestrator — the single place that binds index, encrypted store, quota,
 * transport, progress bus and the opener into the bridge-facing cache API. Pure JVM
 * (Android types appear only in the injected seams), so the whole state machine is
 * unit-testable with fakes, exactly like the Batch 2/3 core classes.
 *
 * Threading model:
 *  - Every public method may run on the WebView JavaBridge thread; none of them
 *    performs unbounded work: [ensureLocal] only enqueues onto [executor]; [openLocal]
 *    performs at most one bounded (2.5s) entitlement re-check when online.
 *  - Download work (entitlement issue + GET content + encrypted write + quota trim)
 *    runs on [executor] (single-threaded in production).
 *
 * Honest behaviors:
 *  - No native session (D1: the WebView's sessionStorage tokens are deliberately
 *    unreachable) → downloads answer `denied_native_session`; nothing is faked.
 *  - A dead access token triggers ONE rotation attempt via [sessionRefresher]
 *    (wired to the Batch-2 refresh path); when that fails the [onAuthDead] hook
 *    wipes the native session — and with it, per the session-integration contract,
 *    the whole media cache.
 *  - 403 from the entitlement/content gates is an entitlement denial for THIS
 *    student, not a dead token: no wipe, just `denied_auth`.
 *  - Durable offline policy (Owner decision 2026-11-23): offline opens are NOT
 *    gated by an hour count. The local ciphertext stays openable until a wipe
 *    (logout / auth rejection / user clear) or until the server-issued entitlement
 *    expiry stored with the entry ([MediaCacheEntry.entitlementExpiresAt]) has
 *    passed (`denied_stale`). Entries without stored expiry stay usable offline —
 *    an online open still re-checks the server, so rights are never faked.
 *  - Shared 10 GiB offline cap, NO automatic eviction (Owner decision 2026-11-28):
 *    a download whose bytes would not fit the SHARED total (media + course chunks
 *    + question packages, via [sharedOfflineBytes]) is refused with `quota` and
 *    existing content is never touched. Because the exact object size is only
 *    known after streaming, the transport sink enforces the cap DURING the copy
 *    (a [MediaQuotaExceededException] aborts the write, the partial file is
 *    deleted, and no eviction ever happens).
 */
class MediaCacheService(
    private val index: CacheIndex,
    private val fileStore: MediaFileStore,
    private val transport: MediaContentTransport,
    private val quota: CacheQuota,
    private val progressBus: CacheProgressBus,
    private val executor: Executor,
    private val opener: MediaOpener,
    private val networkAvailability: () -> Boolean,
    private val clock: () -> Instant,
    private val sessionProvider: () -> OfflineSession?,
    private val sessionRefresher: () -> OfflineSession?,
    private val onAuthDead: () -> Unit,
    /** Total offline bytes across ALL stores (media + chunked episodes + packages). */
    private val sharedOfflineBytes: () -> Long = { 0L }
) : CmsNativeCacheApi {

    private val states = ConcurrentHashMap<String, DownloadState>()

    // =====================================================================
    // Bridge-facing API (string codes — see CacheStatus)
    // =====================================================================

    override fun listCached(): String = index.all().joinToString(
        separator = ",",
        prefix = "[",
        postfix = "]"
    ) { it.toSafeJson() }

    override fun ensureLocal(contentId: String, type: String?, hintsJson: String?): String {
        val id = validatedContentId(contentId) ?: return CacheStatus.INVALID_ARGS
        val kind = MediaKind.fromWireName(type) ?: return CacheStatus.UNSUPPORTED_TYPE
        val hints = parseHints(hintsJson)

        states[id]?.let { state ->
            if (state.phase == CacheProgressBus.Phase.QUEUED || state.phase == CacheProgressBus.Phase.DOWNLOADING) {
                return CacheStatus.DOWNLOADING
            }
            // Terminal bookkeeping (error / denied / canceled): clear it and retry fresh.
            states.remove(id)
        }

        val entry = index.get(id)
        if (!networkAvailability()) {
            return when {
                entry == null -> CacheStatus.DENIED_OFFLINE
                isOfflineUsable(entry) -> CacheStatus.READY
                else -> CacheStatus.DENIED_STALE
            }
        }
        if (entry != null && isOfflineUsable(entry)) return CacheStatus.READY
        if (sessionProvider() == null) return CacheStatus.DENIED_NATIVE_SESSION

        val state = DownloadState(id)
        states[id] = state
        progressBus.publish(id, CacheProgressBus.Phase.QUEUED)
        executor.execute { runDownload(state, id, kind, hints) }
        return CacheStatus.STARTED
    }

    override fun openLocal(contentId: String): String {
        val id = validatedContentId(contentId) ?: return CacheStatus.INVALID_ARGS
        states.remove(id) // terminal bookkeeping from a previous attempt does not block an open
        val entry = index.get(id) ?: return CacheStatus.MISSING
        val now = clock()

        if (networkAvailability()) {
            if (sessionProvider() == null) return CacheStatus.DENIED_NATIVE_SESSION
            when (transport.isAuthorized(id)) {
                AuthorizationResult.ALLOWED -> {
                    index.confirm(id, now)
                    return if (opener.open(entry)) CacheStatus.OPENED else CacheStatus.ERROR
                }
                AuthorizationResult.DENIED -> return CacheStatus.DENIED_AUTH
                AuthorizationResult.UNAVAILABLE -> {
                    // Bounded check could not reach the server — apply the offline rule below.
                }
            }
        }
        return if (isOfflineUsable(entry)) {
            if (opener.open(entry)) CacheStatus.OPENED else CacheStatus.ERROR
        } else {
            CacheStatus.DENIED_STALE
        }
    }

    override fun cacheStatus(contentId: String): String {
        val id = validatedContentId(contentId) ?: return CacheStatus.INVALID_ARGS
        states[id]?.let { state ->
            return when (state.phase) {
                CacheProgressBus.Phase.QUEUED -> CacheStatus.QUEUED
                CacheProgressBus.Phase.DOWNLOADING -> "${CacheStatus.DOWNLOADING}:${state.percent.coerceIn(0, 100)}"
                CacheProgressBus.Phase.DENIED_AUTH -> CacheStatus.DENIED_AUTH
                CacheProgressBus.Phase.ERROR -> "${CacheStatus.ERROR}:${state.errorCode ?: "unknown"}"
                else -> CacheStatus.ABSENT
            }
        }
        return if (index.get(id) != null) CacheStatus.READY else CacheStatus.ABSENT
    }

    override fun cancelDownload(contentId: String): String {
        val id = validatedContentId(contentId) ?: return CacheStatus.INVALID_ARGS
        val state = states[id] ?: return if (index.get(id) != null) CacheStatus.NOT_DOWNLOADING else CacheStatus.ABSENT
        state.canceled = true
        return CacheStatus.CANCELED
    }

    override fun removeCached(contentId: String): String {
        val id = validatedContentId(contentId) ?: return CacheStatus.INVALID_ARGS
        states[id]?.let { it.canceled = true }
        states.remove(id)
        val entry = index.remove(id) ?: return CacheStatus.ABSENT
        fileStore.delete(entry.contentId)
        return CacheStatus.REMOVED
    }

    override fun clearCache(): String {
        wipe()
        return CacheStatus.CLEARED
    }

    // =====================================================================
    // Native-facing helpers (offline catalog, openers, session integration)
    // =====================================================================

    /** Catalog rows (most recently accessed first). */
    fun catalogEntries(): List<MediaCacheEntry> = index.all()

    /** Live progress stream (the offline catalog subscribes). */
    fun progressBus(): CacheProgressBus = progressBus

    /** True when a native session exists (the offline catalog offers a login entry when false). */
    fun hasNativeSession(): Boolean = sessionProvider() != null

    /** Whether a cached entry is usable offline under the durable policy (catalog badge). */
    fun isUsableOffline(contentId: String): Boolean = index.get(contentId)?.let { isOfflineUsable(it) } ?: false

    /** Synchronous wipe of every cached file + the index — logout / auth-reject / clearCache. */
    @Synchronized
    fun wipe() {
        states.values.forEach { it.canceled = true }
        states.clear()
        index.clear()
        fileStore.deleteAll()
    }

    // =====================================================================
    // Download engine
    // =====================================================================

    private fun runDownload(state: DownloadState, contentId: String, kind: MediaKind, hints: Hints) {
        if (state.canceled) {
            abandon(state, contentId, CacheStatus.CANCELED)
            return
        }
        state.phase = CacheProgressBus.Phase.DOWNLOADING
        progressBus.publish(contentId, CacheProgressBus.Phase.DOWNLOADING, 0)
        try {
            val bytes = downloadWithRotation(state, contentId)
            if (state.canceled) throw MediaDownloadCanceledException()

            val now = clock()
            index.put(
                MediaCacheEntry(
                    contentId = contentId,
                    kind = kind,
                    storedFileName = storedFileNameFor(contentId),
                    sourcePath = contentPathFor(contentId),
                    bytes = bytes,
                    createdAt = now,
                    lastConfirmedAt = now,
                    lastAccessAt = now,
                    displayName = hints.title?.takeIf { it.isNotBlank() },
                    subjectId = hints.subjectId?.takeIf { it.isNotBlank() },
                    entitlementExpiresAt = transport.currentEntitlementExpiresAt()
                )
            )
            trimToCap(contentId)
            states.remove(contentId)
            progressBus.publish(contentId, CacheProgressBus.Phase.READY, 100)
        } catch (auth: TransportAuthorizationException) {
            fail(state, contentId, CacheProgressBus.Phase.DENIED_AUTH, CacheStatus.DENIED_AUTH)
        } catch (quota: MediaQuotaExceededException) {
            fail(state, contentId, CacheProgressBus.Phase.ERROR, CacheStatus.QUOTA)
        } catch (canceled: MediaDownloadCanceledException) {
            abandon(state, contentId, CacheStatus.CANCELED)
        } catch (error: Exception) {
            fail(state, contentId, CacheProgressBus.Phase.ERROR, "${CacheStatus.ERROR}:${error.javaClass.simpleName}")
        }
    }

    /** One rotation attempt when the first pass 401s; refresh-rejection triggers the auth-dead hook. */
    private fun downloadWithRotation(state: DownloadState, contentId: String): Long {
        try {
            return transport.download(
                contentId = contentId,
                sink = { quotaGuardedOutput(contentId) },
                onProgress = { percent ->
                    state.percent = percent
                    progressBus.publish(contentId, CacheProgressBus.Phase.DOWNLOADING, percent)
                },
                isCanceled = { state.canceled }
            )
        } catch (auth: TransportAuthorizationException) {
            if (auth.statusCode != 401) throw auth
            val rotated = sessionRefresher()
            if (rotated == null) {
                onAuthDead()
                throw auth
            }
            return transport.download(
                contentId = contentId,
                sink = { quotaGuardedOutput(contentId) },
                onProgress = { percent ->
                    state.percent = percent
                    progressBus.publish(contentId, CacheProgressBus.Phase.DOWNLOADING, percent)
                },
                isCanceled = { state.canceled }
            )
        }
    }

    /**
     * Shared-capacity guarding sink (Owner decision 2026-11-28): wraps the encrypted
     * store output and counts every byte written against the SHARED offline total
     * (media + chunks + packages, excluding the object currently being written).
     * The copy aborts with [MediaQuotaExceededException] the moment the 10 GiB cap
     * would be exceeded — BEFORE the entry is indexed. No eviction ever runs; the
     * partial file is removed by the caller's failure path.
     */
    private fun quotaGuardedOutput(contentId: String): java.io.OutputStream =
        QuotaGuardedOutputStream(fileStore.openOutput(contentId), quota, sharedOfflineBytes)

    /**
     * In-flight byte accounting for the cap: the shared total (all offline
     * content) PLUS this service's own media index, excluding the object being
     * written/replaced. Tests inject sharedOfflineBytes=0, so the media index
     * keeps the guarded sink honest even without an app-level aggregator.
     */
    private fun usedSharedBytesExcluding(contentId: String): Long =
        sharedOfflineBytes() + index.all().filter { it.contentId != contentId }.sumOf { it.bytes }

    /**
     * Shared-capacity verification (Owner decision 2026-11-28, replaces the old LRU
     * trimToQuota): the guarded sink already aborted over-cap writes mid-copy; this
     * is the post-write invariant. NEVER evicts — when the entry does not fit it is
     * the FRESH entry that is rolled back, existing content stays untouched.
     */
    private fun verifySharedCap(contentId: String) {
        if (!quota.fits(usedSharedBytesExcluding(contentId), index.get(contentId)?.bytes ?: 0L)) {
            index.remove(contentId)
            fileStore.delete(contentId)
            throw MediaQuotaExceededException()
        }
    }

    private fun trimToCap(freshContentId: String) = verifySharedCap(freshContentId)

    private fun fail(state: DownloadState, contentId: String, phase: CacheProgressBus.Phase, code: String) {
        fileStore.delete(contentId) // partial writes never become cache entries
        state.phase = phase
        state.errorCode = code
        progressBus.publish(contentId, phase)
    }

    private fun abandon(state: DownloadState, contentId: String, code: String) {
        fileStore.delete(contentId)
        states.remove(contentId)
        progressBus.publish(contentId, CacheProgressBus.Phase.CANCELED)
    }

    /**
     * Durable offline rule (Owner decision 2026-11-23): no hour-count gate. An entry
     * stays openable offline until the server-issued entitlement expiry stored with
     * it has passed; entries without stored expiry stay usable until an online
     * re-check (or a logout/auth wipe) says otherwise — rights are never faked.
     */
    private fun isOfflineUsable(entry: MediaCacheEntry): Boolean {
        val expiresAt = entry.entitlementExpiresAt ?: return true
        return clock().isBefore(expiresAt)
    }

    private fun validatedContentId(raw: String?): String? {
        val trimmed = raw?.trim() ?: return null
        if (trimmed.length > CachePolicy.MAX_INPUT_LENGTH) return null
        return if (CachePolicy.CONTENT_ID_PATTERN.matches(trimmed)) trimmed else null
    }

    private fun storedFileNameFor(contentId: String): String = "$contentId.bin"

    private fun contentPathFor(contentId: String): String = "library/$contentId/content"

    // =====================================================================
    // Hints parsing (lenient: garbage JSON degrades to empty hints, never fails)
    // =====================================================================

    private data class Hints(val title: String?, val subjectId: String?)

    private fun parseHints(raw: String?): Hints = runCatching {
        if (raw.isNullOrBlank()) return Hints(null, null)
        val parsed = JsonParser.parseString(raw).takeIf { it.isJsonObject }?.asJsonObject ?: return Hints(null, null)
        fun field(name: String): String? = parsed.get(name)?.takeUnless { it.isJsonNull }?.asString
            ?.trim()?.takeIf { it.isNotBlank() && it.length <= CachePolicy.MAX_INPUT_LENGTH }
        Hints(title = field("title"), subjectId = field("subjectId"))
    }.getOrDefault(Hints(null, null))

    /** Convenience used by tests/PR documentation to assert the JSON shape stays closed. */
    internal fun safeListFieldNames(): List<String> =
        listOf("contentId", "type", "title", "bytes", "createdAt", "lastAccessAt")
}
