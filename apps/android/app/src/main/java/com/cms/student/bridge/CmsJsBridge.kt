package com.cms.student.bridge

import android.webkit.JavascriptInterface
import com.cms.student.media.CachePolicy
import com.cms.student.media.CacheStatus
import com.cms.student.shell.ShellUrlPolicy

/**
 * Batch 3 + Batch 4 — the single, audited `@JavascriptInterface` bridge between
 * student-web (running inside the hardened shell WebView) and Kotlin. [WebViewHost]
 * injects it under [JS_NAME] ("CmsNative") only AFTER every hardening setting is
 * applied.
 *
 * Exact JS surface — nothing else is reachable from JavaScript:
 *
 * ```
 * window.CmsNative.hasNativeShell()     // true
 * window.CmsNative.getPlatform()        // "android"
 * window.CmsNative.getAppVersion()      // versionName, e.g. "0.1.0"
 * window.CmsNative.getInstallationId()   // the InstallationIdProvider UUID
 * window.CmsNative.listCached()         // JSON array of SAFE metadata (no paths)
 * window.CmsNative.ensureLocal(id, type, hints) // start download / answer status code
 * window.CmsNative.openLocal(id)        // open the native viewer (entitlement-gated)
 * window.CmsNative.cacheStatus(id)      // queued|downloading:<pct>|ready|error|absent
 * window.CmsNative.cancelDownload(id)   // cancel an in-flight download
 * window.CmsNative.removeCached(id)     // delete one cached object
 * window.CmsNative.clearCache()         // delete every cached object
 * ```
 *
 * Origin guard (mandatory): every method body resolves the WebView's current URL via
 * [currentUrl] and consults [urlPolicy] — the SAME HTTPS allowlist
 * (`ShellUrlPolicy.isAllowed`) that governs navigation. When the current URL is not
 * allowlisted (foreign host, non-HTTPS scheme, embedded credentials, odd port, or a
 * blank/not-yet-loaded URL), the method returns a safe default (empty/false/absent)
 * instead of data or an action. The bridge never throws and never leaks partial
 * values.
 *
 * Threat model (student-web XSS, updated for Batch 4): the readable surface is still
 * only installation id + platform + app version plus CACHE METADATA (ids, types,
 * titles, byte counts, timestamps) — no content bytes, no filesystem paths, no
 * source URLs, no tokens. The action surface can fill the encrypted cache with
 * content the student is ALREADY entitled to (the server re-validates the student's
 * own native session + signed entitlement on every download), read/burn the
 * per-installation rate-limit quota, or delete cached rows — a nuisance, not an
 * escalation: it cannot authenticate as anyone else, cannot reach another
 * student's content, cannot exfiltrate a token, cannot execute strings, and cannot
 * drive navigation. `openLocal` only opens viewers for ids the cache already holds.
 *
 * Forbidden and absent: token accessors (getAccessToken/getRefreshToken), password
 * APIs, raw filesystem paths, arbitrary URL fetch (the native side derives the
 * allowlisted API content URL itself from the UUID — a JS-supplied URL is never
 * fetched), eval, free-form executable strings, external-viewer intents.
 */
