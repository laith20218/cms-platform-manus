package com.cms.student.media

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.util.LruCache
import android.view.Gravity
import android.view.View
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import com.cms.student.R
import java.io.File

/**
 * In-app PDF viewer (owner lock: the PDF path is MERGE-CRITICAL).
 *
 * Renders the cached, encrypted object with the framework [PdfRenderer]:
 *  1. decrypt to a PRIVATE temp file in the app cache dir (app-private, world-
 *     unreadable; deleted again in [onDestroy] — G6: no plaintext media remains),
 *  2. pages render to Bitmaps on the background executor into a small [LruCache],
 *  3. a ListView lists the pages vertically (recycled views, RTL-aware gravity).
 *
 * No external viewer, no file share, no `file://` exposure — in-app only.
 */
class PdfViewActivity : MediaViewerActivity() {

    private var decryptedTemp: File? = null
    private var fileDescriptor: ParcelFileDescriptor? = null
    private var renderer: PdfRenderer? = null
    private var pageCache: LruCache<Int, Bitmap>? = null

    private lateinit var pageCountLabel: TextView
    private lateinit var pagesList: ListView
    private lateinit var errorText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = contentId
        val store = mediaFileStore()
        if (id == null || store == null) {
            finish()
            return
        }

        rootLayout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        errorText = TextView(this).apply {
            setText(R.string.media_open_failed)
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(32, 48, 32, 32)
            visibility = View.GONE
        }

        pageCountLabel = TextView(this).apply { textSize = 14f }
        pagesList = ListView(this).apply { divider = null }

        val header = buildHeader()
        rootLayout.addView(header)
        rootLayout.addView(pageCountLabel.apply {
            setPadding(24, 8, 24, 8)
        })
        rootLayout.addView(pagesList, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        rootLayout.addView(errorText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))
        setContentView(rootLayout)

        onBackground { openRenderer(id, store) }
    }

    private fun buildHeader(): LinearLayout {
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
        return header
    }

    private fun openRenderer(id: String, store: MediaFileStore) {
        val temp = store.openDecryptedTemp(id)
        if (temp == null || temp.length() == 0L) {
            runOnUiThread { showError() }
            return
        }
        decryptedTemp = temp
        val descriptor = runCatching {
            ParcelFileDescriptor.open(temp, ParcelFileDescriptor.MODE_READ_ONLY)
        }.getOrNull()
        if (descriptor == null) {
            runOnUiThread { showError() }
            return
        }
        fileDescriptor = descriptor
        val pdfRenderer = runCatching { PdfRenderer(descriptor) }.getOrNull()
        if (pdfRenderer == null) {
            runOnUiThread { showError() }
            return
        }
        renderer = pdfRenderer
        pageCache = object : LruCache<Int, Bitmap>(PAGE_CACHE_ENTRIES) {}

        runOnUiThread {
            pageCountLabel.text = getString(R.string.media_pages_fmt, pdfRenderer.pageCount)
            pagesList.adapter = PagesAdapter()
        }
    }

    private fun showError() {
        pageCountLabel.visibility = View.GONE
        pagesList.visibility = View.GONE
        errorText.visibility = View.VISIBLE
        Toast.makeText(this, R.string.media_open_failed, Toast.LENGTH_LONG).show()
    }

    override fun onDestroy() {
        renderer?.close()
        renderer = null
        fileDescriptor?.runCatching { close() }
        fileDescriptor = null
        decryptedTemp?.delete()
        decryptedTemp = null
        super.onDestroy()
    }

    /** ListView adapter rendering one Bitmap page per row, lazily, on the background executor. */
    private inner class PagesAdapter : BaseAdapter() {

        override fun getCount(): Int = renderer?.pageCount ?: 0
        override fun getItem(position: Int): Any? = null
        override fun getItemId(position: Int): Long = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
            val view = convertView as? ImageView ?: ImageView(parent.context).apply {
                adjustViewBounds = true
                setPadding(0, 12, 0, 12)
            }
            view.tag = position
            view.setImageBitmap(pageCache?.get(position))
            if (pageCache?.get(position) == null) renderAsync(position, view)
            return view
        }

        private fun renderAsync(position: Int, target: ImageView) {
            onBackground {
                val currentRenderer = renderer ?: return@onBackground
                val cache = pageCache ?: return@onBackground
                if (cache.get(position) != null) return@onBackground
                val bitmap = runCatching {
                    currentRenderer.openPage(position).use { page ->
                        val ratio = page.height.toFloat() / page.width.coerceAtLeast(1)
                        val targetWidth = resources.displayMetrics.widthPixels.coerceAtLeast(320)
                        val targetHeight = (targetWidth * ratio).toInt().coerceAtLeast(320)
                        Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888).also { canvas ->
                            canvas.eraseColor(android.graphics.Color.WHITE)
                            page.render(canvas, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        }
                    }
                }.getOrNull() ?: return@onBackground
                cache.put(position, bitmap)
                runOnUiThread {
                    // ListView recycles views; only update the view still bound to this page.
                    if (target.tag == position && !isFinishing) target.setImageBitmap(bitmap)
                }
            }
        }
    }

    private companion object {
        /** Rendered pages kept in RAM (~screen-sized bitmaps; large PDFs evict old pages). */
        const val PAGE_CACHE_ENTRIES = 12
    }
}
