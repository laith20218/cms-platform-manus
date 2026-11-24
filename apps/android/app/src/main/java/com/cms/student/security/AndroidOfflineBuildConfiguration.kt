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
     * D-PIN closure (debt register, 2026-11-24): parses the SPKI pin set for the
     * native HTTPS clients and fails closed when pinning is mandatory but the set
     * is empty. Store/release pipelines build with OFFLINE_API_SPKI_PINS_MANDATORY=true;
     * gradle already refuses release variants with an empty mandatory pin set — this
     * is the runtime backstop so a tampered or hand-wired configuration can never
     * degrade a mandatory-pinning build into system-trust-only native HTTPS.
     * Malformed entries still fail loudly at parse time (IllegalArgumentException).
     */
    fun enforcePins(mandatory: Boolean, pinsBase64: String): Set<String> {
        val pins = OfflineCertificatePinning.parsePins(pinsBase64)
        if (mandatory && pins.isEmpty()) {
            throw IllegalStateException(
                "Mandatory certificate pinning is enabled but OFFLINE_API_SPKI_PINS_BASE64 is empty — " +
                "failing closed (D-PIN); supply SPKI SHA-256 pins or unset OFFLINE_API_SPKI_PINS_MANDATORY"
            )
        }
        return pins
    }

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