class CmsJsBridge(
    private val urlPolicy: ShellUrlPolicy,
    private val currentUrl: () -> String?,
    private val installationId: () -> String,
    private val appVersion: () -> String,
    private val cacheApi: CmsNativeCacheApi
) {

    /**
     * True only when the currently loaded page sits on the allowlisted HTTPS origin.
     * Every `@JavascriptInterface` method consults this before returning anything.
     */
    internal fun isOriginAllowed(): Boolean = urlPolicy.isAllowed(currentUrl())

    /** Always true in the shell; false when the current origin is not allowlisted. */
    @JavascriptInterface
    fun hasNativeShell(): Boolean = isOriginAllowed()

    /** "android" when allowed; empty string otherwise. */
    @JavascriptInterface
    fun getPlatform(): String = if (isOriginAllowed()) PLATFORM else ""

    /** App versionName when allowed; empty string otherwise. */
    @JavascriptInterface
    fun getAppVersion(): String = if (isOriginAllowed()) appVersion() else ""

    /** InstallationIdProvider id when allowed; empty string otherwise — never a token. */
    @JavascriptInterface
    fun getInstallationId(): String = if (isOriginAllowed()) installationId() else ""

    // ===== Batch 4 — encrypted media cache surface (origin-guarded, string codes) =====

    /** Safe metadata rows only: contentId/type/title/bytes/createdAt/lastAccessAt. */
    @JavascriptInterface
    fun listCached(): String = if (isOriginAllowed()) guarded({ cacheApi.listCached() }, CacheStatus.EMPTY_LIST_JSON) else CacheStatus.EMPTY_LIST_JSON

    /** Starts (or answers) a download; see [CacheStatus] for the status codes. */
    @JavascriptInterface
    fun ensureLocal(contentId: String?, type: String?, hintsJson: String?): String =
        if (isOriginAllowed()) {
            if (contentId.isNullOrBlank() || contentId.trim().length > CachePolicy.MAX_INPUT_LENGTH) CacheStatus.INVALID_ARGS
            else guarded({ cacheApi.ensureLocal(contentId.trim(), type, hintsJson) }, CacheStatus.ERROR)
        } else CacheStatus.DENIED_ORIGIN

    /** Opens the in-app viewer when the entitlement policy allows it. */
    @JavascriptInterface
    fun openLocal(contentId: String?): String =
        if (isOriginAllowed()) {
            if (contentId.isNullOrBlank() || contentId.trim().length > CachePolicy.MAX_INPUT_LENGTH) CacheStatus.INVALID_ARGS
            else guarded({ cacheApi.openLocal(contentId.trim()) }, CacheStatus.ERROR)
        } else CacheStatus.DENIED_ORIGIN

    /** `absent | queued | downloading:<pct> | ready | denied_auth | error:<code>`. */
    @JavascriptInterface
    fun cacheStatus(contentId: String?): String =
        if (isOriginAllowed()) {
            if (contentId.isNullOrBlank() || contentId.trim().length > CachePolicy.MAX_INPUT_LENGTH) CacheStatus.INVALID_ARGS
            else guarded({ cacheApi.cacheStatus(contentId.trim()) }, CacheStatus.ABSENT)
        } else CacheStatus.ABSENT

    /** Cancels an in-flight download and removes the partial object. */
    @JavascriptInterface
    fun cancelDownload(contentId: String?): String =
        if (isOriginAllowed()) {
            if (contentId.isNullOrBlank() || contentId.trim().length > CachePolicy.MAX_INPUT_LENGTH) CacheStatus.INVALID_ARGS
            else guarded({ cacheApi.cancelDownload(contentId.trim()) }, CacheStatus.ABSENT)
        } else CacheStatus.ABSENT

    /** Deletes one cached object (file + index row). */
    @JavascriptInterface
    fun removeCached(contentId: String?): String =
        if (isOriginAllowed()) {
            if (contentId.isNullOrBlank() || contentId.trim().length > CachePolicy.MAX_INPUT_LENGTH) CacheStatus.INVALID_ARGS
            else guarded({ cacheApi.removeCached(contentId.trim()) }, CacheStatus.ABSENT)
        } else CacheStatus.ABSENT

    /** Deletes every cached object. */
    @JavascriptInterface
    fun clearCache(): String =
        if (isOriginAllowed()) guarded({ cacheApi.clearCache() }, CacheStatus.ERROR) else CacheStatus.DENIED_ORIGIN

    /** The bridge never propagates an exception to JS — every call degrades to [fallback]. */
    private inline fun guarded(action: () -> String, fallback: String): String =
        runCatching(action).getOrDefault(fallback)

    companion object {
        /** The object name the shell injects this bridge under: `window.CmsNative`. */
        const val JS_NAME = "CmsNative"

        /** Stable platform identifier returned by [getPlatform]. */
        const val PLATFORM = "android"
    }
}
