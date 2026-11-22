package com.cms.student.media

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import com.cms.student.R
import java.io.File

/**
 * In-app video player for a cached, encrypted video object: decrypt to a private
 * temp file (app cache dir; deleted on destroy) and play through the framework
 * [VideoView] with an attached [android.widget.MediaController]. In-app only —
 * no external viewer, no file share.
 */
class VideoPlayerActivity : MediaViewerActivity() {

    private var decryptedTemp: File? = null
    private var videoView: VideoView? = null

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

        val view = VideoView(this)
        videoView = view
        val controller = android.widget.MediaController(this)
        controller.setMediaPlayer(view)
        view.setMediaController(controller)
        view.setOnErrorListener { _, _, _ ->
            runOnUiThread {
                Toast.makeText(this, R.string.media_video_error, Toast.LENGTH_LONG).show()
            }
            true
        }
        rootLayout.addView(
            view,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        )
        setContentView(rootLayout)

        onBackground { prepare(id, store, view) }
    }

    private fun prepare(id: String, store: MediaFileStore, view: VideoView) {
        val temp = store.openDecryptedTemp(id)
        if (temp == null || temp.length() == 0L) {
            runOnUiThread {
                Toast.makeText(this, R.string.media_video_error, Toast.LENGTH_LONG).show()
            }
            return
        }
        decryptedTemp = temp
        runOnUiThread {
            view.setVideoPath(temp.absolutePath)
            view.setOnPreparedListener { it.start() }
            view.requestFocus()
        }
    }

    override fun onPause() {
        videoView?.runCatching { suspend() }
        super.onPause()
    }

    override fun onDestroy() {
        videoView?.runCatching { stopPlayback() }
        videoView = null
        decryptedTemp?.delete()
        decryptedTemp = null
        super.onDestroy()
    }
}
