package com.cms.student.bridge

import com.cms.student.security.OfflineAnswer
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineTransportException
import com.cms.student.security.RevocationStatus
import com.cms.student.security.StoredOfflinePackage
import com.google.gson.JsonParser
import java.time.Instant
import java.util.Base64
import java.util.UUID
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * W2 (UX 3C) JVM tests for [OfflinePackageBridgeService] — pure fakes, no
 * Android types. The web-token path uses a REAL hand-built unsigned JWT
 * ("header.payload.sig", base64url payload) exactly like the student-web
 * session token the W1 CTA forwards; the facade/store fakes mirror the
 * coordinator contracts.
 */
class OfflinePackageBridgeServiceTest {

    private val userId = UUID.fromString("11111111-1111-1111-1111-111111111111")
    private val subjectId = UUID.fromString("22222222-2222-2222-2222-222222222222")
    private val otherSubjectId = UUID.fromString("33333333-3333-3333-3333-333333333333")
    private val packageId = UUID.fromString("55555555-5555-5555-5555-555555555555")
    private val installation = "installation-a"
    private val now = Instant.parse("2026-12-01T12:00:00Z")

    // ------------------------------------------------------------------
    // Fakes
    // ------------------------------------------------------------------

    /** Binding-checked in-memory store; invalidations + wipes counted for remove/wipe assertions. */
    private class FakeStore(initial: List<StoredOfflinePackage> = emptyList()) : com.cms.student.security.IOfflinePackageStore {
        private val records = initial.associateBy { it.envelope.manifest.packageId }.toMutableMap()
        var invalidations = 0
        var wipeAllCalls = 0
            private set

        val size: Int get() = records.size

        private fun binding(record: StoredOfflinePackage, userId: UUID, installationId: String) =
            record.envelope.manifest.userId == userId && record.envelope.manifest.installationId == installationId

        override fun saveEnvelope(envelope: com.cms.student.security.OfflinePackageEnvelope, userId: UUID, installationId: String) {
            records[envelope.manifest.packageId] = StoredOfflinePackage(1, envelope, RevocationStatus.UNKNOWN, null, emptyList())
        }

        override fun load(packageId: UUID, userId: UUID, installationId: String): StoredOfflinePackage? =
            records[packageId]?.takeIf { binding(it, userId, installationId) }

        override fun listAll(userId: UUID, installationId: String): List<StoredOfflinePackage> =
            records.values.filter { binding(it, userId, installationId) }
                .sortedByDescending { it.envelope.manifest.issuedAt }

        override fun replaceQuestionIndex(packageId: UUID, questionIds: Collection<UUID>, userId: UUID, installationId: String) {
            val current = records[packageId]?.takeIf { binding(it, userId, installationId) } ?: return
            records[packageId] = current.copy(questionIds = questionIds.toList())
        }

        override fun recordAnswer(answer: OfflineAnswer, userId: UUID, installationId: String): Boolean = false

        override fun pendingAnswers(packageId: UUID, userId: UUID, installationId: String): List<OfflineAnswer> = emptyList()

        override fun markAnswersSynced(packageId: UUID, localAttemptIds: Collection<UUID>, userId: UUID, installationId: String) = Unit

        override fun updateConfirmedStatus(packageId: UUID, status: RevocationStatus, confirmedAt: Instant?, userId: UUID, installationId: String) {
            val current = records[packageId] ?: return
            records[packageId] = current.copy(lastConfirmedStatus = status, lastConfirmedAt = confirmedAt)
        }

        override fun invalidate(packageId: UUID, userId: UUID, installationId: String) {
            val record = records[packageId] ?: return
            if (binding(record, userId, installationId) && records.remove(packageId) != null) invalidations++
        }

        /** Phase P (containment): counted full wipe — mirrors the production
         *  EncryptedOfflinePackageStore contract (clears every record, never throws). */
        override fun wipeAll() {
            wipeAllCalls++
            records.clear()
        }
    }

