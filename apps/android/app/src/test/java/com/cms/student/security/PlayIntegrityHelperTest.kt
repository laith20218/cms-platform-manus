package com.cms.student

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PlayIntegrityHelperTest {
    @Test
    fun `blank hash is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            PlayIntegrityHelper().evaluate(IntegrityCheckpoint.LOGIN, "")
        }
    }

    @Test
    fun `helper fails closed`() {
        assertEquals(
            IntegrityVerdict.NOT_CONFIGURED,
            PlayIntegrityHelper().evaluate(IntegrityCheckpoint.OFFLINE_DOWNLOAD, "A1234567890_-aBcDeFgHiJkLmNopQ")
        )
    }
}
