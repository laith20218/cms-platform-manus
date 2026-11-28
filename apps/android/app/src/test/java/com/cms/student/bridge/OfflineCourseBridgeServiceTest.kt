package com.cms.student.bridge

import com.cms.student.media.ChunkWriter
import com.cms.student.media.CachePolicy
import com.cms.student.media.FakeChunkedFileStore
import com.cms.student.security.OfflineSession
import com.google.gson.JsonParser
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Wave 5b-i JVM tests for [OfflineCourseBridgeService] — pure fakes (the
 * transport facade and the chunk store), no Android types, mirroring
 * [OfflinePackageBridgeServiceTest]. Status codes are asserted EXACTLY as the
 * frozen W1 web contract (apps/student-web/src/utils/native-courses.ts) maps
 * them; rows are parsed back with Gson to lock the JSON shape (null fields
 * omitted).
 */
class OfflineCourseBridgeServiceTest {

    private val episodeId = "11111111-2222-4333-8444-555555555555"
    private val courseId = "22222222-3333-4444-5555-666666666666"
    private val subjectId = UUID.fromString("33333333-4444-5555-6666-777777777777")
    private val installation = "installation-course"
    private val now = Instant.parse("2026-12-01T12:00:00Z")
    private val nativeSession = OfflineSession(
        UUID.fromString("44444444-5555-6666-7777-888888888888"),
        "native-access-token",
        installation
    )

    // ------------------------------------------------------------------
    // Fakes
    // ------------------------------------------------------------------

    /** Facade that records calls; the outcome/error lambdas fake the transport. */
    private class FakeFacade : CourseEpisodeDownloadFacade {
        var outcome = CourseEpisodeDownloadOutcome(bytes = 2048, contentType = "video/mp4", entitlementExpiresAt = null)
        var error: CourseDownloadException? = null
        var runtimeError: RuntimeException? = null
        val sessions = mutableListOf<OfflineSession>()
        val subjects = mutableListOf<UUID>()
        val episodes = mutableListOf<UUID>()
        var onEnter: () -> Unit = {}

        override fun download(
            session: OfflineSession,
            subjectId: UUID,
            episodeId: UUID,
            sink: ChunkWriter,
            onProgress: (Int) -> Unit,
            isCanceled: () -> Boolean
        ): CourseEpisodeDownloadOutcome {
            onEnter()
            sessions += session
            subjects += subjectId
            episodes += episodeId
            error?.let { throw it }
            runtimeError?.let { throw it }
            var written = 0L
            while (written < outcome.bytes) {
                if (isCanceled()) throw CourseDownloadException(null)
                val size = minOf(64L, outcome.bytes - written).toInt()
                sink.write(ByteArray(size), size)
                written += size
                onProgress(((written * 100) / outcome.bytes).toInt().coerceIn(0, 100))
            }
            return outcome
        }
    }

    /** Executor that never runs anything — proves the fast path stays offline. */
    private class FrozenExecutor : Executor {
        val runnables = mutableListOf<Runnable>()
        override fun execute(command: Runnable) {
            runnables += command
        }
    }

    private fun service(
        facade: CourseEpisodeDownloadFacade = FakeFacade(),
        store: FakeChunkedFileStore = FakeChunkedFileStore(),
        session: OfflineSession? = nativeSession,
        executor: Executor = Executor { it.run() },
        mediaBytes: () -> Long = { 0L },
        playerLauncher: (String) -> Unit = {},
        listMax: Int = 200
    ): OfflineCourseBridgeService = OfflineCourseBridgeService(
        transport = facade,
        chunkStore = store,
        sessionProvider = { session },
        installationId = { installation },
        executor = executor,
        clock = { now },
        mediaBytesUsed = mediaBytes,
        playerLauncher = playerLauncher,
        episodeListMax = listMax
    )

