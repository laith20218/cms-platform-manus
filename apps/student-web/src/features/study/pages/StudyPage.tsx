import { Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3, BookMarked, BookOpen, BookOpenCheck, ClipboardList, Filter, GraduationCap, X,
} from 'lucide-react';
import { cn } from '@/utils';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ProgressTab } from '../components/ProgressTab';
import { ContentTab } from '../components/ContentTab';
import { SubjectScopeBar } from '../components/SubjectScopeBar';
import { LibraryTab } from '../components/LibraryTab';
import { CoursesTab } from '../components/CoursesTab';
import { QuestionBankTab } from '@/features/my-studies/components/QuestionBankTab';
import ExamCourseDetailPage from '@/features/exam-courses/pages/ExamCourseDetailPage';

/**
 * "/study" hub (Wave 15.4.1 → Wave 16.1a → W17.1). The 5-tab home for study
 * resources: progress, content, library, bank, courses.
 *
 * W17.1:
 *   - content      → NEW tab «المحتوى»: the subject's lecture/content cards
 *                    inside the hub (ContentTab — same LectureSummary data
 *                    model as /subjects/:slug, richer counts header).
 *   - Subject scope → the content/library/courses tabs get the shared
 *                    SubjectScopeBar (كل موادي ↔ one subject) in a stable slot
 *                    above the panel; the bank tab keeps its cascade + the
 *                    hub chip (the cascade's subject level is semester-driven).
 *                    Tab order: progress | content | library | bank | courses.
 * W16.1a reshape:
 *   - overview    → REMOVED. progress replaces it as the DEFAULT tab; the
 *                    retired ?tab=overview redirects to ?tab=progress (O1).
 *   - exams       → REMOVED from the hub — the الاختبارات/التدريب sub-tabs
 *                    are a standalone /exams page now (ExamsPage). Legacy
 *                    ?tab=exams redirects there with ?subjectId=/?subtab=
 *                    forwarded (R1).
 *   - leaderboard → REMOVED from the hub — the standalone /leaderboard page
 *                    renders it. Legacy ?tab=leaderboard redirects there (R1).
 *   - bank         → the Question Bank tab (W16.2b): QuestionBankTab owns the
 *                    cascade + the activation gate + the training builder and
 *                    embeds the exam-courses storefront (its دورات سنوات /
 *                    دورات مصنفة lenses) for active subjects; a ?courseId= param
 *                    swaps in the bundle detail (ExamCourseDetailPage) instead.
 *                    Legacy /exam-courses routes redirect into this tab.
 */
