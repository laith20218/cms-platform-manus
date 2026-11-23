package com.cms.student.security

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Owner decision 2026-11-23 — offline USE becomes expiry-bound, but the verifier's
 * expiry model stays intact: a manifest beyond the 7-day issuance window, an expired
 * manifest, and a disabled verifier all reject BEFORE any key material is touched.
 * The happy path proves a genuinely valid envelope still decrypts (real AES-GCM,
 * same scheme as [OfflinePackageVerifier.decrypt]).
 */
class OfflinePackageVerifierExpiryTest {

    private val userId = UUID.fromString("11111111-1111-1111-1111-111111111111")
    private val subjectId = UUID.fromString("22222222-2222-2222-2222-222222222222")
    private val packageId = UUID.fromString("55555555-5555-5555-5555-555555555555")
    private val installationId = "installation-a"
    private val now = Instant.parse("2026-11-20T12:00:00Z")
    private val plaintext = (
        "[{\"id\":\"33333333-3333-3333-3333-333333333333\",\"text\":\"سؤال حقيقي\"," +
        "\"type\":\"SingleChoice\",\"difficulty\":\"Easy\",\"tags\":[],\"options\":[" +
        "{\"id\":\"44444444-4444-4444-4444-444444444444\",\"letter\":\"A\",\"text\":\"خيار\"}]}]"
        ).toByteArray(StandardCharsets.UTF_8)

    /** Builds a REAL encrypted envelope: AES-GCM over [plaintext], AAD = canonical manifest. */
    private fun buildEnvelope(issuedAt: Instant, expiresAt: Instant, key: ByteArray): OfflinePackageEnvelope {
        val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val b64 = Base64.getUrlEncoder().withoutPadding()
        val manifest = OfflinePackageManifest(
            packageId = packageId,
            userId = userId,
            installationId = installationId,
            contentVersion = 1,
            allowedSubjects = listOf(subjectId),
            issuedAt = issuedAt,
            expiresAt = expiresAt,
            nonceBase64Url = b64.encodeToString(nonce),
            aadHashBase64Url = b64.encodeToString(ByteArray(32)),
            signatureBase64Url = "signature"
        )
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
        cipher.updateAAD(
            Phase36CanonicalManifest.serialize(manifest.copy(signatureBase64Url = "")).toByteArray(StandardCharsets.UTF_8)
        )
        val combined = cipher.doFinal(plaintext) // ciphertext || 16-byte tag
        return OfflinePackageEnvelope(
            manifest = manifest,
            ciphertextBase64Url = b64.encodeToString(combined.copyOfRange(0, combined.size - 16)),
            tagBase64Url = b64.encodeToString(combined.copyOfRange(combined.size - 16, combined.size)),
            wrappedKeyBase64Url = b64.encodeToString(ByteArray(32)), // placeholder — the provider ignores it
            keyReleaseToken = "key-release-receipt"
        )
    }

    /** Verifier whose key provider hands back the SAME key the envelope was encrypted with. */
    private fun verifier(enabled: Boolean, knownKey: ByteArray): OfflinePackageVerifier = OfflinePackageVerifier(
        enabled = enabled,
        manifestSignatureVerifier = { true },
        keyReleaseTokenVerifier = { true },
        revocationStatusProvider = { RevocationStatus.ACTIVE },
        packageKeyProvider = { _, use -> use(knownKey) }
    )

    @Test fun `a valid envelope inside the issuance window decrypts to the questions`() {
        val key = ByteArray(32) { it.toByte() }
        val envelope = buildEnvelope(issuedAt = now.minusSeconds(10), expiresAt = now.plusSeconds(3600), key = key)
        val decrypted = verifier(enabled = true, knownKey = key)
            .verifyAndDecrypt(envelope, userId, installationId, subjectId, now)
        assertArrayEquals(plaintext, decrypted)
    }

    @Test fun `a manifest beyond the 7-day issuance window is rejected before key material is touched`() {
        val key = ByteArray(32) { it.toByte() }
        val issuedAt = now.minusSeconds(10)
        val envelope = buildEnvelope(issuedAt = issuedAt, expiresAt = issuedAt.plusSeconds(604800 + 60), key = key)
        val providerMustNotRun = OfflinePackageVerifier(
            enabled = true,
            manifestSignatureVerifier = { true },
            keyReleaseTokenVerifier = { true },
            revocationStatusProvider = { RevocationStatus.ACTIVE },
            packageKeyProvider = { _, _ -> throw IllegalStateException("key provider must not be invoked for a rejected manifest") }
        )
        assertNull(providerMustNotRun.verifyAndDecrypt(envelope, userId, installationId, subjectId, now))
    }

    @Test fun `an expired manifest is rejected`() {
        val key = ByteArray(32) { it.toByte() }
        val envelope = buildEnvelope(
            issuedAt = now.minusSeconds(604800 + 3600),
            expiresAt = now.minusSeconds(3600),
            key = key
        )
        assertNull(verifier(enabled = true, knownKey = key).verifyAndDecrypt(envelope, userId, installationId, subjectId, now))
    }

    @Test fun `a disabled verifier rejects without touching key material`() {
        val key = ByteArray(32) { it.toByte() }
        val envelope = buildEnvelope(issuedAt = now.minusSeconds(10), expiresAt = now.plusSeconds(3600), key = key)
        val providerMustNotRun = OfflinePackageVerifier(
            enabled = false,
            manifestSignatureVerifier = { true },
            keyReleaseTokenVerifier = { true },
            revocationStatusProvider = { RevocationStatus.ACTIVE },
            packageKeyProvider = { _, _ -> throw IllegalStateException("key provider must not be invoked while disabled") }
        )
        assertNull(providerMustNotRun.verifyAndDecrypt(envelope, userId, installationId, subjectId, now))
    }
}
