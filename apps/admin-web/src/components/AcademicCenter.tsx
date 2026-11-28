/**
 * AcademicCenter — institutional academic hierarchy explorer.
 *
 * Composition:
 *   • Page header: section title + subtitle + show/hide archived toggle
 *   • 5-column board (Universities → Colleges → Years → Semesters → Subjects),
 *     responsive grid (1 / 2 / 3 / 5 columns at sm / md / lg / xl)
 *   • Each column: header with icon + count + "add" toggle, scrollable list of items
 *     with teal ring on selection and amber tint on archived items, inline quick-create
 *     form at the bottom (with add button)
 *   • Lecture strip: grid of lecture cards with publish/archive actions + draft/archived chips
 *   • Full lecture create form (separate panel) for the multi-field lecture payload
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling is pure Tailwind.
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Archive, Building2, CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff,
  GraduationCap, Layers, LoaderCircle, Plus, Presentation, RotateCcw,
  School, Send, Stethoscope, X,
} from 'lucide-react';
import { apiRequest, type PagedResult } from '../lib/api';
import { ConfirmDialog } from '@cms/ui';
import { academicIdsOf, useAcademicContext } from '../lib/academicContext';
import { useUiPermissions } from '../hooks/uiPermissionsContext';
import { t, localeOf } from '../lib/dictionary';

type University = { id: string; nameAr: string; nameEn?: string | null; slug: string; collegesCount: number; isArchived: boolean };
type College = { id: string; universityId: string; nameAr: string; nameEn?: string | null; slug: string; yearsCount: number; isArchived: boolean };
type AcademicYear = { id: string; collegeId: string; nameAr: string; nameEn?: string | null; slug: string; yearNumber: number; semestersCount: number; isArchived: boolean };
type Semester = { id: string; academicYearId: string; nameAr: string; nameEn?: string | null; slug: string; semesterNumber: number; subjectsCount: number; isArchived: boolean };
type Subject = { id: string; semesterId: string; nameAr: string; nameEn?: string | null; slug: string; code?: string | null; totalLectures: number; isArchived: boolean };
type Lecture = {
  id: string; subjectId: string; titleAr: string; titleEn?: string | null; slug: string;
  lectureNumber: number; durationMinutes?: number | null; description?: string | null;
  instructorName?: string | null; sourceReference?: string | null; status: string; isArchived: boolean;
};
type AcademicKind = 'university' | 'college' | 'year' | 'semester' | 'subject' | 'lecture';
type StageKey = 'university' | 'college' | 'year' | 'semester' | 'subject';

type QuickForm = { name: string; nameEn: string; number: string; code: string };

type LectureForm = {
  name: string; nameEn: string; number: string; duration: string;
  description: string; instructor: string; source: string;
};

type Props = {
  token: string;
  isSuperAdmin: boolean;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null; titleAr?: string; titleEn?: string | null }) =>
  arabic ? (item.nameAr ?? item.titleAr ?? '') : (item.nameEn ?? item.titleEn ?? item.nameAr ?? item.titleAr ?? '');

const slugify = (value: string) =>
  value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `cms-${Date.now()}`;

const emptyQuickForm = (): QuickForm => ({ name: '', nameEn: '', number: '1', code: '' });

const emptyLectureForm = (): LectureForm => ({
  name: '', nameEn: '', number: '1', duration: '', description: '', instructor: '', source: '',
});

export function AcademicCenter({ token, isSuperAdmin, isArabic, onError, onNotice }: Props) {
  const locale = localeOf(isArabic);
  // Push 3: cosmetic gating — 5 stage adds + lecture add + archive (7 keys).
  // lecture publish stays ungated (out-of-census control); backend policy is the gate.
  const { can } = useUiPermissions();
  const [universities, setUniversities] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  // W14.3 D4: the academic selection lives in the URL query string and is
  // shared across centers (Questions / Exams / Academic / ExamCourses).
  const academic = useAcademicContext();
  const { universityId, collegeId, yearId, semesterId, subjectId } = academic;
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [quickForms, setQuickForms] = useState<Record<StageKey, QuickForm>>({
    university: emptyQuickForm(),
    college: emptyQuickForm(),
    year: emptyQuickForm(),
    semester: emptyQuickForm(),
    subject: emptyQuickForm(),
  });
  const [openQuick, setOpenQuick] = useState<StageKey | null>(null);
  const [lectureForm, setLectureForm] = useState<LectureForm>(emptyLectureForm());
  const [showLectureForm, setShowLectureForm] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<{ kind: AcademicKind; id: string; restore: boolean; name: string } | null>(null);
  // W2 (admin-ui): lecture publish fired on a single click with no confirmation
  // (debt D-10) — publishing makes the lecture student-facing. Now gated by an
  // explicit ConfirmDialog with consequence text.
  const [publishLectureTarget, setPublishLectureTarget] = useState<{ id: string; title: string } | null>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);

  // W14.3 D4: list clearing only — the ids themselves are cleared by the
  // academic-context hook (downstream reset lives in the URL now).
  const resetBelow = (level: 'university' | 'college' | 'year' | 'semester' | 'subject') => {
    if (level === 'university') { setYears([]); setColleges([]); }
    if (level === 'university' || level === 'college') { setSemesters([]); }
    if (level === 'university' || level === 'college' || level === 'year') { setSubjects([]); }
    if (level !== 'subject') { setLectures([]); }
  };

  const archiveSuffix = (includeArchived = showArchived) => (includeArchived ? '&includeArchived=true' : '');

  const loadUniversities = async (includeArchived = showArchived) => {
    const data = await request<PagedResult<University>>(`/api/v1/universities?Page=1&PageSize=100${archiveSuffix(includeArchived)}`);
    setUniversities(data.items);
  };
  const loadColleges = async (id: string, includeArchived = showArchived) => {
    const data = await request<College[]>(`/api/v1/universities/${id}/colleges?includeArchived=${includeArchived}`);
    setColleges(data);
  };
  const loadYears = async (id: string, includeArchived = showArchived) => {
    const data = await request<AcademicYear[]>(`/api/v1/colleges/${id}/years?includeArchived=${includeArchived}`);
    setYears(data);
  };
  const loadSemesters = async (id: string, includeArchived = showArchived) => {
    const data = await request<Semester[]>(`/api/v1/years/${id}/semesters?includeArchived=${includeArchived}`);
    setSemesters(data);
  };
  const loadSubjects = async (id: string, includeArchived = showArchived) => {
    const data = await request<Subject[]>(`/api/v1/semesters/${id}/subjects?includeArchived=${includeArchived}`);
    setSubjects(data);
  };
  const loadLectures = async (id: string, includeArchived = showArchived) => {
    const data = await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${id}/lectures?includeArchived=${includeArchived}`);
    setLectures(data);
  };

  // Initial load — the universities list is the entry directory.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadUniversities().catch((error) => onError(error.message));
    // W14.3 D4: hydrate the cascade lists from the shared URL context
    // (e.g. arriving from the Question Bank with ?univ=…&subject=… already set).
    void (async () => {
      const ids = academicIdsOf(academic);
      if (!ids.universityId && !ids.collegeId && !ids.yearId && !ids.semesterId && !ids.subjectId) return;
      try {
        if (ids.universityId) await loadColleges(ids.universityId);
        if (ids.collegeId) await loadYears(ids.collegeId);
        if (ids.yearId) await loadSemesters(ids.yearId);
        if (ids.semesterId) await loadSubjects(ids.semesterId);
        if (ids.subjectId) await loadLectures(ids.subjectId);
      } catch {
        academic.clear(); // stale context (deleted academic entity?) — drop the URL params
      }
    })();
    // Hydration runs once on mount; loaders/onError are stable per token (Push pattern).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function chooseUniversity(id: string) { academic.chooseUniversity(id); resetBelow('university'); if (id) await loadColleges(id).catch((error) => onError(error.message)); }
  async function chooseCollege(id: string) { academic.chooseCollege(id); resetBelow('college'); if (id) await loadYears(id).catch((error) => onError(error.message)); }
  async function chooseYear(id: string) { academic.chooseYear(id); resetBelow('year'); if (id) await loadSemesters(id).catch((error) => onError(error.message)); }
  async function chooseSemester(id: string) { academic.chooseSemester(id); resetBelow('semester'); if (id) await loadSubjects(id).catch((error) => onError(error.message)); }
  async function chooseSubject(id: string) { academic.chooseSubject(id); resetBelow('subject'); if (id) await loadLectures(id).catch((error) => onError(error.message)); }

  async function toggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    academic.clear();
    setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setLectures([]);
    setOpenQuick(null);
    await loadUniversities(next).catch((error) => onError(error.message));
  }

  async function refreshAfterLifecycle(kind: AcademicKind) {
    if (kind === 'university') return loadUniversities();
    if (kind === 'college' && universityId) return loadColleges(universityId);
    if (kind === 'year' && collegeId) return loadYears(collegeId);
    if (kind === 'semester' && yearId) return loadSemesters(yearId);
    if (kind === 'subject' && semesterId) return loadSubjects(semesterId);
    if (kind === 'lecture' && subjectId) return loadLectures(subjectId);
  }

  async function setArchiveState(kind: AcademicKind, id: string, restore: boolean) {
    setBusy(true);
    try {
      await request(`/api/v1/academic/${kind}/${id}/${restore ? 'restore' : 'archive'}`, { method: 'POST' });
      await refreshAfterLifecycle(kind);
      onNotice(restore
        ? t(locale, 'academic.toasts.itemRestored')
        : t(locale, 'academic.toasts.itemArchived'));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function publishLecture(id: string) {
    setBusy(true);
    try {
      await request(`/api/v1/lectures/${id}/publish`, { method: 'POST' });
      await refreshAfterLifecycle('lecture');
      onNotice(t(locale, 'academic.toasts.lecturePublished'));
      setPublishLectureTarget(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitQuick(kind: StageKey, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = quickForms[kind];
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const slug = slugify(form.name);
      if (kind === 'university') {
        await request('/api/v1/universities', { method: 'POST', body: JSON.stringify({ nameAr: form.name, nameEn: form.nameEn || null, slug, description: null, logoUrl: null }) });
        await loadUniversities();
      } else if (kind === 'college' && universityId) {
        await request('/api/v1/colleges', { method: 'POST', body: JSON.stringify({ universityId, nameAr: form.name, nameEn: form.nameEn || null, slug }) });
        await loadColleges(universityId);
      } else if (kind === 'year' && collegeId) {
        await request('/api/v1/years', { method: 'POST', body: JSON.stringify({ collegeId, nameAr: form.name, nameEn: form.nameEn || null, slug, yearNumber: Number(form.number) }) });
        await loadYears(collegeId);
      } else if (kind === 'semester' && yearId) {
        await request('/api/v1/semesters', { method: 'POST', body: JSON.stringify({ academicYearId: yearId, nameAr: form.name, nameEn: form.nameEn || null, slug, semesterNumber: Number(form.number) }) });
        await loadSemesters(yearId);
      } else if (kind === 'subject' && semesterId) {
        await request('/api/v1/subjects', { method: 'POST', body: JSON.stringify({ semesterId, nameAr: form.name, nameEn: form.nameEn || null, slug, code: form.code || null, description: null, color: '#0f766e' }) });
        await loadSubjects(semesterId);
      } else {
        throw new Error(t(locale, 'academic.errors.parentFirst'));
      }
      setQuickForms((current) => ({ ...current, [kind]: emptyQuickForm() }));
      setOpenQuick(null);
      onNotice(t(locale, 'academic.toasts.itemSaved'));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitLecture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lectureForm.name.trim() || !subjectId) return;
    setBusy(true);
    try {
      const slug = slugify(lectureForm.name);
      await request('/api/v1/lectures', {
        method: 'POST',
        body: JSON.stringify({
          subjectId,
          titleAr: lectureForm.name,
          titleEn: lectureForm.nameEn || null,
          slug,
          lectureNumber: Number(lectureForm.number),
          durationMinutes: lectureForm.duration ? Number(lectureForm.duration) : null,
          description: lectureForm.description || null,
          instructorName: lectureForm.instructor || null,
          sourceReference: lectureForm.source || null,
        }),
      });
      await loadLectures(subjectId);
      setLectureForm(emptyLectureForm());
      setShowLectureForm(false);
      onNotice(t(locale, 'academic.toasts.lectureSaved'));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  const stageConfig = useMemo(() => [
    {
      key: 'university' as StageKey,
      icon: Building2,
      title: t(locale, 'academic.stages.universities'),
      items: universities,
      selected: universityId,
      choose: chooseUniversity,
      canAdd: isSuperAdmin,
      requiresParent: false,
    },
    {
      key: 'college' as StageKey,
      icon: School,
      title: t(locale, 'academic.stages.colleges'),
      items: colleges,
      selected: collegeId,
      choose: chooseCollege,
      canAdd: isSuperAdmin && Boolean(universityId),
      requiresParent: true,
    },
    {
      key: 'year' as StageKey,
      icon: GraduationCap,
      title: t(locale, 'academic.stages.years'),
      items: years,
      selected: yearId,
      choose: chooseYear,
      canAdd: isSuperAdmin && Boolean(collegeId),
      requiresParent: true,
    },
    {
      key: 'semester' as StageKey,
      icon: CalendarDays,
      title: t(locale, 'academic.stages.semesters'),
      items: semesters,
      selected: semesterId,
      choose: chooseSemester,
      canAdd: isSuperAdmin && Boolean(yearId),
      requiresParent: true,
    },
    {
      key: 'subject' as StageKey,
      icon: Stethoscope,
      title: t(locale, 'academic.stages.subjects'),
      items: subjects,
      selected: subjectId,
      choose: chooseSubject,
      canAdd: isSuperAdmin && Boolean(semesterId),
      requiresParent: true,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [universities, colleges, years, semesters, subjects, universityId, collegeId, yearId, semesterId, isSuperAdmin, isArabic]);

  const stageNeedsNumber = (key: StageKey) => key === 'year' || key === 'semester';

  return (
    <section className="space-y-6">
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl"
            style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
          >
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'academic.header.eyebrow')}
            </p>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--cms-text)' }}>
              {t(locale, 'academic.header.title')}
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {t(locale, 'academic.header.subtitle')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggleArchived()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
          style={
            showArchived
              ? { background: 'var(--cms-teal-50)', borderColor: 'var(--cms-teal-500)', color: 'var(--cms-teal-700)' }
              : { background: 'var(--cms-surface)', borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }
          }
        >
          {showArchived ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showArchived ? t(locale, 'academic.header.hideArchived') : t(locale, 'academic.header.showArchived')}
        </button>
      </header>

      {/* ===== Hierarchy board ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stageConfig.map((stage, index) => {
          const Icon = stage.icon;
          const isOpen = openQuick === stage.key;
          return (
            <div
              key={stage.key}
              className="relative rounded-xl border bg-white overflow-hidden flex flex-col"
              style={{ borderColor: 'var(--cms-line)' }}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between gap-2 px-4 py-3 border-b"
                style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-teal-600)' }} />
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--cms-text)' }}>{stage.title}</span>
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold"
                    style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
                  >
                    {stage.items.length}
                  </span>
                </div>
                {/* Push 3: per-stage add button gated by its own key (add-university … add-subject). */}
                {stage.canAdd && can(`btn:academic.add-${stage.key}`) && (
                  <button
                    type="button"
                    title={t(locale, 'academic.add')}
                    onClick={() => setOpenQuick(isOpen ? null : stage.key)}
                    className="p-1 rounded-md transition-colors"
                    style={{ color: isOpen ? 'var(--cms-teal-700)' : 'var(--cms-text-muted)' }}
                  >
                    {isOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </button>
                )}
              </div>

              {/* List */}
              <div className="flex-1 max-h-72 overflow-y-auto p-2 space-y-1">
                {stage.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-8" style={{ color: 'var(--cms-text-muted)' }}>
                    <Icon className="w-5 h-5" style={{ color: 'var(--cms-line-strong)' }} />
                    <p className="mt-2 text-xs">
                      {stage.requiresParent && !stage.canAdd
                        ? t(locale, 'academic.stageList.selectParentFirst')
                        : t(locale, 'academic.stageList.noItems')}
                    </p>
                  </div>
                ) : (
                  stage.items.map((item: University | College | AcademicYear | Semester | Subject) => {
                    const selected = stage.selected === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-stretch gap-1 rounded-lg border transition-colors ${selected ? 'border-transparent' : ''}`}
                        style={
                          selected
                            ? { boxShadow: '0 0 0 2px var(--cms-teal-500)', background: 'var(--cms-teal-50)' }
                            : item.isArchived
                              ? { borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)' }
                              : { borderColor: 'transparent' }
                        }
                      >
                        <button
                          type="button"
                          onClick={() => void stage.choose(item.id)}
                          className="flex-1 min-w-0 text-right px-2.5 py-2 rounded-lg text-sm transition-colors"
                          style={{ color: selected ? 'var(--cms-teal-700)' : 'var(--cms-text)' }}
                        >
                          <strong className="block truncate font-medium text-sm" style={{ color: 'var(--cms-text)' }}>
                            {label(isArabic, item)}
                          </strong>
                          <small className="block text-[10px] truncate font-mono" style={{ color: 'var(--cms-text-muted)' }}>
                            {item.slug}
                          </small>
                          {item.isArchived && (
                            <em
                              className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                              style={{ color: 'var(--cms-warning)', background: 'var(--cms-warning-50)' }}
                            >
                              {t(locale, 'academic.archived')}
                            </em>
                          )}
                        </button>
                        {can('btn:academic.archive') && (
                          <button
                            type="button"
                            disabled={busy}
                            title={item.isArchived ? t(locale, 'academic.restore') : t(locale, 'academic.archive')}
                            onClick={() => setConfirmArchive({
                              kind: stage.key,
                              id: item.id,
                              restore: item.isArchived,
                              name: label(isArabic, item),
                            })}
                            className="w-8 my-1 ml-1 flex items-center justify-center rounded-md transition-colors disabled:opacity-50"
                            style={{ color: 'var(--cms-text-muted)' }}
                          >
                            {item.isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Quick create form */}
              {stage.canAdd && isOpen && (
                <form
                  onSubmit={(event) => void submitQuick(stage.key, event)}
                  className="border-t p-3 space-y-2"
                  style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                >
                  <input
                    required
                    value={quickForms[stage.key].name}
                    onChange={(event) => setQuickForms((current) => ({ ...current, [stage.key]: { ...current[stage.key], name: event.target.value } }))}
                    placeholder={t(locale, 'academic.quickForm.arabicName')}
                    className="w-full px-2.5 py-1.5 rounded-md border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  />
                  <input
                    value={quickForms[stage.key].nameEn}
                    onChange={(event) => setQuickForms((current) => ({ ...current, [stage.key]: { ...current[stage.key], nameEn: event.target.value } }))}
                    placeholder={t(locale, 'academic.quickForm.englishName')}
                    className="w-full px-2.5 py-1.5 rounded-md border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  />
                  {stageNeedsNumber(stage.key) && (
                    <input
                      type="number"
                      min="1"
                      value={quickForms[stage.key].number}
                      onChange={(event) => setQuickForms((current) => ({ ...current, [stage.key]: { ...current[stage.key], number: event.target.value } }))}
                      placeholder={t(locale, 'academic.quickForm.order')}
                      className="w-full px-2.5 py-1.5 rounded-md border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    />
                  )}
                  {stage.key === 'subject' && (
                    <input
                      value={quickForms[stage.key].code}
                      onChange={(event) => setQuickForms((current) => ({ ...current, [stage.key]: { ...current[stage.key], code: event.target.value } }))}
                      placeholder={t(locale, 'academic.quickForm.subjectCode')}
                      className="w-full px-2.5 py-1.5 rounded-md border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    />
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-md text-white text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'var(--cms-teal-700)' }}
                  >
                    {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {t(locale, 'academic.add')}
                  </button>
                </form>
              )}

              {/* Connector chevron */}
              {index < stageConfig.length - 1 && (
                <span className="hidden xl:flex absolute top-1/2 -left-3 -translate-y-1/2 z-10 w-6 h-6 items-center justify-center rounded-full bg-white border text-slate-400 shadow-sm" style={{ borderColor: 'var(--cms-line)' }}>
                  {isArabic ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== Lecture strip ===== */}
      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: 'var(--cms-line)' }}>
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-b flex-wrap"
          style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-600)' }}>
              <Presentation className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'academic.lectures.eyebrow')}
              </p>
              <h3 className="text-base font-bold" style={{ color: 'var(--cms-text)' }}>
                {subjectId
                  ? t(locale, 'academic.lectures.forSubject')
                  : t(locale, 'academic.lectures.selectSubject')}
              </h3>
            </div>
          </div>
          {subjectId && isSuperAdmin && can('btn:academic.add-lecture') && (
            <button
              type="button"
              onClick={() => {
                setLectureForm({ ...emptyLectureForm(), number: String(lectures.length + 1) });
                setShowLectureForm((value) => !value);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors"
              style={{ background: 'var(--cms-teal-700)' }}
            >
              {showLectureForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {t(locale, 'academic.lectures.add')}
            </button>
          )}
        </div>

        <div className="p-5">
          {lectures.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10" style={{ color: 'var(--cms-text-muted)' }}>
              <Presentation className="w-6 h-6" style={{ color: 'var(--cms-line-strong)' }} />
              <p className="mt-2 text-sm">
                {subjectId ? t(locale, 'academic.lectures.empty') : t(locale, 'academic.lectures.selectToBegin')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {lectures.map((lecture) => (
                <article
                  key={lecture.id}
                  className="rounded-lg border p-4 flex gap-3 transition-colors"
                  style={
                    lecture.isArchived
                      ? { borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)' }
                      : { borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }
                  }
                >
                  <div
                    className="shrink-0 w-9 h-9 rounded-lg text-white flex items-center justify-center text-sm font-bold"
                    style={{ background: 'var(--cms-ink-900)' }}
                  >
                    #{lecture.lectureNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-sm font-semibold truncate" style={{ color: 'var(--cms-text)' }}>
                      {label(isArabic, lecture)}
                    </strong>
                    <div className="mt-0.5 space-y-0.5">
                      <small className="block text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                        {lecture.durationMinutes ? t(locale, 'academic.lectures.duration', { count: lecture.durationMinutes }) : '—'}
                      </small>
                      {lecture.instructorName && (
                        <small className="block text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'academic.lectures.instructor', { name: lecture.instructorName })}
                        </small>
                      )}
                      {lecture.sourceReference && (
                        <small className="block text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'academic.lectures.source', { name: lecture.sourceReference })}
                        </small>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {lecture.isArchived && (
                        <em
                          className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--cms-warning)', background: 'var(--cms-warning-50)' }}
                        >
                          {t(locale, 'academic.archived')}
                        </em>
                      )}
                      {lecture.status === 'draft' && (
                        <em
                          className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide text-sky-700 bg-sky-100"
                        >
                          {t(locale, 'academic.lectures.draft')}
                        </em>
                      )}
                      {lecture.status === 'published' && (
                        <em
                          className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50"
                        >
                          {t(locale, 'academic.lectures.published')}
                        </em>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {lecture.status === 'draft' && !lecture.isArchived && (
                      <button
                        type="button"
                        disabled={busy}
                        title={t(locale, 'academic.publish')}
                        onClick={() => setPublishLectureTarget({ id: lecture.id, title: label(isArabic, lecture) })}
                        className="p-1.5 rounded-md transition-colors disabled:opacity-50"
                        style={{ color: 'var(--cms-teal-600)' }}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {can('btn:academic.archive') && (
                      <button
                        type="button"
                        disabled={busy}
                        title={lecture.isArchived ? t(locale, 'academic.restore') : t(locale, 'academic.archive')}
                        onClick={() => setConfirmArchive({
                          kind: 'lecture',
                          id: lecture.id,
                          restore: lecture.isArchived,
                          name: label(isArabic, lecture),
                        })}
                        className="p-1.5 rounded-md transition-colors disabled:opacity-50"
                        style={{ color: 'var(--cms-text-muted)' }}
                      >
                        {lecture.isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Lecture create form (full) ===== */}
      {showLectureForm && subjectId && isSuperAdmin && (
        <form
          onSubmit={(event) => void submitLecture(event)}
          className="rounded-xl border bg-white p-5 space-y-4"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'academic.lectureForm.newLecture')}
            </p>
            <h3 className="text-base font-bold" style={{ color: 'var(--cms-text)' }}>
              {t(locale, 'academic.lectureForm.addToHierarchy')}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'academic.lectureForm.arabicTitle')}
              </span>
              <input
                required
                value={lectureForm.name}
                onChange={(event) => setLectureForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'academic.lectureForm.englishTitle')}
              </span>
              <input
                value={lectureForm.nameEn}
                onChange={(event) => setLectureForm((current) => ({ ...current, nameEn: event.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'academic.lectureForm.lectureNumber')}
              </span>
              <input
                type="number"
                min="1"
                value={lectureForm.number}
                onChange={(event) => setLectureForm((current) => ({ ...current, number: event.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'academic.lectureForm.duration')}
              </span>
              <input
                type="number"
                min="1"
                value={lectureForm.duration}
                onChange={(event) => setLectureForm((current) => ({ ...current, duration: event.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'academic.lectureForm.instructorName')}
              </span>
              <input
                value={lectureForm.instructor}
                onChange={(event) => setLectureForm((current) => ({ ...current, instructor: event.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'academic.lectureForm.sourceReference')}
              </span>
              <input
                value={lectureForm.source}
                onChange={(event) => setLectureForm((current) => ({ ...current, source: event.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </label>
            <label className="block md:col-span-2 lg:col-span-3">
              <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'academic.lectureForm.description')}
              </span>
              <input
                value={lectureForm.description}
                onChange={(event) => setLectureForm((current) => ({ ...current, description: event.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowLectureForm(false); setLectureForm(emptyLectureForm()); }}
              className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              disabled={busy}
            >
              {t(locale, 'academic.cancel')}
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: 'var(--cms-teal-700)' }}
              disabled={busy}
            >
              {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t(locale, 'academic.save')}
            </button>
          </div>
        </form>
      )}

      {/* ===== W2 (admin-ui): explicit confirm before making a draft lecture
          student-facing (was a single unconfirmed click, debt D-10) ===== */}
      <ConfirmDialog
        open={publishLectureTarget !== null}
        onOpenChange={(next) => { if (!next) setPublishLectureTarget(null); }}
        title={t(locale, 'academic.publishConfirm.title')}
        description={publishLectureTarget
          ? t(locale, 'academic.publishConfirm.description', { title: publishLectureTarget.title })
          : undefined}
        confirmLabel={t(locale, 'academic.publish')}
        cancelLabel={t(locale, 'academic.cancel')}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => { if (publishLectureTarget) void publishLecture(publishLectureTarget.id); }}
        testId="lecture-publish-confirm"
      />

      {/* ===== Confirm archive / restore — shared ConfirmDialog ===== */}
      <ConfirmDialog
        open={confirmArchive !== null}
        onOpenChange={(next) => { if (!next && !busy) setConfirmArchive(null); }}
        title={confirmArchive?.restore
          ? t(locale, 'academic.archiveConfirm.restoreTitle', { name: confirmArchive?.name ?? '' })
          : t(locale, 'academic.archiveConfirm.archiveTitle', { name: confirmArchive?.name ?? '' })}
        description={confirmArchive?.restore
          ? t(locale, 'academic.archiveConfirm.restoreText')
          : t(locale, 'academic.archiveConfirm.archiveText')}
        confirmLabel={confirmArchive?.restore ? t(locale, 'academic.restore') : t(locale, 'academic.archive')}
        cancelLabel={t(locale, 'academic.cancel')}
        variant={confirmArchive?.restore ? 'primary' : 'danger'}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => {
          if (!confirmArchive) return;
          const payload = confirmArchive;
          setConfirmArchive(null);
          void setArchiveState(payload.kind, payload.id, payload.restore);
        }}
        testId="academic-archive-confirm"
      />
    </section>
  );
}
