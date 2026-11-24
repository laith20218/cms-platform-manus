package com.cms.student.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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

    // -------------------------------------------------------------------
    // D-PIN closure (2026-11-24): mandatory pinning must fail closed on an
    // empty pin set — never silently degrade a release build to system trust.
    // -------------------------------------------------------------------

    @Test fun `mandatory pins fail closed on an empty pin set`() {
        assertThrows(IllegalStateException::class.java) {
            AndroidOfflineBuildConfiguration.enforcePins(mandatory = true, pinsBase64 = "")
        }
        assertThrows(IllegalStateException::class.java) {
            AndroidOfflineBuildConfiguration.enforcePins(mandatory = true, pinsBase64 = "   ")
        }
    }

    @Test fun `mandatory pins pass through the parsed non-empty pin set`() {
        val pinA = "A".repeat(43) + "="
        val pinB = "B".repeat(43) + "="
        val pins = AndroidOfflineBuildConfiguration.enforcePins(
            mandatory = true,
            pinsBase64 = "sha256/$pinA, $pinB ,$pinA"
        )
        assertEquals(setOf(pinA, pinB), pins)
    }

    @Test fun `optional pins keep the empty set as the debug system-trust fallback`() {
        assertTrue(AndroidOfflineBuildConfiguration.enforcePins(mandatory = false, pinsBase64 = "").isEmpty())
        assertTrue(AndroidOfflineBuildConfiguration.enforcePins(mandatory = false, pinsBase64 = "  ").isEmpty())
    }

    @Test fun `optional pins still parse and pass through when provided`() {
        val pin = "B".repeat(43) + "="
        assertEquals(setOf(pin), AndroidOfflineBuildConfiguration.enforcePins(mandatory = false, pinsBase64 = pin))
    }

    @Test fun `malformed mandatory pin entries still fail loudly at parse time`() {
        assertThrows(IllegalArgumentException::class.java) {
            AndroidOfflineBuildConfiguration.enforcePins(mandatory = true, pinsBase64 = "not-base64!!")
        }
        assertThrows(IllegalArgumentException::class.java) {
            AndroidOfflineBuildConfiguration.enforcePins(mandatory = false, pinsBase64 = "sha256/")
        }
    }

    @Test fun `enforcePins output feeds a pinned socket factory for mandatory builds`() {
        val pin = "A".repeat(43) + "="
        val pins = AndroidOfflineBuildConfiguration.enforcePins(mandatory = true, pinsBase64 = pin)
        assertNotNull(OfflineCertificatePinning.socketFactoryIfPinned(pins))
        assertNull(OfflineCertificatePinning.socketFactoryIfPinned(emptySet()))
    }
}
