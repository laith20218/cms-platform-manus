package com.cms.student.shell

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import android.widget.Button
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.cms.student.BuildConfig
import com.cms.student.CmsApplication
import com.cms.student.R
import com.cms.student.bridge.CmsJsBridge
import com.cms.student.media.OfflineCatalogActivity

/**
 * Hybrid shell launcher: hosts the student-web experience inside a hardened
 * WebView (see [WebViewHost]). Cold start lands here. The phone/password
 * offline entry (MainActivity) is no longer the LAUNCHER and stays reachable
 * only via explicit intent (e.g. `adb shell am start -n com.cms.student/.MainActivity`).
 */
class ShellActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var errorOverlay: View
    private lateinit var errorTitle: TextView
    private lateinit var errorMessage: TextView
    private lateinit var offlineCatalogButton: Button
    private lateinit var host: WebViewHost

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Block screenshots and recents thumbnails for the whole student experience.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        setContentView(R.layout.activity_shell)
        webView = findViewById(R.id.shell_web_view)
        errorOverlay = findViewById(R.id.shell_error_overlay)
        errorTitle = findViewById(R.id.shell_error_title)
        errorMessage = findViewById(R.id.shell_error_message)
        offlineCatalogButton = findViewById(R.id.shell_offline_catalog_button)

        // An unusable base URL yields a block-everything policy; loadHome() then
        // shows the honest configuration error instead of loading anything.
        val urlPolicy = ShellUrlPolicy.fromBaseUrl(BuildConfig.STUDENT_WEB_BASE_URL)
            ?: ShellUrlPolicy.allowNothing()
        host = WebViewHost(webView, urlPolicy, ::showError)
        host.attach()

        // Batch 3 + Batch 4 + D-JS-AUTH + W2 (UX 3C) + Phase P: the single audited
        // JS bridge (window.CmsNative) — attached strictly AFTER host.attach()
        // applied the hardening settings. Four read-only identity methods, the
        // origin-guarded encrypted-media-cache surface (listCached/ensureLocal/
        // openLocal/cacheStatus/cancelDownload/removeCached/clearCache), the
        // origin-guarded remember-me token seal (sealForLocalPersistence/
        // unsealForLocalPersistence — opaque blobs only, no token getters), the
        // origin-guarded offline question-packages surface (listOfflinePackages/
        // downloadOfflinePackage/offlinePackageStatus/removeOfflinePackage/
        // openOfflineExam), and the Phase P web-session-end wipe notification
        // (notifyWebSessionEnded — the page reports its session ended; the wipe
        // direction is strictly native data destruction); see CmsJsBridge for
        // the surface, origin guard, and threat model.
        host.attachJsBridge(
            CmsJsBridge(
                urlPolicy = urlPolicy,
                currentUrl = { webView.url },
                installationId = {
                    (application as CmsApplication).installationIdProvider().installationId()
                },
                appVersion = { resolveAppVersion() },
                cacheApi = (application as CmsApplication).mediaCache(),
                packageApi = (application as CmsApplication).offlinePackageBridge(),
                tokenSeal = (application as CmsApplication).webTokenSeal(),
                // Phase P (containment): the web session ended inside THIS shell —
                // the offline stores wipe per the Phase P policy.
                webSessionEnd = (application as CmsApplication).webSessionEndApi()
            )
        )

        findViewById<Button>(R.id.shell_retry_button).setOnClickListener {
            hideError()
            host.loadHome()
        }

        // Batch 4 — owner lock 6: when the shell cannot reach the student service, the
        // error screen carries an entry to the native offline catalog «وضع بدون إنترنت»
        // listing every cached object that can still open under the durable offline policy.
        findViewById<Button>(R.id.shell_offline_catalog_button).setOnClickListener {
            runCatching { startActivity(Intent(this, OfflineCatalogActivity::class.java)) }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!host.goBack()) finish()
            }
        })

        host.loadHome()
    }

    override fun onPause() {
        host.pause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        host.resume()
    }

    override fun onDestroy() {
        host.destroy()
        super.onDestroy()
    }

    private fun showError(error: ShellError) {
        when (error) {
            ShellError.InvalidConfiguration -> {
                errorTitle.setText(R.string.shell_error_config_title)
                errorMessage.setText(R.string.shell_error_config_message)
                offlineCatalogButton.visibility = View.GONE
            }
            ShellError.Network -> {
                errorTitle.setText(R.string.shell_error_network_title)
                errorMessage.setText(R.string.shell_error_network_message)
                offlineCatalogButton.visibility = View.VISIBLE
            }
        }
        errorOverlay.visibility = View.VISIBLE
    }

    /** versionName from PackageManager (BuildConfig fallback) — shown to JS via the bridge. */
    @Suppress("DEPRECATION") // PackageInfo via the flags overload is deprecated on API 33+; targetSdk 35 keeps the classic call valid.
    private fun resolveAppVersion(): String {
        val versionName = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull()
        return versionName?.takeIf { it.isNotBlank() } ?: BuildConfig.VERSION_NAME
    }

    private fun hideError() {
        errorOverlay.visibility = View.GONE
    }
}
