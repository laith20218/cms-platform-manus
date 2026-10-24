import { useSearchParams } from 'react-router-dom';
import { BookOpenCheck, ClipboardCheck, FileText, GraduationCap } from 'lucide-react';
import { cn } from '@/utils';
import { ExamsCatalogPage } from '@/features/exams/pages/ExamsCatalogPage';
import { LibraryCatalogPage } from '@/features/library/LibraryCatalogPage';
import { CoursesCatalog } from '../components/CoursesCatalog';

/**
 * "My Studies" hub — one protected entry point that groups the three study
 * surfaces behind query-param tabs (?tab=courses|exams|library). Legacy
 * /exams and /library routes redirect here (see router.tsx).
 */
const TABS = [
  { key: 'courses', label: 'الكورسات', icon: GraduationCap },
  { key: 'exams', label: 'الاختبارات', icon: ClipboardCheck },
  { key: 'library', label: 'المكتبة', icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function isTabKey(value: string | null): value is TabKey {
  return value === 'courses' || value === 'exams' || value === 'library';
}

export default function MyStudiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: TabKey = isTabKey(rawTab) ? rawTab : 'courses';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
          <BookOpenCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">دراستي</h1>
          <p className="text-sm text-[var(--c-text-muted)]">الكورسات والاختبارات والمكتبة في مكان واحد</p>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="أقسام دراستي"
        className="flex items-center gap-1 p-1 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] mb-6 w-full sm:w-fit"
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            data-testid={`tab-${key}`}
            onClick={() => setSearchParams({ tab: key }, { replace: true })}
            className={cn(
              'flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === key
                ? 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)] font-semibold shadow-sm'
                : 'text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" data-testid={`panel-${tab}`}>
        {tab === 'courses' && <CoursesCatalog />}
        {tab === 'exams' && <ExamsCatalogPage />}
        {tab === 'library' && <LibraryCatalogPage />}
      </div>
    </div>
  );
}
