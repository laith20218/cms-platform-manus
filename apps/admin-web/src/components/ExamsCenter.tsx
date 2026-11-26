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
  Pencil, Plus, Search, Send, Timer, Trash2, TrendingUp, Users, X, XCircle, CloudOff,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Dialog, Pagination, RowActionsMenu } from '@cms/ui';
import { HardDeleteDialog, type HardDeleteTarget } from './HardDeleteDialog';
import { questionDifficultyLabel, questionTypeLabel } from '../lib/questionLabels';
import { t, localeOf, statusLabel as registryStatusLabel, type Locale } from '../lib/dictionary';
import { academicIdsOf, useAcademicContext } from '../lib/academicContext';
import { useUiPermissions } from '../hooks/uiPermissionsContext';

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
type ConfirmDialog = { exam: ExamSummary; action: 'publish' | 'archive' | 'delete' | 'unpublish' } | null;

// W-coverage (row 18): student-view preview payload (AdminExams GET {id}/preview — no correctness flags).
type ExamPreview = {
  id: string;
  titleAr: string;
  durationMinutes: number;
  totalQuestions: number;
  status: string;
  questions: Array<{
    questionId: string;
    order: number;
    text: string;
    type: string;
    difficulty: string;
    options: Array<{ id: string; letter: string; text: string; imageUrl?: string | null }>;
    images: Array<{ imageUrl: string; alt?: string | null; order: number }>;
  }>;
};

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

// W22.1 — EXAM types only (Final/Midterm/Quiz/Practice). Question types ride
// the shared lib/questionLabels helper so they never fall through to raw enums.
const examTypeLabel = (type: string, locale: Locale) => {
  switch (type) {
    case 'Final': return t(locale, 'exams.examType.final');
    case 'Midterm': return t(locale, 'exams.examType.midterm');
    case 'Quiz': return t(locale, 'exams.examType.quiz');
    case 'Practice': return t(locale, 'exams.examType.practice');
    default: return type;
  }
};

// PR-3 — exam publication status rides the central registry's `publication`
// domain (draft/published/archived, lower-cased wire values). The legacy
// switch answered the default-Draft label for every value it did not know
// (unpublished/unknown) where the registry answers «غير محدد» — this thin
// wrapper keeps the pre-PR-3 output byte-identical.
const statusLabel = (status: string, locale: Locale) => {
  const value = status.toLowerCase();
  if (value === 'published' || value === 'archived' || value === 'draft') {
    return registryStatusLabel(locale, 'publication', value);
  }
  return t(locale, 'exams.status.draft');
};

// W2 (admin-ui): attempt/result session statuses (ExamSessionStatus enum:
// InProgress/Completed/Cancelled/TimedOut + legacy Abandoned/Expired aliases).
// Raw enum values must never leak into the Arabic surface (debt D-23).
const resultStatusLabel = (status: string, locale: Locale) => {
  switch (status.toLowerCase()) {
    case 'inprogress': return t(locale, 'exams.resultStatus.inProgress');
    case 'completed': return t(locale, 'exams.resultStatus.completed');
    case 'cancelled':
    case 'abandoned': return t(locale, 'exams.resultStatus.cancelled');
    case 'timedout':
    case 'expired': return t(locale, 'exams.resultStatus.timedOut');
    // Legacy contract: unknown values render the explicit Arabic fallback;
    // the English surface keeps passing the raw wire value through verbatim.
    default: return locale === 'ar' ? t(locale, 'exams.resultStatus.unknown') : status;
  }
};

const resultStatusBadgeClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'completed') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'inprogress') return 'text-sky-700 bg-sky-50 border-sky-200';
  if (value === 'timedout' || value === 'expired') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

