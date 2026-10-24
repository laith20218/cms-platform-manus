import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import * as SelectPrimitive from '@radix-ui/react-select';
import {
  ArrowLeft, BookOpen, BookOpenCheck, Check, ChevronDown, ChevronLeft, ClipboardCheck,
  Clock3, GraduationCap, Layers, LibraryBig, RotateCcw, Sparkles,
} from 'lucide-react';
import { academicApi, type SubjectSummary } from './services/academic-api';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { ActivationCodeModal } from './ActivationCodeModal';
import { BottomSheet } from '@/components/ui/Overlays';
import { cn } from '@/utils';

/**
 * Subjects browser — Push 8 experience redesign.
 *
 * The old page stacked five numbered sections into an endless vertical scroll.
 * The new flow is a guided multi-step wizard with a live BREADCRUMB PATH:
 *
 *   جامعة حمص › الطب البشري › السنة الخامسة › الفصل الأول › (المواد)
 *
 * - The breadcrumb is sticky; every completed segment is tappable — on desktop
 *   (lg+) it opens a Radix Select with the sibling options, on mobile a bottom
 *   sheet slides up. Re-choosing a level gracefully resets everything below.
 * - Below the path, ONLY the next unchosen step renders (big touch targets,
 *   spring transitions) — no wall of collapsed sections.
 * - Subject cards: entitled → smooth route into the filtered My Studies hub;
 *   unentitled → the elegant Radix activation dialog, right here in place.
 */
