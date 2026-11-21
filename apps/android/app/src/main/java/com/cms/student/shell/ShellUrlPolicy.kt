package com.cms.student.shell

import java.net.URI
import java.net.URISyntaxException

/**
 * Navigation policy for the shell WebView: HTTPS only, exact-host allowlist.
 *
 * Pure JVM logic so the security posture is unit-testable without a device or
 * Robolectric. The WebView consults this policy for the initial load and for
 * every [android.webkit.WebViewClient.shouldOverrideUrlLoading] decision:
 * anything not explicitly allowed is blocked (no external browser, no address
 * bar, no non-HTTP schemes, no embedded credentials, no unlisted hosts).
 *
 * An empty allowlist (see [fromBaseUrl] returning a blocking policy is not a
 * thing — callers construct one via the companion) blocks everything, which
 * is how a misconfigured build must behave.
 */
class ShellUrlPolicy(private val allowedOrigins: Set<Origin>) {

    /** An allowlisted https origin. [port] is -1 when the URL carried no explicit port. */
    data class Origin(val host: String, val port: Int) {
        val effectivePort: Int get() = if (port == PORT_UNSPECIFIED) DEFAULT_HTTPS_PORT else port
    }

    /** True only for absolute HTTPS URLs on an allowlisted host and port, without embedded credentials. */
    fun isAllowed(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        val uri = try {
            URI(rawUrl.trim())
        } catch (_: URISyntaxException) {
            return false
        }
        if (!uri.scheme.equals(SCHEME_HTTPS, ignoreCase = true)) return false
        if (uri.rawUserInfo != null) return false
        val host = uri.host?.lowercase() ?: return false
        val port = if (uri.port == PORT_UNSPECIFIED) DEFAULT_HTTPS_PORT else uri.port
        return allowedOrigins.any { it.host == host && it.effectivePort == port }
    }

    companion object {
        const val SCHEME_HTTPS = "https"
        const val DEFAULT_HTTPS_PORT = 443
        private const val PORT_UNSPECIFIED = -1

        /** A policy that blocks every URL; used when the build carries no usable base URL. */
        fun allowNothing(): ShellUrlPolicy = ShellUrlPolicy(emptySet())

        /**
         * Builds the allowlist from the configured base URL. Returns null when the base URL
         * is not a usable HTTPS origin (blank, non-HTTPS, hostless, credential-bearing, or
         * malformed) — the shell then falls back to [allowNothing] and shows its
         * configuration error instead of loading.
         */
        fun fromBaseUrl(baseUrl: String?): ShellUrlPolicy? {
            if (baseUrl.isNullOrBlank()) return null
            val uri = try {
                URI(baseUrl.trim())
            } catch (_: URISyntaxException) {
                return null
            }
            if (!uri.scheme.equals(SCHEME_HTTPS, ignoreCase = true)) return null
            if (uri.rawUserInfo != null) return null
            val host = uri.host?.lowercase() ?: return null
            return ShellUrlPolicy(setOf(Origin(host, uri.port)))
        }
    }
}
