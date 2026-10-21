import { AlertCircle, Archive, ArrowDown, ArrowUp, BarChart3, CheckCircle2, ClipboardCheck, FileText, ListChecks, LoaderCircle, Pencil, Plus, Search, Send, X, GraduationCap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  id: string; subjectId: string; lectureId?: string | null; titleAr: string; slug: string; examType: string; year: number;
  totalQuestions: number; durationMinutes: number; availableFrom?: string | null; availableUntil?: string | null; maxAttempts?: number | null;
  status: ExamStatus; attemptsCount: number; completedCount: number; averageScore?: number | null;
};
type ExamQuestion = { questionId: string; sortOrder: number; text: string; type: string; difficulty: string; lectureName?: string | null; tags: string[] };
type ExamDetails = { exam: ExamConfiguration; questions: ExamQuestion[] };
type ExamConfiguration = {
  id?: string; subjectId: string; lectureId?: string | null; titleAr: string; titleEn?: string | null; slug: string; description?: string | null; examType: ExamType;
  year: number; durationMinutes: number; totalQuestions?: number; passingScore: number; sortOrder: number; availableFrom?: string | null; availableUntil?: string | null;
  maxAttempts?: number | null; shuffleQuestions: boolean; shuffleOptions: boolean; showResultsImmediately: boolean; allowReview: boolean; showCorrectAnswers: boolean; showExplanations: boolean; status?: ExamStatus;
};
type Candidate = { id: string; text: string; type: string; difficulty: string; lectureId?: string | null; lectureName?: string | null; tags: string[] };
type Result = { sessionId: string; studentId: string; studentName: string; status: string; startedAt: string; completedAt?: string | null; answeredQuestions: number; correctAnswers: number; score?: number | null; passed?: boolean | null; isFirstAttempt: boolean };
type Page<T> = { items: T[]; page: number; pageSize: number; totalCount: number };
type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };
type ConfirmDialog = { exam: ExamSummary; action: 'publish' | 'archive' } | null;

const blankForm = (subjectId = ''): ExamConfiguration => ({
  subjectId, lectureId: null, titleAr: '', titleEn: null, slug: '', description: null, examType: 'Final', year: new Date().getFullYear(), durationMinutes: 60,
  passingScore: 60, sortOrder: 0, availableFrom: null, availableUntil: null, maxAttempts: null, shuffleQuestions: true, shuffleOptions: true,
  showResultsImmediately: true, allowReview: true, showCorrectAnswers: true, showExplanations: true,
});
const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null; titleAr?: string; titleEn?: string | null }) => arabic ? (item.nameAr ?? item.titleAr ?? '') : (item.nameEn ?? item.titleEn ?? item.nameAr ?? item.titleAr ?? '');
const toInputDate = (value?: string | null) => value ? value.slice(0, 16) : '';
const toIso = (value: string) => value ? new Date(value).toISOString() : null;

const statusChipClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'published') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (value === 'archived') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const statusDisplay = (status: string, isArabic: boolean) => {
  const value = status.toLowerCase();
  if (value === 'published') return isArabic ? 'منشور' : 'Published';
  if (value === 'archived') return isArabic ? 'مؤرشف' : 'Archived';
  return isArabic ? 'مسودة' : 'Draft';
};

