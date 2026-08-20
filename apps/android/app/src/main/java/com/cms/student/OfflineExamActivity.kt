package com.cms.student

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.cms.student.security.OfflineQuestion
import com.cms.student.security.OfflineSyncDisposition
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Protected, runtime-backed Offline exam screen. It contains no seed, mock, or hard-coded question
 * content: the UI renders only verified, decrypted package payload. Answer persistence survives
 * Activity recreation through the encrypted package store.
 */
class OfflineExamActivity : AppCompatActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var content: LinearLayout
    private lateinit var status: TextView
    private lateinit var packageId: UUID
    private lateinit var subjectId: UUID
    private var questions: List<OfflineQuestion> = emptyList()
    private var currentQuestionIndex = 0
    private val selectedOptionByQuestion = mutableMapOf<UUID, UUID>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        packageId = intent.getStringExtra(EXTRA_PACKAGE_ID)?.let(UUID::fromString) ?: run { finish(); return }
        subjectId = intent.getStringExtra(EXTRA_SUBJECT_ID)?.let(UUID::fromString) ?: run { finish(); return }
        currentQuestionIndex = savedInstanceState?.getInt(STATE_QUESTION_INDEX, 0)?.coerceAtLeast(0) ?: 0
        showLoadingLayout()
        loadPackage()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt(STATE_QUESTION_INDEX, currentQuestionIndex)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun showLoadingLayout() {
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
        }
        status = TextView(this).apply {
            text = "جارٍ التحقق من الحزمة المحمية…"
            textSize = 18f
        }
        content.addView(status)
        setContentView(ScrollView(this).apply { addView(content) })
    }

    private fun loadPackage() {
        val runtime = (application as? CmsApplication)?.authenticatedOfflineRuntime()
        if (runtime == null) {
            status.text = "الجلسة غير متاحة؛ لا يمكن فتح محتوى Offline محمي."
            return
        }
        executor.execute {
            // Online opening refreshes revocation. If disconnected, only an already-confirmed
            // active package inside the policy window may continue; no retry loop is created.
            val openedOnline = runCatching { runtime.openOnline(packageId, subjectId) }.getOrNull()
            val opened = openedOnline ?: runtime.continueOffline(packageId, subjectId)
            val savedAnswers = runtime.pendingAnswers(packageId)
            runOnUiThread {
                if (opened.isNullOrEmpty()) {
                    status.text = "تم رفض الحزمة أو انتهت نافذة الاستخدام المسموح بها."
                } else {
                    questions = opened
                    currentQuestionIndex = currentQuestionIndex.coerceIn(0, questions.lastIndex)
                    savedAnswers.forEach { selectedOptionByQuestion[it.questionId] = it.selectedOptionId }
                    renderCurrentQuestion(runtime)
                }
            }
        }
    }

    private fun renderCurrentQuestion(runtime: AuthenticatedOfflineRuntime) {
        if (questions.isEmpty()) return
        val question = questions[currentQuestionIndex]
        content.removeAllViews()
        status.text = "السؤال ${currentQuestionIndex + 1} من ${questions.size} — الحزمة موثقة."
        content.addView(status)
        content.addView(TextView(this).apply {
            text = question.text
            textSize = 18f
            setPadding(0, 28, 0, 16)
        })

        val choices = RadioGroup(this).apply { orientation = RadioGroup.VERTICAL }
        val existingSelection = selectedOptionByQuestion[question.id]
        question.options.forEach { option ->
            val button = RadioButton(this).apply {
                id = option.id.hashCode()
                text = "${option.letter}. ${option.text}"
                isChecked = option.id == existingSelection
                setOnClickListener { captureSelectedAnswer(runtime, question.id, option.id) }
            }
            choices.addView(button)
        }
        content.addView(choices)

        val navigation = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        navigation.addView(Button(this).apply {
            text = "السابق"
            isEnabled = currentQuestionIndex > 0
            setOnClickListener { currentQuestionIndex--; renderCurrentQuestion(runtime) }
        })
        navigation.addView(Button(this).apply {
            text = if (currentQuestionIndex == questions.lastIndex) "إنهاء ومزامنة" else "التالي"
            setOnClickListener {
                if (currentQuestionIndex < questions.lastIndex) {
                    currentQuestionIndex++
                    renderCurrentQuestion(runtime)
                } else {
                    syncAnswers(runtime)
                }
            }
        })
        content.addView(navigation)
        content.addView(Button(this).apply {
            text = "مزامنة الإجابات عند الاتصال"
            setOnClickListener { syncAnswers(runtime) }
        })
    }

    private fun captureSelectedAnswer(runtime: AuthenticatedOfflineRuntime, questionId: UUID, optionId: UUID) {
        val clickedAt = Instant.now()
        executor.execute {
            val captured = runtime.captureAnswer(packageId, questionId, optionId, Duration.between(clickedAt, Instant.now()).seconds.toInt().coerceAtLeast(0))
            runOnUiThread {
                if (captured) selectedOptionByQuestion[questionId] = optionId
                else status.text = "تعذر حفظ الإجابة لأن الحزمة لم تعد صالحة."
            }
        }
    }

    private fun syncAnswers(runtime: AuthenticatedOfflineRuntime) {
        status.text = "جارٍ فحص حالة الإبطال ثم المزامنة…"
        executor.execute {
            val outcome = runtime.sync(packageId)
            runOnUiThread {
                status.text = when (outcome.disposition) {
                    OfflineSyncDisposition.SYNCED -> "تمت مزامنة الإجابات بنجاح."
                    OfflineSyncDisposition.NO_PENDING_ANSWERS -> "لا توجد إجابات بانتظار المزامنة."
                    OfflineSyncDisposition.AUTH_REJECTED -> "انتهت الجلسة؛ سجّل الدخول مجدداً."
                    OfflineSyncDisposition.FORBIDDEN -> "تم رفض الحزمة أو تم إبطالها."
                    OfflineSyncDisposition.CONFLICT -> "تعارض في المزامنة؛ لم تُفقد الإجابات المحلية."
                    OfflineSyncDisposition.RATE_LIMITED -> "تم تقييد المزامنة مؤقتاً؛ أعد المحاولة لاحقاً."
                    OfflineSyncDisposition.NETWORK_FAILURE -> "لا توجد شبكة؛ بقيت الإجابات مشفرة محلياً للمحاولة اللاحقة."
                    OfflineSyncDisposition.RETRYABLE_FAILURE -> "تعذر إكمال المزامنة؛ بقيت الإجابات المحلية محفوظة."
                }
            }
        }
    }

    companion object {
        private const val EXTRA_PACKAGE_ID = "com.cms.student.extra.OFFLINE_PACKAGE_ID"
        private const val EXTRA_SUBJECT_ID = "com.cms.student.extra.OFFLINE_SUBJECT_ID"
        private const val STATE_QUESTION_INDEX = "com.cms.student.state.OFFLINE_QUESTION_INDEX"

        fun intent(context: Context, packageId: UUID, subjectId: UUID): Intent =
            Intent(context, OfflineExamActivity::class.java)
                .putExtra(EXTRA_PACKAGE_ID, packageId.toString())
                .putExtra(EXTRA_SUBJECT_ID, subjectId.toString())
    }
}
