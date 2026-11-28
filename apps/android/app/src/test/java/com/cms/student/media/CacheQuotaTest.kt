package com.cms.student.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream

/**
 * Owner decision (offline-experience implementation, 2026-11-28) — shared
 * 10 GiB quota with NO automatic eviction. Tests the capacity math of the new
 * [CacheQuota] (fits/isWithinCap) and the mid-copy [QuotaGuardedOutputStream]
 * that refuses a download the moment the shared cap would be exceeded.
 */
class CacheQuotaTest {

    @Test
    fun `the cap is exactly 10 GiB`() {
        assertEquals(10_737_418_240L, CachePolicy.MAX_CACHE_BYTES)
        assertEquals(10_737_418_240L, CacheQuota().capBytes())
    }

    @Test
    fun `fits accepts a total within the cap`() {
        val quota = CacheQuota(maxBytes = 100)
        assertTrue(quota.fits(usedBytes = 60, incomingBytes = 40))
        assertTrue(quota.fits(usedBytes = 0, incomingBytes = 100))
        assertTrue(quota.fits(usedBytes = 100, incomingBytes = 0))
    }

    @Test
    fun `fits rejects a total above the cap`() {
        val quota = CacheQuota(maxBytes = 100)
        assertFalse(quota.fits(usedBytes = 60, incomingBytes = 41))
        assertFalse(quota.fits(usedBytes = 101, incomingBytes = 0))
    }

    @Test
    fun `fits rejects negative inputs (defensive)`() {
        val quota = CacheQuota(maxBytes = 100)
        assertFalse(quota.fits(usedBytes = -1, incomingBytes = 10))
        assertFalse(quota.fits(usedBytes = 10, incomingBytes = -1))
    }

    @Test
    fun `isWithinCap reflects the bound`() {
        val quota = CacheQuota(maxBytes = 100)
        assertTrue(quota.isWithinCap(100))
        assertFalse(quota.isWithinCap(101))
    }

    // ===== QuotaGuardedOutputStream — mid-copy refusal, never eviction =====

    @Test
    fun `guarded sink aborts the copy the moment the cap would be exceeded`() {
        val quota = CacheQuota(maxBytes = 100)
        val used = arrayOf(0L)
        val sink = QuotaGuardedOutputStream(ByteArrayOutputStream(), quota) { used[0] }

        used[0] = 60
        sink.write(ByteArray(30)) // 60 + 30 = 90 ≤ 100 — allowed
        sink.write(ByteArray(5))  // 60 + 35 = 95 ≤ 100 — allowed

        var threw = false
        try {
            sink.write(ByteArray(10)) // 60 + 45 = 105 > 100 — must abort
        } catch (_: MediaQuotaExceededException) {
            threw = true
        }
        assertTrue("the guarded sink must abort an over-cap write", threw)
    }

    @Test
    fun `guarded sink allows an exact-cap fit`() {
        val quota = CacheQuota(maxBytes = 100)
        val sink = QuotaGuardedOutputStream(ByteArrayOutputStream(), quota) { 40 }
        sink.write(ByteArray(60)) // 40 + 60 = 100 — exactly at the cap, allowed
    }

    @Test
    fun `guarded sink counts partial writes at the exact boundary`() {
        val quota = CacheQuota(maxBytes = 100)
        val sink = QuotaGuardedOutputStream(ByteArrayOutputStream(), quota) { 99 }
        sink.write(ByteArray(1)) // 99 + 1 = 100 — allowed
        var threw = false
        try {
            sink.write(1) // 99 + 2 = 101 — refused
        } catch (_: MediaQuotaExceededException) {
            threw = true
        }
        assertTrue(threw)
    }
}
