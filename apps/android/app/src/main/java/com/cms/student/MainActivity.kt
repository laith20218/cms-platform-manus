package com.cms.student

import android.os.Bundle
import android.text.InputType
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.cms.student.security.OfflineTransportException
import com.cms.student.session.NativeSessionManager
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Secure offline entry point (explicit intent only since Batch 1). Batch 2: the
 * native session survives process death through the encrypted TokenStore, a 401
 * anywhere in the offline path clears it with an honest Arabic message, and an
 * explicit sign-out button wipes it on demand.
 */
class MainActivity : AppCompatActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var form: LinearLayout
    private lateinit var status: TextView
    private var loginButton: Button? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        showLogin()
        restoreStoredSessionIfAny()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun showLogin() {
        loginButton = null
        form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }
        status = TextView(this).apply { text = getString(R.string.login_prompt); textSize = 18f }
        val phone = EditText(this).apply {
            hint = getString(R.string.login_phone_hint)
            inputType = InputType.TYPE_CLASS_PHONE
        }
        val password = EditText(this).apply {
            hint = getString(R.string.login_password_hint)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val login = Button(this).apply {
            text = getString(R.string.login_submit)
            setOnClickListener {
                isEnabled = false
                status.text = getString(R.string.login_in_progress)
                executor.execute {
                    val application = application as CmsApplication
                    var credentialsRejected = false
                    val successful = try {
                        application.loginStudent(phone.text.toString(), password.text.toString(), android.os.Build.MODEL)
                    } catch (error: OfflineTransportException) {
                        credentialsRejected = error.statusCode == 401
                        false
                    }
                    runOnUiThread {
                        isEnabled = true
                        password.text?.clear()
                        when {
                            successful -> showOfflinePackageRequest(getString(R.string.session_ready))
                            credentialsRejected -> status.text = getString(R.string.login_failed_credentials)
                            else -> status.text = getString(R.string.login_failed_generic)
                        }
                    }
                }
            }
        }
        loginButton = login
        form.addView(status)
        form.addView(phone)
        form.addView(password)
        form.addView(login)
        setContentView(form)
    }

    /**
     * Batch 2: rehydrate the encrypted native session after process death. Runs only
     * when tokens are actually stored; the login button stays disabled while the
     * server verifies the stored refresh token.
     */
    private fun restoreStoredSessionIfAny() {
        val application = application as CmsApplication
        if (!application.hasStoredNativeSession()) return
        val login = loginButton ?: return
        login.isEnabled = false
        status.text = getString(R.string.session_verifying)
        executor.execute {
            val result = application.restoreNativeSession()
            runOnUiThread {
                when (result) {
                    is NativeSessionManager.RestoreResult.Restored -> showOfflinePackageRequest(
                        if (result.verifiedByServer) getString(R.string.session_restored)
                        else getString(R.string.session_restored_unverified)
                    )
                    NativeSessionManager.RestoreResult.AuthRejected -> {
                        login.isEnabled = true
                        status.text = getString(R.string.session_expired)
                    }
                    NativeSessionManager.RestoreResult.NoStoredSession -> login.isEnabled = true
                }
            }
        }
    }

    private fun showOfflinePackageRequest(statusMessage: String) {
        loginButton = null
        form.removeAllViews()
        status.text = statusMessage
        form.addView(status)
        val application = application as CmsApplication
        val logout = Button(this).apply {
            text = getString(R.string.logout)
            setOnClickListener {
                application.clearAuthenticatedStudent()
                showLogin()
                status.text = getString(R.string.logged_out)
            }
        }
        form.addView(logout)
        val offline = application.authenticatedOfflineRuntime()
        if (offline == null) {
            form.addView(TextView(this).apply { text = getString(R.string.offline_disabled) })
            return
        }
        val subject = EditText(this).apply { hint = getString(R.string.offline_subject_hint) }
        val exam = EditText(this).apply { hint = getString(R.string.offline_exam_hint) }
        val download = Button(this).apply {
            text = getString(R.string.offline_download)
            setOnClickListener {
                val subjectId = runCatching { UUID.fromString(subject.text.toString().trim()) }.getOrNull()
                val examId = exam.text.toString().trim().takeIf(String::isNotBlank)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                if (subjectId == null || (exam.text.isNotBlank() && examId == null)) {
                    status.text = getString(R.string.offline_invalid_ids)
                    return@setOnClickListener
                }
                isEnabled = false
                status.text = getString(R.string.offline_requesting)
                executor.execute {
                    var authRejected = false
                    var packageId: UUID? = null
                    try {
                        packageId = offline.download(subjectId, examId)
                    } catch (error: OfflineTransportException) {
                        authRejected = error.statusCode == 401
                    } catch (_: Exception) {
                        // Unexpected failure: no package, no auth rejection — honest generic error.
                    }
                    runOnUiThread {
                        isEnabled = true
                        when {
                            packageId != null -> startActivity(OfflineExamActivity.intent(this@MainActivity, packageId, subjectId))
                            authRejected -> {
                                // Honest fail-closed: dead tokens are wiped and the student re-authenticates.
                                application.onNativeAuthRejected()
                                showLogin()
                                status.text = getString(R.string.session_expired_signed_out)
                            }
                            else -> status.text = getString(R.string.offline_rejected)
                        }
                    }
                }
            }
        }
        form.addView(TextView(this).apply { text = getString(R.string.offline_authorized_only) })
        form.addView(subject)
        form.addView(exam)
        form.addView(download)
    }
}