export default function SubjectsPage() {
  const [selectedUni, setSelectedUni] = useState<string | null>(null);
  const [selectedCollege, setSelectedCollege] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  /** The unentitled subject awaiting an activation code in the modal. */
  const [lockedSubject, setLockedSubject] = useState<{ id: string; nameAr: string } | null>(null);
  /** Mobile: which breadcrumb level is open in the bottom sheet. */
  const [sheetLevel, setSheetLevel] = useState<'uni' | 'college' | 'year' | 'semester' | null>(null);

  const mySubjects = useMySubjects();

  const { data: universities, isLoading: uniLoading } = useQuery({
    queryKey: ['universities'],
    queryFn: () => academicApi.getUniversities(),
  });
  const { data: colleges } = useQuery({
    queryKey: ['colleges', selectedUni],
    queryFn: () => academicApi.getColleges(selectedUni!),
    enabled: !!selectedUni,
  });
  const { data: years } = useQuery({
    queryKey: ['years', selectedCollege],
    queryFn: () => academicApi.getYears(selectedCollege!),
    enabled: !!selectedCollege,
  });
  const { data: semesters } = useQuery({
    queryKey: ['semesters', selectedYear],
    queryFn: () => academicApi.getSemesters(selectedYear!),
    enabled: !!selectedYear,
  });
  const { data: subjects, isFetching: subjectsLoading } = useQuery({
    queryKey: ['subjects', selectedSemester],
    queryFn: () => academicApi.getSubjects(selectedSemester!),
    enabled: !!selectedSemester,
  });

  const uniList = universities?.items ?? [];
  const mySubjectsList = mySubjects.data ?? [];
  const entitledIds = useMemo(
    () => new Set((mySubjects.data ?? []).map((s) => s.id)),
    [mySubjects.data]
  );

  // Breadcrumb labels (resolved from the fetched lists).
  const pathLabels = {
    uni: uniList.find((u) => u.id === selectedUni)?.nameAr,
    college: colleges?.find((c) => c.id === selectedCollege)?.nameAr,
    year: years?.find((y) => y.id === selectedYear)?.nameAr,
    semester: semesters?.find((s) => s.id === selectedSemester)?.nameAr,
  };

  const pickUni = (id: string) => {
    setSelectedUni(id);
    setSelectedCollege(null); setSelectedYear(null); setSelectedSemester(null);
  };
  const pickCollege = (id: string) => {
    setSelectedCollege(id);
    setSelectedYear(null); setSelectedSemester(null);
  };
  const pickYear = (id: string) => {
    setSelectedYear(id);
    setSelectedSemester(null);
  };

  if (uniLoading) {
    return (
      <div className="space-y-4" data-testid="subjects-loading">
        <SkeletonBlock className="h-6 w-56" />
        <SkeletonBlock className="h-14 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-20 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const currentStep: 'uni' | 'college' | 'year' | 'semester' | 'subjects' | 'done'
    = !selectedUni ? 'uni'
    : !selectedCollege ? 'college'
    : !selectedYear ? 'year'
    : !selectedSemester ? 'semester'
    : 'subjects';

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

      {/* ===== Breadcrumb path (sticky) ===== */}
      <div
        className="sticky top-16 z-[calc(var(--z-sticky)-5)] -mx-1 px-1 py-2 backdrop-blur-md rounded-2xl"
        style={{ background: 'color-mix(in srgb, var(--cms-ivory-100) 82%, transparent)' }}
        data-testid="cascade-breadcrumb"
        aria-label="مسار التصفح الأكاديمي"
      >
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <CrumbSelect
            level="uni"
            label="الجامعة"
            selectedId={selectedUni}
            options={uniList.map((u) => ({ value: u.id, label: u.nameAr, hint: `${u.collegesCount} كليات` }))}
            onPick={pickUni}
            onOpenSheet={() => setSheetLevel('uni')}
            active={currentStep === 'uni'}
          />
          {selectedUni && <ChevronSeparator />}
          {selectedUni && (
            <CrumbSelect
              level="college"
              label="الكلية"
              selectedId={selectedCollege}
              options={(colleges ?? []).map((c) => ({ value: c.id, label: c.nameAr, hint: `${c.yearsCount} سنوات` }))}
              onPick={pickCollege}
              onOpenSheet={() => setSheetLevel('college')}
              active={currentStep === 'college'}
            />
          )}
          {selectedCollege && <ChevronSeparator />}
          {selectedCollege && (
            <CrumbSelect
              level="year"
              label="السنة"
              selectedId={selectedYear}
              options={(years ?? []).map((y) => ({ value: y.id, label: y.nameAr, hint: `${y.semestersCount} فصول` }))}
              onPick={pickYear}
              onOpenSheet={() => setSheetLevel('year')}
              active={currentStep === 'year'}
            />
          )}
          {selectedYear && <ChevronSeparator />}
          {selectedYear && (
            <CrumbSelect
              level="semester"
              label="الفصل"
              selectedId={selectedSemester}
              options={(semesters ?? []).map((s) => ({ value: s.id, label: s.nameAr, hint: `${s.subjectsCount} مواد` }))}
              onPick={(id) => setSelectedSemester(id)}
              onOpenSheet={() => setSheetLevel('semester')}
              active={currentStep === 'semester'}
            />
          )}
        </div>
      </div>

      {/* ===== My entitled subjects — one-tap access strip ===== */}
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

      {/* ===== Progressive stepper: only the NEXT step renders ===== */}
      <AnimatePresence mode="wait" initial={false}>
        {/* Step 1 — Universities */}
        {currentStep === 'uni' && (
          <motion.section
            key="step-uni"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <StepLabel step={1} label="اختر الجامعة" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {uniList.map((uni) => (
                <button
                  key={uni.id}
                  onClick={() => pickUni(uni.id)}
                  className="press lift flex min-h-[76px] items-center gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-right transition-all hover:border-[var(--c-primary-300)] hover:shadow-md"
                  data-testid="uni-card"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--c-primary-50)]">
                    <GraduationCap className="h-5 w-5 text-[var(--c-primary-700)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-[var(--c-text)]">{uni.nameAr}</div>
                    <div className="text-xs text-[var(--c-text-muted)]" lang="en">{uni.collegesCount} كليات</div>
                  </div>
                  <ArrowLeft className="ms-auto h-4 w-4 shrink-0 text-[var(--c-text-faint)]" />
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {/* Step 2 — Colleges */}
        {currentStep === 'college' && (
          <motion.section
            key="step-college"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <StepLabel step={2} label={`اختر الكلية في ${pathLabels.uni ?? ''}`} onBack={() => pickUni(selectedUni!)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(colleges ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCollege(c.id)}
                  className="press lift flex min-h-[64px] items-center gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 text-right transition-all hover:border-[var(--c-primary-300)] hover:shadow-md"
                  data-testid="college-chip"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--c-primary-50)]">
                    <BookOpenCheck className="h-[18px] w-[18px] text-[var(--c-primary-700)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[var(--c-text)]">{c.nameAr}</div>
                    <div className="text-[11px] text-[var(--c-text-muted)]" lang="en">{c.yearsCount} سنوات دراسية</div>
                  </div>
                  <ArrowLeft className="ms-auto h-4 w-4 shrink-0 text-[var(--c-text-faint)]" />
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {/* Step 3 — Years (animated segmented control) */}
        {currentStep === 'year' && (
          <motion.section
            key="step-year"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <StepLabel step={3} label={`السنة الدراسية في ${pathLabels.college ?? ''}`} onBack={() => pickCollege(selectedCollege!)} />
            <div
              className="flex w-full gap-1.5 overflow-x-auto no-scrollbar rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1.5 sm:w-fit"
              role="tablist"
              aria-label="السنوات الدراسية"
            >
              {(years ?? []).map((y) => {
                const active = selectedYear === y.id;
                return (
                  <button
                    key={y.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => pickYear(y.id)}
                    className={cn(
                      'press relative min-h-11 whitespace-nowrap rounded-xl px-5 py-2 text-sm font-semibold transition-colors',
                      active ? 'text-white' : 'text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]'
                    )}
                    data-testid="year-tab"
                  >
                    {active && (
                      <motion.span
                        layoutId="year-pill"
                        className="absolute inset-0 rounded-xl shadow-sm"
                        style={{ background: 'var(--c-primary-700)' }}
                        transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                      />
                    )}
                    <span className="relative z-[1]">{y.nameAr}</span>
                  </button>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* Step 4 — Semesters */}
        {currentStep === 'semester' && (
          <motion.section
            key="step-semester"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <StepLabel step={4} label={`الفصل في ${pathLabels.year ?? ''}`} onBack={() => pickYear(selectedYear!)} />
            <div className="flex flex-wrap gap-2">
              {(semesters ?? []).map((s) => {
                const active = selectedSemester === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSemester(s.id)}
                    className={cn(
                      'press inline-flex min-h-11 items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-medium transition-all',
                      active
                        ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)] text-[var(--c-primary-700)] shadow-sm'
                        : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] hover:border-[var(--c-primary-300)]'
                    )}
                    data-testid="semester-chip"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {s.nameAr}
                    <span className="text-[11px] text-[var(--c-text-faint)]" lang="en">{s.subjectsCount}</span>
                  </button>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* Step 5 — Subjects grid */}
        {currentStep === 'subjects' && (
          <motion.section
            key="step-subjects"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <StepLabel step={5} label={`مواد ${pathLabels.semester ?? ''}`} onBack={() => pickYear(selectedYear!)} />
            {subjectsLoading ? (
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
          </motion.section>
        )}
      </AnimatePresence>

      {/* Activation-code dialog for unentitled subject cards */}
      {lockedSubject && (
        <ActivationCodeModal subject={lockedSubject} onClose={() => setLockedSubject(null)} />
      )}

      {/* Mobile bottom sheet for re-choosing a breadcrumb level */}
      <LevelSheet
        level={sheetLevel}
        onClose={() => setSheetLevel(null)}
        titles={{ uni: 'اختر الجامعة', college: 'اختر الكلية', year: 'اختر السنة', semester: 'اختر الفصل' }}
        options={{
          uni: uniList.map((u) => ({ value: u.id, label: u.nameAr, hint: `${u.collegesCount} كليات`, selected: u.id === selectedUni })),
          college: (colleges ?? []).map((c) => ({ value: c.id, label: c.nameAr, hint: `${c.yearsCount} سنوات`, selected: c.id === selectedCollege })),
          year: (years ?? []).map((y) => ({ value: y.id, label: y.nameAr, hint: `${y.semestersCount} فصول`, selected: y.id === selectedYear })),
          semester: (semesters ?? []).map((s) => ({ value: s.id, label: s.nameAr, hint: `${s.subjectsCount} مواد`, selected: s.id === selectedSemester })),
        }}
        onPick={{
          uni: (id) => { pickUni(id); setSheetLevel(null); },
          college: (id) => { pickCollege(id); setSheetLevel(null); },
          year: (id) => { pickYear(id); setSheetLevel(null); },
          semester: (id) => { setSelectedSemester(id); setSheetLevel(null); },
        }}
      />
    </div>
  );
}

// ===== Breadcrumb segment: Radix Select on desktop, bottom-sheet trigger on mobile =====

function CrumbSelect({
  level, label, selectedId, options, onPick, onOpenSheet, active,
}: {
  level: string;
  label: string;
  selectedId: string | null;
  options: { value: string; label: string; hint?: string }[];
  onPick: (id: string) => void;
  onOpenSheet: () => void;
  active: boolean;
}) {
  const selected = options.find((o) => o.value === selectedId);
  return (
    <div className="flex shrink-0 items-center gap-1" data-testid={`crumb-${level}`}>
      {/* Mobile trigger (lg:hidden): opens the bottom sheet */}
      <button
        type="button"
        onClick={onOpenSheet}
        className={cn(
          'press inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-all lg:hidden',
          selected
            ? 'border-[var(--c-primary-200)] bg-[var(--c-primary-50)] text-[var(--c-primary-700)]'
            : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-muted)]'
        )}
        aria-label={`${label}${selected ? `: ${selected.label} — تغيير` : ''}`}
      >
        {selected ? (
          <>
            <Check className="h-3.5 w-3.5" />
            <span className="max-w-[38vw] truncate">{selected.label}</span>
          </>
        ) : (
          <span>{label}…</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {/* Desktop trigger (hidden lg:flex): Radix Select */}
      <SelectPrimitive.Root
        value={selected?.value ?? undefined}
        onValueChange={onPick}
      >
        <SelectPrimitive.Trigger
          aria-label={label}
          className={cn(
            'press hidden lg:inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold outline-none transition-all',
            selected
              ? 'border-[var(--c-primary-200)] bg-[var(--c-primary-50)] text-[var(--c-primary-700)]'
              : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-muted)]',
            active && 'ring-2 ring-[var(--c-primary-100)]'
          )}
        >
          <SelectPrimitive.Value placeholder={`${label}…`} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="select-content z-[var(--z-modal)] overflow-hidden rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl"
            position="popper"
            sideOffset={6}
          >
            <SelectPrimitive.Viewport className="p-1.5">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--c-text)] outline-none transition-colors data-[highlighted]:bg-[var(--c-primary-50)] data-[highlighted]:text-[var(--c-primary-700)]"
                >
                  <SelectPrimitive.ItemIndicator className="inline-flex w-4 justify-center">
                    <Check className="h-4 w-4 text-[var(--c-primary-700)]" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.hint && <span className="ms-auto text-[11px] text-[var(--c-text-faint)]" lang="en">{option.hint}</span>}
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}

function ChevronSeparator() {
  return <ChevronLeft className="h-4 w-4 shrink-0 text-[var(--c-text-faint)]" aria-hidden="true" />;
}

// ===== Mobile bottom sheet listing a level's options =====

function LevelSheet({
  level, onClose, titles, options, onPick,
}: {
  level: 'uni' | 'college' | 'year' | 'semester' | null;
  onClose: () => void;
  titles: Record<'uni' | 'college' | 'year' | 'semester', string>;
  options: Record<'uni' | 'college' | 'year' | 'semester', { value: string; label: string; hint?: string; selected: boolean }[]>;
  onPick: Record<'uni' | 'college' | 'year' | 'semester', (id: string) => void>;
}) {
  const open = level !== null;
  const current = level ?? 'uni';
  return (
    <BottomSheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={titles[current]} testId="level-sheet">
      <div className="space-y-1.5 pb-2">
        {options[current].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPick[current](option.value)}
            className={cn(
              'press flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-right transition-all',
              option.selected
                ? 'border-[var(--c-primary-400)] bg-[var(--c-primary-50)]'
                : 'border-transparent bg-[var(--c-bg)] hover:border-[var(--c-primary-200)]'
            )}
          >
            <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', option.selected ? 'border-[var(--c-primary-700)] bg-[var(--c-primary-700)]' : 'border-[var(--c-border-strong)]')}>
              {option.selected && <Check className="h-3.5 w-3.5 text-white" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-sm font-bold', option.selected ? 'text-[var(--c-primary-700)]' : 'text-[var(--c-text)]')}>{option.label}</span>
              {option.hint && <span className="mt-0.5 block text-[11px] text-[var(--c-text-muted)]" lang="en">{option.hint}</span>}
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ===== Step label with optional back =====

function StepLabel({ step, label, onBack }: { step: number; label: string; onBack?: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
        style={{ background: 'var(--c-primary-700)' }}
        lang="en"
      >
        {step}
      </span>
      <h2 className="min-w-0 flex-1 truncate text-base font-bold text-[var(--c-text)]">{label}</h2>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="press inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]"
          aria-label="رجوع خطوة"
        >
          <RotateCcw className="h-3.5 w-3.5" /> رجوع
        </button>
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

/**
 * A subject card: entitled cards route into the subject-filtered My Studies
 * hub; unentitled cards open the activation dialog in place — never a dead
 * "locked" page.
 */
function SubjectCard({ subject, index, entitled, onLocked }: {
  subject: SubjectSummary;
  index: number;
  entitled: boolean;
  onLocked: (subject: { id: string; nameAr: string }) => void;
}) {
  const navigate = useNavigate();
  const scopes = subject.contentScopes ?? [];
  const canQuestions = scopes.includes('QuestionsExams');
  const canLectures = scopes.includes('LecturesText');
  const canVideoAudio = scopes.includes('VideoAudio');
  const hasLibrary = canLectures || canVideoAudio;

  // Entitled cards land on the tab their grant actually covers.
  const preferredTab = canQuestions ? 'exams' : canVideoAudio ? 'courses' : 'exams';

  const openSubject = () => {
    if (entitled) {
      navigate(`/my-studies?subjectId=${subject.id}&tab=${preferredTab}`);
    } else {
      onLocked({ id: subject.id, nameAr: subject.nameAr });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.05, 0.4) }}>
      <div
        className="flex h-full flex-col rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 transition-all hover:border-[var(--c-primary-300)] hover:shadow-lg"
        data-testid="subject-card"
      >
        <button type="button" onClick={openSubject} className="group block w-full text-right" data-testid="subject-card-open" aria-label={`فتح مادة ${subject.nameAr}`}>
          <div className="mb-3 flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
              style={{ background: subject.color || 'var(--c-primary-700)' }}
            >
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-bold text-[var(--c-text)] transition-colors group-hover:text-[var(--c-primary-700)]">{subject.nameAr}</span>
                {!entitled && (
                  <span className="shrink-0 rounded-full bg-[var(--c-bg-hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--c-text-faint)]" data-testid="subject-card-locked-badge">
                    مقفلة
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-[var(--c-text-muted)]" lang="en">{subject.totalQuestions} سؤال • {subject.totalLectures} محاضرة</div>
            </div>
            <ArrowLeft className="h-4 w-4 shrink-0 text-[var(--c-text-faint)] transition-all group-hover:-translate-x-0.5 group-hover:text-[var(--c-primary-700)]" />
          </div>
        </button>

        {subject.userProgress && (
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-[var(--c-text-muted)]">التقدّم</span>
              <span className="font-semibold text-[var(--c-primary-700)]" lang="en">{subject.userProgress.completedPercentage.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-bg)]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'var(--c-primary-600)' }}
                initial={{ width: 0 }}
                animate={{ width: `${subject.userProgress.completedPercentage}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-[var(--c-border)] pt-3" data-testid="subject-quick-actions">
          <Link
            to={`/subjects/${subject.slug}`}
            className="press inline-flex min-h-9 items-center gap-1 rounded-xl bg-[var(--c-primary-50)] px-3 py-1.5 text-xs font-bold text-[var(--c-primary-700)] transition-colors hover:bg-[var(--c-primary-100)]"
          >
            <BookOpenCheck className="h-3.5 w-3.5" /> المحتوى
          </Link>
          {canQuestions && (
            <Link
              to={`/my-studies?subjectId=${subject.id}&tab=exams`}
              className="press inline-flex min-h-9 items-center gap-1 rounded-xl bg-[var(--c-bg-hover)] px-3 py-1.5 text-xs font-bold text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)]"
              data-testid="quick-action-exams"
            >
              <ClipboardCheck className="h-3.5 w-3.5" /> الاختبارات
            </Link>
          )}
          {hasLibrary && (
            <Link
              to={`/my-studies?subjectId=${subject.id}&tab=library`}
              className="press inline-flex min-h-9 items-center gap-1 rounded-xl bg-[var(--c-bg-hover)] px-3 py-1.5 text-xs font-bold text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)]"
              data-testid="quick-action-library"
            >
              <LibraryBig className="h-3.5 w-3.5" /> المكتبة
            </Link>
          )}
          {canVideoAudio && (
            <Link
              to={`/my-studies?subjectId=${subject.id}&tab=courses`}
              className="press inline-flex min-h-9 items-center gap-1 rounded-xl bg-[var(--c-bg-hover)] px-3 py-1.5 text-xs font-bold text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)]"
              data-testid="quick-action-courses"
            >
              <GraduationCap className="h-3.5 w-3.5" /> الكورسات
            </Link>
          )}
        </div>

        {subject.lastContentUpdatedAt && (
          <div className="mt-2.5 flex items-center gap-1 text-[11px] text-[var(--c-text-faint)]">
            <Clock3 className="h-3 w-3" /> آخر تحديث {new Date(subject.lastContentUpdatedAt).toLocaleDateString('ar-SY')}
          </div>
        )}
      </div>
    </motion.div>
  );
}
