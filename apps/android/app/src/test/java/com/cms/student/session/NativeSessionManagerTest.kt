package com.cms.student.session

import com.cms.student.security.OfflineTransportException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.UUID

/**
 * JVM tests for the pure native-session state machine (Batch 2): tokens are saved
 * only on confirmed login/refresh, wiped on auth rejection and logout, and rebuilt
 * from the encrypted store across process death.
 */
class NativeSessionManagerTest {

    private class FakeTokenStore : TokenStore {
        var persisted: StoredNativeSession? = null
        var failSaves = false
        override fun save(session: StoredNativeSession): Boolean {
            if (failSaves) return false
            persisted = session
            return true
        }

        override fun read(): StoredNativeSession? = persisted

        override fun clear() {
            persisted = null
        }
    }

    private fun storedSession(access: String = "stored-access", refresh: String = "stored-refresh") =
        StoredNativeSession(UUID.randomUUID(), access, refresh)

    @Test
    fun `login success persists the token pair`() {
        val store = FakeTokenStore()
        val manager = NativeSessionManager(store)
        val session = storedSession()
        manager.onLoginSucceeded(session)
        assertEquals(session, store.persisted)
    }

    @Test
    fun `failed token persistence fails loudly instead of silently losing the session`() {
        val store = FakeTokenStore().apply { failSaves = true }
        val manager = NativeSessionManager(store)
        val threw = try {
            manager.onLoginSucceeded(storedSession())
            false
        } catch (_: IllegalStateException) {
            true
        }
        assert(threw)
    }

    @Test
    fun `auth rejection wipes stored tokens`() {
        val store = FakeTokenStore().apply { persisted = storedSession() }
        val manager = NativeSessionManager(store)
        manager.onAuthRejected()
        assertNull(store.persisted)
    }

    @Test
    fun `logout wipes stored tokens`() {
        val store = FakeTokenStore().apply { persisted = storedSession() }
        val manager = NativeSessionManager(store)
        manager.onLoggedOut()
        assertNull(store.persisted)
    }

    @Test
    fun `restore with nothing stored skips the network and reports no session`() {
        val store = FakeTokenStore()
        val manager = NativeSessionManager(store)
        var refreshCalls = 0
        val result = manager.restore { refreshCalls++; storedSession() }
        assertEquals(NativeSessionManager.RestoreResult.NoStoredSession, result)
        assertEquals(0, refreshCalls)
    }

    @Test
    fun `restore with successful refresh rotates and persists the new pair`() {
        val store = FakeTokenStore().apply { persisted = storedSession() }
        val manager = NativeSessionManager(store)
        val rotated = storedSession(access = "rotated-access", refresh = "rotated-refresh")
        val result = manager.restore { rotated }
        assertEquals(NativeSessionManager.RestoreResult.Restored(rotated, verifiedByServer = true), result)
        assertEquals(rotated, store.persisted)
    }

    @Test
    fun `restore on refresh auth rejection clears stored tokens`() {
        val store = FakeTokenStore().apply { persisted = storedSession() }
        val manager = NativeSessionManager(store)
        val result = manager.restore { throw OfflineTransportException(401, "refresh rejected") }
        assertEquals(NativeSessionManager.RestoreResult.AuthRejected, result)
        assertNull(store.persisted)
    }

    @Test
    fun `restore on transient network failure keeps tokens and restores unverified`() {
        val store = FakeTokenStore().apply { persisted = storedSession() }
        val manager = NativeSessionManager(store)
        val result = manager.restore { throw OfflineTransportException(message = "network unreachable") }
        assertEquals(NativeSessionManager.RestoreResult.Restored(store.persisted!!, verifiedByServer = false), result)
        assertNotNull(store.persisted)
    }

    // ===== Batch 4: the onTokensCleared hook must fire on EVERY token wipe =====
    // (CmsApplication wires it to the media cache wipe — owner lock 3: logout /
    // auth-reject wipes all encrypted media files + index immediately.)

    @Test
    fun `logout fires the token-cleared hook exactly once`() {
        val store = FakeTokenStore().apply { persisted = storedSession() }
        var wipeCalls = 0
        val manager = NativeSessionManager(store) { wipeCalls++ }
        manager.onLoggedOut()
        assertNull(store.persisted)
        assertEquals(1, wipeCalls)
    }

    @Test
    fun `auth rejection fires the token-cleared hook`() {
        val store = FakeTokenStore().apply { persisted = storedSession() }
        var wipeCalls = 0
        val manager = NativeSessionManager(store) { wipeCalls++ }
        manager.onAuthRejected()
        assertNull(store.persisted)
        assertEquals(1, wipeCalls)
    }

    @Test
    fun `a refresh-401 during restore fires the token-cleared hook`() {
        val store = FakeTokenStore().apply { persisted = storedSession() }
        var wipeCalls = 0
        val manager = NativeSessionManager(store) { wipeCalls++ }
        val result = manager.restore { throw OfflineTransportException(401, "refresh rejected") }
        assertEquals(NativeSessionManager.RestoreResult.AuthRejected, result)
        assertNull(store.persisted)
        assertEquals(1, wipeCalls)
    }

    @Test
    fun `successful logins and rotations never fire the wipe hook`() {
        val store = FakeTokenStore()
        var wipeCalls = 0
        val manager = NativeSessionManager(store) { wipeCalls++ }
        manager.onLoginSucceeded(storedSession())
        manager.restore { storedSession(access = "rotated") }
        assertEquals(0, wipeCalls)
        assertNotNull(store.persisted)
    }
}
