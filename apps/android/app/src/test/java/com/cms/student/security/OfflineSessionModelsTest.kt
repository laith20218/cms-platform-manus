package com.cms.student.security

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * Batch 2: token-bearing models must never expose tokens through toString, so an
 * accidental log statement or crash report cannot leak session material.
 */
class OfflineSessionModelsTest {

    @Test
    fun `offline session toString redacts the access token`() {
        val session = OfflineSession(UUID.randomUUID(), "secret-access", "install-1")
        val text = session.toString()
        assertFalse(text.contains("secret-access"))
        assertTrue(text.contains("<redacted>"))
    }

    @Test
    fun `offline login result toString redacts both tokens`() {
        val result = OfflineLoginResult(UUID.randomUUID(), "secret-access", "secret-refresh", "install-1")
        val text = result.toString()
        assertFalse(text.contains("secret-access"))
        assertFalse(text.contains("secret-refresh"))
        assertTrue(text.contains("<redacted>"))
    }

    @Test
    fun `offline token pair toString redacts both tokens`() {
        val pair = OfflineTokenPair("secret-access", "secret-refresh")
        val text = pair.toString()
        assertFalse(text.contains("secret-access"))
        assertFalse(text.contains("secret-refresh"))
        assertTrue(text.contains("<redacted>"))
    }
}