    /** Facade that records every call; the outcome lambda fakes the coordinator result. */
    private class RecordingFacade(
        private val outcome: (OfflineSession, UUID, UUID?) -> UUID?
    ) : AuthenticatedOfflineRuntimeFacade {
        val sessions = mutableListOf<OfflineSession>()
        val subjects = mutableListOf<UUID>()
        val exams = mutableListOf<UUID?>()

        override fun download(session: OfflineSession, subjectId: UUID, examId: UUID?): UUID? {
            sessions += session
            subjects += subjectId
            exams += examId
            return outcome(session, subjectId, examId)
        }
    }

    /** Executor that never runs anything — proves the fast path stays offline. */
    private class FrozenExecutor : Executor {
        val runnables = mutableListOf<Runnable>()
        override fun execute(command: Runnable) {
            runnables += command
        }
    }

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    private fun envelope(
        pkgId: UUID = packageId,
        owner: UUID = userId,
        subjects: List<UUID> = listOf(subjectId),
        issuedAt: Instant = now.minusSeconds(60),
        expiresAt: Instant = now.plusSeconds(3600)
    ) = com.cms.student.security.OfflinePackageEnvelope(
        com.cms.student.security.OfflinePackageManifest(pkgId, owner, installation, 1, subjects, issuedAt, expiresAt, "nonce", "aad", "signature"),
        "ciphertext", "tag", "wrapped", "release-token"
    )

    private fun storedPackage(
        pkgId: UUID = packageId,
        status: RevocationStatus = RevocationStatus.ACTIVE,
        expiresAt: Instant = now.plusSeconds(3600),
        questionIds: List<UUID> = emptyList(),
        answers: List<OfflineAnswer> = emptyList()
    ): StoredOfflinePackage = StoredOfflinePackage(
        version = 1,
        envelope = envelope(pkgId = pkgId, expiresAt = expiresAt),
        lastConfirmedStatus = status,
        lastConfirmedAt = now,
        answers = answers,
        questionIds = questionIds
    )

    /** Real unsigned JWT shape: base64url(header).base64url(payload).signature. */
    private fun webJwt(subject: String, expiresAtEpochSeconds: Long = 9_999_999_999L): String {
        val header = Base64.getUrlEncoder().withoutPadding().encodeToString("""{"alg":"none"}""".toByteArray())
        val payload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("""{"sub":"$subject","exp":$expiresAtEpochSeconds}""".toByteArray())
        return "$header.$payload.sig"
    }

    private fun service(
        runtime: () -> AuthenticatedOfflineRuntimeFacade? = { RecordingFacade { _, _, _ -> null } },
        store: FakeStore = FakeStore(),
        nativeSession: OfflineSession? = null,
        executor: Executor = Executor { it.run() },
        listMax: Int = 200,
        examLauncher: (String) -> Unit = {}
    ): OfflinePackageBridgeService = OfflinePackageBridgeService(
        runtime = runtime,
        packageStore = store,
        sessionProvider = { nativeSession },
        installationId = { installation },
        executor = executor,
        clock = { now },
        examLauncher = examLauncher,
        packageListMax = listMax
    )

    private fun requestJson(subject: UUID, examId: UUID? = null, accessToken: String? = null): String {
        val fields = mutableListOf("\"subjectId\":\"$subject\"")
        examId?.let { fields += "\"examId\":\"$it\"" }
        accessToken?.let { fields += "\"accessToken\":\"$it\"" }
        return "{${fields.joinToString(",")}}"
    }

    // ------------------------------------------------------------------
    // Fail-closed gates
    // ------------------------------------------------------------------

    @Test
    fun `a disabled runtime denies downloads before any session or network work`() {
        val executor = FrozenExecutor()
        val service = service(runtime = { null }, executor = executor)
        assertEquals(
            OfflinePackageBridgeService.DENIED_DISABLED,
            service.downloadOfflinePackage(requestJson(subjectId))
        )
        assertTrue(executor.runnables.isEmpty())
    }

