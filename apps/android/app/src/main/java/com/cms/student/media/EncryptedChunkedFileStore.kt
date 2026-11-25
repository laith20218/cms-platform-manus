package com.cms.student.media

import android.content.Context
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import java.io.File
import java.io.OutputStream
import java.time.Instant

/**
 * Wave 5b-i (Phase Q) — production CHUNKED store for hosted course-episode AV.
 * On-disk layout under `filesDir/media-chunks`:
 *
 * ```
 * media-chunks/
 *   {episodeId}/chunk-000000.bin   <- each an independent AndroidX EncryptedFile
 *   {episodeId}/chunk-000001.bin      (MasterKey + AES256_GCM_HKDF_4KB — the SAME
 *   {episodeId}/episode.json          stack as [EncryptedMediaFileStore])
 *   .tmp-{episodeId}/...           <- staging area of an in-flight download
 * ```
 *
 * Phase Q decision: heavy AV is stored ONLY as ≤4 MiB independently encrypted
 * chunks — no complete clear media file ever exists on disk, so casual
 * file-manager discovery of a playable episode stays hard (the chunk files are
 * anonymous ciphertext blobs; only the encrypted meta names the episode).
 *
 * Discipline (mirroring the existing stores): writes are atomic (staging
 * directory + rename of the WHOLE episode directory on [ChunkWriter.finish]),
 * reads decrypt exactly ONE chunk, and every public method fails closed with
 * null/false/Unit — never throws outward. The [ChunkWriter] handed out by
 * [openChunkSequence] deliberately DOES throw from [ChunkWriter.write] on
 * storage failure: a download that cannot persist bytes must fail honestly
 * instead of silently truncating.
 */
class EncryptedChunkedFileStore(context: Context) : ChunkedFileStore {

    private val appContext = context.applicationContext
    private val root = File(appContext.filesDir, ROOT_DIR).apply { mkdirs() }
    private val gson = Gson()
    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private fun finalDir(id: String): File = File(root, id)

    private fun stagingDir(id: String): File = File(root, "$TMP_PREFIX$id")

    private fun chunkFile(directory: File, index: Int): File = File(directory, CHUNK_FILE_FORMAT.format(index))

    private fun metaFile(directory: File): File = File(directory, META_FILE)

