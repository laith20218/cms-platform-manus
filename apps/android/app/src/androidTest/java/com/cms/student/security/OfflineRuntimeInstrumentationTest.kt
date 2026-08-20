package com.cms.student.security

import android.content.Intent
import android.security.keystore.KeyProperties
import android.view.WindowManager
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cms.student.OfflineExamActivity
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.RSAPublicKey
import java.security.spec.MGF1ParameterSpec
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import javax.crypto.spec.SecretKeySpec

/**
 * Device instrumentation only. Test signing material is generated in memory per test and is not a
 * deployment trust root. The private package key remains inside AndroidKeyStore throughout unwrap.
 */
@RunWith(AndroidJUnit4::class)
class OfflineRuntimeInstrumentationTest {
    private val userId = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    private val subjectId = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    private val questionId = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc")
    private val optionId = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd")
    private val installationId = "phase45-instrumented-installation"

    @Test fun androidKeystoreUnwrapsSignedEnvelopeAndDecryptsAesGcmThenRejectsTamperAndWrongInstallation() {
        val alias = "phase45-runtime-${System.nanoTime()}"
        val otherAlias = "phase45-runtime-other-${System.nanoTime()}"
        try {
            val fixture = createEnvelope(alias)
            val revocations = CachedOfflineRevocationStatusProvider().apply {
                applyConfirmedStatus(fixture.envelope.manifest.packageId, RevocationStatus.ACTIVE)
            }
            val verifier = OfflinePackageVerifier(
                true,
                PinnedEcdsaManifestSignatureVerifier(fixture.signingPublicSpki),
                OpaqueKeyReleaseReceiptVerifier,
                revocations,
                AndroidKeystorePackageKeyProvider(alias)
            )

            val decrypted = verifier.verifyAndDecrypt(fixture.envelope, userId, installationId, subjectId, fixture.now)
            assertNotNull("Android Keystore RSA unwrap plus AES-GCM decrypt must succeed", decrypted)
            assertArrayEquals(fixture.plaintext, decrypted)

            assertNull("Wrong installation must fail before decrypt", verifier.verifyAndDecrypt(fixture.envelope, userId, "other-installation", subjectId, fixture.now))
            val tampered = fixture.envelope.copy(ciphertextBase64Url = flipFirstBase64UrlByte(fixture.envelope.ciphertextBase64Url))
            assertNull("Tampered ciphertext must fail closed", verifier.verifyAndDecrypt(tampered, userId, installationId, subjectId, fixture.now))
            val tamperedTag = fixture.envelope.copy(tagBase64Url = flipFirstBase64UrlByte(fixture.envelope.tagBase64Url))
            assertNull("Tampered GCM tag must fail closed", verifier.verifyAndDecrypt(tamperedTag, userId, installationId, subjectId, fixture.now))
            val badSignature = fixture.envelope.copy(manifest = fixture.envelope.manifest.copy(signatureBase64Url = flipFirstBase64UrlByte(fixture.envelope.manifest.signatureBase64Url)))
            assertNull("Tampered manifest signature must fail closed", verifier.verifyAndDecrypt(badSignature, userId, installationId, subjectId, fixture.now))
            OfflineKeystoreKeyManager.getOrCreatePublicKeySpki(otherAlias)
            val wrongKeyVerifier = OfflinePackageVerifier(true, PinnedEcdsaManifestSignatureVerifier(fixture.signingPublicSpki), OpaqueKeyReleaseReceiptVerifier, revocations, AndroidKeystorePackageKeyProvider(otherAlias))
            assertNull("A different Android Keystore private key cannot unwrap this package", wrongKeyVerifier.verifyAndDecrypt(fixture.envelope, userId, installationId, subjectId, fixture.now))
            val expired = createEnvelope(alias, expiresOffsetSeconds = -1)
            revocations.applyConfirmedStatus(expired.envelope.manifest.packageId, RevocationStatus.ACTIVE)
            assertNull("Expired manifest must fail before decrypt", verifier.verifyAndDecrypt(expired.envelope, userId, installationId, subjectId, expired.now))

            revocations.applyConfirmedStatus(fixture.envelope.manifest.packageId, RevocationStatus.REVOKED)
            assertNull("Revoked package must fail closed", verifier.verifyAndDecrypt(fixture.envelope, userId, installationId, subjectId, fixture.now))
            revocations.applyConfirmedStatus(fixture.envelope.manifest.packageId, RevocationStatus.UNKNOWN)
            assertNull("Unknown revocation status must fail closed", verifier.verifyAndDecrypt(fixture.envelope, userId, installationId, subjectId, fixture.now))
        } finally {
            KeyStore.getInstance("AndroidKeyStore").apply {
                load(null)
                if (containsAlias(alias)) deleteEntry(alias)
                if (containsAlias(otherAlias)) deleteEntry(otherAlias)
            }
        }
    }

