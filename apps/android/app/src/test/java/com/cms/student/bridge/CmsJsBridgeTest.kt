package com.cms.student.bridge

import android.webkit.JavascriptInterface
import com.cms.student.media.CachePolicy
import com.cms.student.media.CacheStatus
import com.cms.student.media.MediaKind
import com.cms.student.session.TokenSeal
import com.cms.student.shell.ShellUrlPolicy
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Batch 3 + Batch 4 JVM tests for [CmsJsBridge] — pure logic, no Robolectric (the
 * project does not use it). The current-URL provider is a fake lambda standing in
 * for `webView.url`, exactly like the wiring in ShellActivity; the cache API is a
 * fake [CmsNativeCacheApi] recording calls.
 */
class CmsJsBridgeTest {

    private val policy = ShellUrlPolicy.fromBaseUrl("https://app.cms.example.com")
        ?: error("fixture base URL must be usable")
    private val installationId = UUID.randomUUID().toString()
    private val appVersion = "0.1.0"

    private val cacheCalls = mutableListOf<String>()
    private val fakeCacheApi = object : CmsNativeCacheApi {
        /** Mirrors the service contract: shape-validated ids, lenient hints, stable codes. */
        private fun validId(contentId: String): String? {
            val trimmed = contentId.trim()
            if (trimmed.isBlank() || trimmed.length > CachePolicy.MAX_INPUT_LENGTH) return null
            return if (CachePolicy.CONTENT_ID_PATTERN.matches(trimmed)) trimmed else null
        }

        override fun listCached(): String = "[]"
        override fun ensureLocal(contentId: String, type: String?, hintsJson: String?): String {
            val id = validId(contentId) ?: return CacheStatus.INVALID_ARGS
            if (MediaKind.fromWireName(type) == null) return CacheStatus.UNSUPPORTED_TYPE
            cacheCalls.add("ensureLocal:$id:$type:$hintsJson")
            return CacheStatus.READY
        }
        override fun openLocal(contentId: String): String {
            val id = validId(contentId) ?: return CacheStatus.INVALID_ARGS
            cacheCalls.add("openLocal:$id")
            return CacheStatus.OPENED
        }
        override fun cacheStatus(contentId: String): String =
            if (validId(contentId) == null) CacheStatus.INVALID_ARGS else CacheStatus.READY
        override fun cancelDownload(contentId: String): String =
            if (validId(contentId) == null) CacheStatus.INVALID_ARGS else CacheStatus.CANCELED
        override fun removeCached(contentId: String): String =
            if (validId(contentId) == null) CacheStatus.INVALID_ARGS else CacheStatus.REMOVED
        override fun clearCache(): String = CacheStatus.CLEARED
    }

    /** D-JS-AUTH fakes: identity-style seal for round trips, plus failing/throwing variants. */
    private val sealCalls = mutableListOf<String>()
    private val fakeSeal = object : TokenSeal {
        override fun seal(plaintext: String): String? {
            sealCalls.add("seal:$plaintext")
            return "v1:$plaintext"
        }
        override fun unseal(sealed: String): String? {
            sealCalls.add("unseal:$sealed")
            return sealed.removePrefix("v1:").takeIf { sealed.startsWith("v1:") }
        }
    }
    private val failingSeal = object : TokenSeal {
        override fun seal(plaintext: String): String? = null
        override fun unseal(sealed: String): String? = null
    }
    private val throwingSeal = object : TokenSeal {
        override fun seal(plaintext: String): String? = error("boom")
        override fun unseal(sealed: String): String? = error("boom")
    }

    private fun bridge(
        cacheApi: CmsNativeCacheApi = fakeCacheApi,
        tokenSeal: TokenSeal = fakeSeal,
        currentUrl: () -> String?
    ): CmsJsBridge =
        CmsJsBridge(
            urlPolicy = policy,
            currentUrl = currentUrl,
            installationId = { installationId },
            appVersion = { appVersion },
            cacheApi = cacheApi,
            tokenSeal = tokenSeal
        )

    @Test
    fun `shell detection platform and version are returned on the allowlisted origin`() {
        val bridge = bridge { "https://app.cms.example.com/dashboard" }
        assertTrue(bridge.hasNativeShell())
        assertEquals("android", bridge.getPlatform())
        assertEquals(appVersion, bridge.getAppVersion())
    }

