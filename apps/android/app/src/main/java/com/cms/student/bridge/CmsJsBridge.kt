package com.cms.student.bridge

import android.webkit.JavascriptInterface
import com.cms.student.shell.ShellUrlPolicy

/**
 * Batch 3 — the single, audited `@JavascriptInterface` bridge between student-web
 * (running inside the hardened shell WebView) and Kotlin. [WebViewHost] injects it
 * under [JS_NAME] ("CmsNative") only AFTER every hardening setting is applied.
 *
 * Exact JS surface — nothing else is reachable from JavaScript:
 *
 * ```
 * window.CmsNative.hasNativeShell()    // true
 * window.CmsNative.getPlatform()       // "android"
 * window.CmsNative.getAppVersion()     // versionName, e.g. "0.1.0"
 * window.CmsNative.getInstallationId() // the InstallationIdProvider UUID
 * ```
 *
 * Origin guard (mandatory): every method body resolves the WebView's current URL via
 * [currentUrl] and consults [urlPolicy] — the SAME HTTPS allowlist
 * (`ShellUrlPolicy.isAllowed`) that governs navigation. When the current URL is not
 * allowlisted (foreign host, non-HTTPS scheme, embedded credentials, odd port, or a
 * blank/not-yet-loaded URL), the method returns a safe default (`false` / empty
 * string) instead of data. The bridge never throws, never leaks partial values, and
 * never exposes state beyond the four values above.
 *
 * Threat model (student-web XSS): if an XSS payload runs inside student-web, the
 * only values it can read here are the installation id (an opaque per-install
 * device-binding id — NOT a credential, never a token), the platform name, and the
 * app version. Worst case: the attacker correlates a device or burns the
 * per-installation rate-limit quota (`X-Installation-Id ?? X-Device-Fingerprint`
 * keys the backend limiter). It cannot authenticate as anyone, cannot read the
 * native session, cannot touch files, and cannot drive navigation. Tokens and
 * passwords stay out of the bridge by design (strategy D1).
 *
 * Batch 3 non-goals enforced by absence: no token accessors, no file/local cache or
 * download APIs, no eval, no arbitrary URL opening, no free-form executable
 * strings, no navigation overrides beyond the existing WebViewClient allowlist.
 */
class CmsJsBridge(
    private val urlPolicy: ShellUrlPolicy,
    private val currentUrl: () -> String?,
    private val installationId: () -> String,
    private val appVersion: () -> String
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

    companion object {
        /** The object name the shell injects this bridge under: `window.CmsNative`. */
        const val JS_NAME = "CmsNative"

        /** Stable platform identifier returned by [getPlatform]. */
        const val PLATFORM = "android"
    }
}
