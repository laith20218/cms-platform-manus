package com.cms.student.media

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream

/**
 * Seam for the encrypted object store. Production uses [EncryptedMediaFileStore]
 * (AndroidX EncryptedFile + Android Keystore MasterKey — encrypt-at-rest, streaming,
 * atomic tmp-then-rename, same stack as the Batch-2 token store); JVM tests use
 * [PlainMediaFileStore] over a temp directory. The service only ever sees streams.
 */
interface MediaFileStore {
    /** Opens the object's decrypted output stream; the impl publishes atomically on close. */
    fun openOutput(contentId: String): OutputStream

    /** Opens the object's decrypted input stream, or null when the object is absent. */
    fun openInput(contentId: String): InputStream?

    /** Reads the whole decrypted object into memory (small kinds: images, text/HTML lessons). */
    fun readBytes(contentId: String): ByteArray? =
        openInput(contentId)?.use { it.readBytes() }?.takeIf { it.isNotEmpty() }

    /** Decrypts into a private temp file under the app cache dir (PDF/audio/video openers). */
    fun openDecryptedTemp(contentId: String): File? =
        openInput(contentId)?.use { input ->
            File.createTempFile("cms-media-$contentId", ".bin").let { temp ->
                FileOutputStream(temp).use { output -> input.copyTo(output) }
                temp
            }
        }

    fun delete(contentId: String): Boolean

    fun deleteAll(): Int

    fun exists(contentId: String): Boolean
}

/**
 * Plain (unencrypted) file store for JVM tests and local fakes — NEVER wired in
 * production Android builds ([EncryptedMediaFileStore] is the production impl; G6
 * forbids plaintext media caches on the device).
 */
class PlainMediaFileStore(private val directory: File) : MediaFileStore {
    init { directory.mkdirs() }

    private fun target(contentId: String): File = File(directory, "$contentId.bin")

    override fun openOutput(contentId: String): OutputStream {
        val temporary = File(directory, "$contentId.bin.tmp")
        return object : FileOutputStream(temporary) {
            override fun close() {
                super.close()
                val final = target(contentId)
                if (final.exists()) final.delete()
                if (!temporary.renameTo(final)) error("Unable to publish plain media object")
            }
        }
    }

    override fun openInput(contentId: String): InputStream? {
        val file = target(contentId)
        return if (file.exists()) FileInputStream(file) else null
    }

    override fun delete(contentId: String): Boolean {
        var removed = false
        File(directory, "$contentId.bin.tmp").let { if (it.exists() && it.delete()) removed = true }
        if (target(contentId).delete()) removed = true
        return removed
    }

    override fun deleteAll(): Int {
        var removed = 0
        directory.listFiles()?.forEach { if (it.isFile && it.delete()) removed++ }
        return removed
    }

    override fun exists(contentId: String): Boolean = target(contentId).exists()
}
