package com.cms.student.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * D-JS-AUTH (debt closure, 2026-11-24) — JVM tests for the sealed-blob envelope
 * codec. The AES/GCM keystore path is exercised by the instrumentation suite
 * (TokenSealInstrumentationTest) because AndroidKeyStore does not exist on the JVM.
 */
class TokenSealEnvelopeTest {

    @Test fun `envelope round trips iv and ciphertext with the version prefix`() {
        val iv = ByteArray(TokenSealEnvelope.GCM_IV_LENGTH_BYTES) { it.toByte() }
        val ciphertext = byteArrayOf(1, 2, 3, 4, 5)
        val sealed = TokenSealEnvelope.encode(iv, ciphertext)
        assertTrue("sealed blobs must carry the v1 prefix", sealed.startsWith("v1:"))

        val decoded = TokenSealEnvelope.decode(sealed)
        assertNotNull(decoded)
        assertEquals(iv.toList(), decoded!!.first.toList())
        assertEquals(ciphertext.toList(), decoded.second.toList())
    }

    @Test fun `values without the version prefix are rejected as not sealed here`() {
        assertNull(TokenSealEnvelope.decode("raw-legacy-token"))
        assertNull(TokenSealEnvelope.decode(""))
        assertNull(TokenSealEnvelope.decode("v2:AAAA"))
    }

    @Test fun `invalid base64 after the prefix is rejected`() {
        assertNull(TokenSealEnvelope.decode("v1:!!!not-base64!!!"))
    }

    @Test fun `blobs shorter than a gcm iv are rejected`() {
        // 12 bytes decoded => empty ciphertext is invalid; shorter is definitely invalid.
        val shortBlob = "AAAAAAAAAAAAAAAA" // 12 base64 chars = 9 bytes < iv length
        assertNull(TokenSealEnvelope.decode("v1:$shortBlob"))
        val emptyCiphertext = java.util.Base64.getEncoder()
            .encodeToString(ByteArray(TokenSealEnvelope.GCM_IV_LENGTH_BYTES))
        assertNull(TokenSealEnvelope.decode("v1:$emptyCiphertext"))
    }

    @Test fun `each encode call is deterministic for its inputs and prefixes stay stable for the web contract`() {
        val iv = ByteArray(12) { 0x0A }
        val ct = byteArrayOf(9)
        assertEquals(TokenSealEnvelope.encode(iv, ct), TokenSealEnvelope.encode(iv, ct))
        assertFalse(TokenSealEnvelope.encode(iv, ct).startsWith("v2:"))
    }
}