    private fun requestJson(
        episode: String = episodeId,
        course: String? = courseId,
        subject: UUID? = subjectId,
        title: String? = "الحلقة الأولى",
        assetType: String? = "video"
    ): String {
        val fields = mutableListOf("\"episodeId\":\"$episode\"")
        course?.let { fields += "\"courseId\":\"$it\"" }
        subject?.let { fields += "\"subjectId\":\"$it\"" }
        title?.let { fields += "\"title\":\"${it.replace("\"", "\\\"")}\"" }
        assetType?.let { fields += "\"assetType\":\"$it\"" }
        return "{${fields.joinToString(",")}}"
    }

    // ------------------------------------------------------------------
    // Listing
    // ------------------------------------------------------------------

    @Test
    fun `list answers an empty array with nothing stored`() {
        assertEquals(OfflineCourseBridgeService.EMPTY_LIST_JSON, service().listOfflineCourseEpisodes())
    }

    @Test
    fun `list rows carry the w1 contract fields and omit nulls`() {
        val store = FakeChunkedFileStore()
        val facade = FakeFacade()
        val bridge = service(facade = facade, store = store)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        val rows = JsonParser.parseString(bridge.listOfflineCourseEpisodes()).asJsonArray
        assertEquals(1, rows.size())
        val row = rows[0].asJsonObject
        assertEquals(episodeId, row["episodeId"].asString)
        assertEquals("video", row["type"].asString)
        assertEquals(2048L, row["bytes"].asLong)
        assertTrue(row.has("downloadedAt"))
        assertTrue(row.has("lastAccessAt"))
        // The freshly downloaded row carries courseId/title from the request.
        assertEquals(courseId, row["courseId"].asString)
        assertEquals("الحلقة الأولى", row["title"].asString)
        // A seeded row (no optional fields) omits them entirely.
        val seededStore = FakeChunkedFileStore()
        seededStore.publish("99999999-9999-4999-8999-999999999999", 10)
        val seeded = JsonParser.parseString(service(store = seededStore).listOfflineCourseEpisodes()).asJsonArray
        assertTrue(!seeded[0].asJsonObject.has("courseId"))
        assertTrue(!seeded[0].asJsonObject.has("title"))
    }

    @Test
    fun `list caps at the episode list max and orders newest first`() {
        val store = FakeChunkedFileStore()
        store.publish("11111111-0000-4000-8000-000000000001", 10, at = now.minusSeconds(3600))
        store.publish("11111111-0000-4000-8000-000000000002", 20, at = now.minusSeconds(1800))
        store.publish("11111111-0000-4000-8000-000000000003", 30, at = now)
        val listed = service(store = store, listMax = 2).listOfflineCourseEpisodes()
        val rows = JsonParser.parseString(listed).asJsonArray
        assertEquals(2, rows.size())
        assertEquals("11111111-0000-4000-8000-000000000003", rows[0].asJsonObject["episodeId"].asString)
        assertEquals("11111111-0000-4000-8000-000000000002", rows[1].asJsonObject["episodeId"].asString)
    }

    // ------------------------------------------------------------------
    // ensureCourseEpisodeLocal — argument validation
    // ------------------------------------------------------------------

    @Test
    fun `malformed episode requests answer invalid_args and never enqueue`() {
        val facade = FakeFacade()
        val frozen = FrozenExecutor()
        val bridge = service(facade = facade, executor = frozen)
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal(null))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal(""))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal("   "))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal("not-json"))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal("[]"))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal("""{"episodeId":"not-a-uuid"}"""))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal("""{"episodeId":"../../etc/passwd"}"""))
        // A malformed OPTIONAL uuid invalidates the whole request (fail closed).
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal("""{"episodeId":"$episodeId","courseId":"zzz"}"""))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal("""{"episodeId":"$episodeId","subjectId":"zzz"}"""))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal(requestJson(assetType = "youtube")))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.ensureCourseEpisodeLocal(requestJson(title = "x".repeat(257))))
        assertEquals(
            OfflineCourseBridgeService.INVALID_ARGS,
            bridge.ensureCourseEpisodeLocal("{\"episodeId\":\"$episodeId\",\"title\":\"" + "x".repeat(8 * 1024) + "\"}")
        )
        assertTrue(facade.episodes.isEmpty())
        assertTrue(frozen.runnables.isEmpty())
    }

    // ------------------------------------------------------------------
    // ensureCourseEpisodeLocal — fast path + session resolution
    // ------------------------------------------------------------------

    @Test
    fun `a stored usable episode answers ready from a pure store read`() {
        val store = FakeChunkedFileStore()
        store.publish(episodeId, bytes = 10)
        val facade = FakeFacade()
        val frozen = FrozenExecutor()
        // Even with NO session at all the fast path holds — no network, no facade.
        val bridge = service(facade = facade, store = store, session = null, executor = frozen)
        assertEquals(OfflineCourseBridgeService.READY, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertTrue(facade.episodes.isEmpty())
        assertTrue(frozen.runnables.isEmpty())
    }

    @Test
    fun `a stored episode with a future entitlement expiry answers ready`() {
        val store = FakeChunkedFileStore()
        store.publish(episodeId, bytes = 10, entitlementExpiresAt = now.plusSeconds(3600).toString())
        assertEquals(OfflineCourseBridgeService.READY, service(store = store, session = null).ensureCourseEpisodeLocal(requestJson()))
    }

    @Test
    fun `a stored episode with a passed entitlement expiry is not ready and demands a session`() {
        val store = FakeChunkedFileStore()
        store.publish(episodeId, bytes = 10, entitlementExpiresAt = now.minusSeconds(60).toString())
        assertEquals(
            OfflineCourseBridgeService.DENIED_NATIVE_SESSION,
            service(store = store, session = null).ensureCourseEpisodeLocal(requestJson())
        )
        assertEquals(
            OfflineCourseBridgeService.DENIED_STALE,
            service(store = store, session = null).courseEpisodeStatus(episodeId)
        )
    }

    @Test
    fun `no native session answers denied_native_session honestly`() {
        val facade = FakeFacade()
        val frozen = FrozenExecutor()
        assertEquals(
            OfflineCourseBridgeService.DENIED_NATIVE_SESSION,
            service(facade = facade, session = null, executor = frozen).ensureCourseEpisodeLocal(requestJson())
        )
        assertTrue(facade.episodes.isEmpty())
        assertTrue(frozen.runnables.isEmpty())
    }

    @Test
    fun `a session from another installation is denied`() {
        val foreign = OfflineSession(nativeSession.studentId, "token", "other-installation")
        assertEquals(
            OfflineCourseBridgeService.DENIED_NATIVE_SESSION,
            service(session = foreign).ensureCourseEpisodeLocal(requestJson())
        )
    }

    @Test
    fun `a request without subjectId answers the honest subject_required error`() {
        val facade = FakeFacade()
        val frozen = FrozenExecutor()
        val bridge = service(facade = facade, executor = frozen)
        // Course-episode entitlement issuance is subject-scoped: no subject, no download.
        assertEquals(
            "${OfflineCourseBridgeService.ERROR}:subject_required",
            bridge.ensureCourseEpisodeLocal(requestJson(subject = null))
        )
        // The status row reports the same honest code (observable until re-observed by ensure).
        assertEquals(
            "${OfflineCourseBridgeService.ERROR}:subject_required",
            bridge.courseEpisodeStatus(episodeId)
        )
        // The terminal row is answered once more by a repeated CTA click, then cleared…
        assertEquals(
            "${OfflineCourseBridgeService.ERROR}:subject_required",
            bridge.ensureCourseEpisodeLocal(requestJson(subject = null))
        )
        // …so a request WITH the subject retries fresh and proceeds.
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals(1, frozen.runnables.size)
        assertTrue(facade.episodes.isEmpty())
    }

    // ------------------------------------------------------------------
    // Download engine — success path
    // ------------------------------------------------------------------

    @Test
    fun `a happy download streams into the chunk store and persists the meta`() {
        val store = FakeChunkedFileStore()
        val facade = FakeFacade()
        facade.outcome = CourseEpisodeDownloadOutcome(
            bytes = 5000,
            contentType = "audio/mpeg",
            entitlementExpiresAt = now.plusSeconds(7200)
        )
        val bridge = service(facade = facade, store = store)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson(assetType = "audio")))
        // Facade saw the resolved native session, the request subject, and the episode UUID.
        assertEquals(listOf(nativeSession), facade.sessions)
        assertEquals(listOf(subjectId), facade.subjects)
        assertEquals(listOf(UUID.fromString(episodeId)), facade.episodes)
        // Chunks rolled at the policy boundary: 5000 bytes → 1 chunk of 5000.
        assertEquals(1, store.chunksOf(episodeId)!!.size)
        assertEquals(5000, store.chunksOf(episodeId)!!.first().size)
        // Meta persisted with the transport-reported fields.
        val meta = store.readMeta(episodeId)
        assertNotNull(meta)
        assertEquals("audio", meta!!.type)
        assertEquals(courseId, meta.courseId)
        assertEquals(subjectId.toString(), meta.subjectId)
        assertEquals("الحلقة الأولى", meta.title)
        assertEquals("audio/mpeg", meta.contentType)
        assertEquals(5000L, meta.totalBytes)
        assertEquals(1, meta.chunkCount)
        assertEquals(now.toString(), meta.createdAt)
        assertEquals(now.plusSeconds(7200).toString(), meta.entitlementExpiresAt)
        // Terminal success: the state row is gone; the store answers ready.
        assertEquals(OfflineCourseBridgeService.READY, bridge.courseEpisodeStatus(episodeId))
    }

    @Test
    fun `assetType course-episode is treated as video`() {
        val store = FakeChunkedFileStore()
        val facade = FakeFacade()
        service(facade = facade, store = store).ensureCourseEpisodeLocal(requestJson(assetType = "course-episode"))
        assertEquals("video", store.readMeta(episodeId)!!.type)
    }

    @Test
    fun `ensure while queued or downloading answers the in-flight codes`() {
        val facade = FakeFacade()
        val frozen = FrozenExecutor()
        val bridge = service(facade = facade, executor = frozen)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.courseEpisodeStatus(episodeId))
        var statusDuringDownload: String? = null
        facade.onEnter = { statusDuringDownload = bridge.courseEpisodeStatus(episodeId) }
        frozen.runnables.single().run()
        assertEquals(OfflineCourseBridgeService.DOWNLOADING, statusDuringDownload)
        // After completion the meta fast path answers ready.
        assertEquals(OfflineCourseBridgeService.READY, bridge.ensureCourseEpisodeLocal(requestJson()))
    }

    // ------------------------------------------------------------------
    // Download engine — failure mapping + cleanup
    // ------------------------------------------------------------------

    @Test
    fun `a 401 entitlement denial maps to denied_auth and cleans partial chunks`() {
        val store = FakeChunkedFileStore()
        val facade = FakeFacade()
        facade.error = CourseDownloadException(401)
        val bridge = service(facade = facade, store = store)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals(OfflineCourseBridgeService.DENIED_AUTH, bridge.courseEpisodeStatus(episodeId))
        assertNull(store.readMeta(episodeId))
        assertNull(store.chunksOf(episodeId))
        // Terminal row observable once, then a fresh retry is possible.
        assertEquals(OfflineCourseBridgeService.DENIED_AUTH, bridge.ensureCourseEpisodeLocal(requestJson()))
        facade.error = null
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
    }

    @Test
    fun `a 403 maps to denied_auth as well`() {
        val facade = FakeFacade()
        facade.error = CourseDownloadException(403)
        val bridge = service(facade = facade)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals(OfflineCourseBridgeService.DENIED_AUTH, bridge.courseEpisodeStatus(episodeId))
    }

    @Test
    fun `a network failure without an http verdict maps to error network`() {
        val facade = FakeFacade()
        facade.error = CourseDownloadException(null)
        val bridge = service(facade = facade)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals("${OfflineCourseBridgeService.ERROR}:network", bridge.courseEpisodeStatus(episodeId))
    }

    @Test
    fun `an endpoint failure maps to error http code`() {
        val facade = FakeFacade()
        facade.error = CourseDownloadException(500)
        val bridge = service(facade = facade)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals("${OfflineCourseBridgeService.ERROR}:http_500", bridge.courseEpisodeStatus(episodeId))
    }

    @Test
    fun `an unexpected facade failure maps to the generic error and cleans the store`() {
        val store = FakeChunkedFileStore()
        val facade = FakeFacade()
        facade.runtimeError = IllegalStateException("boom")
        val bridge = service(facade = facade, store = store)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals("${OfflineCourseBridgeService.ERROR}:download_failed", bridge.courseEpisodeStatus(episodeId))
        assertNull(store.readMeta(episodeId))
    }

    @Test
    fun `a failed meta persistence maps to error store`() {
        val store = FakeChunkedFileStore()
        store.failWriteMeta = true
        val facade = FakeFacade()
        val bridge = service(facade = facade, store = store)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals("${OfflineCourseBridgeService.ERROR}:store", bridge.courseEpisodeStatus(episodeId))
        assertNull(store.readMeta(episodeId))
        assertNull(store.chunksOf(episodeId))
    }

    // ------------------------------------------------------------------
    // Quota (combined 5 GiB cap, honest)
    // ------------------------------------------------------------------

    @Test
    fun `a fresh episode that alone busts the combined cap is deleted and refused`() {
        val store = FakeChunkedFileStore()
        val facade = FakeFacade()
        facade.outcome = CourseEpisodeDownloadOutcome(bytes = 1000)
        val bridge = service(facade = facade, store = store, mediaBytes = { CachePolicy.MAX_CACHE_BYTES + 1 })
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals("${OfflineCourseBridgeService.ERROR}:quota", bridge.courseEpisodeStatus(episodeId))
        assertNull(store.readMeta(episodeId))
        assertNull(store.chunksOf(episodeId))
        assertEquals(OfflineCourseBridgeService.EMPTY_LIST_JSON, bridge.listOfflineCourseEpisodes())
    }

    @Test
    fun `an over-cap download is refused and existing episodes are never evicted`() {
        // Owner decision (offline-experience implementation, 2026-11-28): NO automatic
        // eviction. The fresh episode is deleted, the state answers error:quota, and
        // every previously stored episode stays intact.
        val store = FakeChunkedFileStore()
        val older = "11111111-0000-4000-8000-000000000001"
        val newer = "11111111-0000-4000-8000-000000000002"
        store.publish(older, bytes = 3000, at = now.minusSeconds(7200))
        store.publish(newer, bytes = 2000, at = now.minusSeconds(3600))
        val facade = FakeFacade()
        facade.outcome = CourseEpisodeDownloadOutcome(bytes = 500)
        // The shared-cap math is exercised with byte-sized fixtures: the library
        // cache already holds (cap - 5000) bytes, so the projected total crosses the
        // 10 GiB cap exactly like a multi-GiB episode would.
        val bridge = service(facade = facade, store = store, mediaBytes = { CachePolicy.MAX_CACHE_BYTES - 5000 })
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        // Projected shared total exceeds the cap: the FRESH episode is refused...
        assertEquals("${OfflineCourseBridgeService.ERROR}:quota", bridge.courseEpisodeStatus(episodeId))
        assertNull(store.readMeta(episodeId))
        assertNull(store.chunksOf(episodeId))
        // ...and BOTH pre-existing episodes remain (no LRU eviction, ever).
        assertNotNull(store.readMeta(older))
        assertNotNull(store.readMeta(newer))
    }

    // ------------------------------------------------------------------
    // remove / status / open / reset
    // ------------------------------------------------------------------

    @Test
    fun `remove deletes chunks and meta and answers removed then absent`() {
        val store = FakeChunkedFileStore()
        val bridge = service(store = store)
        bridge.ensureCourseEpisodeLocal(requestJson())
        assertEquals(OfflineCourseBridgeService.REMOVED, bridge.removeOfflineCourseEpisode(episodeId))
        assertNull(store.readMeta(episodeId))
        assertNull(store.chunksOf(episodeId))
        assertEquals(OfflineCourseBridgeService.ABSENT, bridge.courseEpisodeStatus(episodeId))
        assertEquals(OfflineCourseBridgeService.ABSENT, bridge.removeOfflineCourseEpisode(episodeId))
    }

    @Test
    fun `remove cancels a queued download before it starts`() {
        val facade = FakeFacade()
        val frozen = FrozenExecutor()
        val bridge = service(facade = facade, executor = frozen)
        assertEquals(OfflineCourseBridgeService.QUEUED, bridge.ensureCourseEpisodeLocal(requestJson()))
        assertEquals(OfflineCourseBridgeService.REMOVED, bridge.removeOfflineCourseEpisode(episodeId))
        frozen.runnables.single().run()
        // The state row was removed while queued — the loop abandons silently.
        assertTrue(facade.episodes.isEmpty())
        assertEquals(OfflineCourseBridgeService.ABSENT, bridge.courseEpisodeStatus(episodeId))
    }

    @Test
    fun `status validates ids and answers absent for unknown episodes`() {
        val bridge = service()
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.courseEpisodeStatus(null))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.courseEpisodeStatus("not-a-uuid"))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.courseEpisodeStatus("x".repeat(300)))
        assertEquals(OfflineCourseBridgeService.ABSENT, bridge.courseEpisodeStatus(episodeId))
    }

    @Test
    fun `open launches the chunked player for a usable episode and answers opening`() {
        val store = FakeChunkedFileStore()
        store.publish(episodeId, bytes = 10)
        val launches = mutableListOf<String>()
        val bridge = service(store = store, playerLauncher = { launches += it })
        assertEquals(OfflineCourseBridgeService.OPENING, bridge.openOfflineCourseEpisode(episodeId))
        assertEquals(listOf(episodeId), launches)
    }

    @Test
    fun `open answers absent or stale honestly and never launches`() {
        val store = FakeChunkedFileStore()
        val launches = mutableListOf<String>()
        val bridge = service(store = store, playerLauncher = { launches += it })
        // Unknown id → absent (no meta, no chunks).
        assertEquals(OfflineCourseBridgeService.ABSENT, bridge.openOfflineCourseEpisode("99999999-9999-4999-8999-999999999999"))
        // Stored but the server-issued entitlement expiry has passed → denied_stale.
        store.publish(episodeId, bytes = 10, entitlementExpiresAt = "2026-11-01T00:00:00Z")
        assertEquals(OfflineCourseBridgeService.DENIED_STALE, bridge.openOfflineCourseEpisode(episodeId))
        // Malformed ids → invalid_args.
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.openOfflineCourseEpisode("not-a-uuid"))
        assertEquals(OfflineCourseBridgeService.INVALID_ARGS, bridge.openOfflineCourseEpisode(null))
        assertTrue(launches.isEmpty())
    }

    @Test
    fun `a throwing launcher degrades to an honest error code instead of throwing`() {
        val store = FakeChunkedFileStore()
        store.publish(episodeId, bytes = 10)
        val bridge = service(store = store, playerLauncher = { error("boom") })
        assertEquals("error:player_launch_failed", bridge.openOfflineCourseEpisode(episodeId))
    }

    @Test
    fun `reset clears in-memory states without store writes`() {
        val store = FakeChunkedFileStore()
        val facade = FakeFacade()
        facade.error = CourseDownloadException(401)
        val bridge = service(facade = facade, store = store)
        bridge.ensureCourseEpisodeLocal(requestJson())
        assertEquals(OfflineCourseBridgeService.DENIED_AUTH, bridge.courseEpisodeStatus(episodeId))
        bridge.reset()
        assertEquals(OfflineCourseBridgeService.ABSENT, bridge.courseEpisodeStatus(episodeId))
        assertEquals(0, store.deleteAllCalls)
        // The wipe wiring (CmsApplication) owns chunkStore.deleteAll directly.
    }
}
