package com.cms.student.media

import android.os.Bundle
import android.view.WindowManager
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity
import com.cms.student.CmsApplication
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Shared base for the Batch 4 media viewer activities: FLAG_SECURE on the window
 * (owner lock 5 — screenshots/recents thumbnails stay blocked), programmatic UI
 * (the codebase convention), the shared [MediaFileStore] accessor, and a single
 * background executor for decrypt/render work that is always shut down on destroy.
 */
abstract class MediaViewerActivity : AppCompatActivity() {

    protected lateinit var rootLayout: LinearLayout
    private var workExecutor: ExecutorService? = null

    protected val contentId: String?
        get() = intent.getStringExtra(MediaOpenContract.EXTRA_CONTENT_ID)?.takeIf { it.isNotBlank() }

    protected val displayTitle: String
        get() = intent.getStringExtra(MediaOpenContract.EXTRA_TITLE)?.takeIf { it.isNotBlank() }
            ?: contentId ?: ""

    protected val wireKind: String?
        get() = intent.getStringExtra(MediaOpenContract.EXTRA_KIND)

    protected fun mediaFileStore(): MediaFileStore? =
        (application as? CmsApplication)?.mediaFileStore()

    protected fun mediaService(): MediaCacheService? =
        (application as? CmsApplication)?.mediaCache()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    }

    /** Runs [work] on this activity's single background executor; dropped after destroy. */
    protected fun onBackground(work: () -> Unit) {
        val executor = workExecutor ?: Executors.newSingleThreadExecutor().also { workExecutor = it }
        executor.execute {
            if (!isFinishing) runCatching(work)
        }
    }

    override fun onDestroy() {
        workExecutor?.shutdownNow()
        workExecutor = null
        super.onDestroy()
    }
}
