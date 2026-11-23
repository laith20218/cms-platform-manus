package com.cms.student.media

import com.cms.student.security.OfflineSession
import com.google.gson.JsonParser
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.OutputStream
import java.nio.file.Files
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/**
 * Batch 4 — the [MediaCacheService] state machine, exercised end-to-end with fakes
 * (fake transport, plain file store over a temp dir, fake opener, mutable clock,
 * direct executor). No Android types — same JVM-only approach as the Batch 2/3 core.
 */
class MediaCacheServiceTest {

    // ---- fixtures --------------------------------------------------------

    private var now: Instant = Instant.parse("2026-03-01T12:00:00Z")
    private var online: Boolean = true
    private var session: OfflineSession? = null
    private val authDeadCalls = AtomicInteger(0)
    private val refreshedSessions = mutableListOf<OfflineSession>()

    private lateinit var storeDirectory: File
    private lateinit var fileStore: PlainMediaFileStore
    private lateinit var transport: FakeTransport
    private val openedEntries = mutableListOf<MediaCacheEntry>()

    private fun newService(quotaBytes: Long = CachePolicy.MAX_CACHE_BYTES): MediaCacheService =
        MediaCacheService(
            index = CacheIndex(InMemoryMediaCachePersistence()),
            fileStore = fileStore,
            transport = transport,
            quota = CacheQuota(maxBytes = quotaBytes),
            progressBus = CacheProgressBus(),
            executor = Runnable::run, // direct: downloads run inline for deterministic tests
            opener = MediaOpener { entry -> openedEntries.add(entry); true },
            networkAvailability = { online },
            clock = { now },
            sessionProvider = { session },
            sessionRefresher = { refreshedSessions.removeFirstOrNull() },
            onAuthDead = { authDeadCalls.incrementAndGet() }
        )

    private val studentId = UUID.randomUUID()
    private fun aSession(): OfflineSession = OfflineSession(studentId, "access-token", "installation-id")

    @Before
    fun setUp() {
        storeDirectory = Files.createTempDirectory("cms-media-cache-test").toFile()
        fileStore = PlainMediaFileStore(storeDirectory)
        transport = FakeTransport()
        session = aSession()
    }

    @After
    fun tearDown() {
        storeDirectory.deleteRecursively()
    }

    private val contentId = "11111111-2222-4333-8444-555555555555"
    private val otherId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

    // ---- ensureLocal -----------------------------------------------------

    @Test
    fun `a first download runs the queued task to ready with fresh confirmation`() {
        val service = newService()
        val code = service.ensureLocal(contentId, "pdf", """{"title":"كتاب"}""")
        assertEquals(CacheStatus.STARTED, code)
        assertEquals(CacheStatus.READY, service.cacheStatus(contentId))
        val entry = service.catalogEntries().single()
        assertEquals(contentId, entry.contentId)
        assertEquals(MediaKind.PDF, entry.kind)
        assertEquals("كتاب", entry.displayName)
        assertEquals(now, entry.lastConfirmedAt)
        assertTrue(fileStore.exists(contentId))
        assertEquals(transport.lastDownloadedBytes, entry.bytes)
    }

    @Test
    fun `a second ensureLocal on a fresh entry answers ready without new work`() {
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        val downloadsBefore = transport.downloadCalls.get()
        assertEquals(CacheStatus.READY, service.ensureLocal(contentId, "pdf", null))
        assertEquals(downloadsBefore, transport.downloadCalls.get())
    }

    @Test
    fun `offline and absent answers denied_offline`() {
        online = false
        val service = newService()
        assertEquals(CacheStatus.DENIED_OFFLINE, service.ensureLocal(contentId, "pdf", null))
    }

    @Test
    fun `offline with a fresh entry answers ready`() {
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        online = false
        assertEquals(CacheStatus.READY, service.ensureLocal(contentId, "pdf", null))
    }

    @Test
    fun `online without a native session answers denied_native_session instead of faking a download`() {
        session = null
        val service = newService()
        assertEquals(CacheStatus.DENIED_NATIVE_SESSION, service.ensureLocal(contentId, "pdf", null))
        assertFalse(fileStore.exists(contentId))
        assertTrue(service.catalogEntries().isEmpty())
    }

