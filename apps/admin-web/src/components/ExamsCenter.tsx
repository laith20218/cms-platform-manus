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
  AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowUp, BarChart3, CheckCircle2,
  ClipboardCheck, Clock, Eye, FileText, Flag, GraduationCap, ListChecks, LoaderCircle,
  Pencil, Plus, Search, Send, Timer, Trash2, TrendingUp, Users, X, XCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { academicIdsOf, useAcademicContext } from '../lib/academicContext';
import { useUiPermissions } from '../hooks/useUiPermissions';

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
// ===== W14.3 Phase D (D10) — exam analytics (W14.2 D.1/D.2 endpoints) =====
type ExamStats = {
  examId: string; started: number; attempts: number; completed: number; timeouts: number;
  inProgress: number; cancelled: number; pass: number; fail: number;
  meanScore?: number | null; medianScore?: number | null; avgDurationSeconds: number;
  distribution: Array<{ label: string; count: number }>;
};
type QuestionStat = {
  questionId: string; text: string; sortOrder: number; attempts: number;
  correctPercent: number; mostCommonWrongChoice?: string | null;
  avgDurationSeconds?: number | null; problematic: boolean;
};
// ===== W14.3 Phase D (D12) — question reports triage (W14.2 B.4 endpoint) =====
type ErrorReport = {
  id: string; questionId: string; questionText: string; studentId: string;
  reasonType: string; reportType: string; description?: string | null;
  screenshotUrl?: string | null; status: string; createdAt: string;
  resolvedAt?: string | null; resolutionNotes?: string | null;
};
type ReportPage = { items: ErrorReport[]; total: number; page: number; pageSize: number; totalPages: number };
type Page<T> = { items: T[]; page: number; pageSize: number; totalCount: number };
type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void; /** W14.3 D10: jump to the Question Bank — the D4 URL context already carries the subject. */ onNavigateToQuestions?: () => void };
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

// ===== W14.3 Phase D (D12) — report classification labels (ReportType enum) =====
const reportTypeLabel = (type: string, isArabic: boolean) => {
  switch (type) {
    case 'Typo': return isArabic ? 'خطأ في الصياغة' : 'Typo';
    case 'WrongAnswer': return isArabic ? 'الإجابة الصحيحة خاطئة' : 'Wrong answer';
    case 'BadImage': return isArabic ? 'صورة غير سليمة' : 'Bad image';
    default: return isArabic ? 'أخرى' : 'Other';
  }
};

