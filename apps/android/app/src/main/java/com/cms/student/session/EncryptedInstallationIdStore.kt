package com.cms.student.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * EncryptedSharedPreferences-backed [InstallationIdStore].
 *
 * Uses the SAME file and key as the installation identity that previously lived
 * inside CmsApplication ("cms_installation_identity" / "installation_id"), so
 * existing installs keep their id across the upgrade to the shell.
 */
class EncryptedInstallationIdStore(context: Context) : InstallationIdStore {

    private val prefs: SharedPreferences by lazy { create(context.applicationContext) }

    override fun read(): String? = prefs.getString(KEY, null)?.takeIf { it.isNotBlank() }

    override fun write(id: String): Boolean = prefs.edit().putString(KEY, id).commit()

    private fun create(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private companion object {
        const val FILE = "cms_installation_identity"
        const val KEY = "installation_id"
    }
}