    @Test
    fun `no native session and no web token answers denied_native_session and an honest empty listing`() {
        val executor = FrozenExecutor()
        val facade = RecordingFacade { _, _, _ -> packageId }
        val service = service(runtime = { facade }, nativeSession = null, executor = executor, store = FakeStore(listOf(storedPackage())))
        assertEquals(
            OfflinePackageBridgeService.DENIED_NATIVE_SESSION,
            service.downloadOfflinePackage(requestJson(subjectId))
        )
        assertEquals(OfflinePackageBridgeService.EMPTY_LIST_JSON, service.listOfflinePackages())
        assertTrue(facade.sessions.isEmpty())
        assertTrue(executor.runnables.isEmpty())
    }

    @Test
    fun `malformed or non uuid requests answer invalid_args`() {
        val service = service()
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.downloadOfflinePackage(null))
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.downloadOfflinePackage("   "))
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.downloadOfflinePackage("{not-json"))
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.downloadOfflinePackage("""{"examId":"${UUID.randomUUID()}"}"""))
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.downloadOfflinePackage("""{"subjectId":"not-a-uuid"}"""))
        assertEquals(
            OfflinePackageBridgeService.INVALID_ARGS,
            service.downloadOfflinePackage("""{"subjectId":"$subjectId","title":"${"x".repeat(257)}"}""")
        )
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.offlinePackageStatus(null))
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.offlinePackageStatus("../../etc/passwd"))
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.removeOfflinePackage(""))
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, service.openOfflineExam(" "))
    }

    // ------------------------------------------------------------------
    // The web-token (ephemeral session) download path
    // ------------------------------------------------------------------

    @Test
    fun `a web token resolves an ephemeral session that reaches the facade and becomes ready`() {
        val token = webJwt(userId.toString())
        val store = FakeStore()
        val facade = RecordingFacade { session, _, _ ->
            // Mirrors the coordinator: the envelope is persisted before the id returns.
            store.saveEnvelope(envelope(), session.studentId, session.installationId)
            packageId
        }
        val service = service(runtime = { facade }, store = store, nativeSession = null)

        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId, accessToken = token)))

        // The facade saw the EPHEMERAL session: web subject, the page's own token, this install.
        assertEquals(1, facade.sessions.size)
        assertEquals(userId, facade.sessions.single().studentId)
        assertEquals(token, facade.sessions.single().accessToken)
        assertEquals(installation, facade.sessions.single().installationId)
        assertEquals(subjectId, facade.subjects.single())

        assertEquals(OfflinePackageBridgeService.READY, service.offlinePackageStatus(packageId.toString()))
    }

    @Test
    fun `an in-flight subject scope answers downloading instead of enqueueing twice`() {
        val executor = FrozenExecutor()
        val service = service(nativeSession = OfflineSession(userId, "native-token", installation), executor = executor)
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId)))
        assertEquals(OfflinePackageBridgeService.DOWNLOADING, service.downloadOfflinePackage(requestJson(subjectId)))
        assertEquals(1, executor.runnables.size)
    }

    @Test
    fun `a native session wins over the web token when both are present`() {
        val facade = RecordingFacade { _, _, _ -> packageId }
        val native = OfflineSession(userId, "native-token", installation)
        val service = service(runtime = { facade }, store = FakeStore(), nativeSession = native)
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId, accessToken = webJwt(userId.toString()))))
        assertEquals(1, facade.sessions.size)
        assertEquals("native-token", facade.sessions.single().accessToken)
    }

    @Test
    fun `transport failures map to the documented deny and error codes`() {
        fun serviceFor(statusCode: Int?) = service(
            runtime = { RecordingFacade { _, _, _ -> throw OfflineTransportException(statusCode, "boom") } },
            nativeSession = OfflineSession(userId, "native-token", installation)
        )
        // The start answers queued; the terminal code surfaces on the NEXT call
        // for the same scope (a failed download has no packageId to poll).
        val unauthorized = serviceFor(401)
        assertEquals(OfflinePackageBridgeService.QUEUED, unauthorized.downloadOfflinePackage(requestJson(subjectId)))
        assertEquals(OfflinePackageBridgeService.DENIED_AUTH, unauthorized.downloadOfflinePackage(requestJson(subjectId)))
        assertEquals(OfflinePackageBridgeService.QUEUED, unauthorized.downloadOfflinePackage(requestJson(subjectId)))

        val forbidden = serviceFor(403)
        forbidden.downloadOfflinePackage(requestJson(subjectId))
        assertEquals(OfflinePackageBridgeService.DENIED_AUTH, forbidden.downloadOfflinePackage(requestJson(subjectId)))

        val rateLimited = serviceFor(429)
        rateLimited.downloadOfflinePackage(requestJson(subjectId))
        assertEquals("error:rate_limited", rateLimited.downloadOfflinePackage(requestJson(subjectId)))

        val network = serviceFor(null)
        network.downloadOfflinePackage(requestJson(subjectId))
        assertEquals("error:network", network.downloadOfflinePackage(requestJson(subjectId)))

        val server = serviceFor(503)
        server.downloadOfflinePackage(requestJson(subjectId))
        assertEquals("error:http_503", server.downloadOfflinePackage(requestJson(subjectId)))
    }

    @Test
    fun `a null facade result is a download failure not a silent success`() {
        val service = service(nativeSession = OfflineSession(userId, "native-token", installation))
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId)))
        assertEquals("error:download_failed", service.downloadOfflinePackage(requestJson(subjectId)))
    }

    // ------------------------------------------------------------------
    // The ready fast path (pure store read, no network)
    // ------------------------------------------------------------------

    @Test
    fun `a pre-stored active package answers ready from the web token without running the executor`() {
        val executor = FrozenExecutor()
        val facade = RecordingFacade { _, _, _ -> packageId }
        val service = service(
            runtime = { facade },
            store = FakeStore(listOf(storedPackage())),
            nativeSession = null,
            executor = executor
        )
        assertEquals(
            OfflinePackageBridgeService.READY,
            service.downloadOfflinePackage(requestJson(subjectId, accessToken = webJwt(userId.toString())))
        )
        assertEquals(OfflinePackageBridgeService.READY, service.offlinePackageStatus(packageId.toString()))
        assertTrue(facade.sessions.isEmpty())
        assertTrue(executor.runnables.isEmpty())
    }

    @Test
    fun `the last web student keeps the fast path working for other subjects once the web session disappears`() {
        val token = webJwt(userId.toString())
        val otherPackageId = UUID.randomUUID()
        val store = FakeStore(
            listOf(
                // Pre-stored package for ANOTHER subject, bound to the same web student.
                storedPackage(pkgId = otherPackageId).copy(
                    envelope = envelope(pkgId = otherPackageId, subjects = listOf(otherSubjectId))
                )
            )
        )
        val facade = RecordingFacade { session, _, _ ->
            store.saveEnvelope(envelope(), session.studentId, session.installationId)
            packageId
        }
        // Runs inline AND records — proves the second download enqueues nothing.
        val executor = object : Executor {
            val executed = mutableListOf<Runnable>()
            override fun execute(command: Runnable) {
                executed += command
                command.run()
            }
        }
        val service = service(runtime = { facade }, store = store, nativeSession = null, executor = executor)

        // First download carries the web token, runs to completion, and binds
        // the last web student on success.
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId, accessToken = token)))
        assertEquals(1, facade.sessions.size)

        // The web page then drops its session (no token) and asks for the OTHER
        // subject — the last web-bound student still resolves the store binding
        // for the pure store read; no network, no executor.
        assertEquals(OfflinePackageBridgeService.READY, service.downloadOfflinePackage(requestJson(otherSubjectId)))
        assertEquals(1, facade.sessions.size)
        assertEquals(1, executor.executed.size) // only the first, token-carrying download ran
    }

    @Test
    fun `the fast path refuses unknown revoked or expired store packages`() {
        val executor = FrozenExecutor()
        val facade = RecordingFacade { _, _, _ -> packageId }
        val service = service(
            runtime = { facade },
            store = FakeStore(
                listOf(
                    storedPackage(status = RevocationStatus.REVOKED),
                    storedPackage(pkgId = UUID.randomUUID(), status = RevocationStatus.UNKNOWN),
                    storedPackage(pkgId = UUID.randomUUID(), expiresAt = now.minusSeconds(1))
                )
            ),
            nativeSession = OfflineSession(userId, "native-token", installation),
            executor = executor
        )
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId)))
        assertEquals(1, executor.runnables.size)
    }

    // ------------------------------------------------------------------
    // Listing rows — the exact W1 web contract shape
    // ------------------------------------------------------------------

    @Test
    fun `listing rows carry exactly the W1 web contract fields and no token or path material`() {
        val questionId = UUID.randomUUID()
        val answer = OfflineAnswer(
            localAttemptId = UUID.randomUUID(),
            packageId = packageId,
            questionId = questionId,
            selectedOptionId = UUID.randomUUID(),
            answeredAt = now,
            durationSeconds = 12,
            installationId = installation,
            synced = false
        )
        val store = FakeStore(listOf(storedPackage(questionIds = listOf(questionId), answers = listOf(answer))))
        val service = service(store = store, nativeSession = OfflineSession(userId, "native-token", installation))

        val raw = service.listOfflinePackages()
        val rows = JsonParser.parseString(raw).asJsonArray
        assertEquals(1, rows.size())
        val row = rows.single().asJsonObject
        assertEquals(packageId.toString(), row.get("packageId").asString)
        assertEquals(listOf(subjectId.toString()), row.get("subjectIds").asJsonArray.map { it.asString })
        assertEquals("active", row.get("status").asString)
        assertEquals(now.plusSeconds(3600).toString(), row.get("expiresAt").asString)
        assertEquals(1, row.get("questionCount").asInt)
        assertEquals(1, row.get("pendingAnswerCount").asInt)
        assertEquals(now.minusSeconds(60).toString(), row.get("downloadedAt").asString)
        // The envelope carries no display title — the field is OMITTED (the W1
        // web validator treats absence as undefined), never faked.
        assertFalse(row.has("title"))
        // No token or filesystem material ever crosses in a row.
        val serialized = raw.lowercase()
        assertFalse(serialized.contains("token"))
        assertFalse(serialized.contains("/"))
        assertFalse(serialized.contains("ciphertext"))
    }

    @Test
    fun `questionCount stays omitted while the question index is empty pre-open`() {
        val store = FakeStore(listOf(storedPackage()))
        val service = service(store = store, nativeSession = OfflineSession(userId, "native-token", installation))
        val row = JsonParser.parseString(service.listOfflinePackages()).asJsonArray.single().asJsonObject
        assertFalse(row.has("questionCount"))
        assertEquals(0, row.get("pendingAnswerCount").asInt)
    }

    @Test
    fun `the listing honors the row cap`() {
        val many = (1..3).map { index ->
            storedPackage(pkgId = UUID.randomUUID(), expiresAt = now.plusSeconds(index.toLong()))
        }
        val service = service(store = FakeStore(many), nativeSession = OfflineSession(userId, "native-token", installation), listMax = 2)
        assertEquals(2, JsonParser.parseString(service.listOfflinePackages()).asJsonArray.size())
    }

    // ------------------------------------------------------------------
    // Remove + open
    // ------------------------------------------------------------------

    @Test
    fun `remove invalidates a held package and status then reports absent`() {
        val store = FakeStore(listOf(storedPackage()))
        val service = service(store = store, nativeSession = OfflineSession(userId, "native-token", installation))
        assertEquals(OfflinePackageBridgeService.REMOVED, service.removeOfflinePackage(packageId.toString()))
        assertEquals(1, store.invalidations)
        assertEquals(OfflinePackageBridgeService.ABSENT, service.offlinePackageStatus(packageId.toString()))
        assertEquals(OfflinePackageBridgeService.ABSENT, service.removeOfflinePackage(packageId.toString()))
    }

    @Test
    fun `remove without any resolvable binding answers denied_native_session`() {
        val service = service(store = FakeStore(listOf(storedPackage())), nativeSession = null)
        assertEquals(OfflinePackageBridgeService.DENIED_NATIVE_SESSION, service.removeOfflinePackage(packageId.toString()))
    }

    @Test
    fun `openOfflineExam hands the launch to the exam launcher seam and answers opening`() {
        val launches = mutableListOf<String>()
        val service = service(
            store = FakeStore(listOf(storedPackage())),
            nativeSession = OfflineSession(userId, "native-token", installation),
            examLauncher = { launches += it }
        )
        assertEquals(OfflinePackageBridgeService.OPENING, service.openOfflineExam(packageId.toString()))
        assertEquals(listOf(packageId.toString()), launches)
    }

    @Test
    fun `openOfflineExam fails closed on every deny path and never fires the launcher`() {
        val launches = mutableListOf<String>()
        // Disabled runtime (BuildConfig OFF) denies regardless of session or store.
        val disabled = service(
            runtime = { null },
            store = FakeStore(listOf(storedPackage())),
            nativeSession = OfflineSession(userId, "native-token", installation),
            examLauncher = { launches += it }
        )
        assertEquals(OfflinePackageBridgeService.DENIED_DISABLED, disabled.openOfflineExam(packageId.toString()))
        // No resolvable store binding: no native session and no last web student.
        val unbound = service(store = FakeStore(listOf(storedPackage())), nativeSession = null, examLauncher = { launches += it })
        assertEquals(OfflinePackageBridgeService.DENIED_NATIVE_SESSION, unbound.openOfflineExam(packageId.toString()))
        // Bound student but no stored record for THIS package id.
        val absent = service(
            store = FakeStore(listOf(storedPackage(pkgId = UUID.randomUUID()))),
            nativeSession = OfflineSession(userId, "native-token", installation),
            examLauncher = { launches += it }
        )
        assertEquals(OfflinePackageBridgeService.ABSENT, absent.openOfflineExam(packageId.toString()))
        // A stored record whose manifest window already closed.
        val stale = service(
            store = FakeStore(listOf(storedPackage(expiresAt = now.minusSeconds(1)))),
            nativeSession = OfflineSession(userId, "native-token", installation),
            examLauncher = { launches += it }
        )
        assertEquals(OfflinePackageBridgeService.DENIED_STALE, stale.openOfflineExam(packageId.toString()))
        // Malformed id never reaches any gate.
        assertEquals(OfflinePackageBridgeService.INVALID_ARGS, absent.openOfflineExam("not-a-uuid"))
        assertEquals(0, launches.size)
    }

    @Test
    fun `the onWebStudentBound seam reports every successful web session binding`() {
        val token = webJwt(userId.toString())
        // The run-download path reports the web student after a successful download.
        val downloadBindings = mutableListOf<UUID>()
        val store = FakeStore()
        val facade = RecordingFacade { session, _, _ ->
            store.saveEnvelope(envelope(), session.studentId, session.installationId)
            packageId
        }
        val service = OfflinePackageBridgeService(
            runtime = { facade },
            packageStore = store,
            sessionProvider = { null },
            installationId = { installation },
            executor = Executor { it.run() },
            clock = { now },
            onWebStudentBound = { downloadBindings += it }
        )
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId, accessToken = token)))
        assertEquals(listOf(userId), downloadBindings)

        // The pure-store fast path reports the token-resolved binding too — a
        // FRESH service (no in-process download state) with a pre-stored package.
        val fastBindings = mutableListOf<UUID>()
        val fastFacade = RecordingFacade { _, _, _ -> packageId }
        val fastService = OfflinePackageBridgeService(
            runtime = { fastFacade },
            packageStore = FakeStore(listOf(storedPackage())),
            sessionProvider = { null },
            installationId = { installation },
            executor = Executor { it.run() },
            clock = { now },
            onWebStudentBound = { fastBindings += it }
        )
        assertEquals(OfflinePackageBridgeService.READY, fastService.downloadOfflinePackage(requestJson(subjectId, accessToken = token)))
        assertEquals(listOf(userId), fastBindings)
    }

    // ------------------------------------------------------------------
    // Phase P (containment) — session-death wipes
    // ------------------------------------------------------------------

    @Test
    fun `web session end with no native session wipes the store and fires the full-wipe hook`() {
        val token = webJwt(userId.toString())
        val store = FakeStore()
        val facade = RecordingFacade { session, _, _ ->
            store.saveEnvelope(envelope(), session.studentId, session.installationId)
            packageId
        }
        var fullWipes = 0
        val service = OfflinePackageBridgeService(
            runtime = { facade },
            packageStore = store,
            sessionProvider = { null },
            installationId = { installation },
            executor = Executor { it.run() },
            clock = { now },
            onFullWipe = { fullWipes++ }
        )
        // A successful web-token download binds the web student + store record.
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId, accessToken = token)))
        assertEquals(1, store.size)
        assertEquals(OfflinePackageBridgeService.READY, service.offlinePackageStatus(packageId.toString()))

        // The web session ends with NO surviving native session → full wipe.
        assertEquals(OfflinePackageBridgeService.WIPED, service.onWebSessionEnded())
        assertEquals(1, store.wipeAllCalls)
        assertEquals(0, store.size)
        assertEquals(1, fullWipes)
        // Runtime state + web binding are gone: no state row, no store binding → absent.
        assertEquals(OfflinePackageBridgeService.ABSENT, service.offlinePackageStatus(packageId.toString()))
        assertEquals(OfflinePackageBridgeService.EMPTY_LIST_JSON, service.listOfflinePackages())
    }

    @Test
    fun `web session end with no native session and nothing bound still runs the full wipe`() {
        val store = FakeStore(listOf(storedPackage()))
        var fullWipes = 0
        val service = OfflinePackageBridgeService(
            runtime = { RecordingFacade { _, _, _ -> null } },
            packageStore = store,
            sessionProvider = { null },
            installationId = { installation },
            executor = Executor { it.run() },
            clock = { now },
            onFullWipe = { fullWipes++ }
        )
        // Phase P: a logout with nothing bound is a no-op WIPE, not a skipped one —
        // containment never depends on prior state.
        assertEquals(OfflinePackageBridgeService.WIPED, service.onWebSessionEnded())
        assertEquals(1, store.wipeAllCalls)
        assertEquals(0, store.size)
        assertEquals(1, fullWipes)
    }

    @Test
    fun `web session end with a live native session wipes only the web user's packages`() {
        val nativeStudentId = UUID.fromString("99999999-9999-9999-9999-999999999999")
        val nativePackageId = UUID.fromString("88888888-8888-8888-8888-888888888888")
        val store = FakeStore(
            listOf(
                // A record owned by the OTHER (native) student must survive untouched.
                storedPackage(pkgId = nativePackageId).copy(
                    envelope = envelope(pkgId = nativePackageId, owner = nativeStudentId)
                )
            )
        )
        val facade = RecordingFacade { session, _, _ ->
            store.saveEnvelope(envelope(), session.studentId, session.installationId)
            packageId
        }
        var native: OfflineSession? = null
        var fullWipes = 0
        val service = OfflinePackageBridgeService(
            runtime = { facade },
            packageStore = store,
            sessionProvider = { native },
            installationId = { installation },
            executor = Executor { it.run() },
            clock = { now },
            onFullWipe = { fullWipes++ }
        )
        // The web student downloads while no native session exists (binding = userId).
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId, accessToken = webJwt(userId.toString()))))
        assertEquals(2, store.size)
        // A DIFFERENT student's native session is now live.
        native = OfflineSession(nativeStudentId, "native-token", installation)

        assertEquals(OfflinePackageBridgeService.KEPT_NATIVE_SESSION, service.onWebSessionEnded())
        // The web user's package was invalidated; the native user's record stayed;
        // no full wipe, no media-cache hook (the native session owns its own wipe).
        assertEquals(1, store.invalidations)
        assertEquals(1, store.size)
        assertEquals(0, store.wipeAllCalls)
        assertEquals(0, fullWipes)
        // The surviving record is bound to the native student (binding now = native).
        val rows = JsonParser.parseString(service.listOfflinePackages()).asJsonArray
        assertEquals(1, rows.size())
        assertEquals(nativePackageId.toString(), rows.single().asJsonObject.get("packageId").asString)
    }

    @Test
    fun `web session end with the binding matching the native student keeps the packages`() {
        val store = FakeStore()
        val facade = RecordingFacade { session, _, _ ->
            store.saveEnvelope(envelope(), session.studentId, session.installationId)
            packageId
        }
        var native: OfflineSession? = null
        var fullWipes = 0
        val service = OfflinePackageBridgeService(
            runtime = { facade },
            packageStore = store,
            sessionProvider = { native },
            installationId = { installation },
            executor = Executor { it.run() },
            clock = { now },
            onFullWipe = { fullWipes++ }
        )
        // The web-token download binds the SAME student that later holds the native session.
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId, accessToken = webJwt(userId.toString()))))
        native = OfflineSession(userId, "native-token", installation)

        assertEquals(OfflinePackageBridgeService.KEPT_NATIVE_SESSION, service.onWebSessionEnded())
        // Nothing to selectively invalidate (the binding IS the native student), and
        // the native session keeps owning its data.
        assertEquals(0, store.invalidations)
        assertEquals(1, store.size)
        assertEquals(0, store.wipeAllCalls)
        assertEquals(0, fullWipes)
        // State rows were reset, but the native binding still resolves the store record.
        assertEquals(OfflinePackageBridgeService.READY, service.offlinePackageStatus(packageId.toString()))
    }

    @Test
    fun `reset clears the runtime state without any store writes`() {
        val store = FakeStore()
        val facade = RecordingFacade { session, _, _ ->
            store.saveEnvelope(envelope(), session.studentId, session.installationId)
            packageId
        }
        var fullWipes = 0
        val service = OfflinePackageBridgeService(
            runtime = { facade },
            packageStore = store,
            sessionProvider = { null },
            installationId = { installation },
            executor = Executor { it.run() },
            clock = { now },
            onFullWipe = { fullWipes++ }
        )
        assertEquals(OfflinePackageBridgeService.QUEUED, service.downloadOfflinePackage(requestJson(subjectId, accessToken = webJwt(userId.toString()))))
        assertEquals(OfflinePackageBridgeService.READY, service.offlinePackageStatus(packageId.toString()))

        // Native auth-death reset: memory only — the application-level wipe owns the store.
        service.reset()
        assertEquals(0, store.wipeAllCalls)
        assertEquals(0, store.invalidations)
        assertEquals(1, store.size)
        assertEquals(0, fullWipes)
        // No download state, no web binding left → status degrades to absent.
        assertEquals(OfflinePackageBridgeService.ABSENT, service.offlinePackageStatus(packageId.toString()))
        assertEquals(OfflinePackageBridgeService.EMPTY_LIST_JSON, service.listOfflinePackages())
    }
}
