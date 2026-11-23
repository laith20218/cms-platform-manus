package com.cms.student.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Owner decision 2026-11-23 — the trusted-offline configuration reader must fail
 * closed: enabled-but-incomplete combinations throw; disabled always succeeds.
 */
class AndroidOfflineBuildConfigurationTest {

    @Test fun `disabled configuration always succeeds even with blank material`() {
        val config = AndroidOfflineBuildConfiguration.trustConfiguration(
            enabled = false,
            offlineApiBaseUrl = "",
            fallbackApiBaseUrl = "",
            manifestSigningPublicKeySpkiBase64 = "",
            keystoreAlias = ""
        )
        assertFalse(config.offlineEnabled)
        assertNull(config.manifestSigningPublicKeySpkiBase64)
    }

    @Test fun `enabled without api url signing key or alias throws`() {
        assertThrows(IllegalStateException::class.java) {
            AndroidOfflineBuildConfiguration.trustConfiguration(true, "", "", "", "")
        }
        assertThrows(IllegalStateException::class.java) {
            AndroidOfflineBuildConfiguration.trustConfiguration(true, "https://api.example.com", "", "", "alias")
        }
        assertThrows(IllegalStateException::class.java) {
            AndroidOfflineBuildConfiguration.trustConfiguration(true, "", "https://api.example.com", "public-key", "")
        }
    }

    @Test fun `enabled with complete material builds the enabled configuration`() {
        val config = AndroidOfflineBuildConfiguration.trustConfiguration(
            enabled = true,
            offlineApiBaseUrl = "https://offline.example.com",
            fallbackApiBaseUrl = "https://api.example.com",
            manifestSigningPublicKeySpkiBase64 = "public-key",
            keystoreAlias = "cms.offline.package.key"
        )
        assertTrue(config.offlineEnabled)
        assertEquals("public-key", config.manifestSigningPublicKeySpkiBase64)
        assertEquals("cms.offline.package.key", config.keystoreAlias)
    }

    @Test fun `api url falls back to the batch 0 base url when offline url is blank`() {
        assertEquals(
            "https://api.example.com",
            AndroidOfflineBuildConfiguration.apiBaseUrl("", "https://api.example.com")
        )
        assertEquals(
            "https://offline.example.com",
            AndroidOfflineBuildConfiguration.apiBaseUrl(" https://offline.example.com ", "https://api.example.com")
        )
    }
}
