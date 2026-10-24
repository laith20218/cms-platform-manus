import { useSearchParams } from 'react-router-dom';
import { BookOpen, BookOpenCheck, ClipboardCheck, Filter, GraduationCap, ListChecks, X } from 'lucide-react';
import { cn } from '@/utils';
import { useMySubjects } from '../hooks/useMySubjects';
import { ExamsCatalogPage } from '@/features/exams/pages/ExamsCatalogPage';
import { CoursesCatalog } from '../components/CoursesCatalog';
import { LibraryHub } from '../components/LibraryHub';
import { PracticeCatalog } from '../components/PracticeCatalog';

/**
 * "My Studies" hub — one protected entry point that groups the four study
 * surfaces behind query-param tabs (?tab=practice|exams|library|courses).
 * Legacy /exams and /library routes redirect here (see router.tsx).
 *
 * Push 6: the الدورات (practice / question bank) tab joins the hub, and the
 * optional `?subjectId=` param — set by the subjects browser when the student
 * clicks an entitled subject card — filters every tab down to that subject.
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
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
          <BookOpenCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">دراستي</h1>
          <p className="text-sm text-[var(--c-text-muted)]">الدورات والاختبارات والمكتبة والكورسات في مكان واحد</p>
        </div>
      </div>

      {/* Subject filter chip (Push 6): deep links arrive as /my-studies?subjectId=…&tab=… */}
      {subjectId && (
        <div
          className="flex items-center justify-between gap-3 mb-4 rounded-xl border px-4 py-2.5"
          style={{ background: 'var(--c-primary-50)', borderColor: 'var(--c-primary-200)' }}
          data-testid="subject-filter-chip"
        >
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Filter className="w-4 h-4 shrink-0 text-[var(--c-primary-700)]" />
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
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--c-text-muted)] hover:text-[var(--c-text)] transition-colors shrink-0"
            data-testid="subject-filter-clear"
            aria-label="إزالة تصفية المادة"
          >
            <X className="w-3.5 h-3.5" /> عرض الكل
          </button>
        </div>
      )}

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
            onClick={() => switchTab(key)}
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

      {/* Tab panels — every surface receives the optional subject filter */}
      <div role="tabpanel" data-testid={`panel-${tab}`}>
        {tab === 'practice' && <PracticeCatalog subjectId={subjectId} />}
        {tab === 'exams' && <ExamsCatalogPage subjectId={subjectId} />}
        {tab === 'library' && <LibraryHub subjectId={subjectId} />}
        {tab === 'courses' && <CoursesCatalog subjectId={subjectId} />}
      </div>
    </div>
  );
}
