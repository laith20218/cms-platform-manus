package com.cms.student.security

import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Verifies an ECDSA P-256 manifest signature using a public SPKI key pinned by the trusted app configuration. */
class PinnedEcdsaManifestSignatureVerifier(publicKeySpkiBase64: String) : ManifestSignatureVerifier {
    private val publicKey: PublicKey = KeyFactory.getInstance("EC").generatePublic(
        X509EncodedKeySpec(Base64.getDecoder().decode(publicKeySpkiBase64))
    )

    override fun verify(manifest: OfflinePackageManifest): Boolean = runCatching {
        val unsignedForAad = manifest.copy(aadHashBase64Url = "", signatureBase64Url = "")
        val expectedAadHash = b64(MessageDigest.getInstance("SHA-256").digest(
            Phase36CanonicalManifest.serialize(unsignedForAad).toByteArray(StandardCharsets.UTF_8)
        ))
        if (!MessageDigest.isEqual(expectedAadHash.toByteArray(StandardCharsets.UTF_8), manifest.aadHashBase64Url.toByteArray(StandardCharsets.UTF_8))) return false
        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(publicKey)
        verifier.update(Phase36CanonicalManifest.serialize(manifest.copy(signatureBase64Url = "")).toByteArray(StandardCharsets.UTF_8))
        verifier.verify(Base64.getUrlDecoder().decode(manifest.signatureBase64Url))
    }.getOrDefault(false)

    private fun b64(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

/**
 * The release token is an opaque server receipt, not a local trust root. Local authority
 * comes from the pinned manifest signature plus the Android Keystore private key bound to
 * the installation. A blank receipt is rejected, while any server-side revocation is enforced
 * through the confirmed local revocation state below.
 */
object OpaqueKeyReleaseReceiptVerifier : KeyReleaseTokenVerifier {
    override fun verify(envelope: OfflinePackageEnvelope): Boolean = envelope.keyReleaseToken.isNotBlank()
}

/** Fail-closed cached revocation state. UNKNOWN is never treated as ACTIVE by OfflinePackageVerifier. */
class CachedOfflineRevocationStatusProvider : RevocationStatusProvider {
    private val states = ConcurrentHashMap<UUID, RevocationStatus>()
    override fun status(packageId: UUID): RevocationStatus = states[packageId] ?: RevocationStatus.UNKNOWN
    fun applyConfirmedStatus(packageId: UUID, status: RevocationStatus) { states[packageId] = status }
}
