package com.cms.student.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID

/** JVM-only logic tests. Android Keystore/runtime proof remains the responsibility of instrumentation. */
class OfflineRuntimeCoordinatorTest {
    private val now = Instant.now()
    private val userId = UUID.fromString("11111111-1111-1111-1111-111111111111")
    private val subjectId = UUID.fromString("22222222-2222-2222-2222-222222222222")
    private val questionId = UUID.fromString("33333333-3333-3333-3333-333333333333")
    private val optionId = UUID.fromString("44444444-4444-4444-4444-444444444444")
    private val packageId = UUID.fromString("55555555-5555-5555-5555-555555555555")
    private val session = OfflineSession(userId, "test-access-token", "installation-a")

    @Test fun `active package opens, captures a bound answer, then syncs exactly one pending answer`() {
        val fixture = Fixture(active = true)
        val downloaded = fixture.coordinator.download(session, subjectId)
        assertEquals(packageId, downloaded)

        val questions = fixture.coordinator.openOnline(session, packageId, subjectId)
        assertNotNull(questions)
        assertEquals(questionId, questions!!.single().id)
        assertTrue(fixture.coordinator.captureAnswer(session, packageId, questionId, optionId, 12, now))
        assertEquals(1, fixture.store.pendingAnswers(packageId, userId, session.installationId).size)

        val outcome = fixture.coordinator.sync(session, packageId)
        assertEquals(OfflineSyncDisposition.SYNCED, outcome.disposition)
        assertEquals(1, fixture.syncRequests.size)
        assertEquals(1, fixture.syncRequests.single().answers.size)
        assertTrue(fixture.store.pendingAnswers(packageId, userId, session.installationId).isEmpty())
    }

    @Test fun `unknown revocation from network failure rejects continuation and sync`() {
        val fixture = Fixture(active = true)
        assertEquals(packageId, fixture.coordinator.download(session, subjectId))
        assertNotNull(fixture.coordinator.openOnline(session, packageId, subjectId))
        fixture.statusFailure = true

        assertFalse(fixture.coordinator.refreshStatus(session, packageId))
        assertNull(fixture.coordinator.continueOffline(session, packageId, subjectId, now.plusSeconds(1)))
        assertEquals(OfflineSyncDisposition.FORBIDDEN, fixture.coordinator.sync(session, packageId).disposition)
    }

    @Test fun `revoked response invalidates package and prevents opening or capture`() {
        val fixture = Fixture(active = true)
        assertEquals(packageId, fixture.coordinator.download(session, subjectId))
        fixture.active = false

        assertFalse(fixture.coordinator.refreshStatus(session, packageId))
        assertNull(fixture.coordinator.openOnline(session, packageId, subjectId))
        assertFalse(fixture.coordinator.captureAnswer(session, packageId, questionId, optionId, 3, now))
    }

    @Test fun `disabled configuration never calls package client`() {
        val fixture = Fixture(active = true, enabled = false)
        assertNull(fixture.coordinator.download(session, subjectId))
        assertEquals(0, fixture.downloadCalls)
    }

    private inner class Fixture(active: Boolean, enabled: Boolean = true) {
        var active = active
        var statusFailure = false
        var downloadCalls = 0
        val store = InMemoryStore()
        val syncRequests = mutableListOf<OfflineSyncRequest>()
        private val cache = CachedOfflineRevocationStatusProvider()
        private val envelope = envelope()
        private val client = object : IOfflinePackageClient, ISyncClient {
            override fun issueEntitlement(session: OfflineSession) = "entitlement"
            override fun download(session: OfflineSession, entitlementToken: String, request: OfflinePackageRequest, devicePublicKeySpkiBase64: String): OfflinePackageEnvelope {
                downloadCalls++
                return envelope
            }
            override fun sync(session: OfflineSession, request: OfflineSyncRequest): OfflineSyncResult {
                syncRequests += request
                return OfflineSyncResult(request.answers.size, request.answers.size, 0, emptyList())
            }
        }
        private val statusApi = OfflinePackageStatusApi { id, _ ->
            if (statusFailure) throw IllegalStateException("network unavailable")
            OfflinePackageStatus(id, if (this.active) "active" else "revoked", now.plusSeconds(600), if (this.active) null else now, now)
        }
        private val decryptor = IOfflinePackageDecryptor { _, _, _, _, _ -> questionJson().toByteArray(StandardCharsets.UTF_8) }
        val coordinator = OfflineRuntimeCoordinator(
            trustConfiguration = OfflineTrustConfiguration(enabled, "test-public-key", "test-alias"),
            verifier = decryptor,
            packageClient = client,
            syncClient = client,
            packageStore = store,
            revocationCache = cache,
            revocationRefresher = OfflineRevocationRefresher(statusApi, cache),
            publicKeyProvider = { "test-device-public-key" }
        )
    }

