import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, BookMarked, Clock, FileText, Loader2, MousePointerClick,
} from 'lucide-react';
import { academicApi } from '@/features/subjects/services/academic-api';
import { hasScope, useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { LockedEmptyState } from '@/features/my-studies/components/LockedEmptyState';
import { CatalogErrorCard } from '@/features/my-studies/components/CatalogErrorCards';

/**
 * W17.1 — /study «المحتوى» tab: the subject's lecture/content cards INSIDE the
 * study hub (the subject sheet's «المحتوى» action and /subjects/:slug stay the
 * full-page surface; this is the in-hub equivalent).
 *
 * Reuses the existing data model — no parallel API: my-subjects drives the
 * entitlement + scope gates (bank-activation-gate pattern for unentitled
 * picks, SubjectDetail's lectures-locked pattern for a grant without
 * LecturesText), GET /subjects/{id} supplies the rich header counts
 * (questions / lectures / files), and GET /subjects/{id}/lectures supplies
 * the cards — the same LectureSummary the subject page renders, with the same
 * card anatomy (number badge, questions + duration counts, progress bar,
 * completed badge) so the tab feels native to both surfaces.
 */
export function ContentTab({ subjectId }: { subjectId: string | null }) {
  const mySubjects = useMySubjects();
  const subjects = mySubjects.data ?? [];
  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const canLectures = subject ? hasScope(subject, 'LecturesText') : false;

  // Rich header counts + lecture cards — both keyed to the ENTITLED subject
  // only (gates below cover everything else), so no query fires while locked.
  const subjectQuery = useQuery({
    queryKey: ['subject', subject?.id, 'id'],
    queryFn: () => academicApi.getSubjectById(subject!.id),
    enabled: !!subject && canLectures,
    staleTime: 5 * 60_000,
  });
  const lecturesQuery = useQuery({
    queryKey: ['lectures', subject?.id],
    queryFn: () => academicApi.getLectures(subject!.id),
    enabled: !!subject && canLectures,
  });

  if (mySubjects.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16" data-testid="content-loading">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" aria-hidden="true" />
        <p className="text-sm text-[var(--c-text-muted)]">جارٍ تحميل موادك…</p>
      </div>
    );
  }

  // No active code at all → the shared locked state with the activation CTA.
  if (subjects.length === 0) {
    return <LockedEmptyState title="المحتوى مُقفل" hint="محاضرات موادك ومحتواها التعليمي يُفتح بعد تفعيل كود الاشتراك." />;
  }

  // No subject picked yet — content is inherently per-subject; the scope bar
  // above the panel owns the choice, so the prompt points at it (no dead end).
  if (!subjectId) {
    return (
      <div
        className="rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-8 py-14 text-center"
        data-testid="content-pick-subject"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--c-primary-50)]">
          <MousePointerClick className="h-8 w-8 text-[var(--c-primary-700)]" aria-hidden="true" />
        </div>
        <h3 className="text-base font-bold text-[var(--c-text)]">المحتوى مرتب حسب المادة</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--c-text-muted)]">
          اختر مادتك من شريط «المادة» أعلاه لعرض محاضراتها وأسئلتها وملفاتها.
        </p>
      </div>
    );
  }

  // A subjectId the student holds no grant for (stale deep link / old share) —
  // the bank tab's activation-gate pattern, not a dead locked page.
  if (!subject) {
    return (
      <div data-testid="content-subject-locked">
        <LockedEmptyState
          title="هذه المادة غير مفعلة"
          hint="قم بتفعيلها للوصول إلى محتواها — المحاضرات والأسئلة والملفات لهذه المادة تُفتح بعد تفعيل كود اشتراك يشملها."
        />
      </div>
    );
  }

  // Entitled subject, but the grant lacks LecturesText (e.g. a questions-only
  // code) — the SubjectDetail lectures-locked pattern.
  if (!canLectures) {
    return (
      <div data-testid="content-scope-locked">
        <LockedEmptyState
          title="محتوى المحاضرات غير مشمول باشتراكك"
          hint="اشتراكك الحالي لا يشمل محتوى المحاضرات لهذه المادة — وسّع تفعيلك ليشمل المحتوى التعليمي لفتحه."
        />
      </div>
    );
  }

  const lectures = lecturesQuery.data ?? [];
  const detail = subjectQuery.data;
  const completedCount = lectures.filter((lecture) => lecture.isCompleted).length;

  return (
    <div data-testid="study-content-tab" className="space-y-4">
      {/* Subject strip — richer counts from GET /subjects/{id} (same endpoint
          the subject page uses; falls back to the my-subjects name while it
          loads, so the header never flashes empty). */}
      <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="content-subject-strip">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{ background: subject.color || 'var(--grad-primary)' }}
            >
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-[var(--c-text)]">{subject.nameAr}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--c-text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  <strong className="text-[var(--c-text)]" lang="en">{detail?.totalQuestions ?? '…'}</strong> سؤال
                </span>
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  <strong className="text-[var(--c-text)]" lang="en">{detail?.totalLectures ?? lectures.length}</strong> محاضرة
                </span>
                {detail?.totalFiles != null && detail.totalFiles > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <BookMarked className="w-3.5 h-3.5" aria-hidden="true" />
                    <strong className="text-[var(--c-text)]" lang="en">{detail.totalFiles}</strong> ملف
                  </span>
                )}
                {lectures.length > 0 && (
                  <span>
                    أنجزت <strong className="text-[var(--c-text)]" lang="en">{completedCount}</strong> من{' '}
                    <strong className="text-[var(--c-text)]" lang="en">{lectures.length}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link
            to={`/subjects/${subject.slug}`}
            className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-3.5 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] hover:text-[var(--c-primary-700)]"
          >
            صفحة المادة
          </Link>
        </div>
      </div>

      {lecturesQuery.isLoading ? (
        <div className="flex justify-center py-10" data-testid="content-loading">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--c-primary-700)]" aria-hidden="true" />
        </div>
      ) : lecturesQuery.isError ? (
        <CatalogErrorCard
          onRetry={() => void lecturesQuery.refetch()}
          testId="content-lectures-error"
          title="تعذّر تحميل محاضرات المادة"
          body="حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
        />
      ) : lectures.length === 0 ? (
        <div
          className="rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] py-12 text-center"
          data-testid="content-lectures-empty"
        >
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-[var(--c-text-faint)]" aria-hidden="true" />
          <p className="font-bold text-[var(--c-text)]">لا توجد محاضرات في هذه المادة بعد</p>
          <p className="mt-1 text-sm text-[var(--c-text-muted)]">تُنشر المحاضرات هنا فور إضافتها من فريق المحتوى.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="content-lecture-grid">
          {lectures.map((lecture, index) => (
            <motion.div key={lecture.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.05, 0.4) }}>
              <Link
                to={`/subjects/${subject.slug}/lectures/${lecture.id}`}
                data-testid={`content-lecture-card-${lecture.id}`}
                className="block rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 transition-all hover:border-[var(--c-primary-200)] hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ background: 'var(--grad-primary)' }}
                      lang="en"
                    >
                      {lecture.lectureNumber}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[var(--c-text)]">{lecture.titleAr}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--c-text-muted)]">
                        <span lang="en">{lecture.questionsCount}</span> سؤال
                        {lecture.durationMinutes != null && lecture.durationMinutes > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            <span lang="en">{lecture.durationMinutes}</span>د
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {lecture.isCompleted && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--c-success-50)] px-2.5 py-1 text-xs font-bold text-[var(--c-success-700)]">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />مكتملة
                    </span>
                  )}
                </div>
                {lecture.userProgress !== undefined && !lecture.isCompleted && lecture.questionsCount > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-[var(--c-text-muted)]">تقدّمك</span>
                      <span className="font-semibold text-[var(--c-primary-700)]" lang="en">{lecture.userProgress.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-bg)]">
                      <div className="h-full rounded-full" style={{ width: `${lecture.userProgress}%`, background: 'var(--grad-primary)' }} />
                    </div>
                  </div>
                )}
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
