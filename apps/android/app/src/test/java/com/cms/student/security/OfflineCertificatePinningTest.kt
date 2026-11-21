package com.cms.student.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Base64
import javax.net.ssl.X509TrustManager

/**
 * JVM tests for the optional (Batch 2) certificate pinning hook. The trust-decision
 * tests use a self-signed fixture certificate (CN=pinning-test.local) whose SPKI
 * SHA-256 pin was computed independently with openssl — the same procedure ops will
 * use to produce production pins.
 */
class OfflineCertificatePinningTest {

    private val certificatePem = """
        -----BEGIN CERTIFICATE-----
        MIIDGzCCAgOgAwIBAgIUWf83S+Fiv0hCmoSOw8iyzHDNcX4wDQYJKoZIhvcNAQEL
        BQAwHTEbMBkGA1UEAwwScGlubmluZy10ZXN0LmxvY2FsMB4XDTI2MTEyMTExNTQ0
        N1oXDTM2MTExODExNTQ0N1owHTEbMBkGA1UEAwwScGlubmluZy10ZXN0LmxvY2Fs
        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6KKv0M3uudmS6er9YsNm
        pg02GmfUAfkG+P5X3seU/t9gGjnxkuqUFGoxGR58HF1SSVy2iQtompFi8v3W/m1a
        YQU5bnDh5w83W/n0dtZQiysMWWbIvmpjGHMmJsnu5MbjREIUYaI81YD8zDHh/WQi
        FEjkRlDDwPJKIgQ1KrIJxavx9yxpp1Ql1I/4B/OC9NOlonLJE9Qya4XTSdS12z7r
        sxXWaFfMzSbp8xciU66W8ZHlqhW/ZL/fQYneTXM2FbYW3hbMJFONgEIQ1C/7EGNC
        cjVcF4CaSm4sDfwhzF/MPKpiUWqAhq4Jm0l6lssE+eiRhF7e1z4u1tZ5X4cAyp/U
        vQIDAQABo1MwUTAdBgNVHQ4EFgQU9zAt55vF1MnE9Oez4mi7zhbCd98wHwYDVR0j
        BBgwFoAU9zAt55vF1MnE9Oez4mi7zhbCd98wDwYDVR0TAQH/BAUwAwEB/zANBgkq
        hkiG9w0BAQsFAAOCAQEAv86FD+q1MxTKuFA2Zq/bU1N1N+FpW9XQ2XRKARn+6nLT
        pNCO5lMJit6b6Sj5D92DaDqb22/kQLRHLN5K6o8sis9v9cPcvKpTd6XjZQa6IvVS
        qToZ208mN/j8SLLm77cS4A9D9odYfLiLi1FEr5/2F+u3DBdHHHMpN5yif9qIyNLh
        JAaqVyveARctLKRvmmkS7PciyOPD978lQRozBUS3OBJZWOQLjbg96+7skWEEnZFj
        79IGD68z6B/CKfVNYi8JNxGBwcY7lyhMjuOmSIQXSMm4SJRFxrOTzZloBIyLnXoZ
        UvBLfmqA1A0O/Rg2xoKVWa6v0iZ32EdVllQgCFx2hg==
        -----END CERTIFICATE-----
    """.trimIndent()

    /** openssl-computed SPKI SHA-256 pin of the fixture certificate above. */
    private val fixturePin = "ipQYfLzUrK6JIz8Q85vIVmHBkwk58RSukUzf0UGeNyE="

    private object AcceptingDelegate : X509TrustManager {
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    private fun fixtureCertificate(): X509Certificate =
        CertificateFactory.getInstance("X.509")
            .generateCertificate(ByteArrayInputStream(certificatePem.toByteArray())) as X509Certificate

    @Test
    fun `empty pin configuration disables pinning`() {
        assertTrue(OfflineCertificatePinning.parsePins("").isEmpty())
        assertTrue(OfflineCertificatePinning.parsePins("   ").isEmpty())
        assertNull(OfflineCertificatePinning.socketFactoryIfPinned(emptySet()))
    }

    @Test
    fun `pin list accepts sha256 prefixes commas duplicates and whitespace`() {
        val pinA = "A".repeat(43) + "="
        val pinB = "B".repeat(43) + "="
        val pins = OfflineCertificatePinning.parsePins("sha256/$pinA, $pinB ,$pinA")
        assertEquals(setOf(pinA, pinB), pins)
    }

    @Test
    fun `malformed pin entries fail loudly at parse time`() {
        val threw = try {
            OfflineCertificatePinning.parsePins("not-base64!!")
            false
        } catch (_: IllegalArgumentException) {
            true
        }
        assertTrue(threw)
    }

    @Test
    fun `computed leaf pin matches the independently computed fixture pin`() {
        val cert = fixtureCertificate()
        val computed = Base64.getEncoder().encodeToString(OfflineCertificatePinning.spkiSha256(cert.publicKey.encoded))
        assertEquals(fixturePin, computed)
    }

    @Test
    fun `configured pins produce a pinned socket factory`() {
        assertNotNull(OfflineCertificatePinning.socketFactoryIfPinned(setOf(fixturePin)))
    }

    @Test
    fun `pinned trust manager accepts a matching pin and rejects a wrong pin`() {
        val cert = fixtureCertificate()
        val pinned = PinnedTrustManager(AcceptingDelegate, listOf(Base64.getDecoder().decode(fixturePin)))
        pinned.checkServerTrusted(arrayOf(cert), "RSA")

        val wrongPin = ByteArray(32) { it.toByte() }
        val rejected = try {
            PinnedTrustManager(AcceptingDelegate, listOf(wrongPin)).checkServerTrusted(arrayOf(cert), "RSA")
            false
        } catch (_: CertificateException) {
            true
        }
        assertTrue(rejected)
    }

    @Test
    fun `pinned trust manager rejects an empty chain`() {
        val threw = try {
            PinnedTrustManager(AcceptingDelegate, listOf(ByteArray(32))).checkServerTrusted(emptyArray(), "RSA")
            false
        } catch (_: CertificateException) {
            true
        }
        assertTrue(threw)
    }
}
