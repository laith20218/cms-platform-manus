package com.cms.student.media

import com.google.gson.Gson
import java.io.ByteArrayOutputStream
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Wave 5b-i JVM tests for the chunked-store PURE logic (Phase Q).
 *
 * Honest coverage note: [EncryptedChunkedFileStore] itself (AndroidX
 * EncryptedFile + Keystore MasterKey over `filesDir/media-chunks`) CANNOT run
 * on the JVM — AndroidX security-crypto needs the Android Keystore. That
 * wrapper (per-chunk encryption, tmp+rename publish discipline, encrypted
 * episode.json) is exercised by CI instrumentation; here we lock the pieces
 * that carry the wave's behavior: [ChunkSequencePlanner] boundary math, the
 * Gson meta round trip (the episode.json document format), and
 * [FakeChunkedFileStore] — the in-memory store the Deliverable-3 service tests
 * build on, which mirrors the staging-then-publish semantics of the real store.
 */
class ChunkedStoreLogicTest {

    // ------------------------------------------------------------------
    // ChunkSequencePlanner — boundaries, partial tails, edge cases
    // ------------------------------------------------------------------

    @Test
    fun `zero bytes plan to zero chunks`() {
        val plan = ChunkSequencePlanner.plan(0)
        assertEquals(0, plan.chunkCount)
        assertTrue(plan.chunkSizes.isEmpty())
        assertEquals(0, plan.lastChunkBytes)
        assertEquals(0L, plan.totalBytes)
    }

    @Test
    fun `a length below one chunk plans a single partial chunk`() {
        val plan = ChunkSequencePlanner.plan(1024)
        assertEquals(1, plan.chunkCount)
        assertEquals(listOf(1024), plan.chunkSizes)
        assertEquals(1024, plan.lastChunkBytes)
        assertEquals(1024L, plan.totalBytes)
    }

    @Test
    fun `an exact multiple plans full chunks with a full last chunk`() {
        val chunk = CachePolicy.MAX_AV_CHUNK_BYTES
        val plan = ChunkSequencePlanner.plan(chunk * 3)
        assertEquals(3, plan.chunkCount)
        assertEquals(listOf(chunk.toInt(), chunk.toInt(), chunk.toInt()), plan.chunkSizes)
        assertEquals(chunk.toInt(), plan.lastChunkBytes)
        assertEquals(chunk * 3, plan.totalBytes)
    }

    @Test
    fun `a partial tail becomes one smaller last chunk`() {
        val chunk = CachePolicy.MAX_AV_CHUNK_BYTES
        val plan = ChunkSequencePlanner.plan(chunk * 2 + 12345)
        assertEquals(3, plan.chunkCount)
        assertEquals(12345, plan.lastChunkBytes)
        assertEquals(plan.chunkSizes.last(), plan.lastChunkBytes)
        assertEquals(chunk * 2 + 12345, plan.totalBytes)
    }

    @Test
    fun `one byte over the chunk boundary spills a one byte tail`() {
        val plan = ChunkSequencePlanner.plan(CachePolicy.MAX_AV_CHUNK_BYTES + 1)
        assertEquals(2, plan.chunkCount)
        assertEquals(1, plan.lastChunkBytes)
    }

    @Test
    fun `the 4 MiB phase Q chunk size is the planner default`() {
        assertEquals(4L * 1024 * 1024, CachePolicy.MAX_AV_CHUNK_BYTES)
        val default = ChunkSequencePlanner.plan(CachePolicy.MAX_AV_CHUNK_BYTES)
        assertEquals(1, default.chunkCount)
        assertEquals(4L * 1024 * 1024, default.chunkSizes.single().toLong())
    }

    @Test
    fun `invalid planner inputs are rejected`() {
        assertThrows(IllegalArgumentException::class.java) { ChunkSequencePlanner.plan(-1) }
        assertThrows(IllegalArgumentException::class.java) { ChunkSequencePlanner.plan(10, chunkBytes = 0) }
        assertThrows(IllegalArgumentException::class.java) { ChunkSequencePlanner.plan(10, chunkBytes = -1) }
        assertThrows(IllegalArgumentException::class.java) { ChunkSequencePlanner.plan(Long.MAX_VALUE) }
    }

    // ------------------------------------------------------------------
    // ChunkedEpisodeMeta — Gson round trip (the episode.json document)
    // ------------------------------------------------------------------