    @Test fun encryptedStorePersistsEnvelopeOnlyAndBindsAnswersToPackageQuestionAndInstallation() {
        val alias = "phase45-store-${System.nanoTime()}"
        val packageId = UUID.randomUUID()
        try {
            val fixture = createEnvelope(alias, packageId)
            val context = ApplicationProvider.getApplicationContext<android.content.Context>()
            val store = EncryptedOfflinePackageStore(context)
            store.saveEnvelope(fixture.envelope, userId, installationId)
            store.updateConfirmedStatus(packageId, RevocationStatus.ACTIVE, fixture.now, userId, installationId)
            store.replaceQuestionIndex(packageId, listOf(questionId), userId, installationId)
            val answer = OfflineAnswer(UUID.randomUUID(), packageId, questionId, optionId, fixture.now, 9, installationId)
            assertTrue(store.recordAnswer(answer, userId, installationId))
            assertFalse("Wrong installation cannot append answers", store.recordAnswer(answer.copy(localAttemptId = UUID.randomUUID(), installationId = "other"), userId, installationId))
            assertFalse("Question outside package cannot append answers", store.recordAnswer(answer.copy(localAttemptId = UUID.randomUUID(), questionId = UUID.randomUUID()), userId, installationId))
            assertTrue(store.pendingAnswers(packageId, userId, installationId).single().localAttemptId == answer.localAttemptId)
            val reloaded = EncryptedOfflinePackageStore(context).load(packageId, userId, installationId)
            assertNotNull("Encrypted envelope must survive a store re-instantiation", reloaded)
            assertTrue(reloaded!!.answers.single().localAttemptId == answer.localAttemptId)

            val encryptedFile = File(context.filesDir, "offline-envelopes/$packageId.bin")
            assertTrue(encryptedFile.exists())
            val diskBytes = encryptedFile.readBytes()
            assertFalse("Envelope file must not expose question plaintext", String(diskBytes, StandardCharsets.ISO_8859_1).contains("السؤال السري"))
            store.invalidate(packageId, userId, installationId)
        } finally {
            KeyStore.getInstance("AndroidKeyStore").apply { load(null); if (containsAlias(alias)) deleteEntry(alias) }
        }
    }

    @Test fun offlineExamWindowSetsFlagSecureAtRuntime() {
        val intent = OfflineExamActivity.intent(
            ApplicationProvider.getApplicationContext(), UUID.randomUUID(), UUID.randomUUID()
        )
        ActivityScenario.launch<OfflineExamActivity>(intent).use { scenario ->
            scenario.onActivity { activity ->
                assertTrue(
                    "Offline exam activity must block screenshots at runtime",
                    activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE != 0
                )
            }
        }
    }

    private fun createEnvelope(alias: String, packageId: UUID = UUID.randomUUID(), expiresOffsetSeconds: Long = 300): EnvelopeFixture {
        val now = Instant.now()
        val devicePublicSpki = OfflineKeystoreKeyManager.getOrCreatePublicKeySpki(alias)
        val signer = KeyPairGenerator.getInstance("EC").apply { initialize(256) }.generateKeyPair()
        val nonce = ByteArray(12) { (it + 1).toByte() }
        val unsignedBase = OfflinePackageManifest(
            packageId, userId, installationId, 1, listOf(subjectId), now.minusSeconds(5), now.plusSeconds(expiresOffsetSeconds),
            base64Url(nonce), "", ""
        )
        val aadHash = base64Url(MessageDigest.getInstance("SHA-256").digest(
            Phase36CanonicalManifest.serialize(unsignedBase).toByteArray(StandardCharsets.UTF_8)
        ))
        val unsignedWithAad = unsignedBase.copy(aadHashBase64Url = aadHash)
        val signature = Signature.getInstance("SHA256withECDSA").run {
            initSign(signer.private)
            update(Phase36CanonicalManifest.serialize(unsignedWithAad).toByteArray(StandardCharsets.UTF_8))
            sign()
        }
        val manifest = unsignedWithAad.copy(signatureBase64Url = base64Url(signature))
        val packageKey = ByteArray(32) { (it + 11).toByte() }
        val plaintext = """[{"id":"$questionId","text":"السؤال السري","type":"SingleChoice","difficulty":"Easy","tags":["runtime"],"options":[{"id":"$optionId","letter":"A","text":"خيار"}]}]""".toByteArray(StandardCharsets.UTF_8)
        val ciphertextAndTag = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, SecretKeySpec(packageKey, "AES"), GCMParameterSpec(128, nonce))
            updateAAD(Phase36CanonicalManifest.serialize(manifest.copy(signatureBase64Url = "")).toByteArray(StandardCharsets.UTF_8))
            doFinal(plaintext)
        }
        val wrappedKey = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding").run {
            val publicKey = java.security.KeyFactory.getInstance("RSA").generatePublic(java.security.spec.X509EncodedKeySpec(Base64.getDecoder().decode(devicePublicSpki))) as RSAPublicKey
            init(Cipher.ENCRYPT_MODE, publicKey, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT))
            doFinal(packageKey)
        }
        packageKey.fill(0)
        return EnvelopeFixture(
            OfflinePackageEnvelope(manifest, base64Url(ciphertextAndTag.copyOfRange(0, ciphertextAndTag.size - 16)), base64Url(ciphertextAndTag.copyOfRange(ciphertextAndTag.size - 16, ciphertextAndTag.size)), base64Url(wrappedKey), "test-receipt"),
            Base64.getEncoder().encodeToString(signer.public.encoded), plaintext, now
        )
    }

    private fun base64Url(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    private fun flipFirstBase64UrlByte(value: String): String = (if (value.first() == 'A') "B" else "A") + value.drop(1)

    private data class EnvelopeFixture(
        val envelope: OfflinePackageEnvelope,
        val signingPublicSpki: String,
        val plaintext: ByteArray,
        val now: Instant
    )
}
