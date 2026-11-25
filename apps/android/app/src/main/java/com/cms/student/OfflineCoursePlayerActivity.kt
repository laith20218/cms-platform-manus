package com.cms.student

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.MediaController
import android.widget.TextView
import android.widget.VideoView
import androidx.appcompat.app.AppCompatActivity
import com.cms.student.media.ChunkedEpisodeMeta
import com.cms.student.media.ChunkedMediaLoopbackServer

/**
 * W5b-ii (Phase Q playback) — in-app ONLY player for chunked offline course
 * episodes. Starts a [ChunkedMediaLoopbackServer] (loopback, per-instance
 * token, chunk-at-a-time decrypt — never a complete clear file on disk),
 * points a [VideoView] at it, and tears both down on destroy. FLAG_SECURE on
 * the window like every offline viewer (owner lock 5); no external intents,
 * no shares, no recents thumbnails (noHistory in the manifest).
 *
 * Audio episodes reuse the same loopback channel through [VideoView] is not
 * possible — audio falls back to this screen's minimal video surface only
 * when the stream carries audio in a video container; pure audio (audio/mpeg)
 * renders a text player note plus a MediaPlayer fed by the SAME loopback URL.
 */
class OfflineCoursePlayerActivity : AppCompatActivity() {

    private var server: ChunkedMediaLoopbackServer? = null
    private var audioPlayer: android.media.MediaPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        val episodeId = intent.getStringExtra(EXTRA_EPISODE_ID)?.takeIf { it.isNotBlank() }
        if (episodeId == null) {
            finish()
            return
        }
        val app = application as? CmsApplication
        if (app == null) {
            finish()
            return
        }
        val meta = app.courseEpisodeStore().readMeta(episodeId)
        if (meta == null) {
            showDeniedMessage("لم يعد هذا الملف متاحاً دون اتصال — أعد تحميله من صفحة الكورس.")
            return
        }
        val streamContentType = meta.contentType ?: when (meta.type) {
            "audio" -> "audio/mpeg"
            else -> "video/mp4"
        }
        val loopback = ChunkedMediaLoopbackServer(episodeId, app.courseEpisodeStore(), streamContentType)
        val port = loopback.start()
        if (port == null) {
            showDeniedMessage("تعذر تشغيل الملف دون اتصال — أعد المحاولة.")
            return
        }
        server = loopback
        val url = loopback.streamUrl()!!
        if (meta.type == "audio") {
            renderAudioPlayer(meta, url)
        } else {
            renderVideoPlayer(meta, url)
        }
    }

    /** Video surface: [VideoView] + [MediaController], streaming from the loopback URL. */
    private fun renderVideoPlayer(meta: ChunkedEpisodeMeta, url: String) {
        val container = FrameLayout(this)
        val video = VideoView(this)
        video.setVideoPath(url)
        val controller = MediaController(this)
        controller.setMediaPlayer(video)
        video.setMediaController(controller)
        controller.setAnchorView(video)
        container.addView(
            video,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER)
        )
        setContentView(container)
        appendTitleOverlay(meta)
        video.setOnPreparedListener { player -> player.isLooping = false }
        video.start()
    }

    /** Audio surface: minimal [android.media.MediaPlayer] on the same loopback channel. */
    private fun renderAudioPlayer(meta: ChunkedEpisodeMeta, url: String) {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
            gravity = Gravity.CENTER_HORIZONTAL
        }
        val title = TextView(this).apply {
            text = meta.title ?: "ملف صوتي دون اتصال"
            textSize = 18f
            gravity = Gravity.CENTER
        }
        val note = TextView(this).apply {
            text = "يعمل التشغيل من النسخة المشفّرة المحلية — أوقف المشغّل عند الانتهاء."
            textSize = 13f
            setPadding(0, 24, 0, 24)
            gravity = Gravity.CENTER
        }
        root.addView(title)
        root.addView(note)
        setContentView(root)
        appendTitleOverlay(meta)
        runCatching {
            android.media.MediaPlayer().apply {
                setDataSource(url)
                setOnPreparedListener { it.start() }
                prepareAsync()
                audioPlayer = this
            }
        }.onFailure {
            showDeniedMessage("تعذر تشغيل الملف دون اتصال — أعد المحاولة.")
        }
    }

    /** Single honest denial screen (no fake empty players). */
    private fun showDeniedMessage(message: String) {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            gravity = Gravity.CENTER
        }
        root.addView(TextView(this).apply { text = message; textSize = 15f; gravity = Gravity.CENTER })
        setContentView(root)
    }

    /** Small non-interactive title overlay so the player stays honest about what plays. */
    private fun appendTitleOverlay(meta: ChunkedEpisodeMeta) {
        val overlay = TextView(this).apply {
            text = meta.title ?: "عرض دون اتصال"
            textSize = 12f
            alpha = 0.85f
            setPadding(24, 16, 24, 16)
        }
        val parent: android.view.ViewGroup? = window.decorView as? android.view.ViewGroup
        if (parent == null) return
        runCatching {
            val params = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.CENTER_HORIZONTAL
            )
            parent.addView(overlay, 0, params)
        }
    }

    override fun onDestroy() {
        audioPlayer?.runCatching { stop() }
        audioPlayer?.runCatching { release() }
        audioPlayer = null
        server?.close()
        server = null
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_EPISODE_ID = "com.cms.student.extra.OFFLINE_COURSE_EPISODE_ID"

        fun intent(context: Context, episodeId: String): Intent =
            Intent(context, OfflineCoursePlayerActivity::class.java)
                .putExtra(EXTRA_EPISODE_ID, episodeId)
    }
}