    @Test
    fun `meta json round trips every field`() {
        val gson = Gson()
        val meta = ChunkedEpisodeMeta(
            episodeId = "aaaaaaaa-1111-4222-8333-444444444444",
            courseId = "bbbbbbbb-1111-4222-8333-444444444444",
            subjectId = "cccccccc-1111-4222-8333-444444444444",
            title = "الحلقة الأولى",
            type = "video",
            contentType = "video/mp4",
            totalBytes = 12_345_678L,
            chunkCount = 3,
            createdAt = "2026-12-01T12:00:00Z",
            lastAccessAt = "2026-12-02T08:30:00Z",
            entitlementExpiresAt = "2026-12-21T12:00:00Z"
        )
        val parsed = gson.fromJson(gson.toJson(meta), ChunkedEpisodeMeta::class.java)
        assertEquals(meta, parsed)
    }

    @Test
    fun `meta json round trips null optional fields`() {
        val gson = Gson()
        val meta = ChunkedEpisodeMeta(
            episodeId = "aaaaaaaa-1111-4222-8333-444444444444",
            courseId = null,
            subjectId = null,
            title = null,
            type = "audio",
            contentType = null,
            totalBytes = 0L,
            chunkCount = 0,
            createdAt = "2026-12-01T12:00:00Z",
            lastAccessAt = "2026-12-01T12:00:00Z",
            entitlementExpiresAt = null
        )
        val parsed = gson.fromJson(gson.toJson(meta), ChunkedEpisodeMeta::class.java)
        assertEquals(meta, parsed)
        assertNull(parsed.courseId)
        assertNull(parsed.entitlementExpiresAt)
    }

    @Test
    fun `lenient iso parsing accepts instants and rejects junk`() {
        assertEquals(Instant.parse("2026-12-01T12:00:00Z"), parseIsoInstantOrNull("2026-12-01T12:00:00Z"))
        assertNull(parseIsoInstantOrNull(null))
        assertNull(parseIsoInstantOrNull(""))
        assertNull(parseIsoInstantOrNull("not-an-instant"))
    }

    // ------------------------------------------------------------------
    // FakeChunkedFileStore — staging/publish semantics used by D3 tests
    // ------------------------------------------------------------------

    @Test
    fun `fake store hides staged bytes until finish publishes them`() {
        val store = FakeChunkedFileStore()
        val writer = store.openChunkSequence("aaaaaaaa-1111-4222-8333-444444444444")!!
        writer.write(ByteArray(64), 64)
        // Staging: not readable yet — a failed/unfinished sequence leaves nothing behind.
        assertNull(store.readChunk("aaaaaaaa-1111-4222-8333-444444444444", 0))
        assertEquals(0, store.chunkCount("aaaaaaaa-1111-4222-8333-444444444444"))
        val meta = writer.finish()
        assertNotNull(meta)
        assertEquals(64L, meta!!.totalBytes)
        assertEquals(1, meta.chunkCount)
        assertEquals(64, meta.lastChunkBytes)
        assertEquals(64, store.readChunk("aaaaaaaa-1111-4222-8333-444444444444", 0)!!.size)
        // A second finish answers null — the sequence is already published.
        assertNull(writer.finish())
    }

    @Test
    fun `fake store rolls chunks at the policy boundary and keeps the partial tail`() {
        val store = FakeChunkedFileStore()
        val writer = store.openChunkSequence("aaaaaaaa-1111-4222-8333-444444444444")!!
        val chunk = CachePolicy.MAX_AV_CHUNK_BYTES
        writer.write(ByteArray(chunk.toInt()), chunk.toInt())
        writer.write(ByteArray(1024), 1024)
        val meta = writer.finish()!!
        assertEquals(2, meta.chunkCount)
        assertEquals(1024, meta.lastChunkBytes)
        assertEquals(chunk + 1024, meta.totalBytes)
        assertEquals(chunk.toInt(), store.readChunk("aaaaaaaa-1111-4222-8333-444444444444", 0)!!.size)
        assertEquals(1024, store.readChunk("aaaaaaaa-1111-4222-8333-444444444444", 1)!!.size)
        assertNull(store.readChunk("aaaaaaaa-1111-4222-8333-444444444444", 2))
        assertNull(store.readChunk("aaaaaaaa-1111-4222-8333-444444444444", -1))
    }

