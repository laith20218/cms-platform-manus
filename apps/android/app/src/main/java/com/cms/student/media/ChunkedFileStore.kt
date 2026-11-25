package com.cms.student.media

import java.time.Instant

/**
 * Wave 5b-i (Phase Q) — pure JVM contracts for the encrypted CHUNKED audio/video
 * store of hosted course episodes. Heavy AV never lands as ONE encrypted file:
 * episodes stream into [CachePolicy.MAX_AV_CHUNK_BYTES] chunks, each an
 * independently encrypted object, so no complete clear media file ever exists on
 * disk (Phase Q: "hard for casual file-manager discovery") and a partial failure
 * leaves only fragment-sized damage.
 *
 * Production impl: [EncryptedChunkedFileStore] (AndroidX EncryptedFile + the
 * SAME MasterKey stack as [EncryptedMediaFileStore]). JVM tests use the fake in
 * ChunkedStoreLogicTest.kt.
 *
 * Id discipline: ids are validated UUID strings upstream (the bridge and the
 * service enforce the canonical hyphenated shape) — implementations treat them
 * as opaque directory names.
 */
interface ChunkedFileStore {

    /**
     * Opens a staging [ChunkWriter] for one episode. Chunks land in a temporary
     * directory and become readable only after [ChunkWriter.finish] publishes
     * them atomically. Null when the staging area cannot be created — never throws.
     */
    fun openChunkSequence(id: String): ChunkWriter?

    /** Decrypts ONE chunk (result is at most one chunk size), or null when absent. */
    fun readChunk(id: String, index: Int): ByteArray?

    /** Number of published chunk files on disk for the episode. */
    fun chunkCount(id: String): Int

    /** Total plaintext bytes of the episode per its persisted meta (0 when no meta). */
    fun totalBytes(id: String): Long

    /** Removes the episode (staging + published chunks + meta). Never throws. */
    fun delete(id: String)

    /** Wipes EVERY episode — the whole media-chunks directory. Never throws. */
    fun deleteAll()

    /** Published episode ids (staging directories excluded). */
    fun listIds(): List<String>

    /** The episode metadata row, or null when absent/unreadable. */
    fun readMeta(id: String): ChunkedEpisodeMeta?

    /**
     * Persists the episode metadata document atomically (encrypted). The caller
     * writes it AFTER [ChunkWriter.finish] published the chunks. True when the
     * document landed durably; false on failure — never throws.
     */
    fun writeMeta(id: String, meta: ChunkedEpisodeMeta): Boolean

    /** Bumps the metadata `lastAccessAt` (the LRU key). Never throws. */
    fun touch(id: String)

    /** Every readable metadata row, newest (most recently accessed) first. */
    fun listMetas(): List<ChunkedEpisodeMeta>
}

/**
 * Streaming sink one course-episode download writes into. [write] may throw on
 * storage failure (the download then fails honestly — bytes are never silently
 * dropped); [finish] publishes the staged chunks atomically and answers the
 * sequence bookkeeping, or null on failure (never throws).
 */
interface ChunkWriter {
    /** Appends [length] bytes of [buffer]; chunks roll at [CachePolicy.MAX_AV_CHUNK_BYTES]. */
    fun write(buffer: ByteArray, length: Int)

    /** Publishes the staged chunks; null when publication failed. */
    fun finish(): ChunkSequenceMeta?
}

/** Bookkeeping of one published chunk sequence. */
data class ChunkSequenceMeta(
    val id: String,
    val chunkCount: Int,
    val totalBytes: Long,
    val lastChunkBytes: Int
)

/**
 * Metadata row of one downloaded course episode — the ONLY fields the offline
 * panel surface ever reports (safe metadata; no bytes, no paths, no tokens).
 * Dates are ISO-8601 strings; [entitlementExpiresAt] is the server-issued
 * entitlement expiry captured at download time (null = the server sent none).
 */
data class ChunkedEpisodeMeta(
    val episodeId: String,
    val courseId: String?,
    val subjectId: String?,
    val title: String?,
    /** Episode family: "video" | "audio" (drives the panel row icon). */
    val type: String,
    /** Server MIME of the downloaded object — display only. */
    val contentType: String?,
    val totalBytes: Long,
    val chunkCount: Int,
    val createdAt: String,
    val lastAccessAt: String,
    val entitlementExpiresAt: String?
)

/**
 * Pure chunk-boundary arithmetic (no Android types): how a total byte length
 * splits into [CachePolicy.MAX_AV_CHUNK_BYTES] chunks — full chunks plus one
 * partial tail, with the zero-length edge case answering no chunks at all.
 * Used by the store's rolling writer logic and the JVM tests.
 */
object ChunkSequencePlanner {

    /** Immutable split plan for one byte length. */
    data class ChunkPlan(
        val chunkCount: Int,
        val chunkSizes: List<Int>,
        val lastChunkBytes: Int
    ) {
        val totalBytes: Long get() = chunkSizes.sumOf { it.toLong() }
    }

    /**
     * Splits [totalBytes] into chunks of [chunkBytes]. Zero bytes → zero chunks
     * (nothing to store); an exact multiple ends on a FULL chunk; anything else
     * ends on a partial chunk of the remainder.
     */
    fun plan(totalBytes: Long, chunkBytes: Long = CachePolicy.MAX_AV_CHUNK_BYTES): ChunkPlan {
        require(chunkBytes > 0) { "chunk size must be positive" }
        require(totalBytes >= 0) { "total bytes must not be negative" }
        require(totalBytes / chunkBytes <= Int.MAX_VALUE.toLong()) { "total bytes exceed the plannable range" }
        if (totalBytes == 0L) return ChunkPlan(0, emptyList(), 0)
        val fullChunks = (totalBytes / chunkBytes).toInt()
        val remainder = (totalBytes % chunkBytes).toInt()
        val sizes = ArrayList<Int>(fullChunks + if (remainder > 0) 1 else 0)
        repeat(fullChunks) { sizes.add(chunkBytes.toInt()) }
        if (remainder > 0) sizes.add(remainder)
        return ChunkPlan(sizes.size, sizes, sizes.last())
    }
}

/** Parses an ISO-8601 instant leniently; null when the text is absent or malformed. */
internal fun parseIsoInstantOrNull(raw: String?): Instant? =
    raw?.takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it) }.getOrNull() }