const reportTypeBadgeClass = (type: string) => {
  switch (type) {
    case 'WrongAnswer': return 'text-red-700 bg-red-50 border-red-200';
    case 'Typo': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'BadImage': return 'text-sky-700 bg-sky-50 border-sky-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

const reportStatusLabel = (status: string, isArabic: boolean) => {
  switch (status.toLowerCase()) {
    case 'reviewing': return isArabic ? 'قيد المراجعة' : 'Reviewing';
    case 'resolved': return isArabic ? 'تم الحل' : 'Resolved';
    case 'rejected': return isArabic ? 'مرفوض' : 'Rejected';
    case 'closed': return isArabic ? 'مغلق' : 'Closed';
    default: return isArabic ? 'قيد الانتظار' : 'Pending';
  }
};

const reportStatusBadgeClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'resolved': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'rejected': return 'text-red-700 bg-red-50 border-red-200';
    case 'reviewing': return 'text-amber-700 bg-amber-50 border-amber-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

export function ExamsCenter({ token, isArabic, onError, onNotice, onNavigateToQuestions }: Props) {
  // Push 3: cosmetic gating — the API policies remain the real boundary.
  const { can } = useUiPermissions();
  // === Academic hierarchy state ===
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

  // ===== W14.3 Phase D (D10): per-exam stats dashboard state =====
  const [statsExam, setStatsExam] = useState<ExamSummary | null>(null);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [expandedStat, setExpandedStat] = useState<string | null>(null);

  // ===== W14.3 Phase D (D12): question reports triage state =====
  const [showReports, setShowReports] = useState(false);
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportStatus, setReportStatus] = useState('');
  const [reportType, setReportType] = useState('');
  const [reportNotes, setReportNotes] = useState<{ report: ErrorReport; action: 'resolve' | 'reject'; notes: string } | null>(null);
  const [reportsBusy, setReportsBusy] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const selectedIds = useMemo(() => new Set(selectedQuestions.map(question => question.questionId)), [selectedQuestions]);
  const activeSubject = useMemo(() => subjects.find(item => item.id === subjectId), [subjects, subjectId]);

  useEffect(() => {
    void request<{ items: University[] }>('/api/v1/universities?Page=1&PageSize=100')
      .then(data => setUniversities(data.items))
      .catch(error => onError(error instanceof Error ? error.message : 'تعذر تحميل الجامعات.'));
    // W14.3 D4: hydrate the cascade lists from the shared URL context
    // (e.g. arriving from the Question Bank with ?univ=…&subject=… already set).
    void (async () => {
      const ids = academicIdsOf(academic);
      if (!ids.universityId && !ids.collegeId && !ids.yearId && !ids.semesterId && !ids.subjectId) return;
      try {
        if (ids.universityId) setColleges(await request<College[]>(`/api/v1/universities/${ids.universityId}/colleges`));
        if (ids.collegeId) setYears(await request<AcademicYear[]>(`/api/v1/colleges/${ids.collegeId}/years`));
        if (ids.yearId) setSemesters(await request<Semester[]>(`/api/v1/years/${ids.yearId}/semesters`));
        if (ids.semesterId) setSubjects(await request<Subject[]>(`/api/v1/semesters/${ids.semesterId}/subjects`));
        try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${ids.subjectId}/lectures`)); }
        catch { /* lectures list is optional for the context restore */ }
      } catch {
        academic.clear(); // stale context (deleted academic entity?) — drop the URL params
      }
    })();
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

  // W14.3 D12: the reports list follows its filters (debounced, server-side).
  useEffect(() => {
    if (!showReports) return;
    const timer = window.setTimeout(() => { void loadReports(); }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReports, reportStatus, reportType]);

  async function chooseUniversity(id: string) {
    academic.chooseUniversity(id);
    setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الكليات.'); }
  }
  async function chooseCollege(id: string) {
    academic.chooseCollege(id);
    setYears([]); setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل السنوات.'); }
  }
  async function chooseYear(id: string) {
    academic.chooseYear(id);
    setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الفصول.'); }
  }
  async function chooseSemester(id: string) {
    academic.chooseSemester(id);
    setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المواد.'); }
  }
  async function chooseSubject(id: string) {
    academic.chooseSubject(id); setLectures([]); closeEditor();
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

  // ===== W14.3 Phase D (D10): exam stats dashboard (W14.2 D.1/D.2 endpoints) =====
  async function showStats(exam: ExamSummary) {
    setStatsExam(exam); setStats(null); setQuestionStats([]); setExpandedStat(null); setStatsLoading(true);
    try {
      const [statsData, questionData] = await Promise.all([
        request<ExamStats>(`/api/v1/admin/exams/${exam.id}/stats`),
        request<QuestionStat[]>(`/api/v1/admin/exams/${exam.id}/question-stats`),
      ]);
      setStats(statsData);
      setQuestionStats(questionData);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل إحصائيات الاختبار.');
      setStatsExam(null);
    } finally { setStatsLoading(false); }
  }

  // ===== W14.3 Phase D (D12): question reports triage (W14.2 B.4 endpoint) =====
  async function loadReports() {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (reportStatus) params.set('status', reportStatus);
      if (reportType) params.set('type', reportType);
      const data = await request<ReportPage>(`/api/v1/admin/questions/reports?${params.toString()}`);
      setReports(data.items);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل بلاغات الأسئلة.');
    } finally { setReportsLoading(false); }
  }

  async function actOnReport() {
    if (!reportNotes) return;
    setReportsBusy(true);
    try {
      await request(`/api/v1/admin/questions/reports/${reportNotes.report.id}/${reportNotes.action}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: reportNotes.notes.trim() || null }),
      });
      onNotice(reportNotes.action === 'resolve'
        ? (isArabic ? 'تم حل البلاغ وتوثيق الملاحظات.' : 'Report resolved with notes recorded.')
        : (isArabic ? 'تم رفض البلاغ وتوثيق الملاحظات.' : 'Report rejected with notes recorded.'));
      setReportNotes(null);
      await loadReports();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تنفيذ إجراء البلاغ.');
    } finally { setReportsBusy(false); }
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
        {subjectId && can('btn:exams.create') && (
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
              aria-label={isArabic ? 'تصفية حالة الاختبار' : 'Filter by exam status'}
              className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            >
              <option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option>
              <option value="Draft">{isArabic ? 'مسودة' : 'Draft'}</option>
              <option value="Published">{isArabic ? 'منشور' : 'Published'}</option>
              <option value="Archived">{isArabic ? 'مؤرشف' : 'Archived'}</option>
            </select>
            {/* W14.3 D12: question reports triage toggle. */}
            <button
              type="button"
              onClick={() => setShowReports(current => !current)}
              aria-pressed={showReports}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
              style={showReports
                ? { background: 'var(--cms-teal-700)', borderColor: 'var(--cms-teal-700)', color: '#fff' }
                : { borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              <Flag className="w-4 h-4" />
              {isArabic ? 'بلاغات الأسئلة' : 'Question reports'}
            </button>
          </div>

          {/* ===== W14.3 D10: exam stats dashboard (replaces the list while open) ===== */}
          {statsExam && (
            <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="flex items-center justify-between gap-3 p-4 border-b flex-wrap" style={{ borderColor: 'var(--cms-line)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="p-2 rounded-lg shrink-0" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                    <TrendingUp className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--cms-text)' }}>
                      {isArabic ? `إحصائيات: ${statsExam.titleAr}` : `Stats: ${statsExam.titleAr}`}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {isArabic ? 'مؤشرات المحاولات والدرجات وتحليل كل سؤال.' : 'Attempt metrics, score analytics, and per-question breakdown.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {onNavigateToQuestions && (
                    <button
                      type="button"
                      onClick={onNavigateToQuestions}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                      style={{ borderColor: 'var(--cms-teal-600)', color: 'var(--cms-teal-700)' }}
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                      {isArabic ? 'فتح بنك الأسئلة' : 'Open question bank'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setStatsExam(null); setStats(null); setQuestionStats([]); }}
                    aria-label={isArabic ? 'إغلاق الإحصائيات' : 'Close stats'}
                    className="p-2 rounded-lg transition-colors hover:bg-slate-100"
                    style={{ color: 'var(--cms-text-soft)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-5 space-y-6">
                {statsLoading ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[0, 1, 2, 3, 4, 5].map(row => <div key={row} className="h-16 rounded-lg bg-slate-100 animate-pulse" />)}
                    </div>
                    <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
                  </div>
                ) : stats ? (
                  <>
                    {stats.started === 0 && stats.attempts === 0 ? (
                      /* B.4 honesty: a fresh exam shows an explicit empty state, never misleading zeros. */
                      <div className="flex flex-col items-center justify-center text-center py-10" style={{ color: 'var(--cms-text-soft)' }}>
                        <TrendingUp className="w-6 h-6 opacity-50" />
                        <p className="mt-2 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
                          {isArabic ? 'لا توجد محاولات بعد.' : 'No attempts yet.'}
                        </p>
                        <p className="mt-1 text-xs">
                          {isArabic ? 'ستظهر المؤشرات هنا بعد أول محاولة طالب.' : 'Metrics appear here after the first student attempt.'}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Summary cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          {[
                            { icon: Users, label: isArabic ? 'بدأت' : 'Started', value: stats.started },
                            { icon: ClipboardCheck, label: isArabic ? 'محاولات' : 'Attempts', value: stats.attempts },
                            { icon: CheckCircle2, label: isArabic ? 'أكملت' : 'Completed', value: stats.completed },
                            { icon: Timer, label: isArabic ? 'قيد التنفيذ' : 'In progress', value: stats.inProgress },
                            { icon: AlertCircle, label: isArabic ? 'انتهت مهلتها' : 'Timed out', value: stats.timeouts },
                            { icon: XCircle, label: isArabic ? 'ملغاة' : 'Cancelled', value: stats.cancelled },
                          ].map(card => (
                            <div key={card.label} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)' }}>
                              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                                <card.icon className="w-3.5 h-3.5" />
                                {card.label}
                              </div>
                              <div className="text-xl font-bold mt-1" style={{ color: 'var(--cms-text)' }}>{card.value}</div>
                            </div>
                          ))}
                        </div>

                        {/* Pass/fail + scores + duration */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--cms-line)' }}>
                            <p className="text-xs font-medium mb-2" style={{ color: 'var(--cms-text-soft)' }}>
                              {isArabic ? 'النجاح مقابل الرسوب' : 'Pass vs fail'}
                            </p>
                            {stats.pass + stats.fail === 0 ? (
                              <p className="text-sm" style={{ color: 'var(--cms-text-soft)' }}>{isArabic ? 'لا توجد نتائج مصححة بعد.' : 'No graded results yet.'}</p>
                            ) : (
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-emerald-700 font-medium">{isArabic ? 'ناجح' : 'Pass'}: {stats.pass}</span>
                                  <span className="text-red-700 font-medium">{isArabic ? 'راسب' : 'Fail'}: {stats.fail}</span>
                                </div>
                                <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-100">
                                  <div className="bg-emerald-500 h-full" style={{ width: `${(stats.pass / (stats.pass + stats.fail)) * 100}%` }} />
                                  <div className="bg-red-500 h-full" style={{ width: `${(stats.fail / (stats.pass + stats.fail)) * 100}%` }} />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--cms-line)' }}>
                            <p className="text-xs font-medium mb-2" style={{ color: 'var(--cms-text-soft)' }}>
                              {isArabic ? 'الدرجات (من المصححة آلياً)' : 'Scores (auto-graded)'}
                            </p>
                            <div className="flex items-center gap-4 text-sm">
                              <div>
                                <div className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>{isArabic ? 'المعدل' : 'Mean'}</div>
                                <div className="font-bold" style={{ color: 'var(--cms-text)' }}>{stats.meanScore == null ? '—' : `${stats.meanScore.toFixed(1)}%`}</div>
                              </div>
                              <div>
                                <div className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>{isArabic ? 'الوسيط' : 'Median'}</div>
                                <div className="font-bold" style={{ color: 'var(--cms-text)' }}>{stats.medianScore == null ? '—' : `${stats.medianScore.toFixed(1)}%`}</div>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--cms-line)' }}>
                            <p className="text-xs font-medium mb-2" style={{ color: 'var(--cms-text-soft)' }}>
                              {isArabic ? 'متوسط زمن الحل' : 'Average duration'}
                            </p>
                            <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--cms-text)' }}>
                              <Timer className="w-4 h-4" style={{ color: 'var(--cms-text-soft)' }} />
                              {stats.avgDurationSeconds > 0
                                ? `${Math.floor(stats.avgDurationSeconds / 60)} ${isArabic ? 'دقيقة' : 'min'} ${Math.round(stats.avgDurationSeconds % 60)} ${isArabic ? 'ثانية' : 'sec'}`
                                : '—'}
                            </div>
                          </div>
                        </div>

                        {/* Score distribution (decile buckets) */}
                        <div>
                          <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--cms-text)' }}>
                            {isArabic ? 'توزيع الدرجات' : 'Score distribution'}
                          </h4>
                          <div className="space-y-1.5">
                            {stats.distribution.map(bucket => {
                              const max = Math.max(...stats.distribution.map(item => item.count), 1);
                              return (
                                <div key={bucket.label} className="flex items-center gap-2">
                                  <span className="w-14 text-[11px] font-mono shrink-0 text-start" style={{ color: 'var(--cms-text-soft)' }}>{bucket.label}</span>
                                  <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                                    <div
                                      className="h-full rounded transition-all"
                                      style={{ width: `${(bucket.count / max) * 100}%`, background: 'var(--cms-teal-600)', minWidth: bucket.count > 0 ? '4px' : 0 }}
                                    />
                                  </div>
                                  <span className="w-8 text-xs font-semibold text-end" style={{ color: 'var(--cms-text-soft)' }}>{bucket.count}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Per-question stats */}
                    <div>
                      <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--cms-text)' }}>
                        {isArabic ? `إحصائيات الأسئلة (${questionStats.length})` : `Question stats (${questionStats.length})`}
                      </h4>
                      {questionStats.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic ? 'لا توجد أسئلة في هذا الاختبار.' : 'This exam has no questions.'}
                        </p>
                      ) : (
                        <div className="overflow-x-auto [contain:paint] rounded-lg border" style={{ borderColor: 'var(--cms-line)' }}>
                          <table className="w-full text-sm">
                            <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>
                              <tr>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">#</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'السؤال' : 'Question'}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'المحاولات' : 'Attempts'}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'إجابات صحيحة' : '% correct'}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'أكثر خيار خاطئ' : 'Most common wrong'}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'متوسط الزمن' : 'Avg time'}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{isArabic ? 'تنبيه' : 'Flag'}</span></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
                              {questionStats.map(row => (
                                <tr key={row.questionId} className={row.problematic ? 'bg-red-50/60' : 'hover:bg-slate-50/70'}>
                                  <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--cms-text-soft)' }}>{row.sortOrder}</td>
                                  <td className="px-3 py-2.5 max-w-sm">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedStat(current => (current === row.questionId ? null : row.questionId))}
                                      className="text-start text-sm leading-snug w-full"
                                      style={{ color: 'var(--cms-text)' }}
                                      aria-expanded={expandedStat === row.questionId}
                                    >
                                      {expandedStat === row.questionId ? row.text : (row.text.length > 90 ? `${row.text.slice(0, 90)}…` : row.text)}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--cms-text)' }}>{row.attempts}</td>
                                  <td className="px-3 py-2.5">
                                    {row.attempts === 0 ? (
                                      <span className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>—</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${
                                        row.correctPercent >= 70 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                        : row.correctPercent >= 40 ? 'text-amber-700 bg-amber-50 border-amber-200'
                                        : 'text-red-700 bg-red-50 border-red-200'}`}
                                      >
                                        {row.correctPercent.toFixed(0)}%
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-xs max-w-[140px] truncate" style={{ color: 'var(--cms-text-soft)' }}>
                                    {row.mostCommonWrongChoice ?? '—'}
                                  </td>
                                  <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                                    {row.avgDurationSeconds != null && row.avgDurationSeconds > 0
                                      ? `${Math.round(row.avgDurationSeconds)} ${isArabic ? 'ث' : 's'}`
                                      : '—'}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {row.problematic && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border text-red-700 bg-red-50 border-red-200">
                                        <AlertTriangle className="w-3 h-3" />
                                        {isArabic ? 'يحتاج مراجعة' : 'Needs review'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          )}

          {/* ===== Exam list (hidden while the stats dashboard is open) ===== */}
          {!statsExam && (loading ? (
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
            <div className="overflow-x-auto [contain:paint] rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>
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
                        <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--cms-text-soft)' }}>
                          {exam.slug}
                        </div>
                        {(exam.availableFrom || exam.availableUntil || exam.maxAttempts) && (
                          <div className="mt-1 text-[10px] flex flex-wrap gap-2" style={{ color: 'var(--cms-text-soft)' }}>
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
                          {exam.completedCount}<span style={{ color: 'var(--cms-text-soft)' }}>/{exam.attemptsCount}</span>
                        </div>
                        {exam.averageScore != null && (
                          <div className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
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
                            title={isArabic ? 'الإحصائيات' : 'Stats'}
                            aria-label={isArabic ? 'الإحصائيات' : 'Stats'}
                            onClick={() => void showStats(exam)}
                            disabled={busy}
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: 'var(--cms-text-muted)' }}
                            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-50)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                            onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                          >
                            <TrendingUp className="w-4 h-4" />
                          </button>
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
                          {/* Push 3 census: exams edit pencil stays ungated (out-of-census
                              control, like lecture-publish/copy-code) — backend policy is the gate. */}
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
                          {exam.status !== 'Published' && exam.status !== 'Archived' && can('btn:exams.publish') && (
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
                          {exam.status !== 'Archived' && can('btn:exams.archive') && (
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
                          {can('btn:exams.delete') && (
                            <button
                              type="button"
                              title={isArabic ? 'حذف' : 'Delete'}
                              onClick={() => setConfirm({ exam, action: 'delete' })}
                              disabled={busy}
                              className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* ===== W14.3 D12: question reports triage section ===== */}
          {showReports && (
            <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="flex items-center justify-between gap-3 p-4 border-b flex-wrap" style={{ borderColor: 'var(--cms-line)' }}>
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                    <Flag className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>
                      {isArabic ? 'بلاغات الأسئلة' : 'Question reports'}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {isArabic ? 'بلاغات الطلاب عن أخطاء الأسئلة — ضمن نطاقك الأكاديمي.' : 'Student reports about question errors — within your academic scope.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={reportStatus}
                    onChange={(event) => setReportStatus(event.target.value)}
                    aria-label={isArabic ? 'تصفية الحالة' : 'Filter by status'}
                    className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  >
                    <option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option>
                    {['Pending', 'Reviewing', 'Resolved', 'Rejected', 'Closed'].map(status => (
                      <option key={status} value={status}>{reportStatusLabel(status, isArabic)}</option>
                    ))}
                  </select>
                  <select
                    value={reportType}
                    onChange={(event) => setReportType(event.target.value)}
                    aria-label={isArabic ? 'تصفية النوع' : 'Filter by type'}
                    className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  >
                    <option value="">{isArabic ? 'كل الأنواع' : 'All types'}</option>
                    {['Typo', 'WrongAnswer', 'BadImage', 'Other'].map(type => (
                      <option key={type} value={type}>{reportTypeLabel(type, isArabic)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowReports(false)}
                    aria-label={isArabic ? 'إغلاق البلاغات' : 'Close reports'}
                    className="p-2 rounded-lg transition-colors hover:bg-slate-100"
                    style={{ color: 'var(--cms-text-soft)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                {reportsLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map(row => <div key={row} className="h-20 rounded-lg bg-slate-100 animate-pulse" />)}
                  </div>
                ) : reports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-10" style={{ color: 'var(--cms-text-soft)' }}>
                    <Flag className="w-6 h-6 opacity-50" />
                    <p className="mt-2 text-sm">
                      {isArabic ? 'لا توجد بلاغات ضمن هذه التصفية.' : 'No reports match this filter.'}
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {reports.map(report => (
                      <li key={report.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--cms-line)' }}>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${reportTypeBadgeClass(report.reportType)}`}>
                            {reportTypeLabel(report.reportType, isArabic)}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${reportStatusBadgeClass(report.status)}`}>
                            {reportStatusLabel(report.status, isArabic)}
                          </span>
                          <span className="text-xs ms-auto" style={{ color: 'var(--cms-text-soft)' }}>
                            {new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.createdAt))}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedReport(current => (current === report.id ? null : report.id))}
                          className="text-start text-sm leading-snug w-full"
                          style={{ color: 'var(--cms-text)' }}
                          aria-expanded={expandedReport === report.id}
                        >
                          {expandedReport === report.id ? report.questionText : (report.questionText.length > 120 ? `${report.questionText.slice(0, 120)}…` : report.questionText)}
                        </button>
                        {report.description && (
                          <p className="mt-2 text-xs rounded-lg p-2.5" style={{ color: 'var(--cms-text-soft)', background: 'var(--cms-ivory-100)' }}>
                            {report.description}
                          </p>
                        )}
                        {report.resolutionNotes && (
                          <p className="mt-2 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                            {isArabic ? 'ملاحظات الحل:' : 'Resolution notes:'} {report.resolutionNotes}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap mt-3">
                          {report.screenshotUrl && (
                            <a
                              href={report.screenshotUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {isArabic ? 'لقطة الشاشة' : 'Screenshot'}
                            </a>
                          )}
                          {(report.status === 'Pending' || report.status === 'Reviewing') && can('btn:questions.edit') && (
                            <>
                              <button
                                type="button"
                                onClick={() => setReportNotes({ report, action: 'resolve', notes: '' })}
                                disabled={reportsBusy}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50 transition-colors"
                                style={{ background: 'var(--cms-teal-700)' }}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {isArabic ? 'حل البلاغ' : 'Resolve'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setReportNotes({ report, action: 'reject', notes: '' })}
                                disabled={reportsBusy}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 transition-colors"
                                style={{ borderColor: 'var(--cms-danger)', color: 'var(--cms-danger)' }}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                {isArabic ? 'رفض البلاغ' : 'Reject'}
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* ===== Report notes dialog (resolve / reject) ===== */}
          {reportNotes && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onMouseDown={() => !reportsBusy && setReportNotes(null)}
            >
              <div
                className="bg-white rounded-xl max-w-md w-full"
                role="dialog"
                aria-modal="true"
                aria-label={reportNotes.action === 'resolve' ? (isArabic ? 'حل البلاغ' : 'Resolve report') : (isArabic ? 'رفض البلاغ' : 'Reject report')}
                style={{ boxShadow: 'var(--cms-shadow-xl)' }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start gap-3 p-5 border-b" style={{ borderColor: 'var(--cms-line)' }}>
                  <div
                    className="p-2 rounded-lg shrink-0"
                    style={{ background: reportNotes.action === 'resolve' ? 'var(--cms-teal-50)' : 'var(--cms-danger-50)', color: reportNotes.action === 'resolve' ? 'var(--cms-teal-700)' : 'var(--cms-danger)' }}
                  >
                    {reportNotes.action === 'resolve' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                      {reportNotes.action === 'resolve'
                        ? (isArabic ? 'حل البلاغ' : 'Resolve report')
                        : (isArabic ? 'رفض البلاغ' : 'Reject report')}
                    </h3>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--cms-text-soft)' }}>
                      {reportNotes.report.questionText}
                    </p>
                  </div>
                </div>
                <div className="p-5">
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {isArabic ? 'ملاحظات الحل (اختياري)' : 'Resolution notes (optional)'}
                    </span>
                    <textarea
                      value={reportNotes.notes}
                      onChange={(event) => setReportNotes(current => current ? { ...current, notes: event.target.value } : current)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    />
                  </label>
                </div>
                <div className="flex gap-3 justify-end p-5 pt-0">
                  <button
                    type="button"
                    onClick={() => setReportNotes(null)}
                    disabled={reportsBusy}
                    className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                    style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                  >
                    {isArabic ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void actOnReport()}
                    disabled={reportsBusy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
                    style={{ background: reportNotes.action === 'resolve' ? 'var(--cms-teal-700)' : 'var(--cms-danger)' }}
                  >
                    {reportsBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : null}
                    {reportNotes.action === 'resolve' ? (isArabic ? 'حل' : 'Resolve') : (isArabic ? 'رفض' : 'Reject')}
                  </button>
                </div>
              </div>
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
                  <div className="overflow-x-auto [contain:paint] rounded-lg border" style={{ borderColor: 'var(--cms-line)' }}>
                    <table className="w-full text-sm">
                      <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>
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
