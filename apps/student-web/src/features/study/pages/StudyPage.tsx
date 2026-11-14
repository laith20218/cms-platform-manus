import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3, BookOpen, BookOpenCheck, ClipboardCheck, Filter, GraduationCap,
  LayoutGrid, Trophy, X,
} from 'lucide-react';
import { cn } from '@/utils';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { OverviewTab } from '../components/OverviewTab';
import { ProgressTab } from '../components/ProgressTab';
import { LibraryTab } from '../components/LibraryTab';
import { CoursesTab } from '../components/CoursesTab';
import { ExamsTab } from '../components/ExamsTab';
import { LeaderboardTab } from '../components/LeaderboardTab';

/**
 * "/study" hub (Wave 15.4.1 — PARALLEL BUILD). The 6-tab reshaped home for
 * everything study-related: overview, progress, library, courses, exams,
 * leaderboard. It coexists with the untouched legacy hub (my-studies) until
 * the 15.4.4 cutover — nothing links here yet (no Sidebar/BottomNav entry),
 * it is reachable only via direct URL, and tests navigate straight to it.
 *
 * Structure mirrors MyStudiesPage (tab bar, subject filter chip, error
 * boundaries per panel) with its own `study-*` testids so both hubs can
 * be tested independently during the parallel period.
 */
const TABS = [
  { key: 'overview', label: 'نظرة عامة', icon: LayoutGrid },
  { key: 'progress', label: 'تقدمي', icon: BarChart3 },
  { key: 'library', label: 'المكتبة', icon: BookOpen },
  { key: 'courses', label: 'الكورسات', icon: GraduationCap },
  { key: 'exams', label: 'الاختبارات', icon: ClipboardCheck },
  { key: 'leaderboard', label: 'الصدارة', icon: Trophy },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const isTabKey = (value: string | null): value is TabKey =>
  !!value && TABS.some((t) => t.key === value);

export function StudyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: TabKey = isTabKey(rawTab) ? rawTab : 'overview';
  const subjectId = searchParams.get('subjectId');

  // Resolve the filtered subject's name for the context chip (same contract
  // as MyStudiesPage — entitled subjects only).
  const mySubjects = useMySubjects();
  const filteredSubject = (mySubjects.data ?? []).find((s) => s.id === subjectId) ?? null;

  // Tab switches PRESERVE the full param set (subjectId, cascade levels…)
  // instead of rebuilding the URL from scratch — same contract as MyStudiesPage.
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
          <p className="text-sm text-[var(--c-text-muted)]">نظرة عامة وتقدمك ومكتبتك وكورساتك واختباراتك وصدارتك في مكان واحد</p>
        </div>
      </div>

      {/* Subject filter chip: deep links arrive as /study?subjectId=…&tab=… */}
      {subjectId && (
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

      {/* Tab panels — every surface receives the optional subject filter.
          Each panel gets its own error boundary: one failing API call must
          show a Retry card, never a blank hub. */}
      <div role="tabpanel" data-testid={`study-panel-${tab}`}>
        {tab === 'overview' && (
          <ErrorBoundary title="تعذّر تحميل النظرة العامة">
            <OverviewTab />
          </ErrorBoundary>
        )}
        {tab === 'progress' && (
          <ErrorBoundary title="تعذّر تحميل التقدم">
            <ProgressTab />
          </ErrorBoundary>
        )}
        {tab === 'library' && (
          <ErrorBoundary title="تعذّر تحميل المكتبة">
            <LibraryTab subjectId={subjectId} />
          </ErrorBoundary>
        )}
        {tab === 'courses' && (
          <ErrorBoundary title="تعذّر تحميل الكورسات">
            <CoursesTab subjectId={subjectId} />
          </ErrorBoundary>
        )}
        {tab === 'exams' && (
          <ErrorBoundary title="تعذّر تحميل الاختبارات">
            <ExamsTab subjectId={subjectId} />
          </ErrorBoundary>
        )}
        {tab === 'leaderboard' && (
          <ErrorBoundary title="تعذّر تحميل الصدارة">
            <LeaderboardTab />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
