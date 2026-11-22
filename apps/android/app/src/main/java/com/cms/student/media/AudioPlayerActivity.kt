package com.cms.student.media

import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import com.cms.student.R
import java.io.File
import java.util.Locale

/**
 * In-app audio player for a cached, encrypted audio object: decrypt to a private
 * temp file (app cache dir, deleted on destroy), playback via framework
 * [MediaPlayer], play/pause + seek, and Arabic-first labels.
 */
class AudioPlayerActivity : MediaViewerActivity() {

    private var player: MediaPlayer? = null
    private var decryptedTemp: File? = null
    private var fileDescriptor: ParcelFileDescriptor? = null
    private val uiHandler = Handler(Looper.getMainLooper())

    private lateinit var positionLabel: TextView
    private lateinit var seekBar: SeekBar
    private var playPauseButton: Button? = null

    private val progressTick = object : Runnable {
        override fun run() {
            val current = player ?: return
            if (current.isPlaying) {
                val position = current.currentPosition
                val duration = current.duration.coerceAtLeast(1)
                seekBar.max = duration
                seekBar.progress = position
                positionLabel.text = formatClock(position, duration)
            }
            uiHandler.postDelayed(this, PROGRESS_MILLIS)
        }
    }

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

        positionLabel = TextView(this).apply { text = "0:00 / 0:00" }
        seekBar = SeekBar(this).apply {
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(bar: SeekBar?, progress: Int, fromUser: Boolean) {}
                override fun onStartTrackingTouch(bar: SeekBar?) {}
                override fun onStopTrackingTouch(bar: SeekBar?) {
                    player?.seekTo(bar?.progress ?: 0)
                }
            })
        }
        rootLayout.addView(positionLabel.apply { setPadding(24, 16, 24, 4) })
        rootLayout.addView(seekBar)

        val playPause = Button(this).apply { setText(R.string.media_play) }
        playPauseButton = playPause
        rootLayout.addView(
            playPause,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        )
        setContentView(rootLayout)

        playPause.setOnClickListener { togglePlayPause(playPause) }

        onBackground { prepare(id, store) }
    }

    private fun prepare(id: String, store: MediaFileStore) {
        val temp = store.openDecryptedTemp(id)
        if (temp == null || temp.length() == 0L) {
            runOnUiThread { showFailed(); finish() }
            return
        }
        decryptedTemp = temp
        val descriptor = runCatching {
            ParcelFileDescriptor.open(temp, ParcelFileDescriptor.MODE_READ_ONLY)
        }.getOrNull()
        if (descriptor == null) {
            runOnUiThread { showFailed(); finish() }
            return
        }
        fileDescriptor = descriptor
        val prepared = runCatching {
            MediaPlayer().apply {
                setDataSource(descriptor.fileDescriptor, 0, temp.length())
                setOnErrorListener { _, what, extra ->
                    runOnUiThread { showFailed() }
                    true
                }
                prepare()
                setOnCompletionListener { runOnUiThread { markPaused() } }
            }
        }.getOrNull()
        if (prepared == null) {
            runOnUiThread { showFailed(); finish() }
            return
        }
        player = prepared
        runOnUiThread {
            positionLabel.text = formatClock(0, prepared.duration)
            markPaused()
            prepared.start()
            markPlaying()
            uiHandler.post(progressTick)
        }
    }

    private fun togglePlayPause(button: Button) {
        val current = player ?: return
        if (current.isPlaying) {
            current.pause()
            markPaused()
        } else {
            current.start()
            markPlaying()
        }
    }

    private fun markPlaying() {
        playPauseButton?.setText(R.string.media_pause)
    }

    private fun markPaused() {
        playPauseButton?.setText(R.string.media_play)
    }

    private fun showFailed() {
        Toast.makeText(this, R.string.media_audio_error, Toast.LENGTH_LONG).show()
        positionLabel.visibility = View.GONE
    }

    private fun formatClock(positionMillis: Int, durationMillis: Int): String =
        String.format(Locale.US, "%d:%02d / %d:%02d",
            positionMillis / 1000 / 60, (positionMillis / 1000 % 60),
            durationMillis / 1000 / 60, (durationMillis / 1000 % 60))

    override fun onDestroy() {
        uiHandler.removeCallbacks(progressTick)
        player?.runCatching { stop() }
        player?.release()
        player = null
        fileDescriptor?.runCatching { close() }
        fileDescriptor = null
        decryptedTemp?.delete()
        decryptedTemp = null
        super.onDestroy()
    }

    private companion object {
        const val PROGRESS_MILLIS = 500L
    }
}