    @Test
    fun `installation id is returned non blank and uuid shaped on the allowlisted origin`() {
        val bridge = bridge { "https://app.cms.example.com/" }
        val id = bridge.getInstallationId()
        assertTrue(id.isNotBlank())
        assertEquals(installationId, id)
        // InstallationIdProvider generates a UUID v4; the value must stay UUID-shaped
        // so downstream header consumers can rely on the format.
        assertTrue(
            id.matches(Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"))
        )
    }

    @Test
    fun `every method returns safe defaults when the current origin is not allowlisted`() {
        val deniedUrls = listOf(
            "https://evil.example.com/dashboard",
            "https://app.cms.example.com.evil.com/",
            "http://app.cms.example.com/dashboard",
            "https://app.cms.example.com:8443/dashboard",
            "file:///etc/passwd",
            "",
            null
        )
        deniedUrls.forEach { url ->
            val bridge = bridge { url }
            assertFalse("hasNativeShell must be false for '$url'", bridge.hasNativeShell())
            assertEquals("platform must be empty for '$url'", "", bridge.getPlatform())
            assertEquals("version must be empty for '$url'", "", bridge.getAppVersion())
            assertEquals("installation id must be empty for '$url'", "", bridge.getInstallationId())
            // Batch 4 surface: queries answer absent/empty, actions are denied, no
            // cache call ever reaches the service.
            assertEquals("listCached must be empty for '$url'", CacheStatus.EMPTY_LIST_JSON, bridge.listCached())
            assertEquals("ensureLocal must be denied for '$url'", CacheStatus.DENIED_ORIGIN, bridge.ensureLocal("11111111-2222-4333-8444-555555555555", "pdf", null))
            assertEquals("openLocal must be denied for '$url'", CacheStatus.DENIED_ORIGIN, bridge.openLocal("11111111-2222-4333-8444-555555555555"))
            assertEquals("cacheStatus must be absent for '$url'", CacheStatus.ABSENT, bridge.cacheStatus("11111111-2222-4333-8444-555555555555"))
            assertEquals("cancelDownload must be absent for '$url'", CacheStatus.ABSENT, bridge.cancelDownload("11111111-2222-4333-8444-555555555555"))
            assertEquals("removeCached must be absent for '$url'", CacheStatus.ABSENT, bridge.removeCached("11111111-2222-4333-8444-555555555555"))
            assertEquals("clearCache must be denied for '$url'", CacheStatus.DENIED_ORIGIN, bridge.clearCache())
            // D-JS-AUTH: the seal must answer empty outside the allowlisted origin.
            assertEquals("seal must be empty for '$url'", "", bridge.sealForLocalPersistence("token-blob"))
            assertEquals("unseal must be empty for '$url'", "", bridge.unsealForLocalPersistence("v1:token-blob"))
        }
        assertTrue(cacheCalls.isEmpty())
        assertTrue(sealCalls.isEmpty())
    }

    @Test
    fun `origin guard fails closed with a blocking policy even for the configured origin`() {
        val blockingPolicy = ShellUrlPolicy.allowNothing()
        val bridge = CmsJsBridge(
            urlPolicy = blockingPolicy,
            currentUrl = { "https://app.cms.example.com/" },
            installationId = { installationId },
            appVersion = { appVersion },
            cacheApi = fakeCacheApi,
            tokenSeal = fakeSeal
        )
        assertFalse(bridge.hasNativeShell())
        assertEquals("", bridge.getPlatform())
        assertEquals("", bridge.getAppVersion())
        assertEquals("", bridge.getInstallationId())
        assertEquals(CacheStatus.EMPTY_LIST_JSON, bridge.listCached())
        assertEquals(CacheStatus.DENIED_ORIGIN, bridge.clearCache())
        assertEquals("", bridge.sealForLocalPersistence("token-blob"))
        assertEquals("", bridge.unsealForLocalPersistence("v1:token-blob"))
    }

    @Test
    fun `the js surface is exactly the thirteen approved methods`() {
        val jsMethodNames = CmsJsBridge::class.java.methods
            .filter { it.isAnnotationPresent(JavascriptInterface::class.java) }
            .map { it.name }
            .toSet()
        assertEquals(
            setOf(
                "hasNativeShell", "getPlatform", "getAppVersion", "getInstallationId",
                "listCached", "ensureLocal", "openLocal", "cacheStatus",
                "cancelDownload", "removeCached", "clearCache",
                "sealForLocalPersistence", "unsealForLocalPersistence"
            ),
            jsMethodNames
        )
        // D1 / D-JS-AUTH: no method may expose tokens, passwords, or native session
        // material — the seal pair handles page-owned blobs only.
        val forbidden = listOf(
            "getAccessToken", "getRefreshToken", "getToken", "getTokens",
            "getPassword", "getNativeSession", "setAccessToken", "setRefreshToken"
        )
        forbidden.forEach { name ->
            assertFalse("bridge must never expose '$name'", jsMethodNames.contains(name))
        }
    }

    @Test
    fun `js name and platform constants are stable for the documented web contract`() {
        assertEquals("CmsNative", CmsJsBridge.JS_NAME)
        assertEquals("android", CmsJsBridge.PLATFORM)
    }

    @Test
    fun `cache calls reach the service with trimmed ids on the allowlisted origin`() {
        val bridge = bridge { "https://app.cms.example.com/library" }
        val id = "11111111-2222-4333-8444-555555555555"
        assertEquals(CacheStatus.READY, bridge.ensureLocal("  $id ", "pdf", """{"title":"الدرس"}"""))
        assertEquals(CacheStatus.OPENED, bridge.openLocal(" $id\t"))
        assertEquals(listOf("ensureLocal:$id:pdf:{\"title\":\"الدرس\"}", "openLocal:$id"), cacheCalls)
    }

    @Test
    fun `malformed cache inputs answer invalid_args and never reach the service`() {
        val bridge = bridge { "https://app.cms.example.com/library" }
        assertEquals(CacheStatus.INVALID_ARGS, bridge.ensureLocal("", "pdf", null))
        assertEquals(CacheStatus.INVALID_ARGS, bridge.ensureLocal("not-a-uuid", "pdf", null))
        assertEquals(CacheStatus.INVALID_ARGS, bridge.ensureLocal(null, "pdf", null))
        assertEquals(CacheStatus.INVALID_ARGS, bridge.openLocal(""))
        assertEquals(CacheStatus.INVALID_ARGS, bridge.openLocal("../../etc/passwd"))
        assertEquals(CacheStatus.INVALID_ARGS, bridge.cacheStatus("x".repeat(300)))
        assertEquals(CacheStatus.INVALID_ARGS, bridge.cancelDownload(null))
        assertEquals(CacheStatus.INVALID_ARGS, bridge.removeCached(" "))
        assertTrue(cacheCalls.isEmpty())
    }

    @Test
    fun `a throwing cache api degrades to the documented fallbacks instead of surfacing to js`() {
        val throwingCache = object : CmsNativeCacheApi {
            override fun listCached(): String = error("boom")
            override fun ensureLocal(contentId: String, type: String?, hintsJson: String?): String = error("boom")
            override fun openLocal(contentId: String): String = error("boom")
            override fun cacheStatus(contentId: String): String = error("boom")
            override fun cancelDownload(contentId: String): String = error("boom")
            override fun removeCached(contentId: String): String = error("boom")
            override fun clearCache(): String = error("boom")
        }
        val bridge = CmsJsBridge(
            urlPolicy = policy,
            currentUrl = { "https://app.cms.example.com/" },
            installationId = { installationId },
            appVersion = { appVersion },
            cacheApi = throwingCache,
            tokenSeal = throwingSeal
        )
        assertEquals(CacheStatus.EMPTY_LIST_JSON, bridge.listCached())
        assertEquals(CacheStatus.ERROR, bridge.ensureLocal("11111111-2222-4333-8444-555555555555", "pdf", null))
        assertEquals(CacheStatus.ERROR, bridge.openLocal("11111111-2222-4333-8444-555555555555"))
        assertEquals(CacheStatus.ABSENT, bridge.cacheStatus("11111111-2222-4333-8444-555555555555"))
        assertEquals(CacheStatus.ABSENT, bridge.cancelDownload("11111111-2222-4333-8444-555555555555"))
        assertEquals(CacheStatus.ABSENT, bridge.removeCached("11111111-2222-4333-8444-555555555555"))
        assertEquals(CacheStatus.ERROR, bridge.clearCache())
        // A throwing seal degrades to empty strings, never an exception to JS.
        assertEquals("", bridge.sealForLocalPersistence("token-blob"))
        assertEquals("", bridge.unsealForLocalPersistence("v1:token-blob"))
    }

    // ------------------------------------------------------------------
    // D-JS-AUTH (debt closure, 2026-11-24) — the remember-me token seal.
    // ------------------------------------------------------------------

    @Test
    fun `seal and unseal round trip on the allowlisted origin`() {
        val bridge = bridge { "https://app.cms.example.com/" }
        val sealed = bridge.sealForLocalPersistence("""{"accessToken":"a","refreshToken":"r"}""")
        assertEquals("v1:" + """{"accessToken":"a","refreshToken":"r"}""", sealed)
        assertEquals("""{"accessToken":"a","refreshToken":"r"}""", bridge.unsealForLocalPersistence(sealed))
    }

    @Test
    fun `seal failures degrade to the empty string so the web keeps its raw fallback`() {
        val bridge = bridge(tokenSeal = failingSeal) { "https://app.cms.example.com/" }
        assertEquals("", bridge.sealForLocalPersistence("token-blob"))
        assertEquals("", bridge.unsealForLocalPersistence("v1:token-blob"))
    }

    @Test
    fun `blank or oversized seal inputs never reach the seal`() {
        val bridge = bridge { "https://app.cms.example.com/" }
        assertEquals("", bridge.sealForLocalPersistence(null))
        assertEquals("", bridge.sealForLocalPersistence(""))
        assertEquals("", bridge.sealForLocalPersistence("x".repeat(CmsJsBridge.MAX_SEAL_PLAINTEXT_CHARS + 1)))
        assertEquals("", bridge.unsealForLocalPersistence(null))
        assertEquals("", bridge.unsealForLocalPersistence(""))
        assertEquals("", bridge.unsealForLocalPersistence("v1:" + "x".repeat(CmsJsBridge.MAX_SEALED_CHARS + 1)))
        assertTrue(sealCalls.isEmpty())
    }

    @Test
    fun `seal input bounds accept any realistic token pair payload`() {
        val bridge = bridge { "https://app.cms.example.com/" }
        // Two long-lived JWTs are a few KiB each — 16 KiB of plaintext must pass.
        val realisticPair = "x".repeat(CmsJsBridge.MAX_SEAL_PLAINTEXT_CHARS)
        assertEquals("v1:$realisticPair", bridge.sealForLocalPersistence(realisticPair))
    }
}
