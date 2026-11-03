import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BookMarked, CalendarDays, ChevronDown, ClipboardList, GraduationCap,
  Layers, LibraryBig, Loader2, PlayCircle, Tag,
} from 'lucide-react';
import { cn } from '@/utils';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { examCoursesApi, COURSE_TYPE_LABELS, SEMESTER_LABELS, type ExamCourseListItem } from '../services/exam-courses-api';
import { practiceApi, type CategorizedLecture, type CategorizedTree } from '@/features/practice/services/practice-api';
import { isEntitlementDenied, variantForReason } from '@/features/my-studies/services/courses-api';
import { CatalogEntitlementErrorCard, CatalogErrorCard } from '@/features/my-studies/components/CatalogErrorCards';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

/**
 * W14.4 (A.2) — "الدورات الامتحانية" student storefront.
 *
 * Two lenses over one subject:
 *  • دورات سنوات — published bundles (GET /exam-courses/subject/{id}), filtered by
 *    year (default: latest round year) and semester. Year/Semester are calendar
 *    ints (2000-2100 / 1-3) per the admin ExamCourses form, so the default year is
 *    the newest round the subject actually has.
 *  • دورات مصنفة — the practice tree (GET /practice/categorized/{id}): Lecture →
 *    ParagraphTag with "غير مصنف" buckets; a group click starts a filtered
 *    PracticeSession (A.4).
 *
 * A.1: the sidebar entry is rendered only for students holding at least one active
 * subject grant (Sidebar.tsx); a grant-less deep link still renders the locked card.
 */
type TabKey = 'years' | 'categorized';

const TABS: { key: TabKey; label: string; icon: typeof CalendarDays }[] = [
  { key: 'years', label: 'دورات سنوات', icon: CalendarDays },
  { key: 'categorized', label: 'دورات مصنفة', icon: Layers },
];