    @Test
    fun `a write larger than the remaining room splits across chunks`() {
        val store = FakeChunkedFileStore()
        val writer = store.openChunkSequence("aaaaaaaa-1111-4222-8333-444444444444")!!
        val chunk = CachePolicy.MAX_AV_CHUNK_BYTES
        // One single write bigger than a whole chunk: split into full + partial.
        writer.write(ByteArray((chunk + 5).toInt()), (chunk + 5).toInt())
        val meta = writer.finish()!!
        assertEquals(2, meta.chunkCount)
        assertEquals(5, meta.lastChunkBytes)
    }

    @Test
    fun `fake store delete removes one episode and deleteAll wipes everything`() {
        val store = FakeChunkedFileStore()
        store.publish("aaaaaaaa-1111-4222-8333-444444444444", bytes = 10)
        store.publish("bbbbbbbb-1111-4222-8333-444444444444", bytes = 20)
        store.delete("aaaaaaaa-1111-4222-8333-444444444444")
        assertEquals(listOf("bbbbbbbb-1111-4222-8333-444444444444"), store.listIds())
        store.deleteAll()
        assertTrue(store.listIds().isEmpty())
        assertEquals(1, store.deleteAllCalls)
    }

    @Test
    fun `fake store lists metas newest first and touch bumps the lru key`() {
        val store = FakeChunkedFileStore()
        store.publish("aaaaaaaa-1111-4222-8333-444444444444", bytes = 10, at = Instant.parse("2026-12-01T10:00:00Z"))
        store.publish("bbbbbbbb-1111-4222-8333-444444444444", bytes = 20, at = Instant.parse("2026-12-02T10:00:00Z"))
        assertEquals(
            listOf("bbbbbbbb-1111-4222-8333-444444444444", "aaaaaaaa-1111-4222-8333-444444444444"),
            store.listMetas().map { it.episodeId }
        )
        store.now = Instant.parse("2026-12-03T09:00:00Z")
        store.touch("aaaaaaaa-1111-4222-8333-444444444444")
        assertEquals(
            listOf("aaaaaaaa-1111-4222-8333-444444444444", "bbbbbbbb-1111-4222-8333-444444444444"),
            store.listMetas().map { it.episodeId }
        )
    }

    @Test
    fun `fake store meta survives writeMeta and readMeta round trip`() {
        val store = FakeChunkedFileStore()
        store.publish("aaaaaaaa-1111-4222-8333-444444444444", bytes = 48, at = Instant.parse("2026-12-01T10:00:00Z"))
        val meta = store.readMeta("aaaaaaaa-1111-4222-8333-444444444444")!!
        assertEquals(48L, meta.totalBytes)
        assertEquals(1, meta.chunkCount)
        assertEquals("video", meta.type)
        assertTrue(store.writeMeta("aaaaaaaa-1111-4222-8333-444444444444", meta.copy(title = "عنوان")))
        assertEquals("عنوان", store.readMeta("aaaaaaaa-1111-4222-8333-444444444444")!!.title)
        assertNull(store.readMeta("cccccccc-1111-4222-8333-444444444444"))
        assertEquals(0, store.totalBytes("cccccccc-1111-4222-8333-444444444444"))
        // Forced meta-persistence failure (the real store's encrypted write can fail too).
        store.failWriteMeta = true
        assertFalse(store.writeMeta("aaaaaaaa-1111-4222-8333-444444444444", meta))
    }

    private fun assertThrows(expected: Class<out Throwable>, action: () -> Unit) {
        try {
            action()
            error("Expected ${expected.simpleName} was not thrown")
        } catch (thrown: Throwable) {
            if (!expected.isInstance(thrown)) throw thrown
        }
    }
}

/**
 * In-memory [ChunkedFileStore] for the Wave 5b-i JVM tests — the
 * Deliverable-3 service tests reuse it. Mirrors the production semantics the
 * service depends on: staged chunks are invisible until [ChunkWriter.finish]
 * publishes them; chunk boundaries roll exactly at
 * [CachePolicy.MAX_AV_CHUNK_BYTES]; delete / deleteAll / touch / writeMeta
 * follow [EncryptedChunkedFileStore]. The [publish] helper seeds completed
 * episodes (chunks + meta) for fast-path and quota fixtures.
 */
class FakeChunkedFileStore : ChunkedFileStore {

