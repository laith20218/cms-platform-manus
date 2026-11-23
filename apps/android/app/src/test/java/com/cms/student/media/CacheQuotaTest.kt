package com.cms.student.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.util.UUID

/**
 * Batch 4 — LRU/5 GiB quota planner tests (Owner decision 2026-11-23): eviction
 * order, protected entries, projected bytes math, and the un-trimmable refusal.
 */
class CacheQuotaTest {

    private fun entry(id: String, bytes: Long, lastAccessAt: Instant): MediaCacheEntry =
        MediaCacheEntry(
            contentId = id,
            kind = MediaKind.PDF,
            storedFileName = "$id.bin",
            sourcePath = "library/$id/content",
            bytes = bytes,
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            lastConfirmedAt = Instant.parse("2026-01-01T00:00:00Z"),
            lastAccessAt = lastAccessAt,
            displayName = id
        )

    @Test
    fun `the cap is exactly 5 GiB`() {
        assertEquals(5_368_709_120L, CachePolicy.MAX_CACHE_BYTES)
        assertEquals(5_368_709_120L, CacheQuota().capBytes())
    }

    @Test
    fun `a total within the cap needs no eviction`() {
        val quota = CacheQuota(maxBytes = 100)
        val plan = quota.planEviction(
            listOf(entry("a", 60, Instant.parse("2026-01-01T00:00:00Z"))),
            incomingBytes = 40,
            protectedIds = emptySet()
        )
        assertTrue(plan.sufficient)
        assertTrue(plan.evictIds.isEmpty())
        assertEquals(100L, plan.projectedBytes)
    }

    @Test
    fun `eviction is least recently accessed first`() {
        val quota = CacheQuota(maxBytes = 100)
        val entries = listOf(
            entry("fresh", 50, Instant.parse("2026-03-01T00:00:00Z")),
            entry("middle", 30, Instant.parse("2026-02-01T00:00:00Z")),
            entry("oldest", 40, Instant.parse("2026-01-01T00:00:00Z"))
        )
        val plan = quota.planEviction(entries, incomingBytes = 50, protectedIds = emptySet())
        // Total 120 + 50 = 170; evicting oldest (40) → 130; evicting middle (30) → 100 ≤ cap.
        assertTrue(plan.sufficient)
        assertEquals(listOf("oldest", "middle"), plan.evictIds)
    }

    @Test
    fun `protected entries are never evicted even when oldest`() {
        val quota = CacheQuota(maxBytes = 100)
        val entries = listOf(
            entry("in-flight", 40, Instant.parse("2026-01-01T00:00:00Z")),
            entry("recent", 60, Instant.parse("2026-03-01T00:00:00Z"))
        )
        val plan = quota.planEviction(entries, incomingBytes = 50, protectedIds = setOf("in-flight"))
        // Total 100 + 50 = 150; only "recent" (60) is evictable → 90 ≤ cap.
        assertTrue(plan.sufficient)
        assertEquals(listOf("recent"), plan.evictIds)
        assertFalse(plan.evictIds.contains("in-flight"))
    }

    @Test
    fun `an untrimmable plan is reported insufficient`() {
        val quota = CacheQuota(maxBytes = 100)
        val entries = listOf(entry("protected", 200, Instant.parse("2026-01-01T00:00:00Z")))
        val plan = quota.planEviction(entries, incomingBytes = 10, protectedIds = setOf("protected"))
        assertFalse(plan.sufficient)
        assertTrue(plan.evictIds.isEmpty())
    }

    @Test
    fun `isWithinCap reflects the bound`() {
        val quota = CacheQuota(maxBytes = 100)
        assertTrue(quota.isWithinCap(100))
        assertFalse(quota.isWithinCap(101))
    }
}
