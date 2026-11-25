package com.cms.student.shell

import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.cms.student.BuildConfig
import com.cms.student.bridge.CmsJsBridge
import com.cms.student.bridge.OfflineExamBridge

/** Failures the shell surfaces as an honest Arabic error screen (no fake offline mode). */
sealed interface ShellError {
    /** [BuildConfig.STUDENT_WEB_BASE_URL] is blank or not a usable HTTPS origin. */
    object InvalidConfiguration : ShellError

    /** The main frame could not be loaded (network, DNS, TLS, or an HTTP error status). */
    object Network : ShellError
}

/**
 * Owns every WebView setting and navigation decision of the student shell.
 *
 * Batch 1 hardening:
 * - Loads only [BuildConfig.STUDENT_WEB_BASE_URL]; [ShellUrlPolicy] allowlists exactly that
 *   origin (host and port), so navigation to any other host or scheme is silently blocked —
 *   no address bar and no external browser for normal navigation.
 * - JavaScript is enabled (student-web is a JS SPA). Batch 3 added the shell's
 *   ONE audited bridge: [attachJsBridge] exposes `window.CmsNative` (see
 *   [CmsJsBridge]) — four read-only methods behind the ShellUrlPolicy origin
 *   guard; nothing else is reachable from the web app in THAT WebView.
 *   W3 (UX 2A) added a SECOND, DEDICATED WebView — the offline exam player
 *   (OfflineExamWebActivity) — whose ONLY injected interface is
 *   `window.CmsOfflineExam` (see [attachExamBridge]). The invariant is one
 *   audited interface per WebView: never two interfaces in the same view.
 * - Password saving, file/content access, geolocation, and multiple windows are disabled;
 *   mixed content is never allowed; TLS errors always fail closed.
 * - DOM storage is enabled: student-web persists its session in localStorage/sessionStorage
 *   (see apps/student-web/src/app/providers/AuthProvider.tsx and
 *   apps/student-web/src/services/api-client.ts).
 */
class WebViewHost(
    private val webView: WebView,
    private val urlPolicy: ShellUrlPolicy,
    private val onShellError: (ShellError) -> Unit
) {

    fun attach() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            @Suppress("DEPRECATION") // Explicit hardening statement; a no-op on newer APIs.
            setSavePassword(false)
            @Suppress("DEPRECATION") // Explicit hardening statement; a no-op on newer APIs.
            allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION") // Explicit hardening statement; a no-op on newer APIs.
            allowUniversalAccessFromFileURLs = false
            setGeolocationEnabled(false)
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        // Default chrome client so JS alert()/confirm() dialogs still render.
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                !urlPolicy.isAllowed(url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !urlPolicy.isAllowed(request.url.toString())

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                // Never proceed past a TLS error: fail closed.
                handler.cancel()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) onShellError(ShellError.Network)
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                if (request.isForMainFrame) onShellError(ShellError.Network)
            }
        }
    }

    /**
     * Batch 3: exposes the single audited JS bridge of the SHELL WebView as
     * `window.CmsNative`.
     *
     * MUST be called only after [attach] so the hardened settings (password save off,
     * file access off, mixed content never, multi-window off, allowlisted navigation)
     * are already in force — the interface would otherwise live inside an unhardened
     * WebView. The bridge itself re-checks [ShellUrlPolicy] per call (origin guard,
     * see [CmsJsBridge]), so a page outside the allowlist degrades to safe defaults.
     * The shell WebView carries exactly this ONE interface — no second
     * addJavascriptInterface ever runs against it (the W3 exam WebView is a
     * different view, see [attachExamBridge]).
     */
    fun attachJsBridge(bridge: CmsJsBridge) {
        webView.addJavascriptInterface(bridge, CmsJsBridge.JS_NAME)
    }

    /**
     * W3 (UX 2A): exposes the DEDICATED offline-exam bridge of the exam WebView as
     * `window.CmsOfflineExam` (see [OfflineExamBridge] — payload + answer capture +
     * sync status, all origin-guarded per call).
     *
     * The offline exam player (OfflineExamWebActivity) constructs its OWN WebView,
     * runs it through the same [attach] hardening, and then injects exactly this ONE
     * interface — its only interface. Per-WebView invariant: the shell view carries
     * `CmsNative` only, the exam view carries `CmsOfflineExam` only; no single view
     * ever carries two interfaces. MUST likewise be called only after [attach].
     */
    fun attachExamBridge(bridge: OfflineExamBridge) {
        webView.addJavascriptInterface(bridge, OfflineExamBridge.JS_NAME)
    }

    /** Loads the configured student web home; a misconfigured base URL surfaces as an error. */
    fun loadHome() {
        val home = BuildConfig.STUDENT_WEB_BASE_URL
        if (!urlPolicy.isAllowed(home)) {
            onShellError(ShellError.InvalidConfiguration)
            return
        }
        webView.loadUrl(home)
    }

    /** Steps back in the WebView history; false when there is nothing to go back to. */
    fun goBack(): Boolean {
        if (!webView.canGoBack()) return false
        webView.goBack()
        return true
    }

    fun pause() = webView.onPause()

    fun resume() = webView.onResume()

    fun destroy() = webView.destroy()
}
