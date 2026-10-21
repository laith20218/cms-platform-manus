/**
 * ExamsCenter — institutional exam management surface.
 *
 * Composition:
 *   • Page header with section title + live count badge
 *   • Academic hierarchy filter bar (university → college → year → semester → subject)
 *     in a responsive grid
 *   • Toolbar (search · status filter · new exam)
 *   • Responsive exam table (overflow-x-auto) with title, type, subject,
 *     question count, duration, attempts, status badge, and row actions
 *     (results · edit · publish · archive · delete)
 *   • Slide-in editor panel from the right with sections:
 *       — Basic info (title · type · subject · lecture · year · slug · description)
 *       — Availability (duration · passing score · attempts · start/end window)
 *       — Question builder (two-column: selected ↔ candidates with add/remove/reorder)
 *       — Policy checkboxes (shuffle · show results · allow review · show answers)
 *   • Results panel: student, status, score, passed, answered, correct
 *   • Loading skeletons, empty state, custom confirm dialog
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling is pure Tailwind.
 *
 * Functionality preserved:
 *   • Academic hierarchy filters
 *   • Exam list fetch — `/api/v1/admin/exams?subjectId=&page=&pageSize=`
 *   • Exam detail fetch — `/api/v1/admin/exams/{id}`
 *   • Create — `POST /api/v1/admin/exams`
 *   • Update — `PUT /api/v1/admin/exams/{id}`
 *   • Publish — `POST /api/v1/admin/exams/{id}/publish`
 *   • Archive — `POST /api/v1/admin/exams/{id}/archive`
 *   • Delete — `DELETE /api/v1/admin/exams/{id}`
 *   • Question candidates — `GET /api/v1/admin/exams/question-candidates?subjectId=`
 *   • Add questions — `PUT /api/v1/admin/exams/{id}/questions`
 *   • Results — `GET /api/v1/admin/exams/{id}/results`
 *   • Exam types: Final, Midterm, Quiz, Practice
 *   • Question builder (two-column: selected ↔ candidates)
 *   • Policy checkboxes
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle, Archive, ArrowDown, ArrowUp, BarChart3, CheckCircle2,
  ClipboardCheck, Clock, FileText, GraduationCap, ListChecks, LoaderCircle,
  Pencil, Plus, Search, Send, Trash2, X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

type University = { id: string; nameAr: string; nameEn?: string | null };
type College = { id: string; nameAr: string; nameEn?: string | null };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null };
type Semester = { id: string; nameAr: string; nameEn?: string | null };
type Subject = { id: string; nameAr: string; nameEn?: string | null };
type Lecture = { id: string; titleAr: string; titleEn?: string | null };
type ExamStatus = 'Draft' | 'Published' | 'Archived';
type ExamType = 'Final' | 'Midterm' | 'Quiz' | 'Practice';

type ExamSummary = {
  id: string; subjectId: string; lectureId?: string | null; titleAr: string; slug: string;
  examType: string; year: number;
  totalQuestions: number; durationMinutes: number;
  availableFrom?: string | null; availableUntil?: string | null; maxAttempts?: number | null;
  status: ExamStatus; attemptsCount: number; completedCount: number; averageScore?: number | null;
};
type ExamQuestion = { questionId: string; sortOrder: number; text: string; type: string; difficulty: string; lectureName?: string | null; tags: string[] };
type ExamDetails = { exam: ExamConfiguration; questions: ExamQuestion[] };
type ExamConfiguration = {
  id?: string; subjectId: string; lectureId?: string | null;
  titleAr: string; titleEn?: string | null; slug: string; description?: string | null;
  examType: ExamType; year: number; durationMinutes: number;
  totalQuestions?: number; passingScore: number; sortOrder: number;
  availableFrom?: string | null; availableUntil?: string | null; maxAttempts?: number | null;
  shuffleQuestions: boolean; shuffleOptions: boolean;
  showResultsImmediately: boolean; allowReview: boolean;
  showCorrectAnswers: boolean; showExplanations: boolean;
  status?: ExamStatus;
};
type Candidate = { id: string; text: string; type: string; difficulty: string; lectureId?: string | null; lectureName?: string | null; tags: string[] };
type Result = {
  sessionId: string; studentId: string; studentName: string;
  status: string; startedAt: string; completedAt?: string | null;
  answeredQuestions: number; correctAnswers: number;
  score?: number | null; passed?: boolean | null; isFirstAttempt: boolean;
};
type Page<T> = { items: T[]; page: number; pageSize: number; totalCount: number };
type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };
type ConfirmDialog = { exam: ExamSummary; action: 'publish' | 'archive' | 'delete' } | null;

const blankForm = (subjectId = ''): ExamConfiguration => ({
  subjectId, lectureId: null, titleAr: '', titleEn: null, slug: '', description: null,
  examType: 'Final', year: new Date().getFullYear(), durationMinutes: 60,
  passingScore: 60, sortOrder: 0, availableFrom: null, availableUntil: null, maxAttempts: null,
  shuffleQuestions: true, shuffleOptions: true,
  showResultsImmediately: true, allowReview: true, showCorrectAnswers: true, showExplanations: true,
});

const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null; titleAr?: string; titleEn?: string | null }) =>
  arabic ? (item.nameAr ?? item.titleAr ?? '') : (item.nameEn ?? item.titleEn ?? item.nameAr ?? item.titleAr ?? '');

const toInputDate = (value?: string | null) => value ? value.slice(0, 16) : '';
const toIso = (value: string) => value ? new Date(value).toISOString() : null;

// === Badge tone helpers ===
const typeBadgeClass = (type: string) => {
  switch (type) {
    case 'Final': return 'text-red-700 bg-red-50 border-red-200';
    case 'Midterm': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Quiz': return 'text-teal-700 bg-teal-50 border-teal-200';
    case 'Practice': return 'text-sky-700 bg-sky-50 border-sky-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

const statusBadgeClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'published') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'archived') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const typeLabel = (type: string, isArabic: boolean) => {
  switch (type) {
    case 'Final': return isArabic ? 'نهائي' : 'Final';
    case 'Midterm': return isArabic ? 'نصفي' : 'Midterm';
    case 'Quiz': return isArabic ? 'قصير' : 'Quiz';
    case 'Practice': return isArabic ? 'تدريبي' : 'Practice';
    default: return type;
  }
};

const statusLabel = (status: string, isArabic: boolean) => {
  const value = status.toLowerCase();
  if (value === 'published') return isArabic ? 'منشور' : 'Published';
  if (value === 'archived') return isArabic ? 'مؤرشف' : 'Archived';
  return isArabic ? 'مسودة' : 'Draft';
};

export function ExamsCenter({ token, isArabic, onError, onNotice }: Props) {
  // === Academic hierarchy state ===
  const [universities, setUniversities] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [universityId, setUniversityId] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  // === Exams state ===
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // === Editor state ===
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<ExamConfiguration>(blankForm());
  const [selectedQuestions, setSelectedQuestions] = useState<ExamQuestion[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateQuery, setCandidateQuery] = useState('');

  // === Results state ===
  const [resultExam, setResultExam] = useState<ExamSummary | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmDialog>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const selectedIds = useMemo(() => new Set(selectedQuestions.map(question => question.questionId)), [selectedQuestions]);
  const activeSubject = useMemo(() => subjects.find(item => item.id === subjectId), [subjects, subjectId]);

  useEffect(() => {
    void request<{ items: University[] }>('/api/v1/universities?Page=1&PageSize=100')
      .then(data => setUniversities(data.items))
      .catch(error => onError(error instanceof Error ? error.message : 'تعذر تحميل الجامعات.'));
    // The directory is loaded once per authenticated workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!subjectId) { setExams([]); return; }
    const timer = window.setTimeout(() => { void loadExams(); }, 250);
    return () => window.clearTimeout(timer);
    // Server-side filters drive the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, query, statusFilter]);

  useEffect(() => {
    if (!showEditor || !subjectId) { setCandidates([]); return; }
    const timer = window.setTimeout(() => { void loadCandidates(); }, 250);
    return () => window.clearTimeout(timer);
    // Candidate list follows form scope and server-side search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditor, subjectId, form.lectureId, candidateQuery]);

  async function chooseUniversity(id: string) {
    setUniversityId(id); setCollegeId(''); setYearId(''); setSemesterId(''); setSubjectId('');
    setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الكليات.'); }
  }
  async function chooseCollege(id: string) {
    setCollegeId(id); setYearId(''); setSemesterId(''); setSubjectId('');
    setYears([]); setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل السنوات.'); }
  }
  async function chooseYear(id: string) {
    setYearId(id); setSemesterId(''); setSubjectId('');
    setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الفصول.'); }
  }
  async function chooseSemester(id: string) {
    setSemesterId(id); setSubjectId(''); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المواد.'); }
  }
  async function chooseSubject(id: string) {
    setSubjectId(id); setLectures([]); closeEditor();
    if (!id) return;
    try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${id}/lectures`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المحاضرات.'); }
  }

  async function loadExams() {
    if (!subjectId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ subjectId, page: '1', pageSize: '100' });
      if (query.trim()) params.set('search', query.trim());
      if (statusFilter) params.set('status', statusFilter);
      const data = await request<Page<ExamSummary>>(`/api/v1/admin/exams?${params.toString()}`);
      setExams(data.items);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل الاختبارات.');
    } finally { setLoading(false); }
  }

  async function loadCandidates() {
    if (!subjectId) return;
    try {
      const params = new URLSearchParams({ subjectId, page: '1', pageSize: '100' });
      if (form.lectureId) params.set('lectureId', form.lectureId);
      if (candidateQuery.trim()) params.set('search', candidateQuery.trim());
      const data = await request<Page<Candidate>>(`/api/v1/admin/exams/question-candidates?${params.toString()}`);
      setCandidates(data.items);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل الأسئلة المؤهلة للاختبار.');
    }
  }

  function openCreate() {
    if (!subjectId) return;
    setForm(blankForm(subjectId)); setSelectedQuestions([]); setCandidateQuery(''); setShowEditor(true); setResultExam(null);
  }
  function closeEditor() {
    setShowEditor(false); setForm(blankForm(subjectId)); setSelectedQuestions([]); setCandidateQuery('');
  }

  async function openEdit(exam: ExamSummary) {
    setBusy(true); setResultExam(null);
    try {
      const data = await request<ExamDetails>(`/api/v1/admin/exams/${exam.id}`);
      setForm({
        ...data.exam,
        availableFrom: toInputDate(data.exam.availableFrom),
        availableUntil: toInputDate(data.exam.availableUntil),
      });
      setSelectedQuestions(data.questions);
      setShowEditor(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر فتح الاختبار.');
    } finally { setBusy(false); }
  }

  function addCandidate(candidate: Candidate) {
    if (selectedIds.has(candidate.id)) return;
    setSelectedQuestions(current => [...current, {
      questionId: candidate.id, sortOrder: current.length, text: candidate.text,
      type: candidate.type, difficulty: candidate.difficulty,
      lectureName: candidate.lectureName, tags: candidate.tags,
    }]);
  }
  function removeQuestion(id: string) {
    setSelectedQuestions(current => current.filter(question => question.questionId !== id).map((question, index) => ({ ...question, sortOrder: index })));
  }
  function moveQuestion(index: number, direction: -1 | 1) {
    setSelectedQuestions(current => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((question, position) => ({ ...question, sortOrder: position }));
    });
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectId || !form.titleAr.trim() || !form.slug.trim()) return;
    if (form.availableFrom && form.availableUntil && new Date(form.availableUntil) <= new Date(form.availableFrom)) {
      onError(isArabic ? 'يجب أن ينتهي نطاق الإتاحة بعد بدايته.' : 'Availability end must be after its start.');
      return;
    }
    setBusy(true);
    const payload = {
      ...form, subjectId, lectureId: form.lectureId || null,
      titleAr: form.titleAr.trim(), slug: form.slug.trim(),
      titleEn: form.titleEn?.trim() || null, description: form.description?.trim() || null,
      availableFrom: toIso(form.availableFrom ?? ''), availableUntil: toIso(form.availableUntil ?? ''),
      maxAttempts: form.maxAttempts ? Number(form.maxAttempts) : null,
      year: Number(form.year), durationMinutes: Number(form.durationMinutes),
      passingScore: Number(form.passingScore), sortOrder: Number(form.sortOrder),
    };
    try {
      const saved = form.id
        ? await request<ExamConfiguration>(`/api/v1/admin/exams/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await request<ExamConfiguration>('/api/v1/admin/exams', { method: 'POST', body: JSON.stringify(payload) });
      const examId = saved.id ?? form.id;
      if (!examId) throw new Error('لم يعُد الخادم بمعرف الاختبار.');
      await request(`/api/v1/admin/exams/${examId}/questions`, { method: 'PUT', body: JSON.stringify({ questionIds: selectedQuestions.map(question => question.questionId) }) });
      setForm({
        ...saved,
        availableFrom: toInputDate(saved.availableFrom),
        availableUntil: toInputDate(saved.availableUntil),
      });
      onNotice(isArabic ? 'تم حفظ تكوين الاختبار وترتيب أسئلته كمسودة.' : 'Exam configuration and question order saved as a draft.');
      await loadExams();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر حفظ الاختبار.');
    } finally { setBusy(false); }
  }

  async function lifecycle(exam: ExamSummary, action: 'publish' | 'archive') {
    setBusy(true);
    try {
      await request(`/api/v1/admin/exams/${exam.id}/${action}`, { method: 'POST' });
      onNotice(action === 'publish'
        ? (isArabic ? 'تم نشر الاختبار.' : 'Exam published.')
        : (isArabic ? 'تمت أرشفة الاختبار.' : 'Exam archived.'));
      await loadExams();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحديث حالة الاختبار.');
    } finally { setBusy(false); }
  }

  async function deleteExam(exam: ExamSummary) {
    setBusy(true);
    try {
      await request(`/api/v1/admin/exams/${exam.id}`, { method: 'DELETE' });
      onNotice(isArabic ? 'تم حذف الاختبار.' : 'Exam deleted.');
      await loadExams();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر حذف الاختبار.');
    } finally { setBusy(false); }
  }

  async function showResults(exam: ExamSummary) {
    setResultExam(exam); setResultsLoading(true);
    try {
      const data = await request<Page<Result>>(`/api/v1/admin/exams/${exam.id}/results?page=1&pageSize=100`);
      setResults(data.items);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل نتائج الاختبار.');
      setResults([]);
    } finally { setResultsLoading(false); }
  }

  const dir = isArabic ? 'rtl' : 'ltr';

  return (
    <section className="space-y-6" dir={dir}>
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl"
            style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
          >
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {isArabic ? 'إدارة المحتوى الأكاديمي' : 'Academic content management'}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {isArabic ? 'الاختبارات' : 'Exams'}
              {subjectId && (
                <span
                  className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                  style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
                >
                  {exams.length}
                </span>
              )}
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic
                ? 'تصميم الاختبارات، نشرها، وقراءة نتائجها.'
                : 'Design, publish, and audit exam outcomes.'}
            </p>
          </div>
        </div>
        {subjectId && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
            style={{ background: 'var(--cms-teal-700)' }}
            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
          >
            <Plus className="w-4 h-4" />
            {isArabic ? 'اختبار جديد' : 'New exam'}
          </button>
        )}
      </header>

      {/* ===== Academic hierarchy filter bar ===== */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-xl border"
        style={{ background: 'var(--cms-ivory-100)', borderColor: 'var(--cms-line)' }}
      >
        {[
          { label: isArabic ? 'الجامعة' : 'University', value: universityId, onChange: chooseUniversity, items: universities, disabled: false },
          { label: isArabic ? 'الكلية' : 'College', value: collegeId, onChange: chooseCollege, items: colleges, disabled: !universityId },
          { label: isArabic ? 'السنة' : 'Year', value: yearId, onChange: chooseYear, items: years, disabled: !collegeId },
          { label: isArabic ? 'الفصل' : 'Semester', value: semesterId, onChange: chooseSemester, items: semesters, disabled: !yearId },
          { label: isArabic ? 'المادة' : 'Subject', value: subjectId, onChange: chooseSubject, items: subjects, disabled: !semesterId },
        ].map((field) => (
          <label key={field.label} className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
              {field.label}
            </span>
            <select
              value={field.value}
              disabled={field.disabled}
              onChange={(event) => void field.onChange(event.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            >
              <option value="">{isArabic ? `اختر ${field.label}` : `Select ${field.label.toLowerCase()}`}</option>
              {field.items.map(item => (
                <option key={item.id} value={item.id}>{label(isArabic, item)}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {!subjectId ? (
        <div
          className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
            <ClipboardCheck className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
            {isArabic ? 'اختر مادة لفتح إدارة اختباراتِها.' : 'Select a subject to manage its exams.'}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {isArabic ? 'التدرج الأكاديمي أعلاه يقودك من الجامعة إلى المادة.' : 'The hierarchy above leads from university down to subject.'}
          </p>
        </div>
      ) : (
        <>
          {/* ===== Toolbar ===== */}
          <div
            className="flex flex-wrap gap-3 items-center p-4 rounded-xl border bg-white"
            style={{ borderColor: 'var(--cms-line)' }}
          >
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isArabic ? 'ابحث بعنوان الاختبار أو رابطه' : 'Search title or slug'}
                className="w-full pr-10 pl-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            >
              <option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option>
              <option value="Draft">{isArabic ? 'مسودة' : 'Draft'}</option>
              <option value="Published">{isArabic ? 'منشور' : 'Published'}</option>
              <option value="Archived">{isArabic ? 'مؤرشف' : 'Archived'}</option>
            </select>
          </div>

          {/* ===== Exam list ===== */}
          {loading ? (
            <div className="rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="flex items-start gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                        <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
                        <div className="h-5 w-14 rounded-full bg-slate-100 animate-pulse" />
                      </div>
                      <div className="h-4 rounded bg-slate-100 animate-pulse w-3/4" />
                      <div className="h-3 rounded bg-slate-100 animate-pulse w-1/2" />
                    </div>
                    <div className="h-8 w-24 rounded bg-slate-100 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : exams.length === 0 ? (
            <div
              className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16"
              style={{ borderColor: 'var(--cms-line)' }}
            >
              <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
                {isArabic ? 'لا توجد اختبارات' : 'No exams'}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                {isArabic ? 'لا توجد اختبارات ضمن هذه التصفية.' : 'No exams match this filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                  <tr>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'عنوان الاختبار' : 'Exam title'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'النوع' : 'Type'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'المادة' : 'Subject'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'عدد الأسئلة' : 'Questions'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'المدة (دقيقة)' : 'Duration (min)'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'المحاولات' : 'Attempts'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الحالة' : 'Status'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{isArabic ? 'إجراءات' : 'Actions'}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
                  {exams.map(exam => (
                    <tr key={exam.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-sm leading-snug truncate" style={{ color: 'var(--cms-text)' }}>
                          {exam.titleAr}
                        </div>
                        <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--cms-text-muted)' }}>
                          {exam.slug}
                        </div>
                        {(exam.availableFrom || exam.availableUntil || exam.maxAttempts) && (
                          <div className="mt-1 text-[10px] flex flex-wrap gap-2" style={{ color: 'var(--cms-text-muted)' }}>
                            {exam.availableFrom && (
                              <span>{isArabic ? 'من' : 'From'} {new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(exam.availableFrom))}</span>
                            )}
                            {exam.availableUntil && (
                              <span>{isArabic ? 'إلى' : 'Until'} {new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(exam.availableUntil))}</span>
                            )}
                            {exam.maxAttempts && (
                              <span>{isArabic ? 'حد المحاولات' : 'Max attempts'}: {exam.maxAttempts}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${typeBadgeClass(exam.examType)}`}>
                          {typeLabel(exam.examType, isArabic)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                        {activeSubject ? label(isArabic, activeSubject) : exam.subjectId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold" style={{ color: 'var(--cms-text)' }}>{exam.totalQuestions}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
                          <Clock className="w-3.5 h-3.5" />
                          {exam.durationMinutes}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                          {exam.completedCount}<span style={{ color: 'var(--cms-text-muted)' }}>/{exam.attemptsCount}</span>
                        </div>
                        {exam.averageScore != null && (
                          <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                            {isArabic ? 'المعدل' : 'Avg'}: {exam.averageScore.toFixed(0)}%
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(exam.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          {statusLabel(exam.status, isArabic)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title={isArabic ? 'النتائج' : 'Results'}
                            onClick={() => void showResults(exam)}
                            disabled={busy}
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: 'var(--cms-text-muted)' }}
                            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-50)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                            onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                          >
                            <BarChart3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title={isArabic ? 'تعديل' : 'Edit'}
                            onClick={() => void openEdit(exam)}
                            disabled={busy}
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: 'var(--cms-text-muted)' }}
                            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-50)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                            onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {exam.status !== 'Published' && exam.status !== 'Archived' && (
                            <button
                              type="button"
                              title={isArabic ? 'نشر' : 'Publish'}
                              onClick={() => setConfirm({ exam, action: 'publish' })}
                              disabled={busy}
                              className="p-1.5 rounded-md text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                          {exam.status !== 'Archived' && (
                            <button
                              type="button"
                              title={isArabic ? 'أرشفة' : 'Archive'}
                              onClick={() => setConfirm({ exam, action: 'archive' })}
                              disabled={busy}
                              className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            title={isArabic ? 'حذف' : 'Delete'}
                            onClick={() => setConfirm({ exam, action: 'delete' })}
                            disabled={busy}
                            className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== Slide-in editor ===== */}
          {showEditor && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/40"
                onMouseDown={closeEditor}
                role="presentation"
              />
              <aside
                className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md lg:max-w-2xl bg-white shadow-2xl overflow-y-auto"
                role="dialog"
                aria-modal="true"
                onMouseDown={(event) => event.stopPropagation()}
                style={{ boxShadow: 'var(--cms-shadow-xl)' }}
              >
                <form onSubmit={event => void saveDraft(event)} className="flex flex-col min-h-full">
                  {/* Editor header */}
                  <div
                    className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b backdrop-blur"
                    style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface-glass)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                        {form.id ? (isArabic ? 'تعديل الاختبار' : 'Edit exam') : (isArabic ? 'اختبار جديد' : 'New exam')}
                      </p>
                      <h3 className="text-base font-bold truncate" style={{ color: 'var(--cms-text)' }}>
                        {activeSubject ? label(isArabic, activeSubject) : (isArabic ? 'الاختبارات' : 'Exams')}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: 'var(--cms-text-muted)' }}
                      onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-ivory-200)'; }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Editor body */}
                  <div className="flex-1 px-5 py-4 space-y-5">
                    {/* === Basic info section === */}
                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                          {isArabic ? 'المعلومات الأساسية' : 'Basic info'}
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'عنوان الاختبار (بالعربية)' : 'Exam title (Arabic)'}
                          </span>
                          <input
                            required
                            value={form.titleAr}
                            onChange={event => setForm(current => ({ ...current, titleAr: event.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'العنوان الإنجليزي (اختياري)' : 'English title (optional)'}
                          </span>
                          <input
                            value={form.titleEn ?? ''}
                            onChange={event => setForm(current => ({ ...current, titleEn: event.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'الرابط المختصر' : 'Slug'}
                          </span>
                          <input
                            required
                            dir="ltr"
                            pattern="[a-z0-9-]+"
                            value={form.slug}
                            onChange={event => setForm(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'النوع' : 'Type'}
                          </span>
                          <select
                            value={form.examType}
                            onChange={event => setForm(current => ({ ...current, examType: event.target.value as ExamType }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          >
                            <option value="Final">{isArabic ? 'نهائي' : 'Final'}</option>
                            <option value="Midterm">{isArabic ? 'نصفي' : 'Midterm'}</option>
                            <option value="Quiz">{isArabic ? 'قصير' : 'Quiz'}</option>
                            <option value="Practice">{isArabic ? 'تدريبي' : 'Practice'}</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'المحاضرة (اختياري)' : 'Lecture (optional)'}
                          </span>
                          <select
                            value={form.lectureId ?? ''}
                            onChange={event => { setForm(current => ({ ...current, lectureId: event.target.value || null })); setSelectedQuestions([]); }}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          >
                            <option value="">{isArabic ? 'على مستوى المادة' : 'Subject-wide'}</option>
                            {lectures.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'السنة' : 'Year'}
                          </span>
                          <input
                            required
                            min="1"
                            type="number"
                            value={form.year}
                            onChange={event => setForm(current => ({ ...current, year: Number(event.target.value) }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block md:col-span-2">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'الوصف (اختياري)' : 'Description (optional)'}
                          </span>
                          <textarea
                            rows={3}
                            value={form.description ?? ''}
                            onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                      </div>
                    </section>

                    {/* === Availability section === */}
                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                          {isArabic ? 'الإتاحة والتوقيت' : 'Availability & timing'}
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'المدة (دقيقة)' : 'Duration (min)'}
                          </span>
                          <input
                            required
                            min="1"
                            type="number"
                            value={form.durationMinutes}
                            onChange={event => setForm(current => ({ ...current, durationMinutes: Number(event.target.value) }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'درجة النجاح %' : 'Passing score %'}
                          </span>
                          <input
                            required
                            min="0"
                            max="100"
                            step="0.01"
                            type="number"
                            value={form.passingScore}
                            onChange={event => setForm(current => ({ ...current, passingScore: Number(event.target.value) }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'ترتيب العرض' : 'Display order'}
                          </span>
                          <input
                            required
                            min="0"
                            type="number"
                            value={form.sortOrder}
                            onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'الحد الأقصى للمحاولات' : 'Max attempts'}
                          </span>
                          <input
                            min="1"
                            type="number"
                            value={form.maxAttempts ?? ''}
                            onChange={event => setForm(current => ({ ...current, maxAttempts: event.target.value ? Number(event.target.value) : null }))}
                            placeholder={isArabic ? 'غير محدود' : 'Unlimited'}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'متاح من' : 'Available from'}
                          </span>
                          <input
                            type="datetime-local"
                            value={toInputDate(form.availableFrom)}
                            onChange={event => setForm(current => ({ ...current, availableFrom: event.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'متاح حتى' : 'Available until'}
                          </span>
                          <input
                            type="datetime-local"
                            value={toInputDate(form.availableUntil)}
                            onChange={event => setForm(current => ({ ...current, availableUntil: event.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                      </div>
                    </section>

                    {/* === Policy checkboxes section === */}
                    <section
                      className="space-y-2 p-4 rounded-lg border"
                      style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                    >
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                          {isArabic ? 'سياسات الاختبار' : 'Exam policies'}
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" checked={form.shuffleQuestions} onChange={event => setForm(current => ({ ...current, shuffleQuestions: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                          {isArabic ? 'ترتيب الأسئلة عشوائي' : 'Shuffle questions'}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" checked={form.shuffleOptions} onChange={event => setForm(current => ({ ...current, shuffleOptions: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                          {isArabic ? 'ترتيب الخيارات عشوائي' : 'Shuffle options'}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" checked={form.showResultsImmediately} onChange={event => setForm(current => ({ ...current, showResultsImmediately: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                          {isArabic ? 'إظهار النتيجة بعد التسليم' : 'Show results after submission'}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" checked={form.allowReview} onChange={event => setForm(current => ({ ...current, allowReview: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                          {isArabic ? 'السماح بالمراجعة' : 'Allow review'}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" disabled={!form.allowReview} checked={form.showCorrectAnswers} onChange={event => setForm(current => ({ ...current, showCorrectAnswers: event.target.checked }))} className="h-4 w-4 accent-teal-600 disabled:opacity-50" />
                          {isArabic ? 'عرض الإجابة الصحيحة' : 'Show correct answers'}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" disabled={!form.allowReview} checked={form.showExplanations} onChange={event => setForm(current => ({ ...current, showExplanations: event.target.checked }))} className="h-4 w-4 accent-teal-600 disabled:opacity-50" />
                          {isArabic ? 'عرض الشرح' : 'Show explanations'}
                        </label>
                      </div>
                    </section>

                    {/* === Question builder section === */}
                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ListChecks className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                          {isArabic ? 'بناء الأسئلة' : 'Question builder'}
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Selected questions column */}
                        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cms-line)' }}>
                          <div
                            className="flex items-center justify-between gap-2 px-4 py-3 border-b"
                            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-teal-50)' }}
                          >
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-teal-700)' }}>
                                {isArabic ? 'أسئلة مختارة' : 'Selected questions'}
                              </p>
                              <h5 className="text-sm font-bold" style={{ color: 'var(--cms-text)' }}>
                                {selectedQuestions.length} {isArabic ? 'سؤال' : 'questions'}
                              </h5>
                            </div>
                            <ListChecks className="w-5 h-5" style={{ color: 'var(--cms-teal-700)' }} />
                          </div>
                          <div className="p-3 max-h-96 overflow-y-auto space-y-2">
                            {selectedQuestions.length === 0 ? (
                              <div className="flex flex-col items-center justify-center text-center py-8" style={{ color: 'var(--cms-text-muted)' }}>
                                <FileText className="w-6 h-6 opacity-50" />
                                <p className="mt-2 text-xs">
                                  {isArabic ? 'أضف أسئلة منشورة من القائمة المقابلة.' : 'Add published questions from the candidate list.'}
                                </p>
                              </div>
                            ) : selectedQuestions.map((question, index) => (
                              <article
                                key={question.questionId}
                                className="flex gap-2 p-2 rounded-lg border bg-white"
                                style={{ borderColor: 'var(--cms-line)' }}
                              >
                                <span
                                  className="shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                                  style={{ background: 'var(--cms-ink-900)' }}
                                >
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <strong className="block text-xs font-medium leading-snug" style={{ color: 'var(--cms-text)' }}>
                                    {question.text}
                                  </strong>
                                  <small className="block mt-0.5 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                                    {typeLabel(question.type, isArabic)} · {question.lectureName ?? (isArabic ? 'على مستوى المادة' : 'Subject-wide')}
                                  </small>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    type="button"
                                    title={isArabic ? 'أعلى' : 'Up'}
                                    disabled={index === 0}
                                    onClick={() => moveQuestion(index, -1)}
                                    className="p-0.5 rounded transition-colors disabled:opacity-30"
                                    style={{ color: 'var(--cms-text-muted)' }}
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title={isArabic ? 'أسفل' : 'Down'}
                                    disabled={index === selectedQuestions.length - 1}
                                    onClick={() => moveQuestion(index, 1)}
                                    className="p-0.5 rounded transition-colors disabled:opacity-30"
                                    style={{ color: 'var(--cms-text-muted)' }}
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title={isArabic ? 'إزالة' : 'Remove'}
                                    onClick={() => removeQuestion(question.questionId)}
                                    className="p-0.5 rounded text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>

                        {/* Available candidates column */}
                        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--cms-line)' }}>
                          <div
                            className="flex items-center justify-between gap-2 px-4 py-3 border-b"
                            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-100)' }}
                          >
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                                {isArabic ? 'أسئلة متاحة' : 'Available questions'}
                              </p>
                              <h5 className="text-sm font-bold" style={{ color: 'var(--cms-text)' }}>
                                {isArabic ? 'المنشورة والمصححة آلياً' : 'Published, auto-graded'}
                              </h5>
                            </div>
                          </div>
                          <div className="p-3 space-y-2">
                            <div className="relative">
                              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <input
                                value={candidateQuery}
                                onChange={event => setCandidateQuery(event.target.value)}
                                placeholder={isArabic ? 'ابحث في نص السؤال' : 'Search question text'}
                                className="w-full pr-9 pl-3 py-1.5 rounded-md border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ borderColor: 'var(--cms-line-strong)' }}
                              />
                            </div>
                            <div className="max-h-80 overflow-y-auto space-y-2">
                              {candidates.length === 0 ? (
                                <p className="text-center text-xs py-6" style={{ color: 'var(--cms-text-muted)' }}>
                                  {isArabic ? 'لا توجد أسئلة مؤهلة.' : 'No eligible questions.'}
                                </p>
                              ) : candidates.map(candidate => {
                                const picked = selectedIds.has(candidate.id);
                                return (
                                  <button
                                    type="button"
                                    key={candidate.id}
                                    onClick={() => addCandidate(candidate)}
                                    disabled={picked}
                                    className={`w-full flex items-start gap-2 p-2 rounded-lg border text-right transition-colors ${picked ? 'opacity-70 cursor-not-allowed' : ''}`}
                                    style={picked
                                      ? { borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }
                                      : { borderColor: 'var(--cms-line)', background: 'white' }}
                                    onMouseEnter={(event) => { if (!picked) { event.currentTarget.style.borderColor = 'var(--cms-teal-400)'; event.currentTarget.style.background = 'var(--cms-teal-50)'; } }}
                                    onMouseLeave={(event) => { if (!picked) { event.currentTarget.style.borderColor = 'var(--cms-line)'; event.currentTarget.style.background = 'white'; } }}
                                  >
                                    <span className="shrink-0 mt-0.5" style={{ color: picked ? 'var(--cms-teal-700)' : 'var(--cms-text-muted)' }}>
                                      {picked ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <strong className="block text-xs font-medium leading-snug" style={{ color: 'var(--cms-text)' }}>
                                        {candidate.text}
                                      </strong>
                                      <small className="block mt-0.5 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                                        {typeLabel(candidate.type, isArabic)} · {candidate.difficulty} · {candidate.lectureName ?? (isArabic ? 'على مستوى المادة' : 'Subject-wide')}
                                      </small>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Action bar */}
                  <div
                    className="sticky bottom-0 flex items-center gap-2 justify-end px-5 py-3 border-t bg-white"
                    style={{ borderColor: 'var(--cms-line)' }}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={closeEditor}
                      className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                    >
                      {isArabic ? 'إغلاق' : 'Close'}
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                      style={{ background: 'var(--cms-teal-700)' }}
                      onMouseEnter={(event) => { if (!busy) event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
                    >
                      {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {isArabic ? 'حفظ كمسودة' : 'Save as draft'}
                    </button>
                  </div>
                </form>
              </aside>
            </>
          )}

          {/* ===== Results panel ===== */}
          {resultExam && (
            <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: 'var(--cms-line)' }}>
              <div
                className="flex items-start justify-between gap-3 px-5 py-4 border-b"
                style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-100)' }}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                    {isArabic ? 'النتائج' : 'Results'}
                  </p>
                  <h3 className="text-base font-bold" style={{ color: 'var(--cms-text)' }}>
                    {resultExam.titleAr}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setResultExam(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                  style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                >
                  <X className="w-3.5 h-3.5" />
                  {isArabic ? 'إغلاق' : 'Close'}
                </button>
              </div>
              <div className="p-5">
                {resultsLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3, 4].map((row) => (
                      <div key={row} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 rounded bg-slate-100 animate-pulse w-1/3" />
                          <div className="h-3 rounded bg-slate-100 animate-pulse w-1/4" />
                        </div>
                        <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12" style={{ color: 'var(--cms-text-muted)' }}>
                    <BarChart3 className="w-6 h-6 opacity-50" />
                    <p className="mt-2 text-sm">
                      {isArabic ? 'لا توجد محاولات بعد.' : 'No attempts yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--cms-line)' }}>
                    <table className="w-full text-sm">
                      <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                        <tr>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الطالب' : 'Student'}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الحالة' : 'Status'}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الدرجة' : 'Score'}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'النتيجة' : 'Result'}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الإجابات' : 'Answered'}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'إجابات صحيحة' : 'Correct answers'}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'البداية' : 'Started'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
                        {results.map(result => {
                          const passed = result.passed === true;
                          const failed = result.passed === false;
                          return (
                            <tr key={result.sessionId} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                                    style={{
                                      background: passed ? 'var(--cms-success-50)' : failed ? 'var(--cms-danger-50)' : 'var(--cms-ivory-200)',
                                      color: passed ? 'var(--cms-success)' : failed ? 'var(--cms-danger)' : 'var(--cms-text-soft)',
                                    }}
                                  >
                                    {result.studentName?.[0]?.toUpperCase() ?? 'S'}
                                  </div>
                                  <span className="font-medium" style={{ color: 'var(--cms-text)' }}>{result.studentName}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(result.status)}`}>
                                  {result.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                                  {result.score == null ? '—' : `${result.score.toFixed(0)}%`}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {passed && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border text-emerald-700 bg-emerald-50 border-emerald-200">
                                    {isArabic ? 'ناجح' : 'Passed'}
                                  </span>
                                )}
                                {failed && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border text-red-700 bg-red-50 border-red-200">
                                    {isArabic ? 'راسب' : 'Failed'}
                                  </span>
                                )}
                                {result.passed == null && (
                                  <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>—</span>
                                )}
                              </td>
                              <td className="px-4 py-3" style={{ color: 'var(--cms-text-soft)' }}>
                                {result.answeredQuestions}
                              </td>
                              <td className="px-4 py-3" style={{ color: 'var(--cms-text-soft)' }}>
                                {result.correctAnswers}/{result.answeredQuestions}
                              </td>
                              <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                                {new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.startedAt))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* ===== Confirm dialog for publish / archive / delete ===== */}
      {confirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={() => !busy && setConfirm(null)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full"
            role="dialog"
            aria-modal="true"
            style={{ boxShadow: 'var(--cms-shadow-xl)' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-5 border-b" style={{ borderColor: 'var(--cms-line)' }}>
              <div
                className="p-2 rounded-lg"
                style={{
                  background: confirm.action === 'archive' ? 'var(--cms-warning-50)'
                    : confirm.action === 'delete' ? 'var(--cms-danger-50)'
                    : 'var(--cms-teal-50)',
                  color: confirm.action === 'archive' ? 'var(--cms-warning)'
                    : confirm.action === 'delete' ? 'var(--cms-danger)'
                    : 'var(--cms-teal-700)',
                }}
              >
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                  {confirm.action === 'publish'
                    ? (isArabic ? 'نشر الاختبار' : 'Publish exam')
                    : confirm.action === 'archive'
                    ? (isArabic ? 'أرشفة الاختبار' : 'Archive exam')
                    : (isArabic ? 'حذف الاختبار' : 'Delete exam')}
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--cms-text-soft)' }}>
                  {confirm.action === 'publish'
                    ? (isArabic ? 'لا يقبل النشر إلا الأسئلة المنشورة والمؤهلة.' : 'Only published, eligible questions can be used.')
                    : confirm.action === 'archive'
                    ? (isArabic ? 'سيُخفى الاختبار من قائمة الطلاب.' : 'The exam will be removed from student discovery.')
                    : (isArabic ? 'هذا الإجراء دائم. سيُحذف الاختبار نهائياً.' : 'This action is permanent. The exam will be removed permanently.')}
                </p>
                <p className="text-sm font-medium mt-2 truncate" style={{ color: 'var(--cms-text)' }}>
                  "{confirm.exam.titleAr}"
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end p-5">
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
              >
                {isArabic ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  const exam = confirm.exam;
                  const action = confirm.action;
                  setConfirm(null);
                  if (action === 'delete') void deleteExam(exam);
                  else void lifecycle(exam, action);
                }}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
                style={{
                  background: confirm.action === 'archive' ? 'var(--cms-warning)'
                    : confirm.action === 'delete' ? 'var(--cms-danger)'
                    : 'var(--cms-teal-700)',
                }}
                onMouseEnter={(event) => {
                  if (confirm.action === 'archive') event.currentTarget.style.background = '#8a5a18';
                  else if (confirm.action === 'delete') event.currentTarget.style.background = '#9c3a31';
                  else event.currentTarget.style.background = 'var(--cms-teal-600)';
                }}
                onMouseLeave={(event) => {
                  if (confirm.action === 'archive') event.currentTarget.style.background = 'var(--cms-warning)';
                  else if (confirm.action === 'delete') event.currentTarget.style.background = 'var(--cms-danger)';
                  else event.currentTarget.style.background = 'var(--cms-teal-700)';
                }}
              >
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : (
                  confirm.action === 'archive' ? <Archive className="w-4 h-4" />
                  : confirm.action === 'delete' ? <Trash2 className="w-4 h-4" />
                  : <Send className="w-4 h-4" />
                )}
                {confirm.action === 'publish'
                  ? (isArabic ? 'نشر' : 'Publish')
                  : confirm.action === 'archive'
                  ? (isArabic ? 'أرشفة' : 'Archive')
                  : (isArabic ? 'حذف' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
