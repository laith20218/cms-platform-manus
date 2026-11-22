package com.cms.student.bridge

/**
 * Batch 4 — cache surface exposed through `window.CmsNative` by [CmsJsBridge].
 * Implemented by [com.cms.student.media.MediaCacheService]; fakes drive the JVM
 * bridge tests. Every method returns a stable string status code (see
 * [com.cms.student.media.CacheStatus]) — never throws, never exposes filesystem
 * paths or tokens.
 */
interface CmsNativeCacheApi {
    /** JSON array of safe metadata rows (contentId/type/title/bytes/createdAt/lastAccessAt). */
    fun listCached(): String

    /** Starts (or answers) a download for `contentId` of wire `type`; optional JSON `hintsJson`. */
    fun ensureLocal(contentId: String, type: String?, hintsJson: String?): String

    /** Opens the cached object natively after the entitlement policy allows it. */
    fun openLocal(contentId: String): String

    /** `absent | queued | downloading:<pct> | ready | denied_auth | error:<code>`. */
    fun cacheStatus(contentId: String): String

    /** Cooperatively cancels an in-flight download and removes the partial object. */
    fun cancelDownload(contentId: String): String

    /** Removes one cached object (file + index row). */
    fun removeCached(contentId: String): String

    /** Removes every cached object (files + index). */
    fun clearCache(): String
}
