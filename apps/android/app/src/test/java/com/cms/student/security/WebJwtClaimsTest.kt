package com.cms.student.security

import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * W2 (UX 3C) JVM tests for [WebJwtClaims] — the routing-only web token parser.
 * The fixture builds REAL unsigned JWT strings (base64url header.payload.sig),
 * exactly like the tokens the student-web session store hands to the bridge.
 * No signature is ever verified here — that stays the server's job.
 */
class WebJwtClaimsTest {

    private val subject = "11111111-1111-1111-1111-111111111111"

    private fun jwt(payload: String, header: String = """{"alg":"none"}""", signature: String = "sig"): String =
        listOf(header, payload, signature).joinToString(".") { part ->
            Base64.getUrlEncoder().withoutPadding().encodeToString(part.toByteArray())
        }

    @Test
    fun `parses subject and expiry from a well-formed unsigned token`() {
        val claims = WebJwtClaims.parse(jwt("""{"sub":"$subject","exp":9999999999}"""))
        assertEquals(subject, claims?.subject)
        assertEquals(9999999999L, claims?.expiresAtEpochSeconds)
    }

    @Test
    fun `a missing exp yields claims with a null expiry`() {
        val claims = WebJwtClaims.parse(jwt("""{"sub":"$subject"}"""))
        assertEquals(subject, claims?.subject)
        assertNull(claims?.expiresAtEpochSeconds)
    }

    @Test
    fun `a missing or blank sub answers null`() {
        assertNull(WebJwtClaims.parse(jwt("""{"exp":9999999999}""")))
        assertNull(WebJwtClaims.parse(jwt("""{"sub":""}""")))
        assertNull(WebJwtClaims.parse(jwt("""{"sub":42}""")))
    }

    @Test
    fun `malformed structure answers null and never throws`() {
        assertNull(WebJwtClaims.parse(""))
        assertNull(WebJwtClaims.parse("not-a-jwt"))
        assertNull(WebJwtClaims.parse("only.two"))
        assertNull(WebJwtClaims.parse("a.b.c.d"))
        // Payloads that are not base64url or not JSON degrade to null.
        assertNull(WebJwtClaims.parse("header.####not-base64.sig"))
        assertNull(WebJwtClaims.parse(jwt("not-json")))
        assertNull(WebJwtClaims.parse(jwt("""["array"]""")))
    }

    @Test
    fun `extra claims are ignored and whitespace is trimmed`() {
        val claims = WebJwtClaims.parse(" " + jwt("""{"sub":" $subject ","exp":42,"role":"student"}""") + " ")
        assertEquals(subject, claims?.subject)
        assertEquals(42L, claims?.expiresAtEpochSeconds)
    }

    @Test
    fun `the subject pattern accepts canonical uuids and rejects junk`() {
        assertTrue(WebJwtClaims.SUBJECT_UUID_PATTERN.matches(subject))
        assertFalse(WebJwtClaims.SUBJECT_UUID_PATTERN.matches("not-a-uuid"))
        assertFalse(WebJwtClaims.SUBJECT_UUID_PATTERN.matches("../../etc/passwd"))
        assertFalse(WebJwtClaims.SUBJECT_UUID_PATTERN.matches("1111111111111111111111111111111111111111"))
    }
}
