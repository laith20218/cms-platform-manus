package com.cms.student.security

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.util.UUID

class TrustedOfflineRuntimeTest {
    @Test fun `factory remains fail closed when Offline disabled or signing key absent`() {
        val cache = CachedOfflineRevocationStatusProvider()
        assertNull(TrustedOfflineVerifierFactory.create(OfflineTrustConfiguration(false, "public-key", "alias"), cache))
        assertNull(TrustedOfflineVerifierFactory.create(OfflineTrustConfiguration(true, null, "alias"), cache))
    }

    @Test fun `revocation refresher accepts only matching confirmed active status and revokes otherwise`() {
        val packageId = UUID.randomUUID()
        val cache = CachedOfflineRevocationStatusProvider()
        val now = Instant.parse("2026-08-20T12:00:00Z")
        val activeApi = OfflinePackageStatusApi { id, _ -> OfflinePackageStatus(id, "active", now.plusSeconds(600), null, now) }
        assertTrue(OfflineRevocationRefresher(activeApi, cache).refresh(packageId, "installation", now))
        assertTrue(cache.status(packageId) == RevocationStatus.ACTIVE)

        val revokedApi = OfflinePackageStatusApi { id, _ -> OfflinePackageStatus(id, "revoked", now.plusSeconds(600), now, now) }
        assertFalse(OfflineRevocationRefresher(revokedApi, cache).refresh(packageId, "installation", now))
        assertTrue(cache.status(packageId) == RevocationStatus.REVOKED)
    }

    @Test fun `revocation refresher changes prior active state to unknown on transport failure`() {
        val packageId = UUID.randomUUID()
        val cache = CachedOfflineRevocationStatusProvider().apply { applyConfirmedStatus(packageId, RevocationStatus.ACTIVE) }
        val failingApi = OfflinePackageStatusApi { _, _ -> throw IllegalStateException("network unavailable") }
        assertFalse(OfflineRevocationRefresher(failingApi, cache).refresh(packageId, "installation", Instant.now()))
        assertTrue(cache.status(packageId) == RevocationStatus.UNKNOWN)
    }

    @Test fun `revocation refresher rejects stale confirmation fail closed`() {
        val packageId = UUID.randomUUID()
        val now = Instant.parse("2026-08-20T12:00:00Z")
        val cache = CachedOfflineRevocationStatusProvider()
        val staleApi = OfflinePackageStatusApi { id, _ -> OfflinePackageStatus(id, "active", now.plusSeconds(600), null, now.minusSeconds(301)) }
        assertFalse(OfflineRevocationRefresher(staleApi, cache).refresh(packageId, "installation", now))
        assertTrue(cache.status(packageId) == RevocationStatus.UNKNOWN)
    }
}
