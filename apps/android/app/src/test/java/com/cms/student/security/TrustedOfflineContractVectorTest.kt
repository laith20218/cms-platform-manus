package com.cms.student.security

import com.google.gson.Gson
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyFactory
import java.security.PrivateKey
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.MGF1ParameterSpec
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource

data class TrustedVector(
    val manifestSigningPublicKeySpkiBase64: String,
    val testOnlyDevicePrivateKeyPkcs8Base64: String,
    val expectedPlaintextBase64: String,
    val canonicalForAad: String,
    val canonicalForSignature: String,
    val envelope: TrustedEnvelope
)
data class TrustedEnvelope(val manifest: TrustedManifest, val ciphertextBase64Url: String, val tagBase64Url: String, val wrappedKeyBase64Url: String, val keyReleaseToken: String)
data class TrustedManifest(val packageId: String, val userId: String, val installationId: String, val contentVersion: Int, val allowedSubjects: List<String>, val issuedAt: String, val expiresAt: String, val nonceBase64Url: String, val aadHashBase64Url: String, val signatureBase64Url: String)

class TrustedOfflineContractVectorTest {
    @Test fun `backend ECDSA RSA envelope verifies and decrypts only with matching device private key`() {
        val vector = vector()
        val envelope = envelope(vector)
        val revocations = CachedOfflineRevocationStatusProvider().apply { applyConfirmedStatus(envelope.manifest.packageId, RevocationStatus.ACTIVE) }
        org.junit.Assert.assertEquals(vector.canonicalForAad, Phase36CanonicalManifest.serialize(envelope.manifest.copy(aadHashBase64Url = "", signatureBase64Url = "")))
        org.junit.Assert.assertEquals(vector.canonicalForSignature, Phase36CanonicalManifest.serialize(envelope.manifest.copy(signatureBase64Url = "")))
        val manifestVerifier = PinnedEcdsaManifestSignatureVerifier(vector.manifestSigningPublicKeySpkiBase64)
        assertTrue("Backend manifest canonicalization/signature must verify on Android", manifestVerifier.verify(envelope.manifest))
        val verifier = OfflinePackageVerifier(true, manifestVerifier, OpaqueKeyReleaseReceiptVerifier, revocations, TestRsaPackageKeyProvider(vector.testOnlyDevicePrivateKeyPkcs8Base64))

        val plaintext = verifier.verifyAndDecrypt(envelope, envelope.manifest.userId, envelope.manifest.installationId, envelope.manifest.allowedSubjects.single(), envelope.manifest.issuedAt)
        assertArrayEquals(Base64.getDecoder().decode(vector.expectedPlaintextBase64), plaintext)
    }

    @Test fun `trusted verifier fails closed for tampered signature or unknown revocation`() {
        val vector = vector(); val envelope = envelope(vector)
        val verifier = OfflinePackageVerifier(true, PinnedEcdsaManifestSignatureVerifier(vector.manifestSigningPublicKeySpkiBase64), OpaqueKeyReleaseReceiptVerifier, CachedOfflineRevocationStatusProvider(), TestRsaPackageKeyProvider(vector.testOnlyDevicePrivateKeyPkcs8Base64))
        assertNull(verifier.verifyAndDecrypt(envelope, envelope.manifest.userId, envelope.manifest.installationId, envelope.manifest.allowedSubjects.single(), envelope.manifest.issuedAt))
        val active = CachedOfflineRevocationStatusProvider().apply { applyConfirmedStatus(envelope.manifest.packageId, RevocationStatus.ACTIVE) }
        val tampered = envelope.copy(manifest = envelope.manifest.copy(signatureBase64Url = envelope.manifest.signatureBase64Url.dropLast(1) + "A"))
        val tamperedVerifier = OfflinePackageVerifier(true, PinnedEcdsaManifestSignatureVerifier(vector.manifestSigningPublicKeySpkiBase64), OpaqueKeyReleaseReceiptVerifier, active, TestRsaPackageKeyProvider(vector.testOnlyDevicePrivateKeyPkcs8Base64))
        assertNull(tamperedVerifier.verifyAndDecrypt(tampered, tampered.manifest.userId, tampered.manifest.installationId, tampered.manifest.allowedSubjects.single(), tampered.manifest.issuedAt))
    }

    private fun vector(): TrustedVector = Gson().fromJson(
        javaClass.classLoader!!.getResourceAsStream("phase45_trusted_contract_vector.json")!!.reader(), TrustedVector::class.java
    )
    private fun envelope(vector: TrustedVector): OfflinePackageEnvelope {
        val m = vector.envelope.manifest
        return OfflinePackageEnvelope(OfflinePackageManifest(UUID.fromString(m.packageId), UUID.fromString(m.userId), m.installationId, m.contentVersion, m.allowedSubjects.map(UUID::fromString), Instant.parse(m.issuedAt), Instant.parse(m.expiresAt), m.nonceBase64Url, m.aadHashBase64Url, m.signatureBase64Url), vector.envelope.ciphertextBase64Url, vector.envelope.tagBase64Url, vector.envelope.wrappedKeyBase64Url, vector.envelope.keyReleaseToken)
    }
}

private class TestRsaPackageKeyProvider(privateKeyPkcs8Base64: String) : PackageKeyProvider {
    private val privateKey: PrivateKey = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateKeyPkcs8Base64)))
    override fun withPackageKey(envelope: OfflinePackageEnvelope, use: (ByteArray) -> ByteArray): ByteArray? = runCatching {
        val key = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding").apply {
            init(Cipher.DECRYPT_MODE, privateKey, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT))
        }.doFinal(Base64.getUrlDecoder().decode(envelope.wrappedKeyBase64Url))
        try { use(key) } finally { key.fill(0) }
    }.getOrNull()
}
