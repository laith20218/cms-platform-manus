import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ClipboardList, Dumbbell, Loader2 } from 'lucide-react';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { LockedEmptyState } from '@/features/my-studies/components/LockedEmptyState';
import { ExamCoursesCatalog } from '@/features/exam-courses/components/ExamCoursesCatalog';
import { CascadeFilters, type CascadeValue } from '@/features/exam-courses/components/CascadeFilters';
import { TrainingBuilderModal } from './TrainingBuilderModal';
// Owner decision (offline-experience implementation, 2026-11-28): the first
// visit to a subject's question bank auto-downloads THAT subject's full
// question package (idempotent, one attempt per subject per install).
import { useAutoSubjectPackage } from '@/features/offline/useAutoSubjectPackage';

/**
 * W16.2b — "بنك الأسئلة" tab panel: the bank's own gate over the exam-courses
 * storefront. The tab OWNS the cascade (University → College → Year → Semester →
 * Subject — every semester subject stays selectable here, entitled or not) and
 * answers the pick:
 *   • INACTIVE subject (not in useMySubjects) → the activation gate
 *     ("هذه المادة غير مفعلة…") with the shared activate-code CTA — replacing the
 *     storefront's locked options with an actionable message.
 *   • ACTIVE subject → the two lenses mount inside this tab as the embedded
 *     ExamCoursesCatalog (hideHeader + hideCascade — the bank owns both):
 *       Lens 1 «دورات سنوات» — the full semester-course bundles (years lens).
 *       Lens 2 «دورات مصنفة» — the Lecture → ParagraphTag practice tree
 *       (the catalog's categorized UI, GET /practice/categorized/{subjectId}).
 * The header carries the training-exam builder entry ("بناء اختبار تدريبي").
 *
 * State contract mirrors the catalog: cascade levels + subjectId ride the URL
 * (same param names — deep links stay canonical), every level optional, cleared
 * levels DELETED. The subject auto-defaults to the first entitled subject when
 * the URL carries none (the catalog's resolution — so the tab never renders
 * without a subject once the student holds grants).
 */
