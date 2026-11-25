package com.cms.student.bridge

import android.webkit.JavascriptInterface
import com.cms.student.media.CachePolicy
import com.cms.student.media.CacheStatus
import com.cms.student.session.TokenSeal
import com.cms.student.shell.ShellUrlPolicy

/**
 * Batch 3 + Batch 4 + W2 (UX 3C) + Phase P (containment) + Wave 5b-i (hosted
 * course episodes) — the single, audited `@JavascriptInterface` bridge between
 * student-web (running inside the hardened shell WebView) and Kotlin.
 * [WebViewHost] injects it under [JS_NAME] ("CmsNative") only AFTER every
 * hardening setting is applied.
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
 * window.CmsNative.sealForLocalPersistence(blob)     // D-JS-AUTH: AES-GCM seal of a page-owned blob
 * window.CmsNative.unsealForLocalPersistence(sealed)  // D-JS-AUTH: inverse of the seal
 * window.CmsNative.listOfflinePackages()   // W2: JSON array of safe package rows (no paths/tokens)
 * window.CmsNative.downloadOfflinePackage(requestJson) // W2: start a question-package download
 * window.CmsNative.offlinePackageStatus(packageId)      // W2: queued|downloading|ready|denied_auth|error:*|absent
 * window.CmsNative.removeOfflinePackage(packageId)      // W2: delete one stored package
 * window.CmsNative.openOfflineExam(packageId)           // W3: launch the hardened offline exam webview
 * window.CmsNative.notifyWebSessionEnded()              // Phase P: the page reports its session ended -> "wiped"|"kept_native_session"
 * window.CmsNative.listOfflineCourseEpisodes()          // W5b-i: JSON array of safe episode rows (no paths/tokens/bytes)
 * window.CmsNative.ensureCourseEpisodeLocal(episodeJson) // W5b-i: start a chunked hosted-episode download
 * window.CmsNative.courseEpisodeStatus(episodeId)        // W5b-i: absent|queued|downloading|ready|denied_auth|error:*
 * window.CmsNative.removeOfflineCourseEpisode(episodeId) // W5b-i: delete one downloaded episode (chunks + meta)
 * window.CmsNative.openOfflineCourseEpisode(episodeId)   // W5b-i: "error:playback_pending" until Wave 5b-ii
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
 * Threat model (student-web XSS, updated for Batch 4 and W2): the readable surface
 * is still only installation id + platform + app version plus CACHE METADATA (ids,
 * types, titles, byte counts, timestamps) and PACKAGE METADATA (ids, subject ids,
 * status, expiry, counts) — no content bytes, no filesystem paths, no source URLs,
 * no tokens. The action surface can fill the encrypted cache with content the
 * student is ALREADY entitled to (the server re-validates the student's own native
 * session + signed entitlement on every download), read/burn the per-installation
 * rate-limit quota, or delete cached rows — a nuisance, not an escalation: it cannot
 * authenticate as anyone else, cannot reach another student's content, cannot
 * exfiltrate a token, cannot execute strings, and cannot drive navigation.
 * `openLocal` only opens viewers for ids the cache already holds.
 *
 * W2 (UX 3C) token direction: the web page may SUPPLY its own session token
 * inside a package download request — the same trust direction as
 * `sealForLocalPersistence` (the page hands native something the page already
 * owns). The bridge still never RETURNS a token (D1 unchanged): the supplied
 * token lives in memory only for the duration of one download, and the SERVER
 * remains its verifier (entitlement + package + status calls all re-present it).
 *
 * D-JS-AUTH (debt closure, 2026-11-24): the two seal methods handle OPAQUE BLOBS
 * the page already owns (the remember-me token pair) so durable WebView storage
 * holds AndroidKeyStore-bound ciphertext instead of plaintext tokens. They do NOT
 * widen token exposure: the page supplies the plaintext it already holds, and
 * sealing protects against at-rest extraction (disk dump / backup) only — code
 * running in the page can always read its own live session (see
 * docs/security/PROTECTION-LIMITS.md).
 *
 * Phase P (containment) — `notifyWebSessionEnded()` (method #19): the page
 * signals ITS OWN web session ended; NO data flows web→native on this call,
 * and the wipe direction is strictly native data DESTRUCTION (question-package
 * envelopes + this service's runtime state, plus the media cache when no
 * native session survives — see OfflinePackageBridgeService.onWebSessionEnded).
 * A hostile caller gains nothing but a self-inflicted wipe of its own
 * installation-bound offline data (nuisance, not escalation) — and a
 * non-allowlisted origin cannot even trigger that: the origin guard answers
 * `denied_origin` without touching the seam.
 *
 * Wave 5b-i (hosted course episodes, methods #20–#24): the readable surface
 * grows EPISODE METADATA ONLY (episodeId, courseId, title, type, byte counts,
 * timestamps) — never content bytes, filesystem paths, chunk layouts, or
 * tokens. The action surface can fill the encrypted chunk store with episodes
 * the student is ALREADY entitled to: every download is entitlement-gated
 * server-side (the native session + the subject-scoped signed entitlement are
 * re-validated on every `GET media/course-episode/{id}/content`), and the
 * subject of the entitlement comes from the page's own course data — a
 * hostile page cannot reach another student's content, cannot exfiltrate
 * anything (the answers are status strings, not data), and cannot choose an
 * arbitrary URL (the native side derives the frozen API route from the
 * UUID-validated episode id). Deletion is self-inflicted nuisance, same as
 * the packages surface. `openOfflineCourseEpisode` answers the honest interim
 * `error:playback_pending` — no viewer launches this wave.
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
    private val cacheApi: CmsNativeCacheApi,
    private val packageApi: OfflinePackageBridgeSurface,
    private val courseApi: OfflineCourseBridgeSurface,
    private val tokenSeal: TokenSeal,
    private val webSessionEnd: WebSessionEndApi
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

    // ===== D-JS-AUTH (debt closure, 2026-11-24) — remember-me token seal =====

    /**
     * Seals an opaque page-owned blob (the student-web remember-me token pair) for
     * durable WebView storage: AES-256-GCM via AndroidKeyStore, envelope
     * `v1:<base64(iv||ciphertext)>`. Empty string when the origin is not
     * allowlisted, the input is blank/oversized, or the seal fails — the web side
     * then keeps its pre-existing raw-storage behavior (sealing is best-effort).
     */
    @JavascriptInterface
    fun sealForLocalPersistence(plaintext: String?): String =
        if (isOriginAllowed()) {
            if (plaintext.isNullOrEmpty() || plaintext.length > MAX_SEAL_PLAINTEXT_CHARS) ""
            else guarded({ tokenSeal.seal(plaintext) ?: "" }, "")
        } else ""

    /**
     * Inverse of [sealForLocalPersistence]: returns the plaintext of a blob sealed
     * by this install's key, or "" when the origin is not allowlisted, the input is
     * blank/oversized, or the blob was not sealed here / failed authentication.
     * The web side only calls this for values it first saw with the `v1:` prefix.
     */
    @JavascriptInterface
    fun unsealForLocalPersistence(sealed: String?): String =
        if (isOriginAllowed()) {
            if (sealed.isNullOrEmpty() || sealed.length > MAX_SEALED_CHARS) ""
            else guarded({ tokenSeal.unseal(sealed) ?: "" }, "")
        } else ""

    // ===== W2 (UX 3C) — offline question packages surface (origin-guarded, string codes) =====

    /** Safe package rows only: packageId/subjectIds/status/expiresAt/counts — never paths or tokens. */
    @JavascriptInterface
    fun listOfflinePackages(): String =
        if (isOriginAllowed()) guarded({ packageApi.listOfflinePackages() }, OfflinePackageBridgeService.EMPTY_LIST_JSON)
        else OfflinePackageBridgeService.EMPTY_LIST_JSON

    /**
     * Starts (or answers) a question-package download. The serialized request may
     * carry the page's own web session token (see the W2 paragraph in the class
     * doc); the bridge NEVER returns token material in any answer code or row.
     */
    @JavascriptInterface
    fun downloadOfflinePackage(requestJson: String?): String =
        if (isOriginAllowed()) {
            if (requestJson.isNullOrBlank() || requestJson.length > MAX_PACKAGE_REQUEST_JSON_CHARS) OfflinePackageBridgeService.INVALID_ARGS
            else guarded({ packageApi.downloadOfflinePackage(requestJson) }, OfflinePackageBridgeService.ERROR)
        } else CacheStatus.DENIED_ORIGIN

    /** `absent | queued | downloading | ready | denied_auth | error:<code>` for one packageId. */
    @JavascriptInterface
    fun offlinePackageStatus(packageId: String?): String =
        if (isOriginAllowed()) {
            if (!isUuidArgument(packageId)) OfflinePackageBridgeService.INVALID_ARGS
            else guarded({ packageApi.offlinePackageStatus(packageId!!.trim()) }, OfflinePackageBridgeService.ABSENT)
        } else OfflinePackageBridgeService.ABSENT

    /** Deletes one stored package (encrypted store invalidation). */
    @JavascriptInterface
    fun removeOfflinePackage(packageId: String?): String =
        if (isOriginAllowed()) {
            if (!isUuidArgument(packageId)) OfflinePackageBridgeService.INVALID_ARGS
            else guarded({ packageApi.removeOfflinePackage(packageId!!.trim()) }, OfflinePackageBridgeService.ABSENT)
        } else OfflinePackageBridgeService.ABSENT

    /** Launches the W3 offline exam webview (OfflineExamWebActivity) for a stored, unexpired package. */
    @JavascriptInterface
    fun openOfflineExam(packageId: String?): String =
        if (isOriginAllowed()) {
            if (!isUuidArgument(packageId)) OfflinePackageBridgeService.INVALID_ARGS
            else guarded({ packageApi.openOfflineExam(packageId!!.trim()) }, OfflinePackageBridgeService.ERROR)
        } else CacheStatus.DENIED_ORIGIN

    // ===== Phase P (containment) — web-session-end wipe notification =====

    /**
     * Method #19 (Phase P): the page reports its own web session ended (logout
     * or a 401 verdict). No arguments, no data crossing web→native — the native
     * side answers with the wipe outcome code: `wiped` (no native session
     * survived: full offline wipe ran) or `kept_native_session` (a live native
     * session owns its data). `error` when the seam fails; `denied_origin`
     * when the current origin is not allowlisted (the seam is never invoked —
     * a foreign page cannot trigger a wipe).
     */
    @JavascriptInterface
    fun notifyWebSessionEnded(): String =
        if (isOriginAllowed()) guarded({ webSessionEnd.onWebSessionEnded() }, OfflinePackageBridgeService.ERROR)
        else CacheStatus.DENIED_ORIGIN

    // ===== Wave 5b-i — hosted course-episode chunked AV surface =====

    /** Safe episode rows only: episodeId/courseId?/title?/type/bytes/downloadedAt/lastAccessAt. */
    @JavascriptInterface
    fun listOfflineCourseEpisodes(): String =
        if (isOriginAllowed()) guarded({ courseApi.listOfflineCourseEpisodes() }, OfflineCourseBridgeService.EMPTY_LIST_JSON)
        else OfflineCourseBridgeService.EMPTY_LIST_JSON

    /**
     * Starts (or answers) one hosted-episode chunked download from the serialized
     * web request ({episodeId, courseId?, subjectId?, title?, assetType?}). The
     * answer is a status code, never episode bytes or token material.
     */
    @JavascriptInterface
    fun ensureCourseEpisodeLocal(episodeJson: String?): String =
        if (isOriginAllowed()) {
            if (episodeJson.isNullOrBlank() || episodeJson.length > MAX_EPISODE_REQUEST_JSON_CHARS) OfflineCourseBridgeService.INVALID_ARGS
            else guarded({ courseApi.ensureCourseEpisodeLocal(episodeJson) }, OfflineCourseBridgeService.ERROR)
        } else CacheStatus.DENIED_ORIGIN

    /** `absent | queued | downloading | ready | denied_stale | denied_auth | error:<code>`. */
    @JavascriptInterface
    fun courseEpisodeStatus(episodeId: String?): String =
        if (isOriginAllowed()) {
            if (!isUuidArgument(episodeId)) OfflineCourseBridgeService.INVALID_ARGS
            else guarded({ courseApi.courseEpisodeStatus(episodeId!!.trim()) }, OfflineCourseBridgeService.ABSENT)
        } else OfflineCourseBridgeService.ABSENT

    /** Deletes one downloaded episode (encrypted chunks + encrypted meta). */
    @JavascriptInterface
    fun removeOfflineCourseEpisode(episodeId: String?): String =
        if (isOriginAllowed()) {
            if (!isUuidArgument(episodeId)) OfflineCourseBridgeService.INVALID_ARGS
            else guarded({ courseApi.removeOfflineCourseEpisode(episodeId!!.trim()) }, OfflineCourseBridgeService.ABSENT)
        } else OfflineCourseBridgeService.ABSENT

    /**
     * Opens one downloaded episode — the honest interim Wave 5b-i answer is
     * `error:playback_pending` (chunked playback lands in Wave 5b-ii).
     */
    @JavascriptInterface
    fun openOfflineCourseEpisode(episodeId: String?): String =
        if (isOriginAllowed()) {
            if (!isUuidArgument(episodeId)) OfflineCourseBridgeService.INVALID_ARGS
            else guarded({ courseApi.openOfflineCourseEpisode(episodeId!!.trim()) }, OfflineCourseBridgeService.ERROR)
        } else CacheStatus.DENIED_ORIGIN

    /**
     * Ids are ALWAYS canonical hyphenated UUIDs — anything else (blank,
     * oversized, path-shaped) is rejected at the bridge, before the service.
     * Generalized from the W2 package-id validator (the shapes are the same
     * canonical UUID regex): package ids AND episode ids route through here.
     * Defense-in-depth on top of the service-level pattern checks.
     */
    private fun isUuidArgument(raw: String?): Boolean {
        val trimmed = raw?.trim() ?: return false
        return trimmed.length <= CachePolicy.MAX_INPUT_LENGTH && CachePolicy.CONTENT_ID_PATTERN.matches(trimmed)
    }

    /** The bridge never propagates an exception to JS — every call degrades to [fallback]. */
    private inline fun guarded(action: () -> String, fallback: String): String =
        runCatching(action).getOrDefault(fallback)

    companion object {
        /** The object name the shell injects this bridge under: `window.CmsNative`. */
        const val JS_NAME = "CmsNative"

        /** Stable platform identifier returned by [getPlatform]. */
        const val PLATFORM = "android"

        /**
         * W2 (UX 3C) — request payload bound for `downloadOfflinePackage`. The
         * service enforces the same cap; the bridge rejects earlier so a hostile
         * page cannot push unbounded JSON onto the JavaBridge thread.
         */
        const val MAX_PACKAGE_REQUEST_JSON_CHARS = 8 * 1024

        /**
         * Wave 5b-i — request payload bound for `ensureCourseEpisodeLocal`
         * (episode/course/subject UUIDs + title; the service enforces the same cap).
         */
        const val MAX_EPISODE_REQUEST_JSON_CHARS = 8 * 1024

        /**
         * Seal input bounds. A token pair JSON is a few KiB (two JWTs); 16 KiB of
         * plaintext / 32 KiB of envelope keeps the surface useless as a bulk
         * encryption-oracle while never rejecting a legitimate token payload.
         */
        const val MAX_SEAL_PLAINTEXT_CHARS = 16 * 1024

        /** Sealed envelope bound: base64 of (iv 12 + ct + tag 16) over the cap above, plus prefix slack. */
        const val MAX_SEALED_CHARS = 32 * 1024
    }
}
