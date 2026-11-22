package com.cms.student.media

/**
 * Pure LRU/1 GiB planner (owner lock 4). Given the current index and an incoming
 * download size it computes which completed entries to evict — least-recently-used
 * (by [MediaCacheEntry.lastAccessAt]) first — until the projected total fits the cap.
 *
 * Guarantees:
 *  - Entries whose ids are in [protectedIds] (in-flight or open) are never evicted.
 *  - A plan is [EvictionPlan.sufficient] only when the cap is actually reachable
 *    after evictions; otherwise the caller must refuse the download (`quota`).
 */
class CacheQuota(private val maxBytes: Long = CachePolicy.MAX_CACHE_BYTES) {

    data class EvictionPlan(val evictIds: List<String>, val sufficient: Boolean, val projectedBytes: Long)

    fun isWithinCap(totalBytes: Long): Boolean = totalBytes <= maxBytes

    /**
     * Plans evictions for an incoming [incomingBytes] download given the current
     * [entries]. In-flight/open ids are protected and never selected.
     */
    fun planEviction(entries: List<MediaCacheEntry>, incomingBytes: Long, protectedIds: Set<String>): EvictionPlan {
        val evictable = entries
            .filter { it.contentId !in protectedIds }
            .sortedBy { it.lastAccessAt.toEpochMilli() } // LRU first
        var projected = entries.sumOf { it.bytes } + incomingBytes
        if (projected <= maxBytes) return EvictionPlan(emptyList(), sufficient = true, projectedBytes = projected)

        val toEvict = mutableListOf<String>()
        for (entry in evictable) {
            projected -= entry.bytes
            toEvict.add(entry.contentId)
            if (projected <= maxBytes) break
        }
        return EvictionPlan(toEvict, sufficient = projected <= maxBytes, projectedBytes = projected)
    }

    /** Convenience: cap constant exposure for tests/callers. */
    fun capBytes(): Long = maxBytes
}
