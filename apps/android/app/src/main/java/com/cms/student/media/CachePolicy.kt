package com.cms.student.media

/**
 * Batch 4 — shared policy constants and wire-level status codes for the encrypted
 * media cache. Every value the JS bridge can observe lives here so the contract
 * stays auditable in one file.
 *
 * Owner decisions (offline-experience implementation, 2026-11-28):
 *  - [MAX_CACHE_BYTES] = 10 GiB TOTAL shared offline-content cap across library
 *    files, question packages (envelopes count toward the same budget at the
 *    application layer) and downloaded course episodes.
 *  - NO automatic eviction: when the cap cannot fit a NEW download, that download
 *    is refused with `quota` and existing content stays untouched. The student
 *    is told to free space explicitly. (Supersedes the former 5 GiB LRU policy;
 *    Owner decision 2026-11-23 quota number updated, durable offline policy kept.)
 *  - Durable offline policy (Owner decision 2026-11-23, unchanged): a cached
 *    object opens offline as long as its local ciphertext exists — until logout
 *    wipe, auth rejection/session end (401 path), or the server-issued
 *    entitlement expiry embedded with the entry ([MediaCacheEntry.entitlementExpiresAt])
 *    has passed. No hour-count gate; a null expiry never fakes infinite rights —
 *    an online re-check still applies whenever the network is reachable.
 */
object CachePolicy {

    /** Total on-device cap for ALL offline content (10 GiB, exact bytes). */
    const val MAX_CACHE_BYTES: Long = 10_737_418_240L

    /**
     * Phase Q (Owner decision, hosted-course AV): chunk size of the encrypted
     * CHUNKED episode store — 4 MiB, each chunk an INDEPENDENT AndroidX
     * EncryptedFile object, so no complete clear media file ever exists on
     * disk and casual file-manager discovery of playable episodes stays hard.
     */
    const val MAX_AV_CHUNK_BYTES: Long = 4 * 1024 * 1024

    /** Network timeout for the synchronous on-open entitlement re-check (keeps the bridge call bounded). */
    const val VERIFY_TIMEOUT_MILLIS: Int = 2_500

    /** Network timeouts for downloads (the download itself runs on a background executor). */
    const val DOWNLOAD_CONNECT_TIMEOUT_MILLIS: Int = 10_000
    const val DOWNLOAD_READ_TIMEOUT_MILLIS: Int = 60_000

    /** In-process cache for the signed entitlement token, renewed 60s before expiry (mirrors student-web). */
    const val ENTITLEMENT_RENEWAL_SKEW_SECONDS: Long = 60

    /** Bridge inputs are trimmed and rejected above this length (defensive cap). */
    const val MAX_INPUT_LENGTH: Int = 256

    /** UUID shape every contentId must carry (library file GUIDs); blocks path tricks. */
    val CONTENT_ID_PATTERN: Regex =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
}

/** Cacheable content kinds, one per library file family the shell can open natively. */
enum class MediaKind(val wireName: String) {
    PDF("pdf"),
    TEXT("txt"),
    HTML("html"),
    IMAGE("image"),
    VIDEO("video"),
    AUDIO("audio");

    companion object {
        /** Lenient wire-name parsing (case-insensitive, `text` aliases `txt`); null when unknown. */
        fun fromWireName(raw: String?): MediaKind? = when (raw?.trim()?.lowercase()) {
            "pdf" -> PDF
            "txt", "text" -> TEXT
            "html" -> HTML
            "image" -> IMAGE
            "video" -> VIDEO
            "audio" -> AUDIO
            else -> null
        }
    }
}

/**
 * String status codes crossing the bridge — stable, documented, never exceptions.
 * The student-web helper maps every deny code to an Arabic message.
 */
object CacheStatus {
    // ensureLocal(contentId, type, hints) →
    const val READY = "ready"                       // cached and usable offline under the durable policy
    const val STARTED = "started"                   // download/replacement enqueued on the executor
    const val DOWNLOADING = "downloading"           // already in flight for this contentId
    const val DENIED_NATIVE_SESSION = "denied_native_session" // no native session (D1: WebView tokens are unreachable)
    const val DENIED_OFFLINE = "denied_offline"     // offline and nothing usable cached
    const val DENIED_STALE = "denied_stale"         // offline and the stored server-issued entitlement expiry has passed
    const val DENIED_AUTH = "denied_auth"           // server answered 401/403 for this student
    const val DENIED_ORIGIN = "denied_origin"       // bridge origin guard rejected the caller
    const val INVALID_ARGS = "invalid_args"         // blank / oversized / non-UUID contentId
    const val UNSUPPORTED_TYPE = "unsupported_type" // wire type not in [MediaKind]
    const val QUOTA = "quota"                       // 10 GiB shared offline cap cannot fit the new download (no auto-eviction)
    const val ERROR = "error"

    // cacheStatus(contentId) → (plus DOWNLOADING with ":<percent>" suffix)
    const val ABSENT = "absent"
    const val QUEUED = "queued"
    const val CANCELED = "canceled"
    const val OPENING = "opening"                   // decrypt/launch in progress after openLocal returned

    // openLocal(contentId) →
    const val OPENED = "opened"
    const val MISSING = "missing"

    // removeCached / clearCache / cancelDownload →
    const val REMOVED = "removed"
    const val CLEARED = "cleared"
    const val NOT_DOWNLOADING = "not_downloading"

    /** empty JSON array — the safe `listCached()` answer outside the allowlisted origin. */
    const val EMPTY_LIST_JSON = "[]"
}
