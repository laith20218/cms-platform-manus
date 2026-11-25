package com.cms.student

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.cms.student.bridge.OfflineExamBridge
import com.cms.student.bridge.OfflineExamSessionRunner
import com.cms.student.security.OfflineSyncDisposition
import com.cms.student.security.OfflineSyncOutcome
import com.cms.student.shell.ShellError
import com.cms.student.shell.ShellUrlPolicy
import com.cms.student.shell.WebViewHost
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors

/**
 * W3 (UX 2A) — hardened WebView player for OFFLINE question packages. Loads the
 * student-web exam route (`/offline-exam/:packageId`) in a DEDICATED WebView whose
 * ONLY injected interface is `window.CmsOfflineExam` (see [OfflineExamBridge] —
 * payload, answer capture, sync status; a different interface on a different
 * WebView than the shell's `CmsNative`).
 *
 * The React page reuses the shared QuestionRow exam UI; this activity mirrors the
 * native OfflineExamActivity lifecycle it supersedes for the panel flow: the
 * session/runtime binding resolves once from CmsApplication (native session, else
 * the last web-bound student as a token-less binding), the payload state machine
 * lives in the pure [OfflineExamSessionRunner] (openOnline ?: continueOffline,
 * pendingAnswers restore, capture, sync dispositions), and answers survive
 * activity recreation through the encrypted package store.
 *
 * MainActivity's phone/password fallback path keeps the NATIVE OfflineExamActivity
 * — this class never touches it.
 */
class OfflineExamWebActivity : AppCompatActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var webView: WebView
    private lateinit var errorOverlay: LinearLayout
    private lateinit var errorTitle: TextView
    private lateinit var errorMessage: TextView
    private lateinit var retryButton: Button
    private lateinit var host: WebViewHost
    private lateinit var packageId: UUID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Block screenshots and recents thumbnails — same protection as the shell.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        packageId = intent.getStringExtra(EXTRA_PACKAGE_ID)?.let(UUID::fromString) ?: run { finish(); return }
        buildContentView()

        // An unusable base URL yields a block-everything policy; the exam route
        // load then shows the honest configuration error instead of loading.
        val urlPolicy = ShellUrlPolicy.fromBaseUrl(BuildConfig.STUDENT_WEB_BASE_URL)
            ?: ShellUrlPolicy.allowNothing()
        host = WebViewHost(webView, urlPolicy, ::showError)
        host.attach()

        // W3 (UX 2A): the exam webview's runtime facade — the SAME coordinator
        // graph the native fallback uses, bound to the resolved session (native
        // session, else the last web-bound student). A null binding (no session
        // or trusted-offline disabled) fails closed to the runner's denied_session
        // phase — the page shows its honest Arabic message.
        val app = application as CmsApplication
        val binding = app.offlineExamRuntimeBinding()
        val runner = OfflineExamSessionRunner(
            packageId = packageId,
            session = binding?.session,
            store = app.offlinePackageStoreForExams(),
            openOnline = { pkg, subject -> binding?.runtime?.let { runCatching { it.openOnline(pkg, subject) }.getOrNull() } },
            continueOffline = { pkg, subject -> binding?.runtime?.let { runCatching { it.continueOffline(pkg, subject) }.getOrNull() } },
            captureAnswer = { pkg, question, option, duration ->
                binding?.runtime?.let { it.captureAnswer(pkg, question, option, duration) } ?: false
            },
            pendingAnswers = { pkg -> binding?.runtime?.let { it.pendingAnswers(pkg) } ?: emptyList() },
            sync = { pkg ->
                binding?.runtime?.let { runCatching { it.sync(pkg) }.getOrNull() }
                    ?: OfflineSyncOutcome(OfflineSyncDisposition.AUTH_REJECTED)
            },
            executor = executor,
            clock = Instant::now
        )
        runner.start()

        // The DEDICATED exam bridge — injected strictly AFTER host.attach() applied
        // the hardening settings, exactly like the shell's CmsNative injection.
        host.attachExamBridge(
            OfflineExamBridge(
                currentUrl = { webView.url },
                urlPolicy = urlPolicy,
                payloadProvider = { runner.stateSnapshot() },
                answerCapture = { questionId, optionId, durationSeconds ->
                    runner.captureAnswer(questionId, optionId, durationSeconds)
                },
                submitRequest = { runner.requestSubmit() },
                syncStatus = { runner.syncStatus() }
            )
        )

        retryButton.setOnClickListener {
            hideError()
            loadExamRoute(urlPolicy)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!host.goBack()) finish()
            }
        })

        loadExamRoute(urlPolicy)
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
        executor.shutdownNow()
        host.destroy()
        super.onDestroy()
    }

    /** Programmatic chrome: the exam WebView plus the honest error overlay (no XML). */
    private fun buildContentView() {
        webView = WebView(this)
        errorTitle = TextView(this).apply {
            textSize = 18f
            setPadding(0, 0, 0, 16)
            gravity = Gravity.CENTER
        }
        errorMessage = TextView(this).apply {
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 24)
        }
        retryButton = Button(this).apply { setText(R.string.shell_retry) }
        errorOverlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            visibility = View.GONE
            addView(errorTitle)
            addView(errorMessage)
            addView(retryButton)
        }
        val root = FrameLayout(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        root.addView(
            errorOverlay,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setContentView(root)
    }

    /** Loads the student-web offline exam route for this package; a misconfigured base URL surfaces as an error. */
    private fun loadExamRoute(urlPolicy: ShellUrlPolicy) {
        val examUrl = BuildConfig.STUDENT_WEB_BASE_URL.trimEnd('/') + "/offline-exam/" + packageId
        if (!urlPolicy.isAllowed(examUrl)) {
            showError(ShellError.InvalidConfiguration)
            return
        }
        webView.loadUrl(examUrl)
    }

    /** Mirrors ShellActivity's honest error screen (no fake offline mode). */
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

    private fun hideError() {
        errorOverlay.visibility = View.GONE
    }

    companion object {
        private const val EXTRA_PACKAGE_ID = "com.cms.student.extra.OFFLINE_EXAM_PACKAGE_ID"

        /**
         * Launch intent for the exam webview. NEW_TASK because the production caller
         * is CmsApplication's exam launcher (an Application context posting to the
         * main thread) — the activity still lands in the app's own task.
         */
        fun intent(context: Context, packageId: UUID): Intent =
            Intent(context, OfflineExamWebActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(EXTRA_PACKAGE_ID, packageId.toString())
    }
}
