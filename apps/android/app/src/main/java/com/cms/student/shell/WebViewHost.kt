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
 * - JavaScript is enabled (student-web is a JS SPA) but there is NO JavascriptInterface
 *   bridge in this batch; the web app cannot reach native code.
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
