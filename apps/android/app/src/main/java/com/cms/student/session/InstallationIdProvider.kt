package com.cms.student.session

import java.util.UUID

/**
 * Persistence seam for the installation identity; fakes drive the JVM unit tests
 * (the project does not use Robolectric).
 */
interface InstallationIdStore {
    /** Returns the persisted id, or null when absent or blank. */
    fun read(): String?

    /** Persists [id]; returns true only when the write is durably committed. */
    fun write(id: String): Boolean
}

/**
 * Stable per-install identity (UUID v4) for later header injection
 * (X-Installation-Id) and device binding. Not exposed to JavaScript in this
 * batch. Reads are stable: the id is generated once per install and reused.
 */
class InstallationIdProvider(private val store: InstallationIdStore) {

    /** Returns the existing installation id, or generates and persists a new one. */
    @Synchronized
    fun installationId(): String {
        val existing = store.read()
        if (!existing.isNullOrBlank()) return existing
        val generated = UUID.randomUUID().toString()
        check(store.write(generated)) { "Unable to persist installation identity" }
        return generated
    }
}
