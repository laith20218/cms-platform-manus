import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, BookOpenCheck, ClipboardCheck, Filter, GraduationCap, ListChecks, X } from 'lucide-react';
import { cn } from '@/utils';
import { useMySubjects } from '../hooks/useMySubjects';
import { ExamsCatalogPage } from '@/features/exams/pages/ExamsCatalogPage';
import { CoursesCatalog } from '../components/CoursesCatalog';
import { LibraryHub } from '../components/LibraryHub';
import { PracticeCatalog } from '../components/PracticeCatalog';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

/**
 * "My Studies" hub — one protected entry point that groups the four study
 * surfaces behind query-param tabs (?tab=practice|exams|library|courses).
 * Legacy /exams and /library routes redirect here (see router.tsx).
 *
 * Push 8: the tab strip is horizontally scrollable on mobile (gesture swipe,
 * hidden scrollbar, soft edge fades) with a spring-animated active indicator
 * (framer-motion layoutId). Each tab panel rides inside its own ErrorBoundary
 * — a failing surface (e.g. the courses catalog) shows a Retry card instead of
 * blanking the hub. The optional `?subjectId=` filter renders a dismissible
 * context chip.
 */
const TABS = [
  { key: 'practice', label: 'الدورات', icon: ListChecks },
  { key: 'exams', label: 'الاختبارات', icon: ClipboardCheck },
  { key: 'library', label: 'المكتبة', icon: BookOpen },
  { key: 'courses', label: 'الكورسات', icon: GraduationCap },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function isTabKey(value: string | null): value is TabKey {
  return value === 'practice' || value === 'exams' || value === 'library' || value === 'courses';
}

export default function MyStudiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: TabKey = isTabKey(rawTab) ? rawTab : 'courses';
  const subjectId = searchParams.get('subjectId');

  // Resolve the filtered subject's name for the context chip (entitled case).
  const mySubjects = useMySubjects();
  const filteredSubject = (mySubjects.data ?? []).find((s) => s.id === subjectId) ?? null;

  const switchTab = (key: TabKey) => {
    const next: Record<string, string> = { tab: key };
    if (subjectId) next.subjectId = subjectId;
    setSearchParams(next, { replace: true });
  };

  const clearSubjectFilter = () => setSearchParams({ tab }, { replace: true });

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
          <BookOpenCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">دراستي</h1>
          <p className="text-sm text-[var(--c-text-muted)]">الدورات والاختبارات والمكتبة والكورسات في مكان واحد</p>
        </div>
      </div>

      {/* Subject filter chip: deep links arrive as /my-studies?subjectId=…&tab=… */}
      {subjectId && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 mb-4 rounded-2xl border px-4 py-2.5 shadow-sm"
          style={{ background: 'var(--c-primary-50)', borderColor: 'var(--c-primary-200)' }}
          data-testid="subject-filter-chip"
        >
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--c-primary-100)] text-[var(--c-primary-700)]">
              <Filter className="w-4 h-4" />
            </span>
            <span className="text-[var(--c-text-muted)]">تعرض الآن محتوى مادة:</span>
            <span className="font-bold text-[var(--c-primary-700)] truncate" data-testid="subject-filter-name">
              {mySubjects.isLoading
                ? '…'
                : filteredSubject?.nameAr ?? 'مادة غير مفعّلة'}
            </span>
          </div>
          <button
            type="button"
            onClick={clearSubjectFilter}
            className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--c-primary-200)] bg-[var(--c-surface)] px-3 text-xs font-semibold text-[var(--c-text-muted)] transition-colors hover:border-[var(--c-primary-400)] hover:text-[var(--c-text)]"
            data-testid="subject-filter-clear"
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
                data-testid={`tab-${key}`}
                onClick={() => switchTab(key)}
                className={cn(
                  'press relative inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm transition-colors sm:flex-none',
                  active ? 'font-bold' : 'font-medium text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="my-studies-tab-pill"
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
      <div role="tabpanel" data-testid={`panel-${tab}`}>
        {tab === 'practice' && (
          <ErrorBoundary title="تعذّر تحميل الدورات">
            <PracticeCatalog subjectId={subjectId} />
          </ErrorBoundary>
        )}
        {tab === 'exams' && (
          <ErrorBoundary title="تعذّر تحميل الاختبارات">
            <ExamsCatalogPage subjectId={subjectId} />
          </ErrorBoundary>
        )}
        {tab === 'library' && (
          <ErrorBoundary title="تعذّر تحميل المكتبة">
            <LibraryHub subjectId={subjectId} />
          </ErrorBoundary>
        )}
        {tab === 'courses' && (
          <ErrorBoundary title="تعذّر تحميل الكورسات">
            <CoursesCatalog subjectId={subjectId} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
