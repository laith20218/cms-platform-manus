package com.cms.student.media

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.google.gson.reflect.TypeToken
import java.time.Instant

/**
 * One cached library file. [storedFileName] and [sourcePath] are INTERNAL bookkeeping —
 * they never cross the bridge (listCached exposes only id/kind/title/bytes/timestamps).
 *
 * [lastConfirmedAt] is the timestamp of the last server-side entitlement confirmation
 * (download completion, or a 2xx on-open re-check) — bookkeeping only; it no longer
 * gates offline opens. [entitlementExpiresAt] is the server-issued entitlement expiry
 * captured at download time (null when the server sends none); under the durable
 * offline policy an entry is denied offline only when this expiry exists and has
 * passed (Owner decision 2026-11-23).
 */
data class MediaCacheEntry(
    val contentId: String,
    val kind: MediaKind,
    val storedFileName: String,
    val sourcePath: String,
    val bytes: Long,
    val createdAt: Instant,
    val lastConfirmedAt: Instant,
    val lastAccessAt: Instant,
    val displayName: String? = null,
    val subjectId: String? = null,
    val entitlementExpiresAt: Instant? = null
) {
    /** Bridge-facing metadata row — deliberately excludes paths and internal fields. */
    fun toSafeJson(): String = Gson().toJson(
        linkedMapOf(
            "contentId" to contentId,
            "type" to kind.wireName,
            "title" to (displayName ?: contentId),
            "bytes" to bytes,
            "createdAt" to createdAt.toString(),
            "lastAccessAt" to lastAccessAt.toString()
        )
    )
}

/** Persistence seam for the index document; implementations choose the at-rest format. */
interface MediaCachePersistence {
    /** Returns the serialized index document, or null when nothing was ever persisted. */
    fun load(): String?

    /** Durably persists the serialized index document. */
    fun save(document: String)
}

/** In-memory persistence (JVM tests, and the pre-init state of the Android store). */
class InMemoryMediaCachePersistence : MediaCachePersistence {
    private var document: String? = null
    override fun load(): String? = document
    override fun save(document: String) { this.document = document }
}

/**
 * Pure (no Android types) metadata index for the encrypted media cache. Mutations
 * serialize through [MediaCachePersistence]; the Android production store keeps the
 * document encrypted at rest with the same EncryptedFile/keystore stack as the
 * Batch-2 token store, so the index (and its entitlement timestamps) cannot be
 * tampered with by a device user to extend offline access.
 */
class CacheIndex(private val persistence: MediaCachePersistence) {

    private val gson = Gson()
    private val entries = LinkedHashMap<String, MediaCacheEntry>()
    @Volatile private var loaded = false

    @Synchronized
    private fun ensureLoaded() {
        if (loaded) return
        persistence.load()?.let { document ->
            runCatching {
                val type = object : TypeToken<List<StoredEntry>>() {}.type
                val stored: List<StoredEntry> = gson.fromJson(document, type) ?: emptyList()
                stored.mapNotNull { it.toDomain() }.forEach { entries[it.contentId] = it }
            }
        }
        loaded = true
    }

    @Synchronized
    fun get(contentId: String): MediaCacheEntry? {
        ensureLoaded()
        return entries[contentId]
    }

    /** All entries, most recently accessed first (the offline catalog order). */
    @Synchronized
    fun all(): List<MediaCacheEntry> {
        ensureLoaded()
        return entries.values.sortedByDescending { it.lastAccessAt.toEpochMilli() }
    }

    @Synchronized
    fun totalBytes(): Long {
        ensureLoaded()
        return entries.values.sumOf { it.bytes }
    }

    /** Upsert; returns the previous entry when one existed. */
    @Synchronized
    fun put(entry: MediaCacheEntry): MediaCacheEntry? {
        ensureLoaded()
        val previous = entries.put(entry.contentId, entry)
        persist()
        return previous
    }

    /** Records an open: bumps [MediaCacheEntry.lastAccessAt] (the LRU key). */
    @Synchronized
    fun touch(contentId: String, at: Instant): Boolean {
        ensureLoaded()
        val entry = entries[contentId] ?: return false
        entries[contentId] = entry.copy(lastAccessAt = at)
        persist()
        return true
    }

    /** Records a fresh server-side entitlement confirmation. */
    @Synchronized
    fun confirm(contentId: String, at: Instant): Boolean {
        ensureLoaded()
        val entry = entries[contentId] ?: return false
        entries[contentId] = entry.copy(lastConfirmedAt = at, lastAccessAt = at)
        persist()
        return true
    }

    @Synchronized
    fun remove(contentId: String): MediaCacheEntry? {
        ensureLoaded()
        val removed = entries.remove(contentId) ?: return null
        persist()
        return removed
    }

    @Synchronized
    fun clear() {
        entries.clear()
        persist()
    }

    @Synchronized
    private fun persist() {
        persistence.save(gson.toJson(entries.values.map { StoredEntry.from(it) }))
    }

    /** Gson-friendly mirror of [MediaCacheEntry]; Instant/String via ISO-8601. */
    private data class StoredEntry(
        val contentId: String,
        val kind: String,
        val storedFileName: String,
        val sourcePath: String,
        val bytes: Long,
        val createdAt: String,
        val lastConfirmedAt: String,
        val lastAccessAt: String,
        val displayName: String? = null,
        val subjectId: String? = null,
        val entitlementExpiresAt: String? = null
    ) {
        fun toDomain(): MediaCacheEntry? = runCatching {
            MediaCacheEntry(
                contentId = contentId,
                kind = MediaKind.fromWireName(kind) ?: return null,
                storedFileName = storedFileName,
                sourcePath = sourcePath,
                bytes = bytes,
                createdAt = Instant.parse(createdAt),
                lastConfirmedAt = Instant.parse(lastConfirmedAt),
                lastAccessAt = Instant.parse(lastAccessAt),
                displayName = displayName,
                subjectId = subjectId,
                entitlementExpiresAt = entitlementExpiresAt?.let { parsed ->
                    runCatching { Instant.parse(parsed) }.getOrNull()
                }
            )
        }.getOrNull()

        companion object {
            fun from(entry: MediaCacheEntry) = StoredEntry(
                contentId = entry.contentId,
                kind = entry.kind.wireName,
                storedFileName = entry.storedFileName,
                sourcePath = entry.sourcePath,
                bytes = entry.bytes,
                createdAt = entry.createdAt.toString(),
                lastConfirmedAt = entry.lastConfirmedAt.toString(),
                lastAccessAt = entry.lastAccessAt.toString(),
                displayName = entry.displayName,
                subjectId = entry.subjectId,
                entitlementExpiresAt = entry.entitlementExpiresAt?.toString()
            )
        }
    }
}
