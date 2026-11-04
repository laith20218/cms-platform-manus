import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight, BookMarked, CheckCircle2, ChevronLeft, ClipboardList,
  Clock, Dumbbell, FileCheck2, Loader2, PencilRuler,
} from 'lucide-react';
import { examCoursesApi, COURSE_TYPE_LABELS, SEMESTER_LABELS } from '../services/exam-courses-api';
import { isEntitlementDenied, variantForReason } from '@/features/my-studies/services/courses-api';
import { CatalogEntitlementErrorCard, CatalogErrorCard } from '@/features/my-studies/components/CatalogErrorCards';

/**
 * W14.4 (A.3) — one exam-course bundle: the ordered exams of the round with the
 * student's attempt state. Each exam offers BOTH entries:
 *  • تدريب — a PracticeSession run (immediate feedback, resets — D13, B.1)
 *  • اختبار — the real ExamSession flow (timed, graded, attempt-limited)
 */
export default function ExamCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['exam-course-detail', courseId],
    queryFn: () => examCoursesApi.getCourse(courseId!),
    enabled: !!courseId,
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--cms-teal-700)]" aria-hidden="true" />
        <p className="text-sm text-[var(--cms-text-muted)]">جارٍ تحميل الدورة…</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    const error = query.error;
    if (error && isEntitlementDenied(error)) {
      return (
        <div className="max-w-4xl mx-auto">
          <CatalogEntitlementErrorCard
            variant={variantForReason((error as { reason?: string }).reason)}
            onRetry={() => void query.refetch()}
            testId="exam-course-detail-denied"
          />
        </div>
      );
    }
    return (
      <div className="max-w-4xl mx-auto">
        <CatalogErrorCard
          onRetry={() => void query.refetch()}
          testId="exam-course-detail-error"
          title="تعذّر تحميل الدورة"
          body="ربما حُذفت الدورة أو رابطها غير صحيح. حاول مرة أخرى أو عد إلى قائمة الدورات."
        />
      </div>
    );
  }

  const course = query.data;

  return (
    <div className="max-w-4xl mx-auto">
      <button
        type="button"
        onClick={() => navigate('/my-studies?tab=exam-courses')}
        className="press mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--cms-text-muted)] hover:text-[var(--cms-teal-700)]"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        العودة إلى الدورات الامتحانية
      </button>

      <header className="rounded-3xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6 shadow-sm mb-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
            <BookMarked className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-[var(--cms-text)]">{course.nameAr}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center rounded-full bg-[var(--cms-teal-50)] px-2.5 py-0.5 font-semibold text-[var(--cms-teal-800)]">
                <span lang="en">{course.year}</span>
              </span>
              <span className="inline-flex items-center rounded-full bg-[var(--cms-teal-50)] px-2.5 py-0.5 font-semibold text-[var(--cms-teal-800)]">
                {SEMESTER_LABELS[course.semester] ?? `فصل ${course.semester}`}
              </span>
              <span className="inline-flex items-center rounded-full bg-[var(--cms-teal-50)] px-2.5 py-0.5 font-semibold text-[var(--cms-teal-800)]">
                {COURSE_TYPE_LABELS[course.courseType] ?? course.courseType}
              </span>
              {/* W14.4 §13: 700 text steps — #059669/#d97706 on the 50-tints
                  measure 3.58:1/3.07:1 (fail AA); the 700 steps pass (≥ 5.2:1). */}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold ${course.freeOrPaid ? 'bg-[var(--cms-warning-50)] text-[var(--cms-warning-700)]' : 'bg-[var(--cms-success-50)] text-[var(--cms-success-700)]'}`}>
                {course.freeOrPaid ? 'مدفوعة' : 'مجانية'}
              </span>
            </div>
            {course.description && <p className="mt-3 text-sm text-[var(--cms-text-soft)] leading-relaxed">{course.description}</p>}
          </div>
        </div>
      </header>

      <h2 className="text-base font-bold text-[var(--cms-text)] mb-3 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-[var(--cms-teal-700)]" aria-hidden="true" />
        اختبارات الدورة
        <span className="text-xs font-medium text-[var(--cms-text-muted)]" lang="en">({course.exams.length})</span>
      </h2>

      {course.exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[var(--cms-line-strong)] bg-[var(--cms-surface)] px-8 py-14 text-center">
          <PencilRuler className="w-8 h-8 text-[var(--cms-text-muted)]" aria-hidden="true" />
          <h3 className="text-base font-bold text-[var(--cms-text)]">لا توجد اختبارات في هذه الدورة بعد</h3>
          <p className="text-sm text-[var(--cms-text-muted)]">تُضاف الاختبارات إلى الدورة من قبل الإدارة.</p>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="exam-course-exams">
          {course.exams.map((exam, index) => (
            <li key={exam.examId}>
              <motion.article
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3) }}
                className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-4 shadow-sm"
                data-testid={`course-exam-${exam.examId}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-[var(--cms-text)]">{exam.titleAr}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--cms-text-muted)]">
                      <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" /><span lang="en">{exam.durationMinutes}</span> دقيقة</span>
                      <span className="inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" aria-hidden="true" /><span lang="en">{exam.totalQuestions}</span> سؤالاً</span>
                      {exam.attemptCount > 0 && <span className="inline-flex items-center gap-1"><FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />محاولات: <span lang="en">{exam.attemptCount}</span></span>}
                      {exam.bestScore != null && <span className="inline-flex items-center gap-1 font-semibold text-[var(--cms-teal-700)]">أفضل نتيجة: <span lang="en">{Math.round(exam.bestScore)}%</span></span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {exam.inProgress && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--cms-warning-50)] px-2.5 py-0.5 text-xs font-semibold text-[var(--cms-warning-700)]">محاولة جارية</span>}
                      {exam.completed && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--cms-success-50)] px-2.5 py-0.5 text-xs font-semibold text-[var(--cms-success-700)]"><CheckCircle2 className="w-3 h-3" aria-hidden="true" />مكتملة</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/practice/exam/${exam.examId}`)}
                      data-testid={`practice-exam-${exam.examId}`}
                      className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--cms-teal-600)] px-4 text-sm font-bold text-[var(--cms-teal-800)] transition-colors hover:bg-[var(--cms-teal-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cms-teal-700)]"
                      aria-label={`بدء تدريب ${exam.titleAr}`}
                    >
                      <Dumbbell className="w-4 h-4" aria-hidden="true" />
                      تدريب
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/exams/${exam.examId}`)}
                      data-testid={`sit-exam-${exam.examId}`}
                      className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-[var(--cms-text-inverse)] shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cms-teal-700)]"
                      style={{ background: 'var(--cms-teal-700)' }}
                      aria-label={`بدء اختبار ${exam.titleAr}`}
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" aria-hidden="true" />
                      اختبار
                    </button>
                  </div>
                </div>
              </motion.article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
