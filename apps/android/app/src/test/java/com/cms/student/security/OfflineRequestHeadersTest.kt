package com.cms.student.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * JVM tests for the Batch 2 single-place header builders. The header matrix mirrors
 * the student-web request interceptor (Authorization Bearer + X-Installation-Id +
 * X-Device-Fingerprint compat) so the backend rate limiter and every controller
 * (`X-Installation-Id ?? X-Device-Fingerprint`) see identical identity headers from
 * both clients.
 */
class OfflineRequestHeadersTest {

    @Test
    fun `installation headers carry both identity header names with the same value`() {
        val headers = OfflineRequestHeaders.installation("install-1")
        assertEquals("install-1", headers[OfflineRequestHeaders.INSTALLATION_ID])
        assertEquals("install-1", headers[OfflineRequestHeaders.DEVICE_FINGERPRINT])
        assertEquals(2, headers.size)
    }

    @Test
    fun `installation headers reject a blank installation id`() {
        val threw = try {
            OfflineRequestHeaders.installation("   ")
            false
        } catch (_: IllegalArgumentException) {
            true
        }
        assertTrue(threw)
    }

    @Test
    fun `authenticated headers add bearer authorization to the installation identity`() {
        val session = OfflineSession(UUID.randomUUID(), "token-1", "install-1")
        val headers = OfflineRequestHeaders.authenticated(session)
        assertEquals("Bearer token-1", headers[OfflineRequestHeaders.AUTHORIZATION])
        assertEquals("install-1", headers[OfflineRequestHeaders.INSTALLATION_ID])
        assertEquals("install-1", headers[OfflineRequestHeaders.DEVICE_FINGERPRINT])
        assertEquals(3, headers.size)
    }

    @Test
    fun `authenticated headers reject a session with a blank token`() {
        val session = OfflineSession(UUID.randomUUID(), " ", "install-1")
        val threw = try {
            OfflineRequestHeaders.authenticated(session)
            false
        } catch (_: OfflineTransportException) {
            true
        }
        assertTrue(threw)
    }

    @Test
    fun `authenticated headers reject a session with a blank installation id`() {
        val session = OfflineSession(UUID.randomUUID(), "token-1", "")
        val threw = try {
            OfflineRequestHeaders.authenticated(session)
            false
        } catch (_: OfflineTransportException) {
            true
        }
        assertTrue(threw)
    }
}