export default function ExamCoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const mySubjects = useMySubjects();

  const subjects = mySubjects.data ?? [];
  const routeSubjectId = searchParams.get('subjectId');
  const subjectId = routeSubjectId && subjects.some((s) => s.id === routeSubjectId)
    ? routeSubjectId
    : subjects[0]?.id ?? null;
  const tab: TabKey = searchParams.get('tab') === 'categorized' ? 'categorized' : 'years';

  // Year/Semester are display-level filters (one unfiltered fetch per subject,
  // client-side narrowing — the list is small and this avoids refetch churn).
  const [yearOverride, setYearOverride] = useState<number | null>(null);
  const [semesterFilter, setSemesterFilter] = useState<number | null>(null);

  useEffect(() => {
    setYearOverride(null);
    setSemesterFilter(null);
  }, [subjectId]);

  const coursesQuery = useQuery({
    queryKey: ['exam-courses', subjectId],
    queryFn: () => examCoursesApi.getBySubject(subjectId!),
    enabled: tab === 'years' && !!subjectId,
  });

  const treeQuery = useQuery({
    queryKey: ['practice-categorized-tree', subjectId],
    queryFn: () => practiceApi.getCategorizedTree(subjectId!),
    enabled: tab === 'categorized' && !!subjectId,
  });

  const years = useMemo(
    () => Array.from(new Set((coursesQuery.data ?? []).map((course) => course.year))).sort((a, b) => b - a),
    [coursesQuery.data]
  );
  const activeYear = yearOverride ?? years[0] ?? null;
  const visibleCourses = useMemo(
    () => (coursesQuery.data ?? []).filter(
      (course) => (activeYear == null || course.year === activeYear) && (semesterFilter == null || course.semester === semesterFilter)
    ),
    [coursesQuery.data, activeYear, semesterFilter]
  );

  const switchTab = (key: TabKey) => {
    const next: Record<string, string> = { tab: key };
    if (subjectId) next.subjectId = subjectId;
    setSearchParams(next, { replace: true });
  };

  const chooseSubject = (id: string) => {
    setSearchParams({ tab, subjectId: id }, { replace: true });
  };

  const subject = subjects.find((s) => s.id === subjectId) ?? null;

  // ===== shell states =====
  if (mySubjects.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--cms-teal-700)]" aria-hidden="true" />
        <p className="text-sm text-[var(--cms-text-muted)]">جارٍ تحميل موادك…</p>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader />
        <CatalogEntitlementErrorCard
          variant="no-grants"
          onRetry={() => void mySubjects.refetch()}
          testId="exam-courses-locked"
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader subjectName={subject?.nameAr ?? null} />

      {/* Subject chips — entitled subjects only (A.1 visibility ruling). */}
      <FilterRow label="المادة" testId="subject-filter-row">
        {subjects.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === subjectId}
            data-testid={`subject-chip-${item.id}`}
            onClick={() => chooseSubject(item.id)}
            className={cn(
              'press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold transition-colors',
              item.id === subjectId
                ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]'
                : 'border-[var(--cms-line)] bg-[var(--cms-surface)] text-[var(--cms-text-soft)] hover:border-[var(--cms-teal-500)]'
            )}
          >
            <GraduationCap className="w-4 h-4" aria-hidden="true" />
            {item.nameAr}
          </button>
        ))}
      </FilterRow>

      {/* Tabs */}
      <div className="fade-edges -mx-4 px-4 sm:mx-0 sm:px-0 mb-4" role="tablist" aria-label="أقسام الدورات الامتحانية">
        <div className="flex w-full gap-1 overflow-x-auto no-scrollbar rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-1.5 sm:w-fit">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`exam-courses-tab-${key}`}
                onClick={() => switchTab(key)}
                className={cn(
                  'press relative inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm transition-colors sm:flex-none',
                  active ? 'font-bold' : 'font-medium text-[var(--cms-text-muted)] hover:text-[var(--cms-text)]'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="exam-courses-tab-pill"
                    className="absolute inset-0 rounded-xl shadow-sm"
                    style={{ background: 'var(--cms-teal-50)', border: '1px solid var(--cms-teal-600)' }}
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                  />
                )}
                <Icon className={cn('relative z-[1] h-4 w-4', active && 'text-[var(--cms-teal-700)]')} aria-hidden="true" />
                <span className={cn('relative z-[1]', active && 'text-[var(--cms-teal-700)]')}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" data-testid={`exam-courses-panel-${tab}`}>
        {tab === 'years' ? (
          <ErrorBoundary title="تعذّر تحميل الدورات">
            <YearsTab
              query={coursesQuery}
              years={years}
              activeYear={activeYear}
              semesterFilter={semesterFilter}
              onYear={(year) => setYearOverride(year)}
              onSemester={(semester) => setSemesterFilter(semester)}
              visibleCourses={visibleCourses}
              onOpenCourse={(courseId) => navigate(`/exam-courses/${courseId}`)}
              refetch={() => void coursesQuery.refetch()}
            />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary title="تعذّر تحميل التصنيفات">
            <CategorizedTab
              query={treeQuery}
              subjectId={subjectId}
              onStartPractice={(lectureId, untaggedLecture, paragraphTag, untaggedTag) => {
                const params = new URLSearchParams();
                if (lectureId) params.set('lectureId', lectureId);
                if (untaggedLecture) params.set('untaggedLecture', 'true');
                if (paragraphTag) params.set('paragraphTag', paragraphTag);
                if (untaggedTag) params.set('untaggedTag', 'true');
                navigate(`/practice/categorized/${subjectId}?${params.toString()}`);
              }}
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

function PageHeader({ subjectName }: { subjectName?: string | null }) {
  return (
    <header className="flex items-center gap-3 mb-6">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
        <LibraryBig className="w-6 h-6" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-[var(--cms-text)]">الدورات الامتحانية</h1>
        <p className="text-sm text-[var(--cms-text-muted)]">
          {subjectName ? `دورات وتصنيفات مادة ${subjectName}` : 'دورات سنوات وتصنيفات التدريب لكل مادة'}
        </p>
      </div>
    </header>
  );
}

function FilterRow({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <section className="mb-4" aria-label={label} data-testid={testId}>
      <div className="fade-edges -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex w-full gap-2 overflow-x-auto no-scrollbar py-1">{children}</div>
      </div>
    </section>
  );
}

function YearsTab({
  query, years, activeYear, semesterFilter, onYear, onSemester, visibleCourses, onOpenCourse, refetch,
}: {
  query: UseQueryResult<ExamCourseListItem[], Error>;
  years: number[];
  activeYear: number | null;
  semesterFilter: number | null;
  onYear: (year: number | null) => void;
  onSemester: (semester: number | null) => void;
  visibleCourses: ExamCourseListItem[];
  onOpenCourse: (courseId: string) => void;
  refetch: () => void;
}) {
  if (query.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--cms-teal-700)]" aria-hidden="true" />
        <p className="text-sm text-[var(--cms-text-muted)]">جارٍ تحميل الدورات…</p>
      </div>
    );
  }
  if (query.isError) {
    const error = query.error;
    if (isEntitlementDenied(error)) {
      return <CatalogEntitlementErrorCard variant={variantForReason((error as { reason?: string }).reason)} onRetry={refetch} testId="exam-courses-denied" />;
    }
    return <CatalogErrorCard onRetry={refetch} testId="exam-courses-error" title="تعذّر تحميل الدورات" body="حدث خطأ أثناء جلب الدورات الامتحانية. حاول مرة أخرى." />;
  }

  if ((query.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="w-8 h-8 text-[var(--cms-text-muted)]" aria-hidden="true" />}
        title="لا توجد دورات منشورة بعد"
        body="ستظهر هنا دورات هذه المادة فور نشرها من قبل الإدارة."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Year + semester filters */}
      <FilterRow label="السنة" testId="year-filter-row">
        {years.map((year) => (
          <button
            key={year}
            type="button"
            aria-pressed={year === activeYear}
            data-testid={`year-chip-${year}`}
            onClick={() => onYear(year)}
            className={cn(
              'press inline-flex min-h-11 shrink-0 items-center rounded-xl border px-4 text-sm font-bold transition-colors',
              year === activeYear
                ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]'
                : 'border-[var(--cms-line)] bg-[var(--cms-surface)] text-[var(--cms-text-soft)] hover:border-[var(--cms-teal-500)]'
            )}
          >
            <span lang="en">{year}</span>
          </button>
        ))}
      </FilterRow>
      <FilterRow label="الفصل" testId="semester-filter-row">
        <Chip pressed={semesterFilter == null} onClick={() => onSemester(null)} testId="semester-chip-all">الكل</Chip>
        {[1, 2, 3].map((semester) => (
          <Chip key={semester} pressed={semesterFilter === semester} onClick={() => onSemester(semester)} testId={`semester-chip-${semester}`}>
            {SEMESTER_LABELS[semester] ?? `الفصل ${semester}`}
          </Chip>
        ))}
      </FilterRow>

      {visibleCourses.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="w-8 h-8 text-[var(--cms-text-muted)]" aria-hidden="true" />}
          title="لا توجد دورات ضمن هذا التصنيف"
          body="جرّب سنة أو فصلاً آخر من المرشحات أعلاه."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="exam-courses-list">
          {visibleCourses.map((course) => (
            <li key={course.id}>
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                type="button"
                onClick={() => onOpenCourse(course.id)}
                data-testid={`exam-course-card-${course.id}`}
                className="press w-full h-full text-start rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-4 shadow-sm transition-colors hover:border-[var(--cms-teal-500)]"
                aria-label={`فتح ${course.nameAr}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                    <BookMarked className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-[var(--cms-text)] truncate">{course.nameAr}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge><span lang="en">{course.year}</span></Badge>
                      <Badge>{SEMESTER_LABELS[course.semester] ?? `فصل ${course.semester}`}</Badge>
                      <Badge>{COURSE_TYPE_LABELS[course.courseType] ?? course.courseType}</Badge>
                      {course.freeOrPaid ? <Badge tone="warning">مدفوعة</Badge> : <Badge tone="success">مجانية</Badge>}
                    </div>
                    {course.description && <p className="mt-2 text-sm text-[var(--cms-text-muted)] line-clamp-2">{course.description}</p>}
                    <p className="mt-2 text-xs font-semibold text-[var(--cms-teal-700)] flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
                      <span lang="en">{course.examsCount}</span> اختباراً
                    </p>
                  </div>
                </div>
              </motion.button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategorizedTab({
  query, subjectId, onStartPractice,
}: {
  query: UseQueryResult<CategorizedTree, Error>;
  subjectId: string | null;
  onStartPractice: (lectureId: string | null, untaggedLecture: boolean, paragraphTag: string | null, untaggedTag: boolean) => void;
}) {
  const [openLectures, setOpenLectures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenLectures({});
  }, [subjectId]);

  if (query.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--cms-teal-700)]" aria-hidden="true" />
        <p className="text-sm text-[var(--cms-text-muted)]">جارٍ تحميل التصنيفات…</p>
      </div>
    );
  }
  if (query.isError) {
    const error = query.error;
    if (isEntitlementDenied(error)) {
      return <CatalogEntitlementErrorCard variant={variantForReason((error as { reason?: string }).reason)} onRetry={() => void query.refetch()} testId="categorized-denied" />;
    }
    return <CatalogErrorCard onRetry={() => void query.refetch()} testId="categorized-error" title="تعذّر تحميل التصنيفات" body="حدث خطأ أثناء جلب تصنيفات التدريب. حاول مرة أخرى." />;
  }

  const tree = query.data;
  if (!tree || tree.totalQuestions === 0) {
    return (
      <EmptyState
        icon={<Layers className="w-8 h-8 text-[var(--cms-text-muted)]" aria-hidden="true" />}
        title="لا توجد أسئلة تدريب مصنفة بعد"
        body="تُبنى هذه الصفحة من أسئلة المادة المنشورة القابلة للتدريب، مصنّفة حسب المحاضرة ووسم الفقرة."
      />
    );
  }

  const toggle = (key: string) => setOpenLectures((previous) => ({ ...previous, [key]: !previous[key] }));

  return (
    <div className="space-y-3" data-testid="categorized-tree">
      <div className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--cms-text-soft)]">
          إجمالي أسئلة التدريب: <strong className="text-[var(--cms-text)]" lang="en">{tree.totalQuestions}</strong>
          {tree.uncategorizedCount > 0 && (
            <> — منها <strong className="text-[var(--cms-text)]" lang="en">{tree.uncategorizedCount}</strong> غير مصنفة</>
          )}
        </p>
        <span className="text-xs text-[var(--cms-text-muted)]">المحاضرة ← وسم الفقرة</span>
      </div>

      {tree.lectures.map((lecture, index) => {
        const key = lecture.lectureId ?? 'uncategorized';
        const open = openLectures[key] ?? index === 0;
        return (
          <LectureAccordion
            key={key}
            lecture={lecture}
            open={open}
            onToggle={() => toggle(key)}
            onStartPractice={onStartPractice}
          />
        );
      })}
    </div>
  );
}

function LectureAccordion({
  lecture, open, onToggle, onStartPractice,
}: {
  lecture: CategorizedLecture;
  open: boolean;
  onToggle: () => void;
  onStartPractice: (lectureId: string | null, untaggedLecture: boolean, paragraphTag: string | null, untaggedTag: boolean) => void;
}) {
  const panelId = `lecture-panel-${lecture.lectureId ?? 'uncategorized'}`;
  return (
    <div className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={`lecture-accordion-${lecture.lectureId ?? 'uncategorized'}`}
        className="press w-full min-h-14 flex items-center gap-3 p-4 text-start hover:bg-[var(--cms-teal-50)] transition-colors"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
          <BookMarked className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[var(--cms-text)] truncate">{lecture.lectureTitle}</h3>
          <p className="text-xs text-[var(--cms-text-muted)] mt-0.5">
            {lecture.lectureNumber != null && <><span lang="en">{lecture.lectureNumber}</span> • </>}
            <span lang="en">{lecture.questionsCount}</span> سؤالاً • <span lang="en">{lecture.groups.length}</span> تصنيفات
          </p>
        </div>
        <ChevronDown className={cn('w-5 h-5 text-[var(--cms-text-muted)] shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <ul id={panelId} className="border-t border-[var(--cms-line)] divide-y divide-[var(--cms-line)]">
          {lecture.groups.map((group) => {
            const groupLabel = group.paragraphTag ?? 'غير مصنف';
            return (
              <li key={group.paragraphTag ?? '__untagged__'} className="flex items-center justify-between gap-3 p-3.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Tag className="w-4 h-4 text-[var(--cms-text-muted)] shrink-0" aria-hidden="true" />
                  <span className="text-sm font-semibold text-[var(--cms-text)] truncate">{groupLabel}</span>
                  <span className="text-xs text-[var(--cms-text-muted)] shrink-0" lang="en">({group.questionsCount})</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onStartPractice(lecture.lectureId ?? null, lecture.lectureId == null, group.paragraphTag ?? null, group.paragraphTag == null)
                  }
                  data-testid={`start-practice-${lecture.lectureId ?? 'uncategorized'}-${group.paragraphTag ?? 'untagged'}`}
                  className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cms-teal-700)]"
                  style={{ background: 'var(--cms-teal-700)' }}
                  aria-label={`بدء تدريب ${groupLabel} — ${lecture.lectureTitle}`}
                >
                  <PlayCircle className="w-4 h-4" aria-hidden="true" />
                  ابدأ التدريب
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chip({ pressed, onClick, testId, children }: { pressed: boolean; onClick: () => void; testId: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'press inline-flex min-h-11 shrink-0 items-center rounded-xl border px-4 text-sm font-semibold transition-colors',
        pressed
          ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]'
          : 'border-[var(--cms-line)] bg-[var(--cms-surface)] text-[var(--cms-text-soft)] hover:border-[var(--cms-teal-500)]'
      )}
    >
      {children}
    </button>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'success' | 'warning' }) {
  const className = tone === 'success'
    ? 'bg-[var(--cms-success-50)] text-[var(--cms-success)]'
    : tone === 'warning'
      ? 'bg-[var(--cms-warning-50)] text-[var(--cms-warning)]'
      : 'bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]';
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold', className)}>{children}</span>;
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[var(--cms-line-strong)] bg-[var(--cms-surface)] px-8 py-14 text-center" data-testid="exam-courses-empty">
      {icon}
      <h3 className="text-base font-bold text-[var(--cms-text)]">{title}</h3>
      <p className="text-sm text-[var(--cms-text-muted)] max-w-sm">{body}</p>
    </div>
  );
}
