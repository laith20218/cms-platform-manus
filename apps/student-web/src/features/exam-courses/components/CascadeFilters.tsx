import * as SelectPrimitive from '@radix-ui/react-select';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Lock, RotateCcw } from 'lucide-react';
import { cn } from '@/utils';
import {
  academicApi,
  type AcademicYearSummary,
  type CollegeSummary,
  type SemesterSummary,
  type SubjectSummary,
  type UniversitySummary,
} from '@/features/subjects/services/academic-api';

/**
 * W15.0 — the University → College → Year → Semester → Subject cascading filter bar
 * on /exam-courses. Each level rides the EXISTING per-level endpoints (academicApi —
 * DIAG-2: no aggregate tree endpoint exists; levels are cached independently by
 * React Query so revisits are instant). Choosing a level clears everything below it;
 * «الكل» resets that level and its descendants. The subject level lists the selected
 * semester's subjects with ENTITLED ones enabled and non-entitled ones locked —
 * the storefront only opens entitled content (A.1 ruling).
 *
 * Accessibility: Radix Select per level (keyboard + focus), visible trigger labels,
 * 44px targets, flex-wrap for 375px. A failed level query degrades to an empty list
 * (the e2e mock world aborts unmocked routes — never a crash). */

export interface CascadeValue {
  universityId: string | null;
  collegeId: string | null;
  yearId: string | null;
  semesterId: string | null;
}

/** Reset value — module-private (kept out of the export surface so the file stays
 *  fast-refresh-clean; the page composes resets through onChange). */
const EMPTY_CASCADE: CascadeValue = {
  universityId: null,
  collegeId: null,
  yearId: null,
  semesterId: null,
};

export interface CascadeFiltersProps {
  value: CascadeValue;
  /** Fires with children of the changed level already cleared. */
  onChange: (next: CascadeValue) => void;
  /** Currently active subject id (chip- or cascade-chosen) for the 5th select's display. */
  subjectId: string | null;
  onSelectSubject: (subjectId: string) => void;
  /** Entitled subject ids (useMySubjects) — non-entitled options render locked. */
  entitledSubjectIds: ReadonlySet<string>;
}

interface Option {
  id: string;
  label: string;
  disabled?: boolean;
  meta?: string;
}

export function CascadeFilters({ value, onChange, subjectId, onSelectSubject, entitledSubjectIds }: CascadeFiltersProps) {
  const universitiesQuery = useQuery({
    queryKey: ['cascade', 'universities'],
    queryFn: () => academicApi.getUniversities(),
    staleTime: 10 * 60_000,
  });

  const collegesQuery = useQuery({
    queryKey: ['cascade', 'colleges', value.universityId],
    queryFn: () => academicApi.getColleges(value.universityId!),
    enabled: !!value.universityId,
  });
  const yearsQuery = useQuery({
    queryKey: ['cascade', 'years', value.collegeId],
    queryFn: () => academicApi.getYears(value.collegeId!),
    enabled: !!value.collegeId,
  });
  const semestersQuery = useQuery({
    queryKey: ['cascade', 'semesters', value.yearId],
    queryFn: () => academicApi.getSemesters(value.yearId!),
    enabled: !!value.yearId,
  });
  const subjectsQuery = useQuery({
    queryKey: ['cascade', 'subjects', value.semesterId],
    queryFn: () => academicApi.getSubjects(value.semesterId!),
    enabled: !!value.semesterId,
  });

  // Defensive: the universities envelope is { items } but callers/tests may hand an
  // array — normalize once instead of trusting the shape.
  const universities: UniversitySummary[] = Array.isArray(universitiesQuery.data)
    ? universitiesQuery.data
    : universitiesQuery.data?.items ?? [];
  const colleges: CollegeSummary[] = collegesQuery.data ?? [];
  const years: AcademicYearSummary[] = yearsQuery.data ?? [];
  const semesters: SemesterSummary[] = semestersQuery.data ?? [];
  const subjects: SubjectSummary[] = subjectsQuery.data ?? [];

  const universityOptions: Option[] = universities.map((item) => ({ id: item.id, label: item.nameAr, meta: `${item.collegesCount}` }));
  const collegeOptions: Option[] = colleges.map((item) => ({ id: item.id, label: item.nameAr, meta: `${item.yearsCount}` }));
  const yearOptions: Option[] = years.map((item) => ({ id: item.id, label: item.nameAr, meta: `${item.semestersCount}` }));
  const semesterOptions: Option[] = semesters.map((item) => ({ id: item.id, label: item.nameAr, meta: `${item.subjectsCount}` }));
  const subjectOptions: Option[] = subjects.map((item) => ({
    id: item.id,
    label: item.nameAr,
    disabled: !entitledSubjectIds.has(item.id),
    meta: `${item.totalQuestions}`,
  }));

  const setUniversity = (id: string | null) => onChange(id ? { ...EMPTY_CASCADE, universityId: id } : EMPTY_CASCADE);
  const setCollege = (id: string | null) => onChange({ ...value, collegeId: id, yearId: null, semesterId: null });
  const setYear = (id: string | null) => onChange({ ...value, yearId: id, semesterId: null });
  const setSemester = (id: string | null) => onChange({ ...value, semesterId: id });

  const selectedSubjectLabel = subjects.find((item) => item.id === subjectId)?.nameAr;
  const hasAnySelection = value.universityId || value.collegeId || value.yearId || value.semesterId;

  return (
    <section className="mb-4" aria-label="تصفية هرمية" data-testid="cascade-filters">
      <div className="flex flex-wrap items-center gap-2">
        <CascadeSelect
          testId="cascade-select-university"
          label="الجامعة"
          placeholder="كل الجامعات"
          options={universityOptions}
          value={value.universityId}
          loading={universitiesQuery.isLoading}
          onChange={setUniversity}
        />
        <CascadeSelect
          testId="cascade-select-college"
          label="الكلية"
          placeholder="كل الكليات"
          options={collegeOptions}
          value={value.collegeId}
          disabled={!value.universityId}
          loading={!!value.universityId && collegesQuery.isLoading}
          onChange={setCollege}
        />
        <CascadeSelect
          testId="cascade-select-year"
          label="السنة"
          placeholder="كل السنوات"
          options={yearOptions}
          value={value.yearId}
          disabled={!value.collegeId}
          loading={!!value.collegeId && yearsQuery.isLoading}
          onChange={setYear}
        />
        <CascadeSelect
          testId="cascade-select-semester"
          label="الفصل"
          placeholder="كل الفصول"
          options={semesterOptions}
          value={value.semesterId}
          disabled={!value.yearId}
          loading={!!value.yearId && semestersQuery.isLoading}
          onChange={setSemester}
        />
        <CascadeSelect
          testId="cascade-select-subject"
          label="المادة"
          placeholder="اختر فصلاً أولاً"
          options={subjectOptions}
          value={subjectId && subjects.some((item) => item.id === subjectId) ? subjectId : null}
          disabled={!value.semesterId || (!!value.semesterId && subjectsQuery.isLoading)}
          loading={!!value.semesterId && subjectsQuery.isLoading}
          onChange={(id) => id && onSelectSubject(id)}
          selectedLabel={selectedSubjectLabel}
          showLocks
        />

        {hasAnySelection && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_CASCADE)}
            data-testid="cascade-reset"
            aria-label="إعادة تعيين التصفية الهرمية"
            className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--cms-line)] bg-[var(--cms-surface)] px-3.5 text-sm font-semibold text-[var(--cms-text-soft)] transition-colors hover:border-[var(--cms-teal-500)] hover:text-[var(--cms-teal-800)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            إعادة تعيين
          </button>
        )}
      </div>
    </section>
  );
}

