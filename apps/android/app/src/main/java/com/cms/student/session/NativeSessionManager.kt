package com.cms.student.session

import com.cms.student.security.OfflineTransportException

/**
 * Pure (no Android types) state machine that binds [TokenStore] to login/refresh
 * outcomes. CmsApplication delegates here so the token lifecycle is unit-testable
 * on the JVM:
 *
 *  - login success          → tokens persisted
 *  - auth rejection (401)   → tokens wiped (stale credentials must not survive)
 *  - logout                 → tokens wiped
 *  - process death          → [restore] rebuilds the session from the encrypted store
 */
class NativeSessionManager(private val store: TokenStore) {

    sealed interface RestoreResult {
        /** A usable session exists; [verifiedByServer] is true only when a fresh refresh succeeded. */
        data class Restored(val session: StoredNativeSession, val verifiedByServer: Boolean) : RestoreResult

        /** The stored refresh token was rejected by the server; the store is now wiped. */
        object AuthRejected : RestoreResult

        /** Nothing usable was stored; the caller must show the login screen. */
        object NoStoredSession : RestoreResult
    }

    /** Persists tokens only after the backend confirmed a successful login. */
    fun onLoginSucceeded(session: StoredNativeSession) {
        check(store.save(session)) { "Unable to persist native session tokens" }
    }

    /** A 401 from login or any offline client means the tokens are dead — wipe them. */
    fun onAuthRejected() {
        store.clear()
    }

    /** Explicit logout wipes both tokens. */
    fun onLoggedOut() {
        store.clear()
    }

    /**
     * Rehydrates the native session across process death. [refresh] rotates the token
     * pair against `/auth/refresh`; it must throw [OfflineTransportException] with
     * `statusCode == 401` for an auth rejection and any other
     * [OfflineTransportException] for a transport/network failure.
     */
    fun restore(refresh: (StoredNativeSession) -> StoredNativeSession): RestoreResult {
        val stored = store.read() ?: return RestoreResult.NoStoredSession
        return try {
            val rotated = refresh(stored)
            check(store.save(rotated)) { "Unable to persist rotated native session tokens" }
            RestoreResult.Restored(rotated, verifiedByServer = true)
        } catch (error: OfflineTransportException) {
            if (error.statusCode == 401) {
                store.clear()
                RestoreResult.AuthRejected
            } else {
                // Transient network failure: keep the stored pair and proceed with the
                // stored access token. If it is dead the next authenticated call 401s
                // and the caller clears then — honest, never silently fake.
                RestoreResult.Restored(stored, verifiedByServer = false)
            }
        }
    }
}
