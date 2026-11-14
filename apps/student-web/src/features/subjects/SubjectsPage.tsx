import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, GraduationCap, Sparkles } from 'lucide-react';
import { academicApi } from './services/academic-api';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { ActivationCodeModal } from './ActivationCodeModal';
import { SubjectCard } from './SubjectCard';
import { MuwadiTab } from './MuwadiTab';
import { CascadeFilters } from '@/features/exam-courses/components/CascadeFilters';
import { cn } from '@/utils';

/**
 * Subjects browser — W15.3.2 cascade adoption + W15.3.3 tabs.
 *
 * Push 8 replaced the old five-section wall with a guided stepper; W15.3.2
 * swaps the bespoke breadcrumb + stepper machinery for the SHARED
 * CascadeFilters bar (the same component the My Studies hub uses, its 5th
 * subject select hidden via hideSubjectSelect — the subject GRID below is
 * this page's territory). The four academic levels now live in the URL
 * (?universityId&collegeId&yearId&semesterId), so any cascade state is
 * deep-linkable, shareable, and back-button friendly.
 *
 * W15.3.3 — the page is now tabbed (URL-driven, ?tab=muwadi):
 * - «الهيكل الأكاديمي» (default, absent tab param): the W15.3.2 page below
 *   unchanged — entitled strip, cascade bar, then hint/skeleton/grid/empty.
 * - «موادي»: the student's entitled subjects as MuwadiCards, no cascade
 *   needed; «فتح» opens the shared subject BottomSheet (scope-gated).
 *
 * - «موادي المفعّلة» strip sits right under the tabs — one-tap access to
 *   everything the student already holds.
 * - Choosing a semester (4th select) renders the subject grid; unentitled
 *   subjects open the activation dialog in place — never a dead locked page.
 */