    @Test
    fun `invalid arguments and unsupported types answer their own codes`() {
        val service = newService()
        assertEquals(CacheStatus.INVALID_ARGS, service.ensureLocal("", "pdf", null))
        assertEquals(CacheStatus.INVALID_ARGS, service.ensureLocal("not-a-uuid", "pdf", null))
        assertEquals(CacheStatus.INVALID_ARGS, service.ensureLocal("/etc/passwd", "pdf", null))
        assertEquals(CacheStatus.INVALID_ARGS, service.ensureLocal("x".repeat(300), "pdf", null))
        assertEquals(CacheStatus.UNSUPPORTED_TYPE, service.ensureLocal(contentId, "docx", null))
        assertEquals(CacheStatus.UNSUPPORTED_TYPE, service.ensureLocal(contentId, null, null))
    }

    @Test
    fun `garbage hints degrade to empty hints instead of failing`() {
        val service = newService()
        assertEquals(CacheStatus.STARTED, service.ensureLocal(contentId, "pdf", "{not json"))
        assertNull(service.catalogEntries().single().displayName)
    }

    @Test
    fun `a dead access token rotates once and the retry succeeds`() {
        transport.respondWith401Once = true
        val rotated = OfflineSession(studentId, "rotated-access", "installation-id")
        refreshedSessions.add(rotated)
        val service = newService()
        assertEquals(CacheStatus.STARTED, service.ensureLocal(contentId, "pdf", null))
        assertEquals(CacheStatus.READY, service.cacheStatus(contentId))
        assertEquals(0, authDeadCalls.get())
        assertTrue(fileStore.exists(contentId))
    }

    @Test
    fun `a rejected rotation wipes the whole cache via the auth-dead hook`() {
        val service = newService()
        // Pre-cached content must be present BEFORE the session dies.
        service.ensureLocal(otherId, "audio", null)
        assertTrue(fileStore.exists(otherId))

        transport.always401 = true
        assertEquals(CacheStatus.STARTED, service.ensureLocal(contentId, "pdf", null))
        assertEquals(1, authDeadCalls.get())
        assertEquals(CacheStatus.DENIED_AUTH, service.cacheStatus(contentId))
        // The hook (wired to CmsApplication.onNativeAuthRejected in production) wipes the media cache.
        service.wipe()
        assertTrue(service.catalogEntries().isEmpty())
        assertFalse(fileStore.exists(contentId))
        assertFalse(fileStore.exists(otherId))
    }

    @Test
    fun `a 403 entitlement denial is not a dead token - no rotation no wipe`() {
        transport.always403 = true
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        assertEquals(CacheStatus.DENIED_AUTH, service.cacheStatus(contentId))
        assertEquals(0, authDeadCalls.get())
        assertTrue(refreshedSessions.isEmpty())
    }

    @Test
    fun `a transport failure leaves an observable error status and no entry`() {
        transport.failDownloads = true
        val service = newService()
        assertEquals(CacheStatus.STARTED, service.ensureLocal(contentId, "pdf", null))
        assertTrue(service.cacheStatus(contentId).startsWith("error:"))
        assertTrue(service.catalogEntries().isEmpty())
        assertFalse(fileStore.exists(contentId))
        // The terminal error row clears on the next ensureLocal so a retry is possible.
        assertEquals(CacheStatus.STARTED, service.ensureLocal(contentId, "pdf", null))
    }

    @Test
    fun `a cooperative cancel mid-flight removes the partial object`() {
        val service = newService()
        transport.betweenChunks = { service.cancelDownload(contentId) }
        assertEquals(CacheStatus.STARTED, service.ensureLocal(contentId, "pdf", null))
        assertEquals(CacheStatus.ABSENT, service.cacheStatus(contentId))
        assertFalse(fileStore.exists(contentId))
        assertTrue(service.catalogEntries().isEmpty())
    }

    // ---- openLocal -------------------------------------------------------

    @Test
    fun `an online open re-checks authorization then opens the native viewer`() {
        transport.authorize = AuthorizationResult.ALLOWED
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        val before = now
        now = now.plusSeconds(3600)
        assertEquals(CacheStatus.OPENED, service.openLocal(contentId))
        assertEquals(contentId, openedEntries.single().contentId)
        assertEquals(now, service.catalogEntries().single().lastConfirmedAt)
        assertTrue(before.isBefore(service.catalogEntries().single().lastAccessAt))
    }