const TABS = [
  { key: 'progress', label: 'تقدمي', icon: BarChart3 },
  { key: 'content', label: 'المحتوى', icon: BookMarked },
  { key: 'library', label: 'المكتبة', icon: BookOpen },
  { key: 'bank', label: 'بنك الأسئلة', icon: ClipboardList },
  { key: 'courses', label: 'الكورسات', icon: GraduationCap },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const isTabKey = (value: string | null): value is TabKey =>
  !!value && TABS.some((t) => t.key === value);

export function StudyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const subjectId = searchParams.get('subjectId');

  // Resolve the filtered subject's name for the context chip (same contract
  // as the former hub — entitled subjects only). Called BEFORE the retired-tab
  // redirect below so the hook order is stable on every render.
  const mySubjects = useMySubjects();

  // W16.1a (O1/R1) — retired hub tabs transparently redirect, preserving
  // every other search param (subjectId, subtab, cascade levels…):
  //   ?tab=overview    → /study?tab=progress  (the renamed default tab)
  //   ?tab=exams      → /exams                (standalone page)
  //   ?tab=leaderboard → /leaderboard         (standalone page)
  if (rawTab === 'overview' || rawTab === 'exams' || rawTab === 'leaderboard') {
    const next = new URLSearchParams(searchParams);
    if (rawTab === 'overview') next.set('tab', 'progress');
    else next.delete('tab');
    const target = rawTab === 'overview' ? '/study' : `/${rawTab}`;
    const qs = next.toString();
    return <Navigate to={target + (qs ? '?' + qs : '')} replace />;
  }

  const tab: TabKey = isTabKey(rawTab) ? rawTab : 'progress';
  const filteredSubject = (mySubjects.data ?? []).find((s) => s.id === subjectId) ?? null;
  // W16.1b (D2-a) — the bundle detail deep-link param: ?tab=bank&courseId=…
  // swaps the catalog panel for ExamCourseDetailPage (courseId flows through
  // useSearchParams; the legacy /exam-courses/:courseId route redirects here).
  const courseIdParam = searchParams.get('courseId');

  // Tab switches PRESERVE the full param set (subjectId, cascade levels…)
  // instead of rebuilding the URL from scratch.
  const switchTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const clearSubjectFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('subjectId');
    setSearchParams(next, { replace: true });
  };

  return (
    <div data-testid="study-page" className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
          <BookOpenCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">دراستي</h1>
          <p className="text-sm text-[var(--c-text-muted)]">تقدمك ومحتواك ومكتبتك وبنك أسئلتك وكورساتك في مكان واحد</p>
        </div>
      </div>

      {/* Tabs — horizontally scrollable on mobile with soft edge fades,
          spring-animated active pill (framer-motion layoutId). */}
      <div
        role="tablist"
        aria-label="أقسام دراستي"
        className="fade-edges -mx-4 px-4 sm:mx-0 sm:px-0 mb-6"
      >
        <div className="flex w-full gap-1 overflow-x-auto no-scrollbar rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1.5 sm:w-fit">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={active}
                data-testid={`study-tab-${key}`}
                onClick={() => switchTab(key)}
                className={cn(
                  'press relative inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm transition-colors sm:flex-none',
                  active ? 'font-bold' : 'font-medium text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="study-tab-pill"
                    className="absolute inset-0 rounded-xl shadow-sm"
                    style={{ background: 'var(--c-primary-50)', border: '1px solid var(--c-primary-200)' }}
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                  />
                )}
                <Icon className={cn('relative z-[1] h-4 w-4', active && 'text-[var(--c-primary-700)]')} />
                <span className={cn('relative z-[1]', active && 'text-[var(--c-primary-700)]')}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* W20.1 (owner decision 6) — EVERY subject-context strip now renders
          BELOW the tab row, in one stable slot directly above the active panel:
            progress → the D-48 honesty hint (no scope bar — stats are
                       all-subjects by design; no false subject chrome)
            bank     → the hub context chip (the cascade itself stays inside
                       the bank panel, unchanged)
            content/library/courses → the shared SubjectScopeBar
          The student picks the tab FIRST, then sees (and can change) what the
          panel below is scoped to — tab row above, scope chrome below. */}
      {subjectId && tab === 'progress' && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 mb-4 rounded-2xl border px-4 py-2.5 shadow-sm"
          style={{ background: 'var(--c-primary-50)', borderColor: 'var(--c-primary-200)' }}
          data-testid="study-progress-scope-hint"
        >
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--c-primary-100)] text-[var(--c-primary-700)]">
              <BarChart3 className="w-4 h-4" />
            </span>
            <span className="text-[var(--c-text-muted)]">تقدمك يعرض إحصائيات <strong className="text-[var(--c-primary-700)]">كل موادك</strong> — تصفية المادة تعمل في المحتوى والمكتبة وبنك الأسئلة</span>
          </div>
          <button
            type="button"
            onClick={clearSubjectFilter}
            className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--c-primary-200)] bg-[var(--c-surface)] px-3 text-xs font-semibold text-[var(--c-text-muted)] transition-colors hover:border-[var(--c-primary-400)] hover:text-[var(--c-text)]"
            data-testid="study-progress-scope-clear"
            aria-label="إزالة تصفية المادة"
          >
            <X className="w-3.5 h-3.5" /> إزالة التصفية
          </button>
        </motion.div>
      )}

      {/* Subject filter chip — BANK tab only (W17.1): the bank owns its own
          cascade (semester-driven subject select), and this chip is the hub-level
          context + one-tap clear next to it. */}
      {subjectId && tab === 'bank' && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 mb-4 rounded-2xl border px-4 py-2.5 shadow-sm"
          style={{ background: 'var(--c-primary-50)', borderColor: 'var(--c-primary-200)' }}
          data-testid="study-subject-filter-chip"
        >
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--c-primary-100)] text-[var(--c-primary-700)]">
              <Filter className="w-4 h-4" />
            </span>
            <span className="text-[var(--c-text-muted)]">تعرض الآن محتوى مادة:</span>
            <span className="font-bold text-[var(--c-primary-700)] truncate" data-testid="study-subject-filter-name">
              {mySubjects.isLoading
                ? '…'
                : filteredSubject?.nameAr ?? 'مادة غير مفعّلة'}
            </span>
          </div>
          <button
            type="button"
            onClick={clearSubjectFilter}
            className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--c-primary-200)] bg-[var(--c-surface)] px-3 text-xs font-semibold text-[var(--c-text-muted)] transition-colors hover:border-[var(--c-primary-400)] hover:text-[var(--c-text)]"
            data-testid="study-subject-filter-clear"
            aria-label="إزالة تصفية المادة"
          >
            <X className="w-3.5 h-3.5" /> عرض الكل
          </button>
        </motion.div>
      )}

      {/* W17.1 — the shared subject scope control for the per-subject tabs.
          Stable slot directly under the tab row: the student always sees WHICH
          subject (or «كل موادي») the panel below is scoped to, and can switch
          without leaving the tab. The content tab has no all-subjects mode. */}
      {(tab === 'content' || tab === 'library' || tab === 'courses') && (
        <SubjectScopeBar allowAll={tab !== 'content'} />
      )}

      {/* Tab panels — every surface receives the optional subject filter.
          Each panel gets its own error boundary: one failing API call must
          show a Retry card, never a blank hub. */}
      <div role="tabpanel" data-testid={`study-panel-${tab}`}>
        {tab === 'progress' && (
          <ErrorBoundary title="تعذّر تحميل التقدم">
            <ProgressTab />
          </ErrorBoundary>
        )}
        {tab === 'content' && (
          <ErrorBoundary title="تعذّر تحميل المحتوى">
            <ContentTab subjectId={subjectId} />
          </ErrorBoundary>
        )}
        {tab === 'library' && (
          <ErrorBoundary title="تعذّر تحميل المكتبة">
            <LibraryTab subjectId={subjectId} />
          </ErrorBoundary>
        )}
        {tab === 'bank' && (
          <ErrorBoundary title="تعذّر تحميل بنك الأسئلة">
            {/* W16.2b — the bank tab: QuestionBankTab (cascade + activation gate +
                training builder + the embedded storefront lenses). The bundle detail
                deep link (?courseId=) still swaps the panel — W16.1b (D2-a) contract. */}
            {courseIdParam ? <ExamCourseDetailPage /> : <QuestionBankTab />}
          </ErrorBoundary>
        )}
        {tab === 'courses' && (
          <ErrorBoundary title="تعذّر تحميل الكورسات">
            <CoursesTab subjectId={subjectId} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
