package com.cms.student.shell

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM-only tests for the shell navigation allowlist (no device needed). */
class ShellUrlPolicyTest {

    private val policy = ShellUrlPolicy.fromBaseUrl("https://app.cms.example.com")
        ?: error("fixture base URL must be usable")

    @Test
    fun `configured https origin with path query and default port is allowed`() {
        assertTrue(policy.isAllowed("https://app.cms.example.com/"))
        assertTrue(policy.isAllowed("https://app.cms.example.com/dashboard"))
        assertTrue(policy.isAllowed("https://app.cms.example.com/#/study?page=2"))
        assertTrue(policy.isAllowed("https://APP.CMS.EXAMPLE.COM/login"))
        assertTrue(policy.isAllowed("https://app.cms.example.com:443/login"))
    }

    @Test
    fun `non-https schemes are rejected`() {
        assertFalse(policy.isAllowed("http://app.cms.example.com/login"))
        assertFalse(policy.isAllowed("file:///etc/passwd"))
        assertFalse(policy.isAllowed("javascript:alert(1)"))
        assertFalse(policy.isAllowed("intent://app.cms.example.com/#Intent"))
        assertFalse(policy.isAllowed("about:blank"))
        assertFalse(policy.isAllowed("data:text/html,hello"))
    }

    @Test
    fun `hosts outside the allowlist are rejected`() {
        assertFalse(policy.isAllowed("https://evil.com/dashboard"))
        assertFalse(policy.isAllowed("https://app.cms.example.com.evil.com/dashboard"))
        assertFalse(policy.isAllowed("https://sub.app.cms.example.com/dashboard"))
        assertFalse(policy.isAllowed("https://localhost:5173/"))
        assertFalse(policy.isAllowed("https://app.cms.example.com:8443/dashboard"))
    }

    @Test
    fun `credential-bearing urls are rejected`() {
        assertFalse(policy.isAllowed("https://user:pass@app.cms.example.com/dashboard"))
        assertFalse(policy.isAllowed("https://user@app.cms.example.com/"))
    }

    @Test
    fun `blank malformed and relative urls are rejected`() {
        assertFalse(policy.isAllowed(null))
        assertFalse(policy.isAllowed(""))
        assertFalse(policy.isAllowed("   "))
        assertFalse(policy.isAllowed("not a url"))
        assertFalse(policy.isAllowed("/relative/path"))
        assertFalse(policy.isAllowed("app.cms.example.com/login"))
    }

    @Test
    fun `fromBaseUrl rejects unusable base urls`() {
        assertNotNull(ShellUrlPolicy.fromBaseUrl("https://app.cms.example.com"))
        assertNull(ShellUrlPolicy.fromBaseUrl("http://app.cms.example.com"))
        assertNull(ShellUrlPolicy.fromBaseUrl("app.cms.example.com"))
        assertNull(ShellUrlPolicy.fromBaseUrl("https://user@app.cms.example.com"))
        assertNull(ShellUrlPolicy.fromBaseUrl(""))
        assertNull(ShellUrlPolicy.fromBaseUrl(null))
    }

    @Test
    fun `non default base port is preserved in the allowlist`() {
        val custom = ShellUrlPolicy.fromBaseUrl("https://student.internal.local:8443")
            ?: error("fixture base URL must be usable")
        assertTrue(custom.isAllowed("https://student.internal.local:8443/dashboard"))
        assertFalse(custom.isAllowed("https://student.internal.local/dashboard"))
        assertFalse(custom.isAllowed("https://student.internal.local:443/dashboard"))
    }

    @Test
    fun `allowNothing policy blocks even the configured origin`() {
        val blocking = ShellUrlPolicy.allowNothing()
        assertFalse(blocking.isAllowed("https://app.cms.example.com/"))
        assertFalse(blocking.isAllowed("https://app.cms.example.com:443/"))
    }
}
