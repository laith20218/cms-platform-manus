package com.cms.student.security

import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.Base64
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Batch 2 optional HTTPS certificate pinning hook for the native offline clients.
 *
 * Pins are SPKI SHA-256 hashes (the same format used by student-web/ops tooling),
 * supplied through `BuildConfig.OFFLINE_API_SPKI_PINS_BASE64` as a comma-separated
 * list, each entry either raw base64 or prefixed with `sha256/`:
 *
 * ```
 * ./gradlew :app:assembleDebug -POFFLINE_API_SPKI_PINS_BASE64="sha256/AAAA...,sha256/BBBB..."
 * ```
 *
 * EMPTY (the default) = pinning disabled, so debug builds against placeholder
 * domains keep working; non-empty = enforced fail-closed on top of normal system
 * CA validation. Ops supplies production pins at release time — pins are public
 * hashes of the server public key, never secrets.
 *
 * To compute a pin for a host:
 * `openssl s_client -connect host:443 </dev/null 2>/dev/null | openssl x509 -pubkey -noout \
 *  | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`
 */
object OfflineCertificatePinning {

    /** Parses the raw BuildConfig value into normalized base64 pin set; empty input pins nothing. */
    fun parsePins(raw: String): Set<String> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return emptySet()
        return trimmed.split(',')
            .map { it.trim().removePrefix("sha256/") }
            .onEach { entry ->
                if (entry.isEmpty() || entry.any { ch -> ch !in BASE64_ALPHABET }) {
                    throw IllegalArgumentException(
                        "OFFLINE_API_SPKI_PINS_BASE64 entries must be base64 SPKI SHA-256 pins, optionally prefixed with sha256/"
                    )
                }
            }
            .toSet()
    }

    /**
     * Returns an [SSLSocketFactory] that enforces [pinsBase64] on top of the system
     * trust store, or null when pinning is not configured (default debug builds).
     */
    fun socketFactoryIfPinned(pinsBase64: Set<String>): SSLSocketFactory? {
        if (pinsBase64.isEmpty()) return null
        val pins = pinsBase64.map { pin ->
            val bytes = Base64.getDecoder().decode(pin)
            check(bytes.size == SHA256_LENGTH) { "SPKI pin must be a SHA-256 hash (32 bytes)" }
            bytes
        }
        val systemTrustManager = defaultTrustManager()
        return SSLContext.getInstance("TLS")
            .apply { init(null, arrayOf(PinnedTrustManager(systemTrustManager, pins)), null) }
            .socketFactory
    }

    /** Applies [factory] to [connection] when pinning is configured; no-op otherwise. */
    fun applyTo(connection: HttpsURLConnection, factory: SSLSocketFactory?) {
        if (factory != null) connection.sslSocketFactory = factory
    }

    /** Raw SPKI SHA-256 bytes of a public key — the value pins are compared against. */
    fun spkiSha256(spkiDer: ByteArray): ByteArray =
        java.security.MessageDigest.getInstance("SHA-256").digest(spkiDer)

    private fun defaultTrustManager(): X509TrustManager {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            .apply { init(null as KeyStore?) }
        return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
    }

    private const val SHA256_LENGTH = 32
    private const val BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
}

/**
 * Normal system CA validation first (fail closed on invalid chains), then the leaf
 * SPKI pin must match one of the configured pins.
 */
class PinnedTrustManager(
    private val delegate: X509TrustManager,
    private val pins: List<ByteArray>
) : X509TrustManager {

    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) =
        delegate.checkClientTrusted(chain, authType)

    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        delegate.checkServerTrusted(chain, authType)
        if (chain.isEmpty()) throw CertificateException("Empty server certificate chain")
        val leafPin = OfflineCertificatePinning.spkiSha256(chain.first().publicKey.encoded)
        if (pins.none { pin -> MessageDigest.isEqual(pin, leafPin) }) {
            throw CertificateException("Certificate pinning failure")
        }
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = delegate.acceptedIssuers
}
