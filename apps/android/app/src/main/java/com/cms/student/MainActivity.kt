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
import java.util.UUID
import java.util.concurrent.Executors

/** Minimal secure entry point that establishes an in-memory student session before Offline use. */
class MainActivity : AppCompatActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var form: LinearLayout
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        showLogin()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun showLogin() {
        form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }
        status = TextView(this).apply { text = "سجّل الدخول للوصول إلى المحتوى المحمي."; textSize = 18f }
        val phone = EditText(this).apply { hint = "رقم الهاتف"; inputType = InputType.TYPE_CLASS_PHONE }
        val password = EditText(this).apply {
            hint = "كلمة المرور"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val login = Button(this).apply {
            text = "تسجيل الدخول"
            setOnClickListener {
                isEnabled = false
                status.text = "جارٍ تسجيل الدخول…"
                executor.execute {
                    val application = application as CmsApplication
                    val successful = try {
                        application.loginStudent(phone.text.toString(), password.text.toString(), android.os.Build.MODEL)
                    } catch (_: OfflineTransportException) {
                        false
                    }
                    runOnUiThread {
                        isEnabled = true
                        password.text?.clear()
                        if (successful) showOfflinePackageRequest()
                        else status.text = "تعذر تسجيل الدخول أو لا توجد تهيئة API صالحة."
                    }
                }
            }
        }
        form.addView(status)
        form.addView(phone)
        form.addView(password)
        form.addView(login)
        setContentView(form)
    }

    private fun showOfflinePackageRequest() {
        form.removeAllViews()
        status.text = "تم إنشاء جلسة الطالب."
        form.addView(status)
        val offline = (application as CmsApplication).authenticatedOfflineRuntime()
        if (offline == null) {
            form.addView(TextView(this).apply { text = "Offline الموثوق معطّل في هذا البناء؛ يبقى المحتوى غير متاح Offline." })
            return
        }
        val subject = EditText(this).apply { hint = "Subject UUID" }
        val exam = EditText(this).apply { hint = "Exam UUID اختياري" }
        val download = Button(this).apply {
            text = "تنزيل حزمة الامتحان المشفرة"
            setOnClickListener {
                val subjectId = runCatching { UUID.fromString(subject.text.toString().trim()) }.getOrNull()
                val examId = exam.text.toString().trim().takeIf(String::isNotBlank)?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                if (subjectId == null || (exam.text.isNotBlank() && examId == null)) {
                    status.text = "معرف المادة أو الامتحان غير صالح."
                    return@setOnClickListener
                }
                isEnabled = false
                status.text = "جارٍ طلب حزمة مشفرة والتحقق منها…"
                executor.execute {
                    val packageId = runCatching { offline.download(subjectId, examId) }.getOrNull()
                    runOnUiThread {
                        isEnabled = true
                        if (packageId == null) status.text = "رُفضت الحزمة أو تعذر التحقق منها."
                        else startActivity(OfflineExamActivity.intent(this@MainActivity, packageId, subjectId))
                    }
                }
            }
        }
        form.addView(TextView(this).apply { text = "اطلب فقط package IDs من شاشة المحتوى المصرح بها." })
        form.addView(subject)
        form.addView(exam)
        form.addView(download)
    }
}