    private class Record(val chunks: MutableList<ByteArray>, var meta: ChunkedEpisodeMeta?)

    private val records = LinkedHashMap<String, Record>()
    private val staging = HashMap<String, MutableList<ByteArrayOutputStream>>()

    var deleteAllCalls = 0
        private set

    /** When true, [writeMeta] fails (storage failure injection). */
    var failWriteMeta = false

    /** Injectable clock for touch/listMetas ordering assertions. */
    var now: Instant = Instant.parse("2026-12-01T12:00:00Z")

    override fun openChunkSequence(id: String): ChunkWriter? {
        val chunks = mutableListOf<ByteArrayOutputStream>()
        staging[id] = chunks
        return object : ChunkWriter {
            private var finished = false

            override fun write(buffer: ByteArray, length: Int) {
                check(!finished) { "chunk sequence already finished" }
                if (length <= 0) return
                var offset = 0
                while (offset < length) {
                    val current = chunks.lastOrNull()?.takeIf { it.size() < CachePolicy.MAX_AV_CHUNK_BYTES }
                        ?: ByteArrayOutputStream().also { chunks.add(it) }
                    val room = (CachePolicy.MAX_AV_CHUNK_BYTES - current.size()).toInt()
                    val take = minOf(room, length - offset)
                    current.write(buffer, offset, take)
                    offset += take
                }
            }

            override fun finish(): ChunkSequenceMeta? {
                if (finished) return null
                finished = true
                val published = chunks.map(ByteArrayOutputStream::toByteArray)
                staging.remove(id)
                records[id] = Record(published.toMutableList(), null)
                return ChunkSequenceMeta(
                    id = id,
                    chunkCount = published.size,
                    totalBytes = published.sumOf { it.size.toLong() },
                    lastChunkBytes = published.lastOrNull()?.size ?: 0
                )
            }
        }
    }

    override fun readChunk(id: String, index: Int): ByteArray? {
        if (index < 0) return null
        return records[id]?.chunks?.getOrNull(index)
    }

    override fun chunkCount(id: String): Int = records[id]?.chunks?.size ?: 0

    override fun totalBytes(id: String): Long = records[id]?.meta?.totalBytes ?: 0L

    override fun delete(id: String) {
        records.remove(id)
        staging.remove(id)
    }

    override fun deleteAll() {
        deleteAllCalls++
        records.clear()
        staging.clear()
    }

    override fun listIds(): List<String> = records.keys.toList()

    override fun readMeta(id: String): ChunkedEpisodeMeta? = records[id]?.meta

    override fun writeMeta(id: String, meta: ChunkedEpisodeMeta): Boolean {
        if (failWriteMeta) return false
        records.getOrPut(id) { Record(mutableListOf(), null) }.meta = meta
        return true
    }

    override fun touch(id: String) {
        val record = records[id] ?: return
        record.meta = record.meta?.copy(lastAccessAt = now.toString())
    }

    override fun listMetas(): List<ChunkedEpisodeMeta> =
        records.values.mapNotNull { it.meta }.sortedWith(
            compareByDescending<ChunkedEpisodeMeta> { parseIsoInstantOrNull(it.lastAccessAt) ?: Instant.EPOCH }
                .thenByDescending { parseIsoInstantOrNull(it.createdAt) ?: Instant.EPOCH }
        )

    /** Test helper: seeds a completed episode (chunks per the planner + meta). */
    fun publish(
        episodeId: String,
        bytes: Long,
        at: Instant = now,
        type: String = "video",
        entitlementExpiresAt: String? = null
    ) {
        val plan = ChunkSequencePlanner.plan(bytes)
        val chunks = plan.chunkSizes.map { size -> ByteArray(size) { (it % 251).toByte() } }
        records[episodeId] = Record(
            chunks.toMutableList(),
            ChunkedEpisodeMeta(
                episodeId = episodeId,
                courseId = null,
                subjectId = null,
                title = null,
                type = type,
                contentType = null,
                totalBytes = bytes,
                chunkCount = plan.chunkCount,
                createdAt = at.toString(),
                lastAccessAt = at.toString(),
                entitlementExpiresAt = entitlementExpiresAt
            )
        )
    }

    /** Test helper: the raw chunk list of one episode (assertion convenience). */
    fun chunksOf(id: String): List<ByteArray>? = records[id]?.chunks
}
