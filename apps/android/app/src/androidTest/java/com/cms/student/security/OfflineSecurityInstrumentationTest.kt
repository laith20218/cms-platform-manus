package com.cms.student.security

import android.security.keystore.KeyProperties
import android.view.WindowManager
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cms.student.MainActivity
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.security.KeyStore
import java.util.Base64

@RunWith(AndroidJUnit4::class)
class OfflineSecurityInstrumentationTest {
    @Test fun androidKeystoreCreatesNonExportableRsaKeyAndPublicSpki() {
        val alias = "phase45-instrumentation-${System.nanoTime()}"
        val spki = OfflineKeystoreKeyManager.getOrCreatePublicKeySpki(alias)
        assertTrue(Base64.getDecoder().decode(spki).isNotEmpty())

        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val privateKey = store.getKey(alias, null)
        assertNotNull(privateKey)
        assertNull("Android Keystore private keys must not be exportable", privateKey!!.encoded)
    }

    @Test fun sensitiveActivitySetsFlagSecure() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val flags = activity.window.attributes.flags
                assertTrue("Sensitive activity must block screenshots", flags and WindowManager.LayoutParams.FLAG_SECURE != 0)
            }
        }
    }
}
