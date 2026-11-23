package com.cms.student.security

/**
 * Reads the trusted-offline (question packages) build configuration — Owner decision
 * 2026-11-23. Pure JVM (no Android types) so the fail-closed rules are unit-testable:
 * an enabled configuration without its full public trust material throws; a disabled
 * configuration always succeeds. No private key material is ever accepted here — the
 * manifest signing key is a PUBLIC key, the API URL is public configuration.
 */
object AndroidOfflineBuildConfiguration {

    /**
     * Native login/refresh base URL: the release pipeline keeps OFFLINE_API_BASE_URL,
     * and builds without it fall back to the Batch 0 API_BASE_URL (HTTPS-only
     * validated in gradle) so the native session path stays reachable.
     */
    fun apiBaseUrl(offlineUrl: String, fallbackUrl: String): String =
        offlineUrl.trim().ifBlank { fallbackUrl.trim() }

    /**
     * Builds the trust configuration from BuildConfig values. Fail-closed: when
     * [enabled] is true, a blank effective API URL, signing key, or alias throws
     * rather than degrading into a half-trusted runtime (gradle already refuses
     * such builds; this is the runtime backstop).
     */
    fun trustConfiguration(
        enabled: Boolean,
        offlineApiBaseUrl: String,
        fallbackApiBaseUrl: String,
        manifestSigningPublicKeySpkiBase64: String,
        keystoreAlias: String
    ): OfflineTrustConfiguration {
        val publicKey = manifestSigningPublicKeySpkiBase64.trim().ifBlank { null }
        val alias = keystoreAlias.trim()
        if (enabled && (apiBaseUrl(offlineApiBaseUrl, fallbackApiBaseUrl).isBlank() || publicKey == null || alias.isBlank())) {
            throw IllegalStateException("Trusted Offline cannot start without API URL, pinned public key, and keystore alias")
        }
        return OfflineTrustConfiguration(enabled, publicKey, alias)
    }
}