    @Test
    fun `an online open with a server denial answers denied_auth and never opens`() {
        transport.authorize = AuthorizationResult.DENIED
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        assertEquals(CacheStatus.DENIED_AUTH, service.openLocal(contentId))
        assertTrue(openedEntries.isEmpty())
    }

    @Test
    fun `an online open without a native session answers denied_native_session`() {
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        session = null
        assertEquals(CacheStatus.DENIED_NATIVE_SESSION, service.openLocal(contentId))
    }

    @Test
    fun `an unreachable verify endpoint falls back to the offline durability rule`() {
        transport.authorize = AuthorizationResult.UNAVAILABLE
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        assertEquals(CacheStatus.OPENED, service.openLocal(contentId))
    }

    @Test
    fun `an offline open with a future stored entitlement expiry opens without any network`() {
        val service = newService()
        transport.entitlementExpiresAt = now.plusSeconds(60L * 60L * 72)
        service.ensureLocal(contentId, "pdf", null)
        online = false
        session = null
        now = now.plusSeconds(60L * 60L * 71) // still before the stored server-issued expiry
        assertEquals(CacheStatus.OPENED, service.openLocal(contentId))
        assertEquals(contentId, openedEntries.single().contentId)
    }

    @Test
    fun `an offline open past the stored entitlement expiry answers denied_stale`() {
        val service = newService()
        transport.entitlementExpiresAt = now.plusSeconds(60L * 60L)
        service.ensureLocal(contentId, "pdf", null)
        online = false
        session = null
        now = now.plusSeconds(60L * 60L * 2) // past the stored server-issued expiry
        assertEquals(CacheStatus.DENIED_STALE, service.openLocal(contentId))
        assertTrue(openedEntries.isEmpty())
    }

    @Test
    fun `an entry without stored expiry stays openable offline - durable ciphertext policy`() {
        val service = newService()
        transport.entitlementExpiresAt = null // server issued no expiry claim with the token
        service.ensureLocal(contentId, "pdf", null)
        online = false
        session = null
        now = now.plusSeconds(60L * 60L * 24 * 90) // 90 days later — no hour-count gate exists
        assertEquals(CacheStatus.OPENED, service.openLocal(contentId))
        assertEquals(contentId, openedEntries.single().contentId)
    }

    @Test
    fun `offline ensureLocal with an expired stored expiry answers denied_stale`() {
        val service = newService()
        transport.entitlementExpiresAt = now.plusSeconds(60L)
        service.ensureLocal(contentId, "pdf", null)
        online = false
        now = now.plusSeconds(120L)
        assertEquals(CacheStatus.DENIED_STALE, service.ensureLocal(contentId, "pdf", null))
    }

    @Test
    fun `a downloaded entry persists the entitlement expiry it was granted with`() {
        val service = newService()
        transport.entitlementExpiresAt = Instant.parse("2026-03-05T00:00:00Z")
        service.ensureLocal(contentId, "pdf", null)
        assertEquals(Instant.parse("2026-03-05T00:00:00Z"), service.catalogEntries().single().entitlementExpiresAt)
    }

    @Test
    fun `opening an unknown contentId answers missing`() {
        assertEquals(CacheStatus.MISSING, newService().openLocal(contentId))
    }

    // ---- removal / listing / wipe ------------------------------------------

    @Test
    fun `removeCached deletes the object and the index row`() {
        val service = newService()
        service.ensureLocal(contentId, "image", null)
        assertEquals(CacheStatus.REMOVED, service.removeCached(contentId))
        assertFalse(fileStore.exists(contentId))
        assertEquals(CacheStatus.ABSENT, service.cacheStatus(contentId))
        assertEquals(CacheStatus.ABSENT, service.removeCached(contentId))
    }

    @Test
    fun `cancelDownload without an in-flight download answers not_downloading`() {
        val service = newService()
        assertEquals(CacheStatus.ABSENT, service.cancelDownload(contentId))
        service.ensureLocal(contentId, "pdf", null)
        assertEquals(CacheStatus.NOT_DOWNLOADING, service.cancelDownload(contentId))
    }

