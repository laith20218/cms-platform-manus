package com.cms.student.media

import android.content.Context
import android.content.Intent

/**
 * Intent extras shared by every native media viewer activity. Small strings only —
 * the encrypted payload is decrypted inside the viewer activity from the shared
 * [MediaFileStore], never through the Intent (TransactionTooLarge protection).
 */
object MediaOpenContract {
    const val EXTRA_CONTENT_ID = "com.cms.student.media.CONTENT_ID"
    const val EXTRA_TITLE = "com.cms.student.media.TITLE"
    const val EXTRA_KIND = "com.cms.student.media.KIND"

    /** Every viewer activity launches from the application context with NEW_TASK. */
    fun newTaskIntent(context: Context, activityClass: Class<*>, entry: MediaCacheEntry): Intent =
        Intent(context, activityClass).apply {
            putExtra(EXTRA_CONTENT_ID, entry.contentId)
            putExtra(EXTRA_TITLE, entry.displayName ?: entry.contentId)
            putExtra(EXTRA_KIND, entry.kind.wireName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
}

/**
 * Launches the in-app viewer for one cached entry. Called on the WebView bridge
 * thread (or the catalog's UI thread) — `startActivity` from the application
 * context with FLAG_ACTIVITY_NEW_TASK is safe from any thread. Every viewer is
 * an in-app FLAG_SECURE surface; external viewers/file shares are FORBIDDEN
 * (owner lock 5).
 */
class NativeMediaOpener(private val context: Context) : MediaOpener {

    override fun open(entry: MediaCacheEntry): Boolean = runCatching {
        val intent = when (entry.kind) {
            MediaKind.PDF -> MediaOpenContract.newTaskIntent(context, PdfViewActivity::class.java, entry)
            MediaKind.TEXT -> MediaOpenContract.newTaskIntent(context, TextReaderActivity::class.java, entry)
            MediaKind.HTML -> MediaOpenContract.newTaskIntent(context, TextReaderActivity::class.java, entry)
            MediaKind.IMAGE -> MediaOpenContract.newTaskIntent(context, ImageViewerActivity::class.java, entry)
            MediaKind.VIDEO -> MediaOpenContract.newTaskIntent(context, VideoPlayerActivity::class.java, entry)
            MediaKind.AUDIO -> MediaOpenContract.newTaskIntent(context, AudioPlayerActivity::class.java, entry)
        }
        context.startActivity(intent)
        true
    }.getOrDefault(false)
}