export default function SubjectsPage() {
  /** The unentitled subject awaiting an activation code in the modal. */
  const [lockedSubject, setLockedSubject] = useState<{ id: string; nameAr: string } | null>(null);

  // W15.3.2 (C1) — the cascade lives in the URL, not component state.
  const [searchParams, setSearchParams] = useSearchParams();
  const universityId = searchParams.get('universityId');
  const collegeId = searchParams.get('collegeId');
  const yearId = searchParams.get('yearId');
  const semesterId = searchParams.get('semesterId');

  // W15.3.3 — the page tab rides the URL as well: ?tab=muwadi selects «موادي»;
  // absent (or any other value) keeps «الهيكل الأكاديمي» — the default that
  // preserves every existing deep link and the whole W15.3.2 behavior.
  const activeTab = searchParams.get('tab') === 'muwadi' ? 'muwadi' : 'structure';
  const setActiveTab = (next: 'structure' | 'muwadi') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'muwadi') {
      params.set('tab', 'muwadi');
    } else {
      params.delete('tab');
    }
    setSearchParams(params, { replace: true });
  };

  const mySubjects = useMySubjects();

  const { data: subjects, isFetching: subjectsLoading } = useQuery({
    queryKey: ['subjects', semesterId],
    queryFn: () => academicApi.getSubjects(semesterId!),
    enabled: !!semesterId,
  });

  const mySubjectsList = mySubjects.data ?? [];
  const entitledIds = useMemo(
    () => new Set((mySubjects.data ?? []).map((s) => s.id)),
    [mySubjects.data]
  );

  // W15.3.2 (C1) — writes the four cascade levels into the URL (replace, no
  // history spam); CascadeFilters hands us the next value with the children
  // of the changed level already cleared.
  const updateCascade = (next: {
    universityId: string | null;
    collegeId: string | null;
    yearId: string | null;
    semesterId: string | null;
  }) => {
    const params = new URLSearchParams(searchParams);
    if (next.universityId) params.set('universityId', next.universityId);
    else params.delete('universityId');
    if (next.collegeId) params.set('collegeId', next.collegeId);
    else params.delete('collegeId');
    if (next.yearId) params.set('yearId', next.yearId);
    else params.delete('yearId');
    if (next.semesterId) params.set('semesterId', next.semesterId);
    else params.delete('semesterId');
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md" style={{ background: 'var(--c-primary-700)' }}>
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">المواد والخطط الدراسية</h1>
          <p className="text-sm text-[var(--c-text-muted)]">تصفّح الهيكل الأكاديمي وابدأ الدراسة</p>
        </div>
      </div>

      {/* ===== W15.3.3: page tabs — «الهيكل الأكاديمي» (default) / «موادي» =====
          Tab state is URL-driven (?tab=muwadi; absent = structure) so both
          views are deep-linkable and the browser back button behaves. The
          shared layoutId pill animates the active indicator between tabs. */}
      <div
        role="tablist"
        aria-label="أقسام المواد"
        className="flex gap-1 border-b border-[var(--c-border)] overflow-x-auto"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'structure'}
          data-testid="subjects-tab-structure"
          onClick={() => setActiveTab('structure')}
          className="relative px-4 py-2.5 text-sm font-medium whitespace-nowrap text-[var(--c-text-soft)] transition-colors"
        >
          {activeTab === 'structure' && (
            <motion.span
              layoutId="subjects-tab-pill"
              className="absolute inset-0 rounded-t-xl bg-[var(--c-primary-50)]"
              style={{ borderBottom: '2px solid var(--c-primary-700)' }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
          <span className="relative z-[1]">
            الهيكل الأكاديمي
          </span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'muwadi'}
          data-testid="subjects-tab-muwadi"
          onClick={() => setActiveTab('muwadi')}
          className="relative px-4 py-2.5 text-sm font-medium whitespace-nowrap text-[var(--c-text-soft)] transition-colors"
        >
          {activeTab === 'muwadi' && (
            <motion.span
              layoutId="subjects-tab-pill"
              className="absolute inset-0 rounded-t-xl bg-[var(--c-primary-50)]"
              style={{ borderBottom: '2px solid var(--c-primary-700)' }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
          <span className="relative z-[1]">
            موادي
          </span>
        </button>
      </div>

      {activeTab === 'muwadi' ? (
        <MuwadiTab />
      ) : (
        <>
          {/* ===== My entitled subjects — one-tap access strip =====
              (W15.3.2 C4: moved to the page top, right after the header — above
              the cascade — matching the mockup's «المواد المفعّلة» position.) */}
          {mySubjectsList.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-2xl border p-4"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}
              data-testid="my-subjects-strip"
            >
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--c-primary-700)]" />
                <h2 className="text-sm font-bold text-[var(--c-text)]">موادي المفعّلة</h2>
                <span className="rounded-full bg-[var(--c-primary-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--c-primary-700)]" lang="en">{mySubjectsList.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {mySubjectsList.map((subject) => (
                  <Link
                    key={subject.id}
                    to={`/subjects/${subject.slug}`}
                    className="press inline-flex items-center gap-1.5 rounded-full border border-[var(--c-primary-200)] bg-[var(--c-primary-50)] px-3.5 py-2 text-sm font-medium text-[var(--c-primary-700)] transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {subject.nameAr}
                  </Link>
                ))}
              </div>
            </motion.section>
          )}

          {/* ===== W15.3.2 (C2): the shared cascade bar — subject select hidden;
              the subject grid below is this page's territory. ===== */}
          <CascadeFilters
            value={{ universityId, collegeId, yearId, semesterId }}
            onChange={updateCascade}
            subjectId={null}
            onSelectSubject={() => {}}
            entitledSubjectIds={entitledIds}
            subjectLabel={null}
            hideSubjectSelect
          />

          {/* ===== W15.3.2 (C3): subjects grid below the cascade ===== */}
          {!semesterId ? (
            <div
              data-testid="subjects-hint"
              className="rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-text-muted)]"
            >
              اختر فصلاً من الأعلى لعرض المواد
            </div>
          ) : subjectsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-44 rounded-2xl" />)}
            </div>
          ) : subjects && subjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map((s, i) => (
                <SubjectCard
                  key={s.id}
                  subject={s}
                  index={i}
                  entitled={entitledIds.has(s.id)}
                  onLocked={(subject) => setLockedSubject(subject)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] py-12 text-center" data-testid="subjects-empty">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-primary-50)]">
                <BookOpen className="h-9 w-9 text-[var(--c-primary-700)]" />
              </div>
              <p className="mb-1 font-bold text-[var(--c-text)]">لا توجد مواد متاحة لك في هذا الفصل</p>
              <p className="mb-5 text-xs text-[var(--c-text-faint)]">
                {mySubjectsList.length === 0
                  ? 'قد تحتاج إلى تفعيل كود اشتراك لفتح مواد هذا الفصل'
                  : 'مواد هذا الفصل غير مشمولة باشتراكك الحالي'}
              </p>
              {mySubjectsList.length === 0 && (
                <Link
                  to="/activate-code"
                  data-testid="activate-code-cta"
                  className="press inline-flex min-h-11 items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-bold text-white shadow-md"
                  style={{ background: 'var(--c-primary-700)' }}
                >
                  <Sparkles className="h-4 w-4" /> تفعيل كود
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {/* Activation-code dialog for unentitled subject cards — W15.3.3: kept
          OUTSIDE the tab conditional (global overlay): switching tabs never
          unmounts an open dialog. */}
      {lockedSubject && (
        <ActivationCodeModal subject={lockedSubject} onClose={() => setLockedSubject(null)} />
      )}
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl', className)}
      style={{ background: 'linear-gradient(90deg, var(--cms-ivory-200) 25%, var(--cms-ivory-50) 50%, var(--cms-ivory-200) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}
    />
  );
}