    @Test
    fun `listCached exposes only safe fields as a JSON array`() {
        val service = newService()
        service.ensureLocal(contentId, "pdf", """{"title":"الدرس الأول"}""")
        val json = service.listCached()
        val array = JsonParser.parseString(json).asJsonArray
        assertEquals(1, array.size())
        val row = array[0].asJsonObject
        assertEquals(setOf("contentId", "type", "title", "bytes", "createdAt", "lastAccessAt"), row.keySet())
        assertEquals("الدرس الأول", row.get("title").asString)
        assertEquals("pdf", row.get("type").asString)
    }

    @Test
    fun `wipe clears files entries and in-flight bookkeeping`() {
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        service.ensureLocal(otherId, "audio", null)
        service.wipe()
        assertTrue(service.catalogEntries().isEmpty())
        assertEquals(CacheStatus.EMPTY_LIST_JSON, service.listCached())
        assertEquals(CacheStatus.ABSENT, service.cacheStatus(contentId))
        assertFalse(fileStore.exists(contentId))
        assertFalse(fileStore.exists(otherId))
        assertEquals(0, fileStore.deleteAll())
    }

    @Test
    fun `clearCache answers cleared and empties the store`() {
        val service = newService()
        service.ensureLocal(contentId, "pdf", null)
        assertEquals(CacheStatus.CLEARED, service.clearCache())
        assertTrue(service.catalogEntries().isEmpty())
    }

    // ---- quota ------------------------------------------------------------

    @Test
    fun `exceeding the cap evicts the least recently used completed entries`() {
        val service = newService(quotaBytes = 100)
        transport.payloadBytes = 60
        service.ensureLocal(contentId, "pdf", null) // 60 bytes, accessed at T0
        now = now.plusSeconds(60)
        transport.payloadBytes = 30
        service.ensureLocal(otherId, "pdf", null) // 30 bytes, accessed at T1
        now = now.plusSeconds(60)
        transport.payloadBytes = 50
        val third = "99999999-8888-4777-8666-555555555555"
        assertEquals(CacheStatus.STARTED, service.ensureLocal(third, "pdf", null))
        // 60 + 30 + 50 = 140 > 100 → the LRU entry (contentId, 60 bytes) is evicted.
        assertEquals(setOf(otherId, third), service.catalogEntries().map { it.contentId }.toSet())
        assertFalse(fileStore.exists(contentId))
        assertTrue(fileStore.exists(otherId))
    }

    @Test
    fun `an object that can never fit the cap is refused with a quota error`() {
        val service = newService(quotaBytes = 100)
        transport.payloadBytes = 200
        assertEquals(CacheStatus.STARTED, service.ensureLocal(contentId, "pdf", null))
        assertEquals("error:quota", service.cacheStatus(contentId))
        assertTrue(service.catalogEntries().isEmpty())
        assertFalse(fileStore.exists(contentId))
    }

    // ---- fake transport ----------------------------------------------------

    private class FakeTransport : MediaContentTransport {

        var authorize: AuthorizationResult = AuthorizationResult.ALLOWED
        var always401 = false
        var always403 = false
        var failDownloads = false
        var respondWith401Once = false
        var payloadBytes = 2048L
        var betweenChunks: () -> Unit = {}
        val downloadCalls = AtomicInteger(0)
        var lastDownloadedBytes = -1L
        var entitlementExpiresAt: Instant? = null

        override fun currentEntitlementToken(): String? = "signed-entitlement-token"

        override fun currentEntitlementExpiresAt(): Instant? = entitlementExpiresAt

        override fun isAuthorized(contentId: String): AuthorizationResult = authorize

        override fun download(
            contentId: String,
            sink: () -> OutputStream,
            onProgress: (percent: Int) -> Unit,
            isCanceled: () -> Boolean
        ): Long {
            downloadCalls.incrementAndGet()
            if (always401 || respondWith401Once) {
                respondWith401Once = false
                throw TransportAuthorizationException(401)
            }
            if (always403) throw TransportAuthorizationException(403)
            if (failDownloads) throw IllegalStateException("transport down")
            val chunkSize = 64
            var copied = 0L
            sink().use { output ->
                while (copied < payloadBytes) {
                    betweenChunks()
                    if (isCanceled()) throw MediaDownloadCanceledException()
                    val size = (payloadBytes - copied).coerceAtMost(chunkSize.toLong()).toInt()
                    output.write(ByteArray(size))
                    copied += size
                    onProgress(((copied * 100) / payloadBytes).toInt().coerceIn(0, 100))
                }
            }
            lastDownloadedBytes = copied
            return copied
        }
    }
}
