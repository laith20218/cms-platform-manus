package com.cms.student.bridge

import android.webkit.JavascriptInterface
import com.cms.student.shell.ShellUrlPolicy
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Batch 3 JVM tests for [CmsJsBridge] — pure logic, no Robolectric (the project does
 * not use it). The current-URL provider is a fake lambda standing in for
 * `webView.url`, exactly like the wiring in ShellActivity.
 */
class CmsJsBridgeTest {

    private val policy = ShellUrlPolicy.fromBaseUrl("https://app.cms.example.com")
        ?: error("fixture base URL must be usable")
    private val installationId = UUID.randomUUID().toString()
    private val appVersion = "0.1.0"

    private fun bridge(currentUrl: () -> String?): CmsJsBridge =
        CmsJsBridge(
            urlPolicy = policy,
            currentUrl = currentUrl,
            installationId = { installationId },
            appVersion = { appVersion }
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
        }
    }

    @Test
    fun `origin guard fails closed with a blocking policy even for the configured origin`() {
        val blockingPolicy = ShellUrlPolicy.allowNothing()
        val bridge = CmsJsBridge(
            urlPolicy = blockingPolicy,
            currentUrl = { "https://app.cms.example.com/" },
            installationId = { installationId },
            appVersion = { appVersion }
        )
        assertFalse(bridge.hasNativeShell())
        assertEquals("", bridge.getPlatform())
        assertEquals("", bridge.getAppVersion())
        assertEquals("", bridge.getInstallationId())
    }

    @Test
    fun `the js surface is exactly the four approved methods`() {
        val jsMethodNames = CmsJsBridge::class.java.methods
            .filter { it.isAnnotationPresent(JavascriptInterface::class.java) }
            .map { it.name }
            .toSet()
        assertEquals(
            setOf("hasNativeShell", "getPlatform", "getAppVersion", "getInstallationId"),
            jsMethodNames
        )
    }

    @Test
    fun `js name and platform constants are stable for the documented web contract`() {
        assertEquals("CmsNative", CmsJsBridge.JS_NAME)
        assertEquals("android", CmsJsBridge.PLATFORM)
    }
}
