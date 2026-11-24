package com.cms.student.session

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * D-JS-AUTH (debt closure, 2026-11-24) — the seal behind the WebView remember-me
 * token hardening.
 *
 * student-web keeps its own session inside WebView DOM storage (strategy D1: the
 * shell never injects or reads web tokens). The debt was that a durable
 * «تذكّرني» login left the raw access/refresh tokens as plaintext rows in the
 * WebView localStorage database. This seal closes that at-rest gap WITHOUT
 * widening the bridge contract: the page hands the bridge an opaque blob it
 * already owns, and gets back AES-256-GCM ciphertext bound to a non-exportable
 * AndroidKeyStore key. A disk dump / backup extraction of the WebView storage
 * now yields ciphertext only.
 *
 * What this is NOT (honest limits, see docs/security/PROTECTION-LIMITS.md):
 *  - NOT protection against the page itself — code running in the allowlisted
 *    origin already holds the tokens in memory and can seal/unseal its own blobs.
 *  - NOT a token getter: the bridge has no method that RETURNS tokens the shell
 *    holds; the native session store stays unreachable from JS (D1 unchanged).
 *
 * Fail-closed contract: every failure path returns null — the web side then
 * falls back to its pre-existing raw-storage behavior (browser builds, or a
 * seal that is unavailable), never to a half-sealed state.
 */
interface TokenSeal {
    /** Returns the sealed envelope `v1:<base64(iv||ciphertext)>`, or null on ANY failure. */
    fun seal(plaintext: String): String?

    /** Returns the plaintext of a [seal] envelope, or null when not sealed here / tampered / ANY failure. */
    fun unseal(sealed: String): String?
}

/**
 * Pure-JVM envelope codec for sealed blobs (unit-testable without Android).
 * `v1:` prefix lets the web side distinguish a sealed blob from a legacy raw
 * token written before this hardening shipped.
 */
object TokenSealEnvelope {
    const val VERSION_PREFIX = "v1:"
    const val GCM_IV_LENGTH_BYTES = 12
    const val GCM_TAG_LENGTH_BITS = 128

    fun encode(iv: ByteArray, ciphertext: ByteArray): String =
        VERSION_PREFIX + Base64.getEncoder().encodeToString(iv + ciphertext)

    /** Splits a sealed envelope back into iv + ciphertext, or null when malformed. */
    fun decode(sealed: String): Pair<ByteArray, ByteArray>? {
        if (!sealed.startsWith(VERSION_PREFIX)) return null
        val blob = runCatching {
            Base64.getDecoder().decode(sealed.removePrefix(VERSION_PREFIX))
        }.getOrNull() ?: return null
        if (blob.size <= GCM_IV_LENGTH_BYTES) return null
        val iv = blob.copyOfRange(0, GCM_IV_LENGTH_BYTES)
        val ciphertext = blob.copyOfRange(GCM_IV_LENGTH_BYTES, blob.size)
        return iv to ciphertext
    }
}

/**
 * AndroidKeyStore-backed [TokenSeal]: a non-exportable AES-256 key (alias
 * [alias], default the production [DEFAULT_ALIAS]) with per-call random IVs,
 * GCM tag 128 bits. The key never leaves the keystore; sealed blobs are only
 * decryptable by the same install's key. The alias parameter exists so tests
 * can stand in for a different install.
 */
class KeystoreTokenSeal(private val alias: String = DEFAULT_ALIAS) : TokenSeal {

    override fun seal(plaintext: String): String? = runCatching {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        TokenSealEnvelope.encode(cipher.iv, ciphertext)
    }.getOrNull()

    override fun unseal(sealed: String): String? {
        val (iv, ciphertext) = TokenSealEnvelope.decode(sealed) ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TokenSealEnvelope.GCM_TAG_LENGTH_BITS, iv))
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        }.getOrNull()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    companion object {
        /** Production alias — one seal key per install, shared by the bridge. */
        const val DEFAULT_ALIAS = "cms.webview.token.seal"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