    private fun encrypted(file: File): EncryptedFile = EncryptedFile.Builder(
        appContext,
        file,
        masterKey,
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()

    override fun openChunkSequence(id: String): ChunkWriter? = runCatching {
        val staging = stagingDir(id)
        recursiveDelete(staging)
        if (!staging.mkdirs()) error("Unable to create chunk staging directory")
        ChunkedEpisodeWriter(id, staging)
    }.getOrNull()

    override fun readChunk(id: String, index: Int): ByteArray? = runCatching {
        if (index < 0) return null
        val file = chunkFile(finalDir(id), index)
        if (!file.exists()) return null
        encrypted(file).openFileInput().use { input -> input.readBytes() }
    }.getOrNull()

    override fun chunkCount(id: String): Int = runCatching {
        countChunkFiles(finalDir(id))
    }.getOrDefault(0)

    override fun totalBytes(id: String): Long =
        runCatching { readMeta(id)?.totalBytes ?: 0L }.getOrDefault(0L)

    override fun delete(id: String) {
        runCatching {
            recursiveDelete(finalDir(id))
            recursiveDelete(stagingDir(id))
        }
    }

    override fun deleteAll() {
        runCatching {
            root.listFiles()?.forEach { recursiveDelete(it) }
        }
    }

    override fun listIds(): List<String> = runCatching {
        root.listFiles()
            ?.filter { it.isDirectory && !it.name.startsWith(TMP_PREFIX) }
            ?.map { it.name }
            ?: emptyList()
    }.getOrDefault(emptyList())

    override fun readMeta(id: String): ChunkedEpisodeMeta? = runCatching {
        val file = metaFile(finalDir(id))
        if (!file.exists()) return null
        val json = encrypted(file).openFileInput().bufferedReader(Charsets.UTF_8).use { it.readText() }
        gson.fromJson(json, ChunkedEpisodeMeta::class.java)?.takeIf { it.episodeId == id }
    }.getOrNull()

    override fun writeMeta(id: String, meta: ChunkedEpisodeMeta): Boolean = runCatching {
        val directory = finalDir(id).apply { mkdirs() }
        val temporary = File(directory, "$META_FILE.tmp")
        temporary.delete()
        encrypted(temporary).openFileOutput().bufferedWriter(Charsets.UTF_8).use { it.write(gson.toJson(meta)) }
        val target = metaFile(directory)
        if (target.exists() && !target.delete()) error("Unable to replace chunked episode meta")
        if (!temporary.renameTo(target)) error("Unable to publish chunked episode meta")
        true
    }.getOrDefault(false)

    override fun touch(id: String) {
        runCatching {
            val current = readMeta(id) ?: return
            writeMeta(id, current.copy(lastAccessAt = Instant.now().toString()))
        }
    }

    override fun listMetas(): List<ChunkedEpisodeMeta> = runCatching {
        listIds().mapNotNull(::readMeta).sortedWith(
            compareByDescending<ChunkedEpisodeMeta> { parseIsoInstantOrNull(it.lastAccessAt) ?: Instant.EPOCH }
                .thenByDescending { parseIsoInstantOrNull(it.createdAt) ?: Instant.EPOCH }
        )
    }.getOrDefault(emptyList())

    // =====================================================================
    // Rolling chunk writer over the staging directory
    // =====================================================================

    /**
     * Streams bytes into `chunk-NNNNNN.bin` files inside the staging directory,
     * rolling a new encrypted chunk whenever the current one reaches
     * [CachePolicy.MAX_AV_CHUNK_BYTES] (a write larger than the remaining room
     * is split — chunk boundaries are exact). [finish] publishes the whole
     * staging directory onto the final path atomically (rename), replacing any
     * previous episode version only at that instant — a failed re-download
     * never destroys the stored one.
     */
    private inner class ChunkedEpisodeWriter(
        private val episodeId: String,
        private val staging: File
    ) : ChunkWriter {

        private var chunkIndex = 0
        private var chunkBytesWritten = 0L
        private var totalBytes = 0L
        private var lastChunkBytes = 0
        private var published = false
        private var output: OutputStream? = null

        override fun write(buffer: ByteArray, length: Int) {
            check(!published) { "chunk sequence already finished" }
            if (length <= 0) return
            var offset = 0
            while (offset < length) {
                val current = output ?: encrypted(chunkFile(staging, chunkIndex))
                    .openFileOutput()
                    .also { output = it }
                val room = (CachePolicy.MAX_AV_CHUNK_BYTES - chunkBytesWritten).toInt()
                val take = minOf(room, length - offset)
                current.write(buffer, offset, take)
                chunkBytesWritten += take
                totalBytes += take
                offset += take
                if (chunkBytesWritten >= CachePolicy.MAX_AV_CHUNK_BYTES) rollChunk()
            }
        }

        override fun finish(): ChunkSequenceMeta? = runCatching {
            closeCurrentChunk()
            val chunks = countChunkFiles(staging)
            val target = finalDir(episodeId)
            recursiveDelete(target)
            if (!staging.renameTo(target)) error("Unable to publish chunked episode")
            published = true
            ChunkSequenceMeta(episodeId, chunks, totalBytes, lastChunkBytes)
        }.onFailure {
            closeCurrentChunk()
            recursiveDelete(staging)
        }.getOrNull()

        private fun rollChunk() {
            closeCurrentChunk()
            if (chunkBytesWritten > 0) lastChunkBytes = chunkBytesWritten.toInt()
            chunkIndex++
            chunkBytesWritten = 0
        }

        private fun closeCurrentChunk() {
            runCatching { output?.close() }
            output = null
        }
    }

    // =====================================================================
    // Filesystem helpers
    // =====================================================================

    private fun countChunkFiles(directory: File): Int =
        directory.listFiles()?.count { it.isFile && it.name.startsWith(CHUNK_FILE_PREFIX) } ?: 0

    private fun recursiveDelete(target: File) {
        if (!target.exists()) return
        target.walkBottomUp().forEach { it.delete() }
    }

    private companion object {
        const val ROOT_DIR = "media-chunks"
        const val TMP_PREFIX = ".tmp-"
        const val CHUNK_FILE_PREFIX = "chunk-"
        const val CHUNK_FILE_FORMAT = "chunk-%06d.bin"
        const val META_FILE = "episode.json"
    }
}
