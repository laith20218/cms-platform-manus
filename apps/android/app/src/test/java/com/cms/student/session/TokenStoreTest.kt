package com.cms.student.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * JVM tests for the native TokenStore contract (write/read/clear) and the guarantee
 * that tokens never surface in toString/logs. The EncryptedSharedPreferences
 * implementation is exercised on device; these tests pin the semantics every
 * implementation must satisfy.
 */
class TokenStoreTest {

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

    private val session = StoredNativeSession(
        studentId = UUID.fromString("11111111-2222-4333-8444-555555555555"),
        accessToken = "access-token-value",
        refreshToken = "refresh-token-value"
    )

    @Test
    fun `write then read returns the same session`() {
        val store = FakeTokenStore()
        assertTrue(store.save(session))
        assertEquals(session, store.read())
    }

    @Test
    fun `clear removes the stored session`() {
        val store = FakeTokenStore().apply { persisted = session }
        store.clear()
        assertNull(store.read())
    }

    @Test
    fun `stored session toString redacts both tokens`() {
        val text = session.toString()
        assertFalse(text.contains("access-token-value"))
        assertFalse(text.contains("refresh-token-value"))
        assertTrue(text.contains("<redacted>"))
    }
}
