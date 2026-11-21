package com.cms.student.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * JVM-only tests for the installation identity contract. Android Keystore and
 * EncryptedSharedPreferences behaviour stays covered by the existing
 * instrumentation suites; these tests pin the stability logic itself.
 */
class InstallationIdProviderTest {

    private class FakeStore : InstallationIdStore {
        var persisted: String? = null
        var writes = 0
        var failWrites = false

        override fun read(): String? = persisted

        override fun write(id: String): Boolean {
            writes++
            if (failWrites) return false
            persisted = id
            return true
        }
    }

    @Test
    fun `repeated reads return the same stable id and persist exactly once`() {
        val store = FakeStore()
        val provider = InstallationIdProvider(store)
        val first = provider.installationId()
        val second = provider.installationId()
        val third = provider.installationId()
        assertEquals(first, second)
        assertEquals(first, third)
        assertEquals(1, store.writes)
        assertEquals(first, store.persisted)
    }

    @Test
    fun `generated id is a well-formed uuid`() {
        val provider = InstallationIdProvider(FakeStore())
        val id = provider.installationId()
        assertEquals(id, UUID.fromString(id).toString())
    }

    @Test
    fun `existing persisted id is returned untouched without rewriting`() {
        val store = FakeStore().apply { persisted = "11111111-2222-4333-8444-555555555555" }
        val provider = InstallationIdProvider(store)
        assertEquals("11111111-2222-4333-8444-555555555555", provider.installationId())
        assertEquals(0, store.writes)
    }

    @Test
    fun `blank persisted id is treated as missing and regenerated`() {
        val store = FakeStore().apply { persisted = "   " }
        val provider = InstallationIdProvider(store)
        val id = provider.installationId()
        assertEquals(1, store.writes)
        assertEquals(id, store.persisted)
    }

    @Test
    fun `failed persistence fails loudly instead of returning an unstable id`() {
        val store = FakeStore().apply { failWrites = true }
        val provider = InstallationIdProvider(store)
        val threw = try {
            provider.installationId()
            false
        } catch (_: IllegalStateException) {
            true
        }
        assertTrue(threw)
    }
}
