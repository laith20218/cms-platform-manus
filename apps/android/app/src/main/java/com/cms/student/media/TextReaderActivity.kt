package com.cms.student.media

import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.cms.student.R

/**
 * In-app reader for cached text/HTML library files.
 *
 * TXT renders as a scrolling Arabic reading column (auto RTL detection per
 * paragraph, UTF-8). HTML renders in a hardened WebView: JavaScript OFF, file/
 * content access OFF, DOM storage OFF, mixed content never — the static lesson
 * renders read-only. Interactive lessons (server-side `enableScripts`) degrade
 * to static rendering here; that limitation is documented in the roadmap (the
 * web shell keeps full fidelity online).
 */
class TextReaderActivity : MediaViewerActivity() {

    private var webView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = contentId
        val store = mediaFileStore()
        if (id == null || store == null) {
            finish()
            return
        }

        rootLayout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val title = TextView(this).apply {
            text = displayTitle
            textSize = 18f
            setSingleLine(true)
            setPadding(24, 16, 24, 16)
        }
        val close = Button(this).apply {
            setText(R.string.media_close)
            setOnClickListener { finish() }
        }
        header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        header.addView(close)
        rootLayout.addView(header)

        onBackground {
            val bytes = store.readBytes(id) ?: run {
                runOnUiThread { showFailed() }
                return@onBackground
            }
            val text = String(bytes, Charsets.UTF_8)
            runOnUiThread { render(text) }
        }
        setContentView(rootLayout)
    }

    private fun render(text: String) {
        if (wireKind == MediaKind.HTML.wireName) {
            val view = WebView(this).apply {
                settings.apply {
                    javaScriptEnabled = false
                    domStorageEnabled = false
                    allowFileAccess = false
                    allowContentAccess = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                }
                loadDataWithBaseURL(null, text, "text/html; charset=utf-8", "utf-8", null)
            }
            webView = view
            rootLayout.addView(
                view,
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
            )
        } else {
            val scrollView = ScrollView(this)
            val body = TextView(this).apply {
                setPadding(32, 32, 32, 48)
                textSize = 17f
                setLineSpacing(0f, 1.3f)
                textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                gravity = Gravity.START
                setText(text)
            }
            scrollView.addView(body)
            rootLayout.addView(
                scrollView,
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
            )
        }
    }

    private fun showFailed() {
        Toast.makeText(this, R.string.media_open_failed, Toast.LENGTH_LONG).show()
        finish()
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}