function CascadeSelect({
  testId,
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  loading,
  selectedLabel,
  showLocks,
}: {
  testId: string;
  label: string;
  placeholder: string;
  options: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Display override for the trigger when value's label lives outside `options`. */
  selectedLabel?: string;
  showLocks?: boolean;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <SelectPrimitive.Root
      value={value ?? ''}
      onValueChange={(next) => onChange(next === '__all__' ? null : next)}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        className={cn(
          'press inline-flex min-h-11 min-w-[9.5rem] max-w-full items-center justify-between gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cms-teal-700)]',
          value
            ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]'
            : 'border-[var(--cms-line)] bg-[var(--cms-surface)] text-[var(--cms-text-soft)] hover:border-[var(--cms-teal-500)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[var(--cms-text-muted)]">{label}:</span>
          <span className="truncate">
            {loading ? '…' : selectedLabel ?? selected?.label ?? placeholder}
          </span>
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--cms-text-muted)]" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[12rem] overflow-hidden rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            <SelectPrimitive.Item
              value="__all__"
              data-testid={`${testId}-all`}
              className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--cms-text-soft)] outline-none data-[highlighted]:bg-[var(--cms-bg-hover)]"
            >
              {placeholder}
              <SelectPrimitive.ItemIndicator>
                <Check className="h-4 w-4 text-[var(--cms-teal-700)]" aria-hidden="true" />
              </SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.id}
                value={option.id}
                disabled={option.disabled}
                data-testid={`${testId}-${option.id}`}
                className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium outline-none data-[highlighted]:bg-[var(--cms-teal-50)] data-[highlighted]:text-[var(--cms-teal-800)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {option.disabled && showLocks && <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--cms-text-muted)]" aria-hidden="true" />}
                  <span className="truncate" title={option.disabled ? 'يتطلب اشتراكاً فعالاً' : option.label}>{option.label}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {option.meta && (
                    <span className="text-xs text-[var(--cms-text-muted)]" lang="en">
                      {option.meta}
                    </span>
                  )}
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4 text-[var(--cms-teal-700)]" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </span>
              </SelectPrimitive.Item>
            ))}
            {options.length === 0 && !loading && (
              <p className="px-3 py-2 text-xs text-[var(--cms-text-muted)]">لا توجد خيارات</p>
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
