package com.cms.student.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.UUID

/**
 * Tokens for the NATIVE login/offline path only (Batch 2, WebView session strategy D1:
 * the shell does not inject any token into student-web — the web app keeps its own
 * session inside WebView storage).
 *
 * Saved only after a successful login or refresh; the account password is never
 * persisted anywhere; values never appear in logs or crash reports.
 */
data class StoredNativeSession(
    val studentId: UUID,
    val accessToken: String,
    val refreshToken: String
) {
    /** Tokens must never leak into logs, crash reports, or error messages. */
    override fun toString(): String =
        "StoredNativeSession(studentId=$studentId, accessToken=<redacted>, refreshToken=<redacted>)"
}

/** Persistence seam for the native session tokens; fakes drive the JVM unit tests. */
interface TokenStore {
    /** Persists a login/refresh outcome. Returns true only when durably committed. */
    fun save(session: StoredNativeSession): Boolean

    /** Returns the stored session, or null when absent or incomplete. */
    fun read(): StoredNativeSession?

    /** Logout, auth rejection, or account switch must wipe the stored tokens. */
    fun clear()
}

/**
 * EncryptedSharedPreferences-backed [TokenStore] (same security-crypto stack as the
 * installation identity, in its own file). Access tokens AND refresh tokens live
 * only here — never in plaintext SharedPreferences.
 */
class EncryptedTokenStore(context: Context) : TokenStore {

    private val prefs: SharedPreferences by lazy { create(context.applicationContext) }

    override fun save(session: StoredNativeSession): Boolean = prefs.edit()
        .putString(KEY_STUDENT_ID, session.studentId.toString())
        .putString(KEY_ACCESS_TOKEN, session.accessToken)
        .putString(KEY_REFRESH_TOKEN, session.refreshToken)
        .commit()

    override fun read(): StoredNativeSession? {
        val studentId = prefs.getString(KEY_STUDENT_ID, null)
            ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            ?: return null
        val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null)?.takeIf(String::isNotBlank) ?: return null
        val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null)?.takeIf(String::isNotBlank) ?: return null
        return StoredNativeSession(studentId, accessToken, refreshToken)
    }

    override fun clear() {
        prefs.edit().clear().commit()
    }

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
        const val FILE = "cms_native_session"
        const val KEY_STUDENT_ID = "student_id"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
    }
}