export function QuestionBankTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mySubjects = useMySubjects();
  const [trainingOpen, setTrainingOpen] = useState(false);

  const subjects = useMemo(() => mySubjects.data ?? [], [mySubjects.data]);
  const routeSubjectId = searchParams.get('subjectId');
  // Same resolution as the embedded catalog: deep-linked subject (kept as-is even
  // when inactive — the gate answers it) or the first entitled subject.
  const subjectId = routeSubjectId ?? subjects[0]?.id ?? null;
  const isActive = subjectId != null && subjects.some((s) => s.id === subjectId);
  const subject = subjects.find((s) => s.id === subjectId) ?? null;

  // Owner decision (2026-11-28): first visit to THIS subject's bank → auto
  // download its full question package. Only for ACTIVE (entitled) subjects;
  // inert outside the shell; one attempt per subject per install.
  const autoPackage = useAutoSubjectPackage(isActive ? subjectId : null);

  const cascade: CascadeValue = {
    universityId: searchParams.get('universityId'),
    collegeId: searchParams.get('collegeId'),
    yearId: searchParams.get('yearId'),
    semesterId: searchParams.get('semesterId'),
  };
  const entitledSubjectIds = useMemo(() => new Set(subjects.map((s) => s.id)), [subjects]);

  /** Atomic URL writer — EDITS the current params (preserving the hub's ?tab=,
   *  the catalog's ?examTab=, the bundle ?courseId= deep link…) while setting the
   *  non-null cascade levels + subject; cleared levels are DELETED. */
  const updateParams = (patch: { subjectId?: string; cascade?: CascadeValue }) => {
    const nextSubjectId = patch.subjectId !== undefined ? patch.subjectId : subjectId;
    const nextCascade = patch.cascade ?? cascade;
    const next = new URLSearchParams(searchParams);
    if (nextSubjectId) next.set('subjectId', nextSubjectId);
    else next.delete('subjectId');
    if (nextCascade.universityId) next.set('universityId', nextCascade.universityId);
    else next.delete('universityId');
    if (nextCascade.collegeId) next.set('collegeId', nextCascade.collegeId);
    else next.delete('collegeId');
    if (nextCascade.yearId) next.set('yearId', nextCascade.yearId);
    else next.delete('yearId');
    if (nextCascade.semesterId) next.set('semesterId', nextCascade.semesterId);
    else next.delete('semesterId');
    setSearchParams(next, { replace: true });
  };

  if (mySubjects.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20" data-testid="question-bank-loading">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" aria-hidden="true" />
        <p className="text-sm text-[var(--c-text-muted)]">جارٍ تحميل بنك الأسئلة…</p>
      </div>
    );
  }

  // Grant-less student: the storefront's own truthful locked card (no cascade —
  // nothing to browse without an active code).
  if (subjects.length === 0) {
    return <ExamCoursesCatalog hideHeader hideCascade />;
  }

  return (
    <div data-testid="question-bank-tab">
      {/* Bank header — owns the section h2 (the hub owns the page h1) + the
          training-exam builder entry. */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-[var(--c-text)]">بنك الأسئلة</h2>
            <p className="truncate text-sm text-[var(--c-text-muted)]">
              {subject ? `أسئلة السنوات والتصنيفات والتدريب لمادة ${subject.nameAr}` : 'اختر مادتك من التصفية للوصول إلى بنكها'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTrainingOpen(true)}
          disabled={!isActive || !subjectId}
          data-testid="bank-build-training"
          aria-disabled={!isActive || !subjectId ? 'true' : undefined}
          title={!isActive ? 'فعّل المادة أولاً لبناء اختبار تدريبي' : 'اسحب أسئلة عشوائية وابدأ جلسة تدريب'}
          className="btn-primary press shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Dumbbell className="h-4 w-4" aria-hidden="true" />
          بناء اختبار تدريبي
        </button>
      </header>

      {/* Auto offline-package feedback (honest, dismiss-free): started shows the
          one-time progress hint; failed shows nothing noisy — the manual CTA on
          the subject page remains the retry path. */}
      {autoPackage === 'started' && (
        <div
          className="mb-4 rounded-2xl border border-[var(--c-primary-200)] bg-[var(--c-primary-50)] px-4 py-3 text-sm text-[var(--c-primary-700)]"
          data-testid="bank-auto-package-started"
          role="status"
        >
          بدأ تحميل حزمة أسئلة هذه المادة تلقائياً لتعمل دون اتصال — تابع التقدم من لوحة «وضع بدون إنترنت».
        </div>
      )}

      {/* The bank's cascade — same params the catalog wrote (deep links stay
          canonical); every semester subject stays SELECTABLE so the activation
          gate — not a locked option — answers the inactive pick. */}
      <CascadeFilters
        value={cascade}
        onChange={(next) => updateParams({ cascade: next })}
        subjectId={subjectId}
        onSelectSubject={(id) => updateParams({ subjectId: id })}
        entitledSubjectIds={entitledSubjectIds}
        subjectLabel={subject?.nameAr ?? null}
        lockNonEntitled={false}
      />

      {subjectId && !isActive ? (
        /* The activation gate — spec W16.2b: an inactive pick (cascade or deep
           link) shows the activation message + the shared activate-code CTA
           instead of the storefront. */
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="bank-activation-gate"
        >
          <LockedEmptyState
            title="هذه المادة غير مفعلة"
            hint="قم بتفعيلها للوصول إلى بنك الأسئلة — أسئلة السنوات والتصنيفات والتدريب لهذه المادة تُفتح بعد تفعيل كود اشتراك يشملها."
          />
        </motion.div>
      ) : (
        /* Active subject → the two lenses: the storefront catalog (its own
           أسئلة السنوات / أسئلة مصنّفة tabs) mounts with hideHeader + hideCascade. */
        <ExamCoursesCatalog hideHeader hideCascade />
      )}

      {/* Phase 2 — the training-exam builder (active subjects only). */}
      <TrainingBuilderModal
        open={trainingOpen}
        onOpenChange={setTrainingOpen}
        subjectId={subjectId ?? ''}
        subjectName={subject?.nameAr ?? null}
      />
    </div>
  );
}
