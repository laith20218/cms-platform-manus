package com.cms.student.media

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * Batch 4 — [CacheIndex] CRUD + persistence round-trip (fakes: in-memory
 * persistence capturing the serialized document).
 */
class CacheIndexTest {

    private fun entry(id: String, bytes: Long = 10, accessAt: Instant = Instant.parse("2026-01-01T00:00:00Z")) =
        MediaCacheEntry(
            contentId = id,
            kind = MediaKind.PDF,
            storedFileName = "$id.bin",
            sourcePath = "library/$id/content",
            bytes = bytes,
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            lastConfirmedAt = Instant.parse("2026-01-01T00:00:00Z"),
            lastAccessAt = accessAt,
            displayName = "title-$id",
            subjectId = null
        )

    @Test
    fun `put get remove and clear drive the crud surface`() {
        val index = CacheIndex(InMemoryMediaCachePersistence())
        assertNull(index.get("a"))
        index.put(entry("a"))
        assertNotNull(index.get("a"))
        assertEquals(10L, index.totalBytes())
        assertEquals("a", index.remove("a")?.contentId)
        assertNull(index.get("a"))
        index.put(entry("b"))
        index.put(entry("c"))
        index.clear()
        assertTrue(index.all().isEmpty())
        assertEquals(0L, index.totalBytes())
    }

    @Test
    fun `all returns the most recently accessed entries first`() {
        val index = CacheIndex(InMemoryMediaCachePersistence())
        index.put(entry("old", accessAt = Instant.parse("2026-01-01T00:00:00Z")))
        index.put(entry("new", accessAt = Instant.parse("2026-03-01T00:00:00Z")))
        assertEquals(listOf("new", "old"), index.all().map { it.contentId })
    }

    @Test
    fun `touch and confirm update lru and the entitlement window anchor`() {
        val index = CacheIndex(InMemoryMediaCachePersistence())
        index.put(entry("a"))
        assertTrue(index.touch("a", Instant.parse("2026-05-01T00:00:00Z")))
        assertTrue(index.confirm("a", Instant.parse("2026-05-02T00:00:00Z")))
        val updated = index.get("a")!!
        // A server-side confirmation is also an access: both anchors advance to it.
        assertEquals(Instant.parse("2026-05-02T00:00:00Z"), updated.lastAccessAt)
        assertEquals(Instant.parse("2026-05-02T00:00:00Z"), updated.lastConfirmedAt)
        // The bridge-safe row never grows filesystem fields.
        val parsed = JsonParser.parseString(updated.toSafeJson()).asJsonObject
        assertEquals(setOf("contentId", "type", "title", "bytes", "createdAt", "lastAccessAt"), parsed.keySet())
    }

    @Test
    fun `entries survive a persistence round trip`() {
        val persistence = InMemoryMediaCachePersistence()
        val first = CacheIndex(persistence)
        first.put(entry("a", bytes = 123))
        first.put(entry("b", bytes = 45, accessAt = Instant.parse("2026-04-01T00:00:00Z")))

        val reloaded = CacheIndex(persistence)
        assertEquals(2, reloaded.all().size)
        assertEquals(168L, reloaded.totalBytes())
        assertEquals("title-a", reloaded.get("a")?.displayName)
        assertEquals(Instant.parse("2026-04-01T00:00:00Z"), reloaded.get("b")?.lastAccessAt)
    }

    @Test
    fun `entitlement expiry metadata survives a persistence round trip`() {
        val persistence = InMemoryMediaCachePersistence()
        val first = CacheIndex(persistence)
        first.put(
            entry("a").copy(entitlementExpiresAt = Instant.parse("2026-06-01T09:30:00Z"))
        )
        first.put(entry("b").copy(entitlementExpiresAt = null))

        val reloaded = CacheIndex(persistence)
        assertEquals(Instant.parse("2026-06-01T09:30:00Z"), reloaded.get("a")?.entitlementExpiresAt)
        assertNull(reloaded.get("b")?.entitlementExpiresAt)
    }

    @Test
    fun `a corrupted persisted document degrades to an empty index`() {
        val persistence = object : MediaCachePersistence {
            override fun load(): String = "not-json-{"
            override fun save(document: String) = Unit
        }
        val index = CacheIndex(persistence)
        assertTrue(index.all().isEmpty())
    }

    @Test
    fun `wire names parse for every cacheable kind and reject unknown ones`() {
        MediaKind.entries.forEach { kind ->
            assertEquals(kind, MediaKind.fromWireName(kind.wireName))
        }
        assertEquals(MediaKind.TEXT, MediaKind.fromWireName("TEXT"))
        assertEquals(MediaKind.TEXT, MediaKind.fromWireName(" text "))
        assertNull(MediaKind.fromWireName("docx"))
        assertNull(MediaKind.fromWireName(null))
    }
}
