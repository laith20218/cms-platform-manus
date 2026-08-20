package com.cms.student.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.MGF1ParameterSpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource

/**
 * Owns an RSA key pair inside Android Keystore. The private key is never exported
 * and is used only to unwrap an Offline package key encrypted for this installation.
 */
object OfflineKeystoreKeyManager {
    private const val KEYSTORE = "AndroidKeyStore"

    fun getOrCreatePublicKeySpki(alias: String): String {
        require(alias.isNotBlank()) { "Keystore alias is required" }
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val certificate = store.getCertificate(alias)
        if (certificate != null) return Base64.getEncoder().encodeToString(certificate.publicKey.encoded)

        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, KEYSTORE)
        generator.initialize(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                .build()
        )
        val keyPair = generator.generateKeyPair()
        return Base64.getEncoder().encodeToString(keyPair.public.encoded)
    }
}

/**
 * Production key provider for an Android installation. It accepts only RSA-OAEP-SHA256
 * wrapped keys and wipes the transient plaintext key once the caller has finished.
 */
class AndroidKeystorePackageKeyProvider(private val alias: String) : PackageKeyProvider {
    override fun withPackageKey(envelope: OfflinePackageEnvelope, use: (ByteArray) -> ByteArray): ByteArray? = runCatching {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val privateKey = store.getKey(alias, null) ?: return null
        val wrappedKey = Base64.getUrlDecoder().decode(envelope.wrappedKeyBase64Url)
        val cipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding")
        cipher.init(Cipher.DECRYPT_MODE, privateKey, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT))
        val packageKey = cipher.doFinal(wrappedKey)
        require(packageKey.size == 32) { "Invalid package key length" }
        try {
            use(packageKey)
        } finally {
            packageKey.fill(0)
        }
    }.getOrNull()
}
