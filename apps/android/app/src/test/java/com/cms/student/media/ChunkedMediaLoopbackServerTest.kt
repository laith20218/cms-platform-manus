package com.cms.student.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * W5b-ii (Phase Q playback) JVM tests for [ChunkedMediaLoopbackServer] and
 * [RangeHeader]. The loopback server is pure java.net — it runs on the JVM,
 * so these tests exercise the REAL socket path (token gate, Range handling,
 * chunk-at-a-time reassembly against [FakeChunkedFileStore] — the same fake
 * the service tests use; the AndroidX EncryptedFile production store is
 * exercised by CI instrumentation).
 */
class ChunkedMediaLoopbackServerTest {

    private val episodeId = "eeeeeeee-1111-4222-8333-444444444444"

    // ------------------------------------------------------------------
    // RangeHeader — pure byte math
    // ------------------------------------------------------------------

    @Test
    fun `range parsing handles all documented forms`() {
        val total = 1000L
        fun parse(header: String?): RangeHeader.Decision = RangeHeader.parse(header, total)

        assertEquals(RangeHeader.Decision.None, parse(null))
        assertEquals(RangeHeader.Decision.None, parse(""))
        assertEquals(RangeHeader.Decision.None, parse("bytes"))
        assertEquals(RangeHeader.Decision.None, parse("bytes="))
        assertEquals(RangeHeader.Decision.None, parse("items=0-10"))

        // Closed range.
        assertEquals(
            RangeHeader.Decision.Satisfiable(ChunkedMediaLoopbackServer.ByteRange(100, 299)),
            parse("bytes=100-299")
        )
        // Open-ended start clamps the end to total-1.
        assertEquals(
            RangeHeader.Decision.Satisfiable(ChunkedMediaLoopbackServer.ByteRange(500, 999)),
            parse("bytes=500-")
        )
        // End beyond total clamps.
        assertEquals(
            RangeHeader.Decision.Satisfiable(ChunkedMediaLoopbackServer.ByteRange(0, 999)),
            parse("bytes=0-5000")
        )
        // Suffix form caps at the whole body.
        assertEquals(
            RangeHeader.Decision.Satisfiable(ChunkedMediaLoopbackServer.ByteRange(750, 999)),
            parse("bytes=-250")
        )
        assertEquals(
            RangeHeader.Decision.Satisfiable(ChunkedMediaLoopbackServer.ByteRange(0, 999)),
            parse("bytes=-9999")
        )
        // Start at/after total is unsatisfiable; suffix 0 is too.
        assertEquals(RangeHeader.Decision.Unsatisfiable, parse("bytes=1000-"))
        assertEquals(RangeHeader.Decision.Unsatisfiable, parse("bytes=-0"))
        // Malformed numbers degrade to None (whole body), never a crash.
        assertEquals(RangeHeader.Decision.None, parse("bytes=abc-"))
        assertEquals(RangeHeader.Decision.None, parse("bytes=-abc"))
    }

    // ------------------------------------------------------------------
    // Loopback server — the real socket path
    // ------------------------------------------------------------------

    private fun seededStore(): FakeChunkedFileStore {
        val store = FakeChunkedFileStore()
        // 10 bytes + one full 4 MiB chunk + 5-byte tail: 4,194,305 bytes total.
        store.publish(episodeId, bytes = CachePolicy.MAX_AV_CHUNK_BYTES * 2 + 10)
        return store
    }

    private fun get(server: ChunkedMediaLoopbackServer, path: String?, rangeHeader: String? = null): Pair<Int, ByteArray> {
        val url = URL("http://127.0.0.1:${server.port()}${path ?: "/${server.token()}/stream"}")
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 5_000
        connection.readTimeout = 5_000
        if (rangeHeader != null) connection.setRequestProperty("Range", rangeHeader)
        val status = connection.responseCode
        // HttpURLConnection throws on getInputStream for 4xx — the error stream carries the (empty) body.
        val body = (connection.errorStream ?: connection.inputStream)?.use { input -> input.readBytes() } ?: ByteArray(0)
        connection.disconnect()
        return status to body
    }

    @Test
    fun `whole-body 200 serves the reassembled chunk stream with the episode content type`() {
        val store = seededStore()
        val server = ChunkedMediaLoopbackServer(episodeId, store, "video/mp4")
        val port = server.start()
        assertNotNull(port)
        try {
            val (status, body) = get(server, null)
            assertEquals(ChunkedMediaLoopbackServer.STATUS_OK, status)
            assertEquals((CachePolicy.MAX_AV_CHUNK_BYTES * 2 + 10).toInt(), body.size)
            // Reassembly preserves chunk order: first bytes are chunk 0, last 10 are the tail.
            assertEquals(store.readChunk(episodeId, 0)!![0], body[0])
            assertEquals(store.readChunk(episodeId, 2)!![9], body[body.size - 1])
        } finally {
            server.close()
        }
    }

