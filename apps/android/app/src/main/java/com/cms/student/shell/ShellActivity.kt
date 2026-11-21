package com.cms.student.shell

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

        // An unusable base URL yields a block-everything policy; loadHome() then
        // shows the honest configuration error instead of loading anything.
        val urlPolicy = ShellUrlPolicy.fromBaseUrl(BuildConfig.STUDENT_WEB_BASE_URL)
            ?: ShellUrlPolicy.allowNothing()
        host = WebViewHost(webView, urlPolicy, ::showError)
        host.attach()

        // Batch 3: the single audited JS bridge (window.CmsNative) — attached strictly
        // AFTER host.attach() applied the hardening settings. Four read-only methods
        // only; see CmsJsBridge for the surface, origin guard, and threat model.
        host.attachJsBridge(
            CmsJsBridge(
                urlPolicy = urlPolicy,
                currentUrl = { webView.url },
                installationId = {
                    (application as CmsApplication).installationIdProvider().installationId()
                },
                appVersion = { resolveAppVersion() }
            )
        )

        findViewById<Button>(R.id.shell_retry_button).setOnClickListener {
            hideError()
            host.loadHome()
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
            }
            ShellError.Network -> {
                errorTitle.setText(R.string.shell_error_network_title)
                errorMessage.setText(R.string.shell_error_network_message)
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
