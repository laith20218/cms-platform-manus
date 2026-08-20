package com.cms.student.security

import java.time.Instant
import java.util.UUID

/** Build-time or securely delivered public trust configuration. No private signing material is accepted here. */
data class OfflineTrustConfiguration(
    val offlineEnabled: Boolean,
    val manifestSigningPublicKeySpkiBase64: String?,
    val keystoreAlias: String
)

/**
 * Updates local revocation state only from a recent confirmed backend response matching the
 * requested package. Any mismatch, stale/future confirmation, or transport exception becomes
 * UNKNOWN, which OfflinePackageVerifier rejects. This prevents a stale ACTIVE cache entry from
 * authorising use after a failed refresh.
 */
class OfflineRevocationRefresher(
    private val api: OfflinePackageStatusApi,
    private val cache: CachedOfflineRevocationStatusProvider,
    private val maximumConfirmationAgeSeconds: Long = 300
) {
    fun refresh(packageId: UUID, installationId: String, now: Instant = Instant.now()): Boolean {
        val status = try {
            api.getStatus(packageId, installationId)
        } catch (_: Exception) {
            cache.applyConfirmedStatus(packageId, RevocationStatus.UNKNOWN)
            return false
        }

        val confirmationCutoff = now.minusSeconds(maximumConfirmationAgeSeconds)
        if (
            status.packageId != packageId ||
            status.confirmedAt.isBefore(confirmationCutoff) ||
            status.confirmedAt.isAfter(now.plusSeconds(maximumConfirmationAgeSeconds))
        ) {
            cache.applyConfirmedStatus(packageId, RevocationStatus.UNKNOWN)
            return false
        }

        val active = status.status.equals("active", ignoreCase = true) &&
            status.revokedAt == null &&
            status.expiresAt.isAfter(now)
        cache.applyConfirmedStatus(packageId, if (active) RevocationStatus.ACTIVE else RevocationStatus.REVOKED)
        return active
    }
}

/** Creates the only production verifier configuration. Missing trust material deliberately returns null. */
object TrustedOfflineVerifierFactory {
    fun create(configuration: OfflineTrustConfiguration, revocations: CachedOfflineRevocationStatusProvider): OfflinePackageVerifier? {
        if (!configuration.offlineEnabled || configuration.manifestSigningPublicKeySpkiBase64.isNullOrBlank() || configuration.keystoreAlias.isBlank()) return null
        return runCatching {
            OfflinePackageVerifier(
                enabled = true,
                manifestSignatureVerifier = PinnedEcdsaManifestSignatureVerifier(configuration.manifestSigningPublicKeySpkiBase64),
                keyReleaseTokenVerifier = OpaqueKeyReleaseReceiptVerifier,
                revocationStatusProvider = revocations,
                packageKeyProvider = AndroidKeystorePackageKeyProvider(configuration.keystoreAlias)
            )
        }.getOrNull()
    }
}