export function ExamsCenter({ token, isArabic, onError, onNotice }: Props) {
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
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<ExamConfiguration>(blankForm());
  const [selectedQuestions, setSelectedQuestions] = useState<ExamQuestion[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateQuery, setCandidateQuery] = useState('');
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
    setUniversityId(id); setCollegeId(''); setYearId(''); setSemesterId(''); setSubjectId(''); setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الكليات.'); }
  }
  async function chooseCollege(id: string) {
    setCollegeId(id); setYearId(''); setSemesterId(''); setSubjectId(''); setYears([]); setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل السنوات.'); }
  }
  async function chooseYear(id: string) {
    setYearId(id); setSemesterId(''); setSubjectId(''); setSemesters([]); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الفصول.'); }
  }
  async function chooseSemester(id: string) {
    setSemesterId(id); setSubjectId(''); setSubjects([]); setLectures([]); closeEditor();
    if (!id) return;
    try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المواد.'); }
  }
  async function chooseSubject(id: string) {
    setSubjectId(id); setLectures([]); closeEditor();
    if (!id) return;
    try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${id}/lectures`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المحاضرات.'); }
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
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الاختبارات.'); } finally { setLoading(false); }
  }

  async function loadCandidates() {
    if (!subjectId) return;
    try {
      const params = new URLSearchParams({ subjectId, page: '1', pageSize: '100' });
      if (form.lectureId) params.set('lectureId', form.lectureId);
      if (candidateQuery.trim()) params.set('search', candidateQuery.trim());
      const data = await request<Page<Candidate>>(`/api/v1/admin/exams/question-candidates?${params.toString()}`);
      setCandidates(data.items);
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الأسئلة المؤهلة للاختبار.'); }
  }

  function openCreate() {
    if (!subjectId) return;
    setForm(blankForm(subjectId)); setSelectedQuestions([]); setCandidateQuery(''); setShowEditor(true); setResultExam(null);
  }
  function closeEditor() { setShowEditor(false); setForm(blankForm(subjectId)); setSelectedQuestions([]); setCandidateQuery(''); }

  async function openEdit(exam: ExamSummary) {
    setBusy(true); setResultExam(null);
    try {
      const data = await request<ExamDetails>(`/api/v1/admin/exams/${exam.id}`);
      setForm({ ...data.exam, availableFrom: toInputDate(data.exam.availableFrom), availableUntil: toInputDate(data.exam.availableUntil) });
      setSelectedQuestions(data.questions);
      setShowEditor(true);
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر فتح الاختبار.'); } finally { setBusy(false); }
  }

  function addCandidate(candidate: Candidate) {
    if (selectedIds.has(candidate.id)) return;
    setSelectedQuestions(current => [...current, { questionId: candidate.id, sortOrder: current.length, text: candidate.text, type: candidate.type, difficulty: candidate.difficulty, lectureName: candidate.lectureName, tags: candidate.tags }]);
  }
  function removeQuestion(id: string) { setSelectedQuestions(current => current.filter(question => question.questionId !== id).map((question, index) => ({ ...question, sortOrder: index }))); }
  function moveQuestion(index: number, direction: -1 | 1) {
    setSelectedQuestions(current => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
      return next.map((question, position) => ({ ...question, sortOrder: position }));
    });
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectId || !form.titleAr.trim() || !form.slug.trim()) return;
    if (form.availableFrom && form.availableUntil && new Date(form.availableUntil) <= new Date(form.availableFrom)) { onError(isArabic ? 'يجب أن ينتهي نطاق الإتاحة بعد بدايته.' : 'Availability end must be after its start.'); return; }
    setBusy(true);
    const payload = { ...form, subjectId, lectureId: form.lectureId || null, titleAr: form.titleAr.trim(), slug: form.slug.trim(), titleEn: form.titleEn?.trim() || null, description: form.description?.trim() || null, availableFrom: toIso(form.availableFrom ?? ''), availableUntil: toIso(form.availableUntil ?? ''), maxAttempts: form.maxAttempts ? Number(form.maxAttempts) : null, year: Number(form.year), durationMinutes: Number(form.durationMinutes), passingScore: Number(form.passingScore), sortOrder: Number(form.sortOrder) };
    try {
      const saved = form.id
        ? await request<ExamConfiguration>(`/api/v1/admin/exams/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await request<ExamConfiguration>('/api/v1/admin/exams', { method: 'POST', body: JSON.stringify(payload) });
      const examId = saved.id ?? form.id;
      if (!examId) throw new Error('لم يعُد الخادم بمعرف الاختبار.');
      await request(`/api/v1/admin/exams/${examId}/questions`, { method: 'PUT', body: JSON.stringify({ questionIds: selectedQuestions.map(question => question.questionId) }) });
      setForm({ ...saved, availableFrom: toInputDate(saved.availableFrom), availableUntil: toInputDate(saved.availableUntil) });
      onNotice(isArabic ? 'تم حفظ تكوين الاختبار وترتيب أسئلته كمسودة.' : 'Exam configuration and question order saved as a draft.');
      await loadExams();
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر حفظ الاختبار.'); } finally { setBusy(false); }
  }

  async function lifecycle(exam: ExamSummary, action: 'publish' | 'archive') {
    setBusy(true);
    try {
      await request(`/api/v1/admin/exams/${exam.id}/${action}`, { method: 'POST' });
      onNotice(action === 'publish' ? (isArabic ? 'تم نشر الاختبار.' : 'Exam published.') : (isArabic ? 'تمت أرشفة الاختبار.' : 'Exam archived.'));
      await loadExams();
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحديث حالة الاختبار.'); } finally { setBusy(false); }
  }

  async function showResults(exam: ExamSummary) {
    setResultExam(exam); setResultsLoading(true);
    try {
      const data = await request<Page<Result>>(`/api/v1/admin/exams/${exam.id}/results?page=1&pageSize=100`);
      setResults(data.items);
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل نتائج الاختبار.'); setResults([]); } finally { setResultsLoading(false); }
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'إدارة الاختبارات' : 'Exam management'}</p>
            <h2 className="text-2xl font-bold text-slate-900">{isArabic ? 'تصميم الاختبارات، نشرها، وقراءة نتائجها' : 'Design, publish, and audit exam outcomes'}</h2>
          </div>
        </div>
        {subjectId && (
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" />{isArabic ? 'اختبار جديد' : 'New exam'}
          </button>
        )}
      </header>

      {/* Scope selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الجامعة' : 'University'}</span>
          <select value={universityId} onChange={event => void chooseUniversity(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">{isArabic ? 'اختر الجامعة' : 'Select university'}</option>
            {universities.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الكلية' : 'College'}</span>
          <select value={collegeId} disabled={!universityId} onChange={event => void chooseCollege(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">{isArabic ? 'اختر الكلية' : 'Select college'}</option>
            {colleges.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'السنة' : 'Year'}</span>
          <select value={yearId} disabled={!collegeId} onChange={event => void chooseYear(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">{isArabic ? 'اختر السنة' : 'Select year'}</option>
            {years.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الفصل' : 'Semester'}</span>
          <select value={semesterId} disabled={!yearId} onChange={event => void chooseSemester(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">{isArabic ? 'اختر الفصل' : 'Select semester'}</option>
            {semesters.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المادة' : 'Subject'}</span>
          <select value={subjectId} disabled={!semesterId} onChange={event => void chooseSubject(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">{isArabic ? 'اختر المادة' : 'Select subject'}</option>
            {subjects.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
          </select>
        </label>
      </div>

      {!subjectId ? (
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center text-center py-16">
          <div className="p-3 rounded-full bg-slate-50 text-slate-400">
            <ClipboardCheck className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">{isArabic ? 'اختر مادة لفتح إدارة اختباراتِها.' : 'Select a subject to manage its exams.'}</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl bg-white border border-slate-200">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder={isArabic ? 'ابحث بعنوان الاختبار أو رابطه' : 'Search title or slug'} className="w-full pr-10 pl-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option>
              <option value="Draft">{isArabic ? 'مسودة' : 'Draft'}</option>
              <option value="Published">{isArabic ? 'منشور' : 'Published'}</option>
              <option value="Archived">{isArabic ? 'مؤرشف' : 'Archived'}</option>
            </select>
          </div>

          {/* Exams list */}
          <div className="space-y-3">
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="space-y-2">
                    <div className="flex gap-2">
                      <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                      <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
                      <div className="h-5 w-14 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                    <div className="h-4 rounded bg-slate-100 animate-pulse w-3/4" />
                    <div className="h-3 rounded bg-slate-100 animate-pulse w-1/2" />
                  </div>
                ))}
              </div>
            ) : exams.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center text-center py-16">
                <div className="p-3 rounded-full bg-slate-50 text-slate-400">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">{isArabic ? 'لا توجد اختبارات ضمن هذه التصفية.' : 'No exams match this filter.'}</p>
              </div>
            ) : exams.map(exam => (
              <article key={exam.id} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300 hover:shadow-sm transition-all">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${statusChipClass(exam.status)}`}>{statusDisplay(exam.status, isArabic)}</span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs border border-teal-200 text-teal-700 bg-teal-50">{exam.examType}</span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs border border-slate-200 text-slate-600 bg-slate-50">{exam.durationMinutes} {isArabic ? 'د' : 'min'}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">{exam.titleAr}</h3>
                    <p className="mt-1 text-xs text-slate-500">{exam.totalQuestions} {isArabic ? 'سؤال' : 'questions'} · {exam.completedCount}/{exam.attemptsCount} {isArabic ? 'محاولة مكتملة' : 'completed attempts'} · {exam.averageScore == null ? '—' : `${exam.averageScore.toFixed(0)}%`}</p>
                    {(exam.availableFrom || exam.availableUntil || exam.maxAttempts) && (
                      <small className="block mt-1 text-xs text-slate-400">
                        {exam.availableFrom && `${isArabic ? 'من' : 'From'} ${new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(exam.availableFrom))}`}
                        {exam.availableUntil && ` · ${isArabic ? 'إلى' : 'Until'} ${new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(exam.availableUntil))}`}
                        {exam.maxAttempts && ` · ${isArabic ? 'حد المحاولات' : 'Max attempts'}: ${exam.maxAttempts}`}
                      </small>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" title={isArabic ? 'النتائج' : 'Results'} onClick={() => void showResults(exam)} disabled={busy} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50">
                      <BarChart3 className="w-4 h-4" />
                    </button>
                    <button type="button" title={isArabic ? 'تعديل' : 'Edit'} onClick={() => void openEdit(exam)} disabled={busy} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {exam.status !== 'Published' && exam.status !== 'Archived' && (
                      <button type="button" title={isArabic ? 'نشر' : 'Publish'} onClick={() => setConfirm({ exam, action: 'publish' })} disabled={busy} className="p-1.5 rounded-md text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50">
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    {exam.status !== 'Archived' && (
                      <button type="button" title={isArabic ? 'أرشفة' : 'Archive'} onClick={() => setConfirm({ exam, action: 'archive' })} disabled={busy} className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50">
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Exam editor */}
          {showEditor && (
            <form onSubmit={event => void saveDraft(event)} className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{form.id ? (isArabic ? 'تعديل اختبار' : 'Edit exam') : (isArabic ? 'اختبار جديد' : 'New exam')}</p>
                  <h3 className="text-base font-bold text-slate-900">{activeSubject ? label(isArabic, activeSubject) : ''}</h3>
                </div>
                <button type="button" onClick={closeEditor} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <X className="w-3.5 h-3.5" />{isArabic ? 'إغلاق' : 'Close'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'العنوان العربي' : 'Arabic title'}</span>
                  <input required value={form.titleAr} onChange={event => setForm(current => ({ ...current, titleAr: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'العنوان الإنجليزي (اختياري)' : 'English title (optional)'}</span>
                  <input value={form.titleEn ?? ''} onChange={event => setForm(current => ({ ...current, titleEn: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الرابط المختصر' : 'Slug'}</span>
                  <input required dir="ltr" pattern="[a-z0-9-]+" value={form.slug} onChange={event => setForm(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'النوع' : 'Type'}</span>
                  <select value={form.examType} onChange={event => setForm(current => ({ ...current, examType: event.target.value as ExamType }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="Final">{isArabic ? 'نهائي' : 'Final'}</option>
                    <option value="Midterm">{isArabic ? 'نصفي' : 'Midterm'}</option>
                    <option value="Quiz">{isArabic ? 'اختبار قصير' : 'Quiz'}</option>
                    <option value="Practice">{isArabic ? 'تدريبي' : 'Practice'}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'السنة' : 'Year'}</span>
                  <input required min="1" type="number" value={form.year} onChange={event => setForm(current => ({ ...current, year: Number(event.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المحاضرة (اختياري)' : 'Lecture (optional)'}</span>
                  <select value={form.lectureId ?? ''} onChange={event => { setForm(current => ({ ...current, lectureId: event.target.value || null })); setSelectedQuestions([]); }} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">{isArabic ? 'على مستوى المادة' : 'Subject-wide'}</option>
                    {lectures.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المدة بالدقائق' : 'Duration (minutes)'}</span>
                  <input required min="1" type="number" value={form.durationMinutes} onChange={event => setForm(current => ({ ...current, durationMinutes: Number(event.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'درجة النجاح %' : 'Passing score %'}</span>
                  <input required min="0" max="100" step="0.01" type="number" value={form.passingScore} onChange={event => setForm(current => ({ ...current, passingScore: Number(event.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'ترتيب العرض' : 'Display order'}</span>
                  <input required min="0" type="number" value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الحد الأقصى للمحاولات (اختياري)' : 'Maximum attempts (optional)'}</span>
                  <input min="1" type="number" value={form.maxAttempts ?? ''} onChange={event => setForm(current => ({ ...current, maxAttempts: event.target.value ? Number(event.target.value) : null }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'متاح من (اختياري)' : 'Available from (optional)'}</span>
                  <input type="datetime-local" value={toInputDate(form.availableFrom)} onChange={event => setForm(current => ({ ...current, availableFrom: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'متاح حتى (اختياري)' : 'Available until (optional)'}</span>
                  <input type="datetime-local" value={toInputDate(form.availableUntil)} onChange={event => setForm(current => ({ ...current, availableUntil: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block md:col-span-2 lg:col-span-3">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الوصف (اختياري)' : 'Description (optional)'}</span>
                  <textarea rows={3} value={form.description ?? ''} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y" />
                </label>
              </div>

              {/* Policy checkboxes */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.shuffleQuestions} onChange={event => setForm(current => ({ ...current, shuffleQuestions: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                  {isArabic ? 'ترتيب الأسئلة عشوائي لكل محاولة' : 'Shuffle questions for each attempt'}
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.shuffleOptions} onChange={event => setForm(current => ({ ...current, shuffleOptions: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                  {isArabic ? 'ترتيب الخيارات عشوائي' : 'Shuffle answer options'}
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.showResultsImmediately} onChange={event => setForm(current => ({ ...current, showResultsImmediately: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                  {isArabic ? 'إظهار النتيجة بعد التسليم' : 'Show result after submission'}
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.allowReview} onChange={event => setForm(current => ({ ...current, allowReview: event.target.checked }))} className="h-4 w-4 accent-teal-600" />
                  {isArabic ? 'السماح بالمراجعة' : 'Allow review'}
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" disabled={!form.allowReview} checked={form.showCorrectAnswers} onChange={event => setForm(current => ({ ...current, showCorrectAnswers: event.target.checked }))} className="h-4 w-4 accent-teal-600 disabled:opacity-50" />
                  {isArabic ? 'عرض الإجابة الصحيحة في المراجعة' : 'Show correct answers in review'}
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" disabled={!form.allowReview} checked={form.showExplanations} onChange={event => setForm(current => ({ ...current, showExplanations: event.target.checked }))} className="h-4 w-4 accent-teal-600 disabled:opacity-50" />
                  {isArabic ? 'عرض الشرح في المراجعة' : 'Show explanations in review'}
                </label>
              </div>

              {/* Question builder */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'أسئلة الاختبار' : 'Exam questions'}</p>
                      <h4 className="text-sm font-bold text-slate-900">{selectedQuestions.length} {isArabic ? 'سؤال محدد' : 'selected questions'}</h4>
                    </div>
                    <ListChecks className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="p-3 max-h-80 overflow-y-auto space-y-2">
                    {selectedQuestions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center text-center py-8 text-slate-500">
                        <FileText className="w-6 h-6 text-slate-300" />
                        <p className="mt-2 text-xs">{isArabic ? 'أضف أسئلة منشورة من القائمة المقابلة.' : 'Add published questions from the candidate list.'}</p>
                      </div>
                    ) : selectedQuestions.map((question, index) => (
                      <article key={question.questionId} className="flex gap-2 p-2 rounded-lg border border-slate-200 bg-white">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <strong className="block text-xs font-medium text-slate-900 leading-snug">{question.text}</strong>
                          <small className="block mt-0.5 text-[10px] text-slate-500">{question.type} · {question.lectureName ?? (isArabic ? 'على مستوى المادة' : 'Subject-wide')}</small>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <button type="button" title={isArabic ? 'أعلى' : 'Up'} disabled={index === 0} onClick={() => moveQuestion(index, -1)} className="p-0.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-30">
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" title={isArabic ? 'أسفل' : 'Down'} disabled={index === selectedQuestions.length - 1} onClick={() => moveQuestion(index, 1)} className="p-0.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-30">
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" title={isArabic ? 'إزالة' : 'Remove'} onClick={() => removeQuestion(question.questionId)} className="p-0.5 rounded text-red-500 hover:bg-red-50 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'بنك الأسئلة المؤهل' : 'Eligible question bank'}</p>
                      <h4 className="text-sm font-bold text-slate-900">{isArabic ? 'الأسئلة المنشورة المصححة آلياً فقط' : 'Published, automatically graded questions only'}</h4>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input value={candidateQuery} onChange={event => setCandidateQuery(event.target.value)} placeholder={isArabic ? 'ابحث في نص السؤال' : 'Search question text'} className="w-full pr-9 pl-3 py-1.5 rounded-md border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {candidates.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6">{isArabic ? 'لا توجد أسئلة مؤهلة.' : 'No eligible questions.'}</p>
                      ) : candidates.map(candidate => {
                        const picked = selectedIds.has(candidate.id);
                        return (
                          <button type="button" key={candidate.id} onClick={() => addCandidate(candidate)} disabled={picked} className={`w-full flex items-start gap-2 p-2 rounded-lg border text-right transition-colors ${picked ? 'border-teal-200 bg-teal-50 opacity-70 cursor-not-allowed' : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40'}`}>
                            <span className={`shrink-0 mt-0.5 ${picked ? 'text-teal-600' : 'text-slate-400'}`}>
                              {picked ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <strong className="block text-xs font-medium text-slate-900 leading-snug">{candidate.text}</strong>
                              <small className="block mt-0.5 text-[10px] text-slate-500">{candidate.type} · {candidate.difficulty} · {candidate.lectureName ?? (isArabic ? 'على مستوى المادة' : 'Subject-wide')}</small>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-1 border-t border-slate-100">
                <button type="button" disabled={busy} onClick={closeEditor} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">{isArabic ? 'إلغاء' : 'Cancel'}</button>
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50" disabled={busy}>
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{isArabic ? 'حفظ التكوين والأسئلة' : 'Save configuration and questions'}
                </button>
              </div>
            </form>
          )}

          {/* Results panel */}
          {resultExam && (
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'نتائج الاختبار' : 'Exam results'}</p>
                  <h3 className="text-base font-bold text-slate-900">{resultExam.titleAr}</h3>
                </div>
                <button type="button" onClick={() => setResultExam(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <X className="w-3.5 h-3.5" />{isArabic ? 'إغلاق' : 'Close'}
                </button>
              </div>
              <div className="p-5">
                {resultsLoading ? (
                  <div className="flex items-center justify-center py-10 text-slate-500">
                    <LoaderCircle className="w-5 h-5 animate-spin ml-2" />{isArabic ? 'جارٍ تحميل النتائج…' : 'Loading outcomes…'}
                  </div>
                ) : results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12 text-slate-500">
                    <BarChart3 className="w-6 h-6 text-slate-300" />
                    <p className="mt-2 text-sm">{isArabic ? 'لا توجد محاولات بعد.' : 'No attempts yet.'}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="text-right px-4 py-3 font-medium">{isArabic ? 'الطالب' : 'Student'}</th>
                          <th className="text-right px-4 py-3 font-medium">{isArabic ? 'الحالة' : 'Status'}</th>
                          <th className="text-right px-4 py-3 font-medium">{isArabic ? 'النتيجة' : 'Score'}</th>
                          <th className="text-right px-4 py-3 font-medium">{isArabic ? 'الإجابات' : 'Answers'}</th>
                          <th className="text-right px-4 py-3 font-medium">{isArabic ? 'البداية' : 'Started'}</th>
                          <th className="text-right px-4 py-3 font-medium">{isArabic ? 'المحاولة الأولى' : 'First attempt'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {results.map(result => (
                          <tr key={result.sessionId} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-900">{result.studentName}</td>
                            <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${statusChipClass(result.status)}`}>{result.status}</span></td>
                            <td className="px-4 py-3 text-slate-600">{result.score == null ? '—' : `${result.score.toFixed(0)}%`}</td>
                            <td className="px-4 py-3 text-slate-600">{result.correctAnswers}/{result.answeredQuestions}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.startedAt))}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs">{result.isFirstAttempt ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* Confirmation modal for publish / archive */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={() => !busy && setConfirm(null)}>
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3 p-5 border-b border-slate-200">
              <div className={`p-2 rounded-lg ${confirm.action === 'archive' ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-600'}`}>
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{confirm.action === 'publish' ? (isArabic ? 'نشر الاختبار' : 'Publish exam') : (isArabic ? 'أرشفة الاختبار' : 'Archive exam')}</h3>
                <p className="text-sm text-slate-600 mt-1">{confirm.action === 'publish' ? (isArabic ? 'لا يقبل النشر إلا الأسئلة المنشورة والمؤهلة.' : 'Only published, eligible questions can be used.') : (isArabic ? 'سيُخفى الاختبار من قائمة الطلاب.' : 'The exam will be removed from student discovery.')}</p>
                <p className="text-sm font-medium text-slate-900 mt-2">"{confirm.exam.titleAr}"</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end p-5">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">{isArabic ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={() => { const exam = confirm.exam; const action = confirm.action; setConfirm(null); void lifecycle(exam, action); }} disabled={busy} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors ${confirm.action === 'archive' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : confirm.action === 'archive' ? <Archive className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {confirm.action === 'publish' ? (isArabic ? 'نشر' : 'Publish') : (isArabic ? 'أرشفة' : 'Archive')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
