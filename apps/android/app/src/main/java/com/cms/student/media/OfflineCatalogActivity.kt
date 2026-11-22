package com.cms.student.media

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import com.cms.student.MainActivity
import com.cms.student.R
import java.util.Locale

/**
 * Owner lock 6 — the native offline screen «وضع بدون إنترنت»: lists every cached
 * object (most recently accessed first), opens one on tap through the same
 * entitlement-gated [MediaCacheService.openLocal] path the bridge uses, offers a
 * clear-all action, and — when no native session exists — surfaces the local
 * sign-in entry (the honest D1 bootstrap for downloading content: the WebView's
 * own session tokens are deliberately unreachable from Kotlin).
 *
 * A [CacheProgressBus] listener keeps the rows live while downloads finish.
 */
class OfflineCatalogActivity : MediaViewerActivity() {

    private val progressListener = CacheProgressBus.Listener { runOnUiThread { refreshList() } }
    private var listAdapter: CatalogAdapter? = null
    private var emptyLabel: TextView? = null
    private var loginRow: LinearLayout? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        rootLayout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val title = TextView(this).apply {
            setText(R.string.offline_catalog_title)
            textSize = 20f
            setPadding(24, 24, 24, 24)
        }
        header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        val clearButton = Button(this).apply {
            setText(R.string.offline_catalog_clear)
            setOnClickListener {
                mediaService()?.clearCache()
                Toast.makeText(this@OfflineCatalogActivity, R.string.offline_catalog_cleared, Toast.LENGTH_SHORT).show()
                refreshList()
            }
        }
        header.addView(clearButton)
        rootLayout.addView(header)

        emptyLabel = TextView(this).apply {
            setText(R.string.offline_catalog_empty)
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(32, 48, 32, 16)
        }
        rootLayout.addView(emptyLabel, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val loginHint = TextView(this).apply {
            setText(R.string.offline_catalog_login_hint)
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(32, 4, 32, 8)
            visibility = View.GONE
        }
        val loginButton = Button(this).apply {
            setText(R.string.offline_catalog_login)
            setOnClickListener {
                runCatching {
                    startActivity(Intent(this@OfflineCatalogActivity, MainActivity::class.java))
                }
            }
            visibility = View.GONE
        }
        loginRow = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        loginRow?.addView(loginHint)
        loginRow?.addView(loginButton)
        rootLayout.addView(loginRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val list = ListView(this)
        rootLayout.addView(list, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        listAdapter = CatalogAdapter()
        list.adapter = listAdapter
        list.setOnItemClickListener { _, _, position, _ ->
            listAdapter?.entryAt(position)?.let { open(it) }
        }
        setContentView(rootLayout)
        refreshList()
    }

    private fun open(entry: MediaCacheEntry) {
        val service = mediaService() ?: return
        when (val code = service.openLocal(entry.contentId)) {
            CacheStatus.OPENED -> Unit
            CacheStatus.DENIED_AUTH -> Toast.makeText(this, R.string.media_open_denied_auth, Toast.LENGTH_LONG).show()
            CacheStatus.DENIED_STALE -> Toast.makeText(this, R.string.media_open_denied_stale, Toast.LENGTH_LONG).show()
            else -> Toast.makeText(this, R.string.media_open_failed, Toast.LENGTH_LONG).show()
        }
    }

    private fun refreshList() {
        val service = mediaService()
        val entries = service?.catalogEntries() ?: emptyList()
        emptyLabel?.visibility = if (entries.isEmpty()) View.VISIBLE else View.GONE
        loginRow?.visibility = if (entries.isEmpty() && service?.hasNativeSession() == false) View.VISIBLE else View.GONE
        listAdapter?.notifyDataSetChanged()
    }

    override fun onStart() {
        super.onStart()
        mediaService()?.let { service ->
            service.progressBus().register(progressListener)
        }
        refreshList()
    }

    override fun onStop() {
        mediaService()?.let { service ->
            service.progressBus().unregister(progressListener)
        }
        super.onStop()
    }

    /** Two-line rows: title; kind label + size + offline-availability badge. */
    private inner class CatalogAdapter : BaseAdapter() {

        private var entries: List<MediaCacheEntry> = emptyList()

        fun entryAt(position: Int): MediaCacheEntry? = synchronized(this) {
            refresh()
            entries.getOrNull(position)
        }

        override fun getCount(): Int = synchronized(this) {
            refresh()
            entries.size
        }

        override fun getItem(position: Int): Any? = entryAt(position)
        override fun getItemId(position: Int): Long = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
            val row = convertView as? LinearLayout ?: LinearLayout(parent.context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(32, 20, 32, 20)
            }
            val entry = entryAt(position) ?: return row
            val service = mediaService()

            if (row.childCount == 0) {
                row.addView(TextView(parent.context).apply { textSize = 16f; setSingleLine(true) })
                row.addView(TextView(parent.context).apply { textSize = 13f })
            }
            val titleView = row.getChildAt(0) as TextView
            val subtitleView = row.getChildAt(1) as TextView
            titleView.text = entry.displayName ?: entry.contentId
            val kindLabel = kindLabelFor(entry.kind)
            val withinWindow = service?.isWithinWindow(entry.contentId) ?: false
            val badge = getString(
                if (withinWindow) R.string.offline_catalog_available else R.string.offline_catalog_needs_refresh
            )
            subtitleView.text = "$kindLabel — ${formatSize(entry.bytes)} — $badge"
            return row
        }

        private fun refresh() {
            entries = mediaService()?.catalogEntries() ?: emptyList()
        }
    }

    private fun kindLabelFor(kind: MediaKind): String = getString(
        when (kind) {
            MediaKind.PDF -> R.string.media_kind_pdf
            MediaKind.TEXT -> R.string.media_kind_txt
            MediaKind.HTML -> R.string.media_kind_html
            MediaKind.IMAGE -> R.string.media_kind_image
            MediaKind.VIDEO -> R.string.media_kind_video
            MediaKind.AUDIO -> R.string.media_kind_audio
        }
    )

    private fun formatSize(bytes: Long): String =
        String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0))
}
