package com.cms.student.media

/**
 * Lightweight in-process progress bus (Batch 4): the download executor publishes
 * per-content phase/percent updates here, and native UI (the offline catalog)
 * subscribes to refresh itself. Thread-safe; listeners must return fast.
 *
 * This is deliberately NOT a JS-visible API — the bridge polls `cacheStatus()`.
 */
class CacheProgressBus {

    enum class Phase { QUEUED, DOWNLOADING, READY, DENIED_AUTH, ERROR, CANCELED, OPENING }

    data class Update(val contentId: String, val phase: Phase, val percent: Int)

    fun interface Listener {
        fun onCacheUpdate(update: Update)
    }

    private val listeners = mutableSetOf<Listener>()

    fun register(listener: Listener) {
        synchronized(listeners) { listeners.add(listener) }
    }

    fun unregister(listener: Listener) {
        synchronized(listeners) { listeners.remove(listener) }
    }

    fun publish(contentId: String, phase: Phase, percent: Int = 0) {
        val update = Update(contentId, phase, percent)
        synchronized(listeners) { listeners.toList() }.forEach { listener ->
            runCatching { listener.onCacheUpdate(update) }
        }
    }
}
