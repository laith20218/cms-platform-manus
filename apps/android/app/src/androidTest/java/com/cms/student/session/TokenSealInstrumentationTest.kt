package com.cms.student.session

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * D-JS-AUTH (debt closure, 2026-11-24) — real AndroidKeyStore coverage for the
 * WebView remember-me token seal. The JVM suite covers the bridge surface and the
 * envelope codec (TokenSealEnvelopeTest); this class proves the actual keystore
 * path: round trip, prefix contract, and fail-closed rejection of tampered or
 * foreign blobs (AEAD/GCM authentication failure → null, never a wrong plaintext).
 */
@RunWith(AndroidJUnit4::class)
class TokenSealInstrumentationTest {

    @Test fun keystoreSealRoundTripsRememberMeTokenBlob() {
        val seal = KeystoreTokenSeal()
        val blob = """{"accessToken":"access.jwt.value","refreshToken":"refresh.jwt.value"}"""
        val sealed = seal.seal(blob)
        assertTrue("sealed blobs must carry the v1 prefix", sealed != null && sealed.startsWith("v1:"))
        assertEquals(blob, seal.unseal(sealed!!))
    }

    @Test fun tamperedSealedBlobFailsClosedInsteadOfReturningWrongPlaintext() {
        val seal = KeystoreTokenSeal()
        val sealed = seal.seal("token-blob")!!
        // Corrupt the tail (the GCM tag region) — must fail authentication → null.
        val tampered = sealed.dropLast(4) + "AAAA"
        assertNull(seal.unseal(tampered))
    }

    @Test fun foreignAndMalformedBlobsAreRejectedAsNotSealedHere() {
        val seal = KeystoreTokenSeal()
        assertNull("legacy raw tokens are not seal input", seal.unseal("raw-legacy-token"))
        assertNull(seal.unseal(""))
        assertNull(seal.unseal("v1:!!!not-base64!!!"))
        // Sealed by ANOTHER install's key (different alias = different device) — must not decrypt.
        val otherInstall = KeystoreTokenSeal("test.other.install.seal")
        val foreign = otherInstall.seal("token-blob")!!
        assertNull(seal.unseal(foreign))
    }
}
