package com.cms.student.media

import android.content.Context
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import java.io.File
import java.io.InputStream
import java.io.OutputStream

/**
 * Batch 4 production object store — AndroidX [EncryptedFile] with an Android Keystore
 * [MasterKey] (AES256_GCM_HKDF_4KB, the exact stack [com.cms.student.session.EncryptedTokenStore]
 * and the Batch-1 offline package store use). Objects land in the app-private
 * `filesDir/media-cache` directory ENCRYPTED at rest (G6: no plaintext media cache in
 * app-accessible paths); writes are atomic (tmp object + rename), and both the final
 * and the temporary object are removed on delete/clear.
 */
class EncryptedMediaFileStore(context: Context) : MediaFileStore {

    private val appContext = context.applicationContext
    private val directory = File(appContext.filesDir, "media-cache").apply { mkdirs() }
    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private fun target(contentId: String): File = File(directory, "$contentId.bin")

    private fun encrypted(file: File): EncryptedFile = EncryptedFile.Builder(
        appContext,
        file,
        masterKey,
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()

    override fun openOutput(contentId: String): OutputStream {
        val temporary = File(directory, "$contentId.bin.tmp")
        return object : OutputStream() {
            private val delegate = encrypted(temporary).openFileOutput()

            override fun write(b: Int) = delegate.write(b)
            override fun write(b: ByteArray) = delegate.write(b)
            override fun write(b: ByteArray, off: Int, len: Int) = delegate.write(b, off, len)
            override fun flush() = delegate.flush()

            override fun close() {
                try {
                    delegate.close()
                    val final = target(contentId)
                    if (final.exists() && !final.delete()) error("Unable to replace encrypted media object")
                    if (!temporary.renameTo(final)) error("Unable to publish encrypted media object")
                } finally {
                    temporary.delete()
                }
            }
        }
    }

    override fun openInput(contentId: String): InputStream? {
        val file = target(contentId)
        if (!file.exists()) return null
        return runCatching { encrypted(file).openFileInput() }.getOrNull()
    }

    override fun delete(contentId: String): Boolean {
        var removed = false
        File(directory, "$contentId.bin.tmp").let { if (it.exists() && it.delete()) removed = true }
        val file = target(contentId)
        if (file.exists() && file.delete()) removed = true
        return removed
    }

    override fun deleteAll(): Int {
        var removed = 0
        directory.listFiles()?.forEach { file ->
            if (file.isFile && file.delete()) removed++
        }
        return removed
    }

    override fun exists(contentId: String): Boolean = target(contentId).exists()
}

/**
 * Index document at rest — the SAME EncryptedFile/keystore stack, one object
 * (`index.json`) holding the serialized [CacheIndex]. Encrypting the index (not just
 * SharedPreferences) matters: `lastConfirmedAt` drives the offline-open entitlement
 * window, and an attacker-editable index would extend offline access; AES-GCM gives
 * confidentiality + integrity.
 */
class EncryptedMediaCachePersistence(context: Context) : MediaCachePersistence {

    private val appContext = context.applicationContext
    private val directory = File(appContext.filesDir, "media-cache").apply { mkdirs() }
    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private fun target(): File = File(directory, "index.json")

    private fun encrypted(file: File): EncryptedFile = EncryptedFile.Builder(
        appContext,
        file,
        masterKey,
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()

    override fun load(): String? {
        val file = target()
        if (!file.exists()) return null
        return runCatching {
            encrypted(file).openFileInput().bufferedReader(Charsets.UTF_8).use { it.readText() }
        }.getOrNull()
    }

    override fun save(document: String) {
        val temporary = File(directory, "index.json.tmp")
        runCatching {
            encrypted(temporary).openFileOutput().bufferedWriter(Charsets.UTF_8).use { it.write(document) }
            val final = target()
            if (final.exists() && !final.delete()) error("Unable to replace encrypted media index")
            if (!temporary.renameTo(final)) error("Unable to publish encrypted media index")
        }.onFailure {
            temporary.delete()
            throw IllegalStateException("Encrypted media index persistence failed", it)
        }
    }
}
