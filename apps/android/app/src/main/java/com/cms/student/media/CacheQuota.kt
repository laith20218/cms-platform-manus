package com.cms.student.media

/**
 * Shared-capacity planner (owner decision 2026-11-28: 10 GiB total, NO automatic
 * eviction). Answers whether the shared offline-content cap still has room for an
 * incoming download. It NEVER plans evictions anymore: existing content is only
 * removed by an explicit student action (remove/clear) or a wipe (logout / auth
 * rejection). A download that does not fit is refused by the caller with `quota`
 * and existing content stays untouched.
 *
 * Kept as a pure, injectable class so the JVM unit tests stay deterministic.
 */
class CacheQuota(private val maxBytes: Long = CachePolicy.MAX_CACHE_BYTES) {

    /**
     * Whether [usedBytes] + [incomingBytes] still fits the shared cap.
     * The pre-download check: when false the caller refuses the download
     * BEFORE writing any bytes (no partial files, no eviction).
     */
    fun fits(usedBytes: Long, incomingBytes: Long): Boolean =
        usedBytes >= 0 && incomingBytes >= 0 && usedBytes + incomingBytes <= maxBytes

    /** Whether a byte total alone is within the cap (post-write invariant check). */
    fun isWithinCap(totalBytes: Long): Boolean = totalBytes in 0..maxBytes

    /** Convenience: cap constant exposure for tests/callers. */
    fun capBytes(): Long = maxBytes
}