// ===== W14.3 Phase D (D12) — report classification labels (ReportType enum) =====
// ===== W14.3 Phase D (D12) — report classification labels (ReportType enum) =====
const reportTypeLabel = (type: string, locale: Locale) => {
  switch (type) {
    case 'Typo': return t(locale, 'exams.reportType.typo');
    case 'WrongAnswer': return t(locale, 'exams.reportType.wrongAnswer');
    case 'BadImage': return t(locale, 'exams.reportType.badImage');
    default: return t(locale, 'exams.reportType.other');
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

// ===== W14.3 Phase D (D12) — report status labels (local glossary) =====
const reportStatusLabel = (status: string, locale: Locale) => {
  switch (status.toLowerCase()) {
    case 'reviewing': return t(locale, 'exams.reportStatus.reviewing');
    case 'resolved': return t(locale, 'exams.reportStatus.resolved');
    case 'rejected': return t(locale, 'exams.reportStatus.rejected');
    case 'closed': return t(locale, 'exams.reportStatus.closed');
    default: return t(locale, 'exams.reportStatus.pending');
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
  // PR-3 — dictionary locale for the shared `t()` copy.
  const locale = localeOf(isArabic);
  // Push 3: cosmetic gating — the API policies remain the real boundary.
  const { can, bundle } = useUiPermissions();
  // Command Center P1: hard delete is a SuperAdmin-only system action (backend-gated too).
  const isSuperAdmin = bundle?.isSuperAdmin ?? false;
  const [hardTarget, setHardTarget] = useState<HardDeleteTarget | null>(null);
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
  // W2 (admin-ui): server-side pager state — the list was a fixed pageSize=100
  // fetch with no controls (debt D-20).
  const [examsPage, setExamsPage] = useState(1);
  const [examsTotal, setExamsTotal] = useState(0);

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

  // W-coverage (row 18): student-view preview state.
  const [preview, setPreview] = useState<{ exam: ExamSummary; data: ExamPreview | null; loading: boolean; error: string | null } | null>(null);

  async function showPreview(exam: ExamSummary) {
    setPreview({ exam, data: null, loading: true, error: null });
    try {
      const data = await request<ExamPreview>(`/api/v1/admin/exams/${exam.id}/preview`);
      setPreview({ exam, data, loading: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : (t(locale, 'exams.errors.previewLoad'));
      onError(message);
      setPreview({ exam, data: null, loading: false, error: message });
    }
  }

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
      .catch(error => onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadUniversities')));
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
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadColleges')); }
  }
  async function chooseCollege(id: string) {
    academic.chooseCollege(id);
    setYears([]); setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadYears')); }
  }
  async function chooseYear(id: string) {
    academic.chooseYear(id);
    setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadSemesters')); }
  }
  async function chooseSemester(id: string) {
    academic.chooseSemester(id);
    setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadSubjects')); }
  }
  async function chooseSubject(id: string) {
    academic.chooseSubject(id); setLectures([]); closeEditor();
    if (!id) return;
    try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${id}/lectures`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadLectures')); }
  }

  async function loadExams(targetPage = 1) {
    if (!subjectId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ subjectId, page: String(targetPage), pageSize: '100' });
      if (query.trim()) params.set('search', query.trim());
      if (statusFilter) params.set('status', statusFilter);
      const data = await request<Page<ExamSummary>>(`/api/v1/admin/exams?${params.toString()}`);
      setExams(data.items);
      setExamsPage(targetPage);
      setExamsTotal(data.totalCount);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadExams'));
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
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadCandidates'));
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
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.openExam'));
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
      onError(t(locale, 'exams.errors.availabilityWindow'));
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
      if (!examId) throw new Error(t(locale, 'exams.errors.missingExamId'));
      await request(`/api/v1/admin/exams/${examId}/questions`, { method: 'PUT', body: JSON.stringify({ questionIds: selectedQuestions.map(question => question.questionId) }) });
      setForm({
        ...saved,
        availableFrom: toInputDate(saved.availableFrom),
        availableUntil: toInputDate(saved.availableUntil),
      });
      onNotice(t(locale, 'exams.toasts.savedDraft'));
      await loadExams();
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.saveExam'));
    } finally { setBusy(false); }
  }

  async function lifecycle(exam: ExamSummary, action: 'publish' | 'archive' | 'unpublish') {
    setBusy(true);
    try {
      await request(`/api/v1/admin/exams/${exam.id}/${action}`, { method: 'POST' });
      onNotice(action === 'publish'
        ? (t(locale, 'exams.toasts.published'))
        : action === 'unpublish'
        ? (t(locale, 'exams.toasts.unpublished'))
        : (t(locale, 'exams.toasts.archived')));
      await loadExams();
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.updateStatus'));
    } finally { setBusy(false); }
  }

  async function deleteExam(exam: ExamSummary) {
    setBusy(true);
    try {
      await request(`/api/v1/admin/exams/${exam.id}`, { method: 'DELETE' });
      onNotice(t(locale, 'exams.toasts.deleted'));
      await loadExams();
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.deleteExam'));
    } finally { setBusy(false); }
  }

  async function showResults(exam: ExamSummary) {
    setResultExam(exam); setResultsLoading(true);
    try {
      const data = await request<Page<Result>>(`/api/v1/admin/exams/${exam.id}/results?page=1&pageSize=100`);
      setResults(data.items);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadResults'));
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
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadStats'));
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
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.loadReports'));
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
        ? (t(locale, 'exams.reports.resolvedToast'))
        : (t(locale, 'exams.reports.rejectedToast')));
      setReportNotes(null);
      await loadReports();
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'exams.errors.actOnReport'));
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
              {t(locale, 'exams.header.kicker')}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {t(locale, 'exams.header.title')}
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
              {t(locale, 'exams.header.subtitle')}
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
            {t(locale, 'exams.header.newExam')}
          </button>
        )}
      </header>

      {/* ===== Academic hierarchy filter bar ===== */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-xl border"
        style={{ background: 'var(--cms-ivory-100)', borderColor: 'var(--cms-line)' }}
      >
        {[
          { label: t(locale, 'exams.filters.university'), value: universityId, onChange: chooseUniversity, items: universities, disabled: false },
          { label: t(locale, 'exams.filters.college'), value: collegeId, onChange: chooseCollege, items: colleges, disabled: !universityId },
          { label: t(locale, 'exams.filters.year'), value: yearId, onChange: chooseYear, items: years, disabled: !collegeId },
          { label: t(locale, 'exams.filters.semester'), value: semesterId, onChange: chooseSemester, items: semesters, disabled: !yearId },
          { label: t(locale, 'exams.filters.subject'), value: subjectId, onChange: chooseSubject, items: subjects, disabled: !semesterId },
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
              <option value="">{t(locale, 'exams.filters.select', { label: locale === 'ar' ? field.label : field.label.toLowerCase() })}</option>
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
            {t(locale, 'exams.filters.pickSubject')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {t(locale, 'exams.filters.hierarchyHint')}
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
                placeholder={t(locale, 'exams.toolbar.searchPlaceholder')}
                className="w-full pr-10 pl-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label={t(locale, 'exams.toolbar.statusFilterA11y')}
              className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            >
              <option value="">{t(locale, 'exams.toolbar.allStatuses')}</option>
              <option value="Draft">{statusLabel('Draft', locale)}</option>
              <option value="Published">{statusLabel('Published', locale)}</option>
              <option value="Archived">{statusLabel('Archived', locale)}</option>
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
              {t(locale, 'exams.reports.title')}
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
                      {t(locale, 'exams.stats.title', { title: statsExam.titleAr })}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'exams.stats.subtitle')}
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
                      {t(locale, 'exams.stats.openQuestionBank')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setStatsExam(null); setStats(null); setQuestionStats([]); }}
                    aria-label={t(locale, 'exams.stats.closeA11y')}
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
                          {t(locale, 'exams.shared.noAttempts')}
                        </p>
                        <p className="mt-1 text-xs">
                          {t(locale, 'exams.stats.metricsHint')}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Summary cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          {[
                            { icon: Users, label: t(locale, 'exams.stats.startedCard'), value: stats.started },
                            { icon: ClipboardCheck, label: t(locale, 'exams.stats.attemptsCard'), value: stats.attempts },
                            { icon: CheckCircle2, label: t(locale, 'exams.stats.completedCard'), value: stats.completed },
                            { icon: Timer, label: t(locale, 'exams.stats.inProgressCard'), value: stats.inProgress },
                            { icon: AlertCircle, label: t(locale, 'exams.stats.timedOutCard'), value: stats.timeouts },
                            { icon: XCircle, label: t(locale, 'exams.stats.cancelledCard'), value: stats.cancelled },
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
                              {t(locale, 'exams.stats.passVsFail')}
                            </p>
                            {stats.pass + stats.fail === 0 ? (
                              <p className="text-sm" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'exams.stats.noGradedResults')}</p>
                            ) : (
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-emerald-700 font-medium">{t(locale, 'exams.stats.pass')}: {stats.pass}</span>
                                  <span className="text-red-700 font-medium">{t(locale, 'exams.stats.fail')}: {stats.fail}</span>
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
                              {t(locale, 'exams.stats.scores')}
                            </p>
                            <div className="flex items-center gap-4 text-sm">
                              <div>
                                <div className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'exams.stats.mean')}</div>
                                <div className="font-bold" style={{ color: 'var(--cms-text)' }}>{stats.meanScore == null ? '—' : `${stats.meanScore.toFixed(1)}%`}</div>
                              </div>
                              <div>
                                <div className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'exams.stats.median')}</div>
                                <div className="font-bold" style={{ color: 'var(--cms-text)' }}>{stats.medianScore == null ? '—' : `${stats.medianScore.toFixed(1)}%`}</div>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--cms-line)' }}>
                            <p className="text-xs font-medium mb-2" style={{ color: 'var(--cms-text-soft)' }}>
                              {t(locale, 'exams.stats.avgDuration')}
                            </p>
                            <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--cms-text)' }}>
                              <Timer className="w-4 h-4" style={{ color: 'var(--cms-text-soft)' }} />
                              {stats.avgDurationSeconds > 0
                                ? t(locale, 'exams.stats.durationValue', { minutes: Math.floor(stats.avgDurationSeconds / 60), seconds: Math.round(stats.avgDurationSeconds % 60) })
                                : '—'}
                            </div>
                          </div>
                        </div>

                        {/* Score distribution (decile buckets) */}
                        <div>
                          <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--cms-text)' }}>
                            {t(locale, 'exams.stats.distribution')}
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
                        {t(locale, 'exams.stats.questionStatsTitle', { count: questionStats.length })}
                      </h4>
                      {questionStats.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: 'var(--cms-text-soft)' }}>
                          {t(locale, 'exams.stats.noQuestions')}
                        </p>
                      ) : (
                        <div className="overflow-x-auto [contain:paint] rounded-lg border" style={{ borderColor: 'var(--cms-line)' }}>
                          <table className="w-full text-sm">
                            <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>
                              <tr>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">#</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.stats.questionCol')}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.shared.attempts')}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.stats.correctCol')}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.stats.mostCommonWrongCol')}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.stats.avgTimeCol')}</th>
                                <th className="text-start px-3 py-2.5 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{t(locale, 'exams.stats.flagCol')}</span></th>
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
                                      ? t(locale, 'exams.stats.secondsValue', { seconds: Math.round(row.avgDurationSeconds) })
                                      : '—'}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {row.problematic && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border text-red-700 bg-red-50 border-red-200">
                                        <AlertTriangle className="w-3 h-3" />
                                        {t(locale, 'exams.stats.needsReview')}
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
                {t(locale, 'exams.list.empty')}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'exams.list.emptyFiltered')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto [contain:paint] rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>
                  <tr>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.list.titleCol')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.shared.type')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.filters.subject')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.list.questionsCol')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.shared.durationMinutes')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.shared.attempts')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'common.status')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{t(locale, 'common.actions')}</span></th>
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
                              <span>{t(locale, 'exams.list.fromWord')} {new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(exam.availableFrom))}</span>
                            )}
                            {exam.availableUntil && (
                              <span>{t(locale, 'exams.list.untilWord')} {new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(exam.availableUntil))}</span>
                            )}
                            {exam.maxAttempts && (
                              <span>{t(locale, 'exams.list.maxAttemptsWord')}: {exam.maxAttempts}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${typeBadgeClass(exam.examType)}`}>
                          {examTypeLabel(exam.examType, locale)}
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
                            {t(locale, 'exams.list.avgScoreWord')}: {exam.averageScore.toFixed(0)}%
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(exam.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          {statusLabel(exam.status, locale)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {/* Command Center P1: row-action ⋮ menu — all six exam actions
                            (stats, results, edit, publish, archive, delete) grouped into
                            one trigger instead of the 6-button cluster. Destructive
                            entries stay confirm-gated downstream via setConfirm. */}
                        <RowActionsMenu
                          label={t(locale, 'exams.rowActions.menuLabel', { title: exam.titleAr })}
                          dir={isArabic ? 'rtl' : 'ltr'}
                          items={[
                            {
                              key: 'stats',
                              label: t(locale, 'exams.rowActions.stats'),
                              icon: <TrendingUp className="w-4 h-4" />,
                              disabled: busy,
                              onSelect: () => void showStats(exam),
                            },
                            {
                              key: 'results',
                              label: t(locale, 'exams.results.title'),
                              icon: <BarChart3 className="w-4 h-4" />,
                              disabled: busy,
                              onSelect: () => void showResults(exam),
                            },
                            {
                              // Push 3 census: exams edit stays ungated (out-of-census
                              // control, like lecture-publish/copy-code) — backend policy is the gate.
                              key: 'edit',
                              label: t(locale, 'common.edit'),
                              icon: <Pencil className="w-4 h-4" />,
                              disabled: busy,
                              onSelect: () => void openEdit(exam),
                            },
                            {
                              // W6 (complete API coverage): student-view preview joins the menu.
                              key: 'preview',
                              label: t(locale, 'exams.preview.asStudent'),
                              icon: <Eye className="w-4 h-4" />,
                              disabled: busy,
                              onSelect: () => void showPreview(exam),
                            },
                            ...(exam.status !== 'Published' && exam.status !== 'Archived' && can('btn:exams.publish')
                              ? [{
                                  key: 'publish',
                                  label: t(locale, 'common.publish'),
                                  icon: <Send className="w-4 h-4" />,
                                  disabled: busy,
                                  dividerBefore: true,
                                  onSelect: () => setConfirm({ exam, action: 'publish' }),
                                }]
                              : []),
                            // W6 (complete API coverage): unpublish reverts a published exam to draft.
                            ...(exam.status === 'Published' && can('btn:exams.publish')
                              ? [{
                                  key: 'unpublish',
                                  label: t(locale, 'exams.rowActions.unpublish'),
                                  icon: <CloudOff className="w-4 h-4" />,
                                  disabled: busy,
                                  onSelect: () => setConfirm({ exam, action: 'unpublish' }),
                                }]
                              : []),
                            ...(exam.status !== 'Archived' && can('btn:exams.archive')
                              ? [{
                                  key: 'archive',
                                  label: t(locale, 'common.archive'),
                                  icon: <Archive className="w-4 h-4" />,
                                  disabled: busy,
                                  onSelect: () => setConfirm({ exam, action: 'archive' }),
                                }]
                              : []),
                            ...(can('btn:exams.delete')
                              ? [{
                                  key: 'delete',
                                  label: t(locale, 'common.delete'),
                                  danger: true,
                                  icon: <Trash2 className="w-4 h-4" />,
                                  disabled: busy,
                                  onSelect: () => setConfirm({ exam, action: 'delete' }),
                                }]
                              : []),
                            ...(isSuperAdmin
                              ? [{
                                  key: 'hard-delete',
                                  label: t(locale, 'exams.rowActions.hardDelete'),
                                  danger: true,
                                  dividerBefore: true,
                                  icon: <Trash2 className="w-4 h-4" />,
                                  onSelect: () => setHardTarget({ module: 'exam', targetId: exam.id, label: exam.titleAr }),
                                }]
                              : []),
                          ]}
                        />                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* ===== W2 (admin-ui): shared pager for the exam list ===== */}
          {!statsExam && !loading && examsTotal > 0 && (
            <Pagination
              page={examsPage}
              pageSize={100}
              total={examsTotal}
              onPageChange={(next) => void loadExams(next)}
              dir={isArabic ? 'rtl' : 'ltr'}
              labels={isArabic ? undefined : {
                prev: t(locale, 'exams.pager.prev'), next: t(locale, 'exams.pager.next'), navLabel: t(locale, 'exams.pager.navLabel'),
                pageOf: (p, tp) => t(locale, 'exams.pager.pageOf', { page: p, total: tp }),
              }}
              testId="exams-list-pagination"
            />
          )}

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
                      {t(locale, 'exams.reports.title')}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'exams.reports.subtitle')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={reportStatus}
                    onChange={(event) => setReportStatus(event.target.value)}
                    aria-label={t(locale, 'exams.reports.statusFilterA11y')}
                    className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  >
                    <option value="">{t(locale, 'exams.toolbar.allStatuses')}</option>
                    {['Pending', 'Reviewing', 'Resolved', 'Rejected', 'Closed'].map(status => (
                      <option key={status} value={status}>{reportStatusLabel(status, locale)}</option>
                    ))}
                  </select>
                  <select
                    value={reportType}
                    onChange={(event) => setReportType(event.target.value)}
                    aria-label={t(locale, 'exams.reports.typeFilterA11y')}
                    className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  >
                    <option value="">{t(locale, 'exams.reports.allTypes')}</option>
                    {['Typo', 'WrongAnswer', 'BadImage', 'Other'].map(type => (
                      <option key={type} value={type}>{reportTypeLabel(type, locale)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowReports(false)}
                    aria-label={t(locale, 'exams.reports.closeA11y')}
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
                      {t(locale, 'exams.reports.emptyFiltered')}
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {reports.map(report => (
                      <li key={report.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--cms-line)' }}>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${reportTypeBadgeClass(report.reportType)}`}>
                            {reportTypeLabel(report.reportType, locale)}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${reportStatusBadgeClass(report.status)}`}>
                            {reportStatusLabel(report.status, locale)}
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
                            {t(locale, 'exams.reports.resolutionNotes')} {report.resolutionNotes}
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
                              {t(locale, 'exams.reports.screenshot')}
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
                                {t(locale, 'exams.reports.resolveButton')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setReportNotes({ report, action: 'reject', notes: '' })}
                                disabled={reportsBusy}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 transition-colors"
                                style={{ borderColor: 'var(--cms-danger)', color: 'var(--cms-danger)' }}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                {t(locale, 'exams.reports.rejectButton')}
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
                aria-label={reportNotes.action === 'resolve' ? (t(locale, 'exams.reports.resolveDialog')) : (t(locale, 'exams.reports.rejectDialog'))}
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
                        ? (t(locale, 'exams.reports.resolveDialog'))
                        : (t(locale, 'exams.reports.rejectDialog'))}
                    </h3>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--cms-text-soft)' }}>
                      {reportNotes.report.questionText}
                    </p>
                  </div>
                </div>
                <div className="p-5">
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'exams.reports.notesLabel')}
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
                    {t(locale, 'common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void actOnReport()}
                    disabled={reportsBusy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
                    style={{ background: reportNotes.action === 'resolve' ? 'var(--cms-teal-700)' : 'var(--cms-danger)' }}
                  >
                    {reportsBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : null}
                    {reportNotes.action === 'resolve' ? (t(locale, 'exams.reports.resolveAction')) : (t(locale, 'exams.reports.rejectAction'))}
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
                        {form.id ? (t(locale, 'exams.editor.editTitle')) : (t(locale, 'exams.header.newExam'))}
                      </p>
                      <h3 className="text-base font-bold truncate" style={{ color: 'var(--cms-text)' }}>
                        {activeSubject ? label(isArabic, activeSubject) : (t(locale, 'exams.header.title'))}
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
                          {t(locale, 'exams.editor.basicInfo')}
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {t(locale, 'exams.editor.titleArLabel')}
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
                            {t(locale, 'exams.editor.titleEnLabel')}
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
                            {t(locale, 'exams.editor.slugLabel')}
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
                            {t(locale, 'exams.shared.type')}
                          </span>
                          <select
                            value={form.examType}
                            onChange={event => setForm(current => ({ ...current, examType: event.target.value as ExamType }))}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          >
                            <option value="Final">{t(locale, 'exams.examType.final')}</option>
                            <option value="Midterm">{t(locale, 'exams.examType.midterm')}</option>
                            <option value="Quiz">{t(locale, 'exams.examType.quiz')}</option>
                            <option value="Practice">{t(locale, 'exams.examType.practice')}</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {t(locale, 'exams.editor.lectureLabel')}
                          </span>
                          <select
                            value={form.lectureId ?? ''}
                            onChange={event => { setForm(current => ({ ...current, lectureId: event.target.value || null })); setSelectedQuestions([]); }}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          >
                            <option value="">{t(locale, 'exams.shared.subjectWide')}</option>
                            {lectures.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {t(locale, 'exams.filters.year')}
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
                            {t(locale, 'exams.editor.descriptionLabel')}
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
                          {t(locale, 'exams.editor.availabilityTitle')}
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {t(locale, 'exams.shared.durationMinutes')}
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
                            {t(locale, 'exams.editor.passingScoreLabel')}
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
                            {t(locale, 'exams.editor.displayOrderLabel')}
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
                            {t(locale, 'exams.editor.maxAttemptsLabel')}
                          </span>
                          <input
                            min="1"
                            type="number"
                            value={form.maxAttempts ?? ''}
                            onChange={event => setForm(current => ({ ...current, maxAttempts: event.target.value ? Number(event.target.value) : null }))}
                            placeholder={t(locale, 'exams.editor.unlimitedPlaceholder')}
                            className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ borderColor: 'var(--cms-line-strong)' }}
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                            {t(locale, 'exams.editor.availableFromLabel')}
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
                            {t(locale, 'exams.editor.availableUntilLabel')}
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
                          {t(locale, 'exams.editor.policiesTitle')}
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" checked={form.shuffleQuestions} onChange={event => setForm(current => ({ ...current, shuffleQuestions: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                          {t(locale, 'exams.editor.shuffleQuestions')}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" checked={form.shuffleOptions} onChange={event => setForm(current => ({ ...current, shuffleOptions: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                          {t(locale, 'exams.editor.shuffleOptions')}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" checked={form.showResultsImmediately} onChange={event => setForm(current => ({ ...current, showResultsImmediately: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                          {t(locale, 'exams.editor.showResultsAfterSubmission')}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" checked={form.allowReview} onChange={event => setForm(current => ({ ...current, allowReview: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                          {t(locale, 'exams.editor.allowReview')}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" disabled={!form.allowReview} checked={form.showCorrectAnswers} onChange={event => setForm(current => ({ ...current, showCorrectAnswers: event.target.checked }))} className="h-4 w-4 accent-teal-600 disabled:opacity-50" />
                          {t(locale, 'exams.editor.showCorrectAnswers')}
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                          <input type="checkbox" disabled={!form.allowReview} checked={form.showExplanations} onChange={event => setForm(current => ({ ...current, showExplanations: event.target.checked }))} className="h-4 w-4 accent-teal-600 disabled:opacity-50" />
                          {t(locale, 'exams.editor.showExplanations')}
                        </label>
                      </div>
                    </section>

                    {/* === Question builder section === */}
                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ListChecks className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                          {t(locale, 'exams.compose.title')}
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
                                {t(locale, 'exams.compose.selectedTitle')}
                              </p>
                              <h5 className="text-sm font-bold" style={{ color: 'var(--cms-text)' }}>
                                {selectedQuestions.length} {t(locale, 'exams.units.questions')}
                              </h5>
                            </div>
                            <ListChecks className="w-5 h-5" style={{ color: 'var(--cms-teal-700)' }} />
                          </div>
                          <div className="p-3 max-h-96 overflow-y-auto space-y-2">
                            {selectedQuestions.length === 0 ? (
                              <div className="flex flex-col items-center justify-center text-center py-8" style={{ color: 'var(--cms-text-muted)' }}>
                                <FileText className="w-6 h-6 opacity-50" />
                                <p className="mt-2 text-xs">
                                  {t(locale, 'exams.compose.selectedEmpty')}
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
                                    {questionTypeLabel(question.type, isArabic)} · {questionDifficultyLabel(question.difficulty, isArabic)} · {question.lectureName ?? (t(locale, 'exams.shared.subjectWide'))}
                                  </small>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    type="button"
                                    title={t(locale, 'exams.compose.moveUp')}
                                    disabled={index === 0}
                                    onClick={() => moveQuestion(index, -1)}
                                    className="p-0.5 rounded transition-colors disabled:opacity-30"
                                    style={{ color: 'var(--cms-text-muted)' }}
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title={t(locale, 'exams.compose.moveDown')}
                                    disabled={index === selectedQuestions.length - 1}
                                    onClick={() => moveQuestion(index, 1)}
                                    className="p-0.5 rounded transition-colors disabled:opacity-30"
                                    style={{ color: 'var(--cms-text-muted)' }}
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title={t(locale, 'exams.compose.remove')}
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
                                {t(locale, 'exams.compose.availableTitle')}
                              </p>
                              <h5 className="text-sm font-bold" style={{ color: 'var(--cms-text)' }}>
                                {t(locale, 'exams.compose.availableSubtitle')}
                              </h5>
                            </div>
                          </div>
                          <div className="p-3 space-y-2">
                            <div className="relative">
                              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <input
                                value={candidateQuery}
                                onChange={event => setCandidateQuery(event.target.value)}
                                placeholder={t(locale, 'exams.compose.searchPlaceholder')}
                                className="w-full pr-9 pl-3 py-1.5 rounded-md border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ borderColor: 'var(--cms-line-strong)' }}
                              />
                            </div>
                            <div className="max-h-80 overflow-y-auto space-y-2">
                              {candidates.length === 0 ? (
                                <p className="text-center text-xs py-6" style={{ color: 'var(--cms-text-muted)' }}>
                                  {t(locale, 'exams.compose.noCandidates')}
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
                                        {questionTypeLabel(candidate.type, isArabic)} · {questionDifficultyLabel(candidate.difficulty, isArabic)} · {candidate.lectureName ?? (t(locale, 'exams.shared.subjectWide'))}
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
                      {t(locale, 'common.close')}
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
                      {t(locale, 'exams.editor.saveDraft')}
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
                    {t(locale, 'exams.results.title')}
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
                  {t(locale, 'common.close')}
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
                      {t(locale, 'exams.shared.noAttempts')}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto [contain:paint] rounded-lg border" style={{ borderColor: 'var(--cms-line)' }}>
                    <table className="w-full text-sm">
                      <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>
                        <tr>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.results.studentCol')}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'common.status')}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.results.scoreCol')}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.results.resultCol')}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.results.answeredCol')}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.results.correctCol')}</th>
                          <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'exams.results.startedCol')}</th>
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
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${resultStatusBadgeClass(result.status)}`}>
                                  {resultStatusLabel(result.status, locale)}
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
                                    {t(locale, 'exams.results.passed')}
                                  </span>
                                )}
                                {failed && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border text-red-700 bg-red-50 border-red-200">
                                    {t(locale, 'exams.results.failed')}
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
                  background: confirm.action === 'archive' || confirm.action === 'unpublish' ? 'var(--cms-warning-50)'
                    : confirm.action === 'delete' ? 'var(--cms-danger-50)'
                    : 'var(--cms-teal-50)',
                  color: confirm.action === 'archive' || confirm.action === 'unpublish' ? 'var(--cms-warning)'
                    : confirm.action === 'delete' ? 'var(--cms-danger)'
                    : 'var(--cms-teal-700)',
                }}
              >
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                  {confirm.action === 'publish'
                    ? (t(locale, 'exams.confirm.publishTitle'))
                    : confirm.action === 'archive'
                    ? (t(locale, 'exams.confirm.archiveTitle'))
                    : confirm.action === 'unpublish'
                    ? (t(locale, 'exams.confirm.unpublishTitle'))
                    : (t(locale, 'exams.confirm.deleteTitle'))}
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--cms-text-soft)' }}>
                  {confirm.action === 'publish'
                    ? (t(locale, 'exams.confirm.publishText'))
                    : confirm.action === 'archive'
                    ? (t(locale, 'exams.confirm.archiveText'))
                    : confirm.action === 'unpublish'
                    ? (t(locale, 'exams.confirm.unpublishText'))
                    : (t(locale, 'exams.confirm.deleteText'))}
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
                {t(locale, 'common.cancel')}
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
                  background: confirm.action === 'archive' || confirm.action === 'unpublish' ? 'var(--cms-warning)'
                    : confirm.action === 'delete' ? 'var(--cms-danger)'
                    : 'var(--cms-teal-700)',
                }}
                onMouseEnter={(event) => {
                  if (confirm.action === 'archive' || confirm.action === 'unpublish') event.currentTarget.style.background = '#8a5a18';
                  else if (confirm.action === 'delete') event.currentTarget.style.background = '#9c3a31';
                  else event.currentTarget.style.background = 'var(--cms-teal-600)';
                }}
                onMouseLeave={(event) => {
                  if (confirm.action === 'archive' || confirm.action === 'unpublish') event.currentTarget.style.background = 'var(--cms-warning)';
                  else if (confirm.action === 'delete') event.currentTarget.style.background = 'var(--cms-danger)';
                  else event.currentTarget.style.background = 'var(--cms-teal-700)';
                }}
              >
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : (
                  confirm.action === 'archive' ? <Archive className="w-4 h-4" />
                  : confirm.action === 'delete' ? <Trash2 className="w-4 h-4" />
                  : confirm.action === 'unpublish' ? <CloudOff className="w-4 h-4" />
                  : <Send className="w-4 h-4" />
                )}
                {confirm.action === 'publish'
                  ? (t(locale, 'common.publish'))
                  : confirm.action === 'archive'
                  ? (t(locale, 'common.archive'))
                  : confirm.action === 'unpublish'
                  ? (t(locale, 'exams.confirm.unpublishAction'))
                  : (t(locale, 'common.delete'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== W-coverage (row 18): student-view preview — shared Dialog, no correctness flags ===== */}
      {preview && (
        <Dialog
          open
          onOpenChange={(next) => { if (!next) setPreview(null); }}
          title={t(locale, 'exams.preview.asStudent')}
          description={preview.exam.titleAr}
          dir={isArabic ? 'rtl' : 'ltr'}
          size="lg"
          testId="exam-preview-dialog"
        >
          <div className="px-5 py-4 space-y-4">
            {preview.loading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--cms-text-muted)' }}>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                {t(locale, 'exams.preview.loading')}
              </div>
            )}
            {preview.error && !preview.loading && (
              <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--cms-danger)', background: 'var(--cms-danger-50)', color: 'var(--cms-danger)' }}>
                {preview.error}
              </div>
            )}
            {preview.data && !preview.loading && (
              <>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
                    {t(locale, 'exams.preview.durationChip', { minutes: preview.data.durationMinutes })}
                  </span>
                  <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
                    {t(locale, 'exams.preview.questionsChip', { count: preview.data.totalQuestions })}
                  </span>
                  <span className="px-2 py-1 rounded-full border" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
                    {preview.data.status}
                  </span>
                </div>
                <ol className="space-y-3 max-h-[55vh] overflow-y-auto">
                  {preview.data.questions.map((question) => (
                    <li key={question.questionId} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)' }} data-testid="exam-preview-question">
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                          style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                          {question.order}
                        </span>
                        <p className="text-sm font-medium flex-1" style={{ color: 'var(--cms-text)' }}>{question.text}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[10px] ms-8">
                        <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>{question.type}</span>
                        <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>{question.difficulty}</span>
                      </div>
                      <ul className="space-y-1.5 ms-8">
                        {question.options.map((option) => (
                          <li key={option.id} className="flex items-start gap-2 text-xs rounded-lg border px-2.5 py-1.5" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text)' }}>
                            <span className="font-bold shrink-0" style={{ color: 'var(--cms-teal-700)' }}>{option.letter}</span>
                            <span className="flex-1">{option.text}</span>
                          </li>
                        ))}
                      </ul>
                      {question.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 ms-8">
                          {question.images.map((image, index) => (
                            <img key={`${image.imageUrl}-${index}`} src={image.imageUrl} alt={image.alt ?? ''} className="h-16 rounded border object-cover" style={{ borderColor: 'var(--cms-line)' }} loading="lazy" />
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                <p className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                  {t(locale, 'exams.preview.note')}
                </p>
              </>
            )}
          </div>
          <div className="flex justify-end rounded-b-2xl border-t border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-3.5">
            <button
              type="button"
              onClick={() => setPreview(null)}
              data-testid="exam-preview-close"
              className="px-4 py-2 rounded-lg border text-sm font-medium"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              {t(locale, 'common.close')}
            </button>
          </div>
        </Dialog>
      )}

{/* Command Center P1 (D-4): physical delete, SuperAdmin + re-auth + loud-fail on children. */}
      <HardDeleteDialog
        token={token}
        isArabic={isArabic}
        target={hardTarget}
        consequence={t(locale, 'exams.hardDelete.consequence')}
        onDone={() => { void loadExams(); }}
        onClose={() => setHardTarget(null)}
      />
    </section>
  );
}