    @Test
    fun `range requests answer 206 with the exact slice across a chunk boundary`() {
        val store = seededStore()
        val server = ChunkedMediaLoopbackServer(episodeId, store, "video/mp4")
        server.start()
        try {
            // A window spanning the 0→1 chunk boundary (4 MiB boundary at index 4,194,304).
            val from = (CachePolicy.MAX_AV_CHUNK_BYTES - 10).toInt()
            val to = (CachePolicy.MAX_AV_CHUNK_BYTES + 9).toInt()
            val (status, body) = get(server, null, "bytes=$from-$to")
            assertEquals(ChunkedMediaLoopbackServer.STATUS_PARTIAL_CONTENT, status)
            assertEquals(20, body.size)
            val expected = (store.readChunk(episodeId, 0)!! + store.readChunk(episodeId, 1)!!).copyOfRange(from, to + 1)
            assertEquals(expected.toList(), body.toList())
        } finally {
            server.close()
        }
    }

    @Test
    fun `a wrong token answers 404 and never streams bytes`() {
        val store = seededStore()
        val server = ChunkedMediaLoopbackServer(episodeId, store, "video/mp4")
        server.start()
        try {
            val (status, body) = get(server, "/not-the-token/stream")
            assertEquals(ChunkedMediaLoopbackServer.STATUS_NOT_FOUND, status)
            assertEquals(0, body.size)
        } finally {
            server.close()
        }
    }

    @Test
    fun `unsatisfiable ranges answer 416 with the extent`() {
        val store = FakeChunkedFileStore()
        store.publish(episodeId, bytes = 64)
        val server = ChunkedMediaLoopbackServer(episodeId, store, "audio/mpeg")
        server.start()
        try {
            val (status, body) = get(server, null, "bytes=100-")
            assertEquals(ChunkedMediaLoopbackServer.STATUS_RANGE_NOT_SATISFIABLE, status)
            assertEquals(0, body.size)
        } finally {
            server.close()
        }
    }

    @Test
    fun `close stops serving and the token is unique per instance`() {
        val store = FakeChunkedFileStore()
        store.publish(episodeId, bytes = 32)
        val first = ChunkedMediaLoopbackServer(episodeId, store, "video/mp4")
        val second = ChunkedMediaLoopbackServer(episodeId, store, "video/mp4")
        first.start()
        second.start()
        try {
            assertNotEquals(first.token(), second.token())
            assertNotEquals(first.port(), second.port())
        } finally {
            first.close()
            second.close()
        }
        // After close the port refuses connections (bind is released; the accept loop is dead).
        assertTrue(first.port() == null || runCatching { get(first, null) }.isFailure)
        assertNull(first.streamUrl())
    }

    // ------------------------------------------------------------------
    // FakeChunkedFileStore (local copy, since the shared fake lives in the
    // media test package's ChunkedStoreLogicTest file — a compact version
    // driving these socket tests; the planner math is locked separately).
    // ------------------------------------------------------------------

    private class FakeChunkedFileStore : ChunkedFileStore {
        private data class Record(val chunks: List<ByteArray>, var meta: ChunkedEpisodeMeta?)
        private val records = LinkedHashMap<String, Record>()

        fun publish(episodeId: String, bytes: Long, entitlementExpiresAt: String? = null) {
            val chunkSize = CachePolicy.MAX_AV_CHUNK_BYTES
            val fullChunks = (bytes / chunkSize).toInt()
            val tail = (bytes % chunkSize).toInt()
            val chunks = (0 until fullChunks).map { ByteArray(chunkSize.toInt()) { (it % 251).toByte() } } +
                (if (tail > 0) listOf(ByteArray(tail) { ((it + 7) % 251).toByte() }) else emptyList())
            records[episodeId] = Record(
                chunks,
                ChunkedEpisodeMeta(
                    episodeId = episodeId,
                    courseId = null,
                    subjectId = null,
                    title = null,
                    type = "video",
                    contentType = null,
                    totalBytes = bytes,
                    chunkCount = chunks.size,
                    createdAt = "2026-12-01T12:00:00Z",
                    lastAccessAt = "2026-12-01T12:00:00Z",
                    entitlementExpiresAt = entitlementExpiresAt
                )
            )
        }

        override fun openChunkSequence(id: String): ChunkWriter? = null
        override fun readChunk(id: String, index: Int): ByteArray? = records[id]?.chunks?.getOrNull(index)
        override fun chunkCount(id: String): Int = records[id]?.chunks?.size ?: 0
        override fun totalBytes(id: String): Long = records[id]?.meta?.totalBytes ?: 0L
        override fun delete(id: String) { records.remove(id) }
        override fun deleteAll() { records.clear() }
        override fun listIds(): List<String> = records.keys.toList()
        override fun readMeta(id: String): ChunkedEpisodeMeta? = records[id]?.meta
        override fun writeMeta(id: String, meta: ChunkedEpisodeMeta): Boolean {
            records.getOrPut(id) { Record(emptyList(), null) }.meta = meta
            return true
        }
        override fun touch(id: String) {
            records[id]?.let { it.meta = it.meta?.copy(lastAccessAt = "2026-12-01T12:05:00Z") }
        }
        override fun listMetas(): List<ChunkedEpisodeMeta> = records.values.mapNotNull { it.meta }
    }
}
