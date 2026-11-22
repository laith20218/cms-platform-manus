package com.cms.student.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.cms.student.R

/**
 * In-app image viewer for a cached, encrypted image: decode from decrypted bytes
 * in memory (bounded with inSampleSize so a huge lecture image cannot OOM), fit to
 * the screen, with simple zoom in/out buttons. No temp plaintext file is created.
 */
class ImageViewerActivity : MediaViewerActivity() {

    private var imageView: ImageView? = null
    private var zoomLevel = 1f

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

        val view = ImageView(this).apply {
            adjustViewBounds = true
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        imageView = view
        rootLayout.addView(
            view,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        )

        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        val zoomIn = Button(this).apply {
            setText(R.string.media_zoom_in)
            setOnClickListener { zoom(1f) }
        }
        val zoomOut = Button(this).apply {
            setText(R.string.media_zoom_out)
            setOnClickListener { zoom(-1f) }
        }
        controls.addView(zoomIn)
        controls.addView(zoomOut)
        rootLayout.addView(controls)
        setContentView(rootLayout)

        onBackground {
            val bytes = store.readBytes(id) ?: run {
                runOnUiThread { showFailed() }
                return@onBackground
            }
            val bitmap = decodeBounded(bytes) ?: run {
                runOnUiThread { showFailed() }
                return@onBackground
            }
            runOnUiThread { view.setImageBitmap(bitmap) }
        }
    }

    private fun zoom(delta: Float) {
        zoomLevel = (zoomLevel + delta).coerceIn(1f, MAX_ZOOM)
        imageView?.apply {
            scaleX = zoomLevel
            scaleY = zoomLevel
        }
    }

    private fun showFailed() {
        Toast.makeText(this, R.string.media_open_failed, Toast.LENGTH_LONG).show()
    }

    /** Two-pass decode: bounds first, then a sampled decode capped at [MAX_DIMENSION]. */
    private fun decodeBounded(bytes: ByteArray): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while ((bounds.outWidth / sample) > MAX_DIMENSION || (bounds.outHeight / sample) > MAX_DIMENSION) {
            sample *= 2
        }
        return BitmapFactory.decodeByteArray(
            bytes, 0, bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample }
        )
    }

    private companion object {
        const val MAX_DIMENSION = 2048
        const val MAX_ZOOM = 4f
    }
}