    private class InMemoryStore : IOfflinePackageStore {
        private data class Entry(var value: StoredOfflinePackage, var questionIds: Set<UUID> = emptySet())
        private val records = mutableMapOf<UUID, Entry>()
        override fun saveEnvelope(envelope: OfflinePackageEnvelope, userId: UUID, installationId: String) {
            records[envelope.manifest.packageId] = Entry(StoredOfflinePackage(1, envelope, RevocationStatus.UNKNOWN, null, emptyList()))
        }
        override fun load(packageId: UUID, userId: UUID, installationId: String): StoredOfflinePackage? = records[packageId]?.value?.takeIf {
            it.envelope.manifest.userId == userId && it.envelope.manifest.installationId == installationId
        }
        override fun replaceQuestionIndex(packageId: UUID, questionIds: Collection<UUID>, userId: UUID, installationId: String) {
            records[packageId]?.takeIf { it.value.envelope.manifest.userId == userId && it.value.envelope.manifest.installationId == installationId }
                ?.questionIds = questionIds.toSet()
        }
        override fun recordAnswer(answer: OfflineAnswer, userId: UUID, installationId: String): Boolean {
            val entry = records[answer.packageId] ?: return false
            val current = entry.value
            if (current.envelope.manifest.userId != userId || current.envelope.manifest.installationId != installationId ||
                current.lastConfirmedStatus != RevocationStatus.ACTIVE || answer.questionId !in entry.questionIds ||
                !current.envelope.manifest.expiresAt.isAfter(Instant.now())) return false
            entry.value = current.copy(answers = current.answers + answer)
            return true
        }
        override fun pendingAnswers(packageId: UUID, userId: UUID, installationId: String): List<OfflineAnswer> =
            load(packageId, userId, installationId)?.answers?.filterNot { it.synced } ?: emptyList()
        override fun markAnswersSynced(packageId: UUID, localAttemptIds: Collection<UUID>, userId: UUID, installationId: String) {
            val entry = records[packageId] ?: return
            val ids = localAttemptIds.toSet()
            entry.value = entry.value.copy(answers = entry.value.answers.map { if (it.localAttemptId in ids) it.copy(synced = true) else it })
        }
        override fun updateConfirmedStatus(packageId: UUID, status: RevocationStatus, confirmedAt: Instant?, userId: UUID, installationId: String) {
            val entry = records[packageId] ?: return
            entry.value = entry.value.copy(lastConfirmedStatus = status, lastConfirmedAt = confirmedAt)
        }
        override fun invalidate(packageId: UUID, userId: UUID, installationId: String) { records.remove(packageId) }
    }

    private fun envelope() = OfflinePackageEnvelope(
        OfflinePackageManifest(packageId, userId, session.installationId, 1, listOf(subjectId), now.minusSeconds(10), now.plusSeconds(600), "nonce", "aad", "signature"),
        "ciphertext", "tag", "wrapped", "receipt"
    )

    private fun questionJson() = """[{"id":"$questionId","text":"سؤال حقيقي من حزمة مفكوكة","type":"SingleChoice","difficulty":"Easy","tags":["phase45"],"options":[{"id":"$optionId","letter":"A","text":"خيار"}]}]"""
}
