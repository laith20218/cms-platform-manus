import { Archive, ArrowDown, ArrowUp, BarChart3, CheckCircle2, ClipboardCheck, FileText, ListChecks, LoaderCircle, Pencil, Plus, Search, Send, X } from 'lucide-react';
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

const blankForm = (subjectId = ''): ExamConfiguration => ({
  subjectId, lectureId: null, titleAr: '', titleEn: null, slug: '', description: null, examType: 'Final', year: new Date().getFullYear(), durationMinutes: 60,
  passingScore: 60, sortOrder: 0, availableFrom: null, availableUntil: null, maxAttempts: null, shuffleQuestions: true, shuffleOptions: true,
  showResultsImmediately: true, allowReview: true, showCorrectAnswers: true, showExplanations: true,
});
const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null; titleAr?: string; titleEn?: string | null }) => arabic ? (item.nameAr ?? item.titleAr ?? '') : (item.nameEn ?? item.titleEn ?? item.nameAr ?? item.titleAr ?? '');
const toInputDate = (value?: string | null) => value ? value.slice(0, 16) : '';
const toIso = (value: string) => value ? new Date(value).toISOString() : null;

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
    const confirmation = action === 'publish'
      ? (isArabic ? 'هل تنشر الاختبار؟ لا يقبل النشر إلا الأسئلة المنشورة والمؤهلة.' : 'Publish this exam? Only published, eligible questions can be used.')
      : (isArabic ? 'هل تؤرشف الاختبار وتخفيه من قائمة الطالب؟' : 'Archive this exam and remove it from student discovery?');
    if (!window.confirm(confirmation)) return;
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

  return <section className="questions-center exams-center">
    <header className="directory-heading"><div><p className="eyebrow">{isArabic ? 'إدارة الاختبارات' : 'EXAM MANAGEMENT'}</p><h2>{isArabic ? 'تصميم الاختبارات، نشرها، وقراءة نتائجها' : 'Design, publish, and audit exam outcomes'}</h2></div>{subjectId && <button className="primary-action" type="button" onClick={openCreate}><Plus size={17} />{isArabic ? 'اختبار جديد' : 'New exam'}</button>}</header>
    <div className="question-scope-grid">
      <label>{isArabic ? 'الجامعة' : 'University'}<select value={universityId} onChange={event => void chooseUniversity(event.target.value)}><option value="">{isArabic ? 'اختر الجامعة' : 'Select university'}</option>{universities.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
      <label>{isArabic ? 'الكلية' : 'College'}<select value={collegeId} disabled={!universityId} onChange={event => void chooseCollege(event.target.value)}><option value="">{isArabic ? 'اختر الكلية' : 'Select college'}</option>{colleges.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
      <label>{isArabic ? 'السنة' : 'Year'}<select value={yearId} disabled={!collegeId} onChange={event => void chooseYear(event.target.value)}><option value="">{isArabic ? 'اختر السنة' : 'Select year'}</option>{years.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
      <label>{isArabic ? 'الفصل' : 'Semester'}<select value={semesterId} disabled={!yearId} onChange={event => void chooseSemester(event.target.value)}><option value="">{isArabic ? 'اختر الفصل' : 'Select semester'}</option>{semesters.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
      <label>{isArabic ? 'المادة' : 'Subject'}<select value={subjectId} disabled={!semesterId} onChange={event => void chooseSubject(event.target.value)}><option value="">{isArabic ? 'اختر المادة' : 'Select subject'}</option>{subjects.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
    </div>

    {!subjectId ? <div className="table-empty question-empty"><ClipboardCheck size={28} /><strong>{isArabic ? 'اختر مادة لفتح إدارة اختباراتِها.' : 'Select a subject to manage its exams.'}</strong></div> : <>
      <div className="question-toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={isArabic ? 'ابحث بعنوان الاختبار أو رابطه' : 'Search title or slug'} /></label><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option><option value="Draft">{isArabic ? 'مسودة' : 'Draft'}</option><option value="Published">{isArabic ? 'منشور' : 'Published'}</option><option value="Archived">{isArabic ? 'مؤرشف' : 'Archived'}</option></select></div>
      <div className="question-list">{loading ? <div className="table-loading"><LoaderCircle className="spin" size={20} />{isArabic ? 'جارٍ تحميل الاختبارات…' : 'Loading exams…'}</div> : exams.length === 0 ? <div className="table-empty"><ClipboardCheck size={24} /><strong>{isArabic ? 'لا توجد اختبارات ضمن هذه التصفية.' : 'No exams match this filter.'}</strong></div> : exams.map(exam => <article className="question-row exam-row" key={exam.id}><div className="question-row-main"><div className="question-row-tags"><span className={`status-chip ${exam.status === 'Published' ? 'active' : 'disabled'}`}>{exam.status === 'Published' ? (isArabic ? 'منشور' : 'Published') : exam.status === 'Archived' ? (isArabic ? 'مؤرشف' : 'Archived') : (isArabic ? 'مسودة' : 'Draft')}</span><span className="role-tag">{exam.examType}</span><span className="muted-chip">{exam.durationMinutes} {isArabic ? 'د' : 'min'}</span></div><h3>{exam.titleAr}</h3><p>{exam.totalQuestions} {isArabic ? 'سؤال' : 'questions'} · {exam.completedCount}/{exam.attemptsCount} {isArabic ? 'محاولة مكتملة' : 'completed attempts'} · {exam.averageScore == null ? '—' : `${exam.averageScore.toFixed(0)}%`}</p>{(exam.availableFrom || exam.availableUntil || exam.maxAttempts) && <small>{exam.availableFrom && `${isArabic ? 'من' : 'From'} ${new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(exam.availableFrom))}`} {exam.availableUntil && ` · ${isArabic ? 'إلى' : 'Until'} ${new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(exam.availableUntil))}`} {exam.maxAttempts && ` · ${isArabic ? 'حد المحاولات' : 'Max attempts'}: ${exam.maxAttempts}`}</small>}</div><div className="question-actions"><button type="button" title={isArabic ? 'النتائج' : 'Results'} onClick={() => void showResults(exam)} disabled={busy}><BarChart3 size={16} /></button><button type="button" title={isArabic ? 'تعديل' : 'Edit'} onClick={() => void openEdit(exam)} disabled={busy}><Pencil size={16} /></button>{exam.status !== 'Published' && exam.status !== 'Archived' && <button type="button" className="publish-action" title={isArabic ? 'نشر' : 'Publish'} onClick={() => void lifecycle(exam, 'publish')} disabled={busy}><Send size={16} /></button>}{exam.status !== 'Archived' && <button type="button" className="lifecycle-action" title={isArabic ? 'أرشفة' : 'Archive'} onClick={() => void lifecycle(exam, 'archive')} disabled={busy}><Archive size={16} /></button>}</div></article>)}</div>

      {showEditor && <form className="question-editor exam-editor" onSubmit={event => void saveDraft(event)}><div className="question-editor-head"><div><p className="eyebrow">{form.id ? (isArabic ? 'تعديل اختبار' : 'EDIT EXAM') : (isArabic ? 'اختبار جديد' : 'NEW EXAM')}</p><h3>{activeSubject ? label(isArabic, activeSubject) : ''}</h3></div><button type="button" className="clear-filter" onClick={closeEditor}><X size={15} />{isArabic ? 'إغلاق' : 'Close'}</button></div>
        <div className="question-editor-grid"><label>{isArabic ? 'العنوان العربي' : 'Arabic title'}<input required value={form.titleAr} onChange={event => setForm(current => ({ ...current, titleAr: event.target.value }))} /></label><label>{isArabic ? 'العنوان الإنجليزي (اختياري)' : 'English title (optional)'}<input value={form.titleEn ?? ''} onChange={event => setForm(current => ({ ...current, titleEn: event.target.value }))} /></label><label>{isArabic ? 'الرابط المختصر' : 'Slug'}<input required dir="ltr" pattern="[a-z0-9-]+" value={form.slug} onChange={event => setForm(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') }))} /></label><label>{isArabic ? 'النوع' : 'Type'}<select value={form.examType} onChange={event => setForm(current => ({ ...current, examType: event.target.value as ExamType }))}><option value="Final">{isArabic ? 'نهائي' : 'Final'}</option><option value="Midterm">{isArabic ? 'نصفي' : 'Midterm'}</option><option value="Quiz">{isArabic ? 'اختبار قصير' : 'Quiz'}</option><option value="Practice">{isArabic ? 'تدريبي' : 'Practice'}</option></select></label><label>{isArabic ? 'السنة' : 'Year'}<input required min="1" type="number" value={form.year} onChange={event => setForm(current => ({ ...current, year: Number(event.target.value) }))} /></label><label>{isArabic ? 'المحاضرة (اختياري)' : 'Lecture (optional)'}<select value={form.lectureId ?? ''} onChange={event => { setForm(current => ({ ...current, lectureId: event.target.value || null })); setSelectedQuestions([]); }}><option value="">{isArabic ? 'على مستوى المادة' : 'Subject-wide'}</option>{lectures.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label><label>{isArabic ? 'المدة بالدقائق' : 'Duration (minutes)'}<input required min="1" type="number" value={form.durationMinutes} onChange={event => setForm(current => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label><label>{isArabic ? 'درجة النجاح %' : 'Passing score %'}<input required min="0" max="100" step="0.01" type="number" value={form.passingScore} onChange={event => setForm(current => ({ ...current, passingScore: Number(event.target.value) }))} /></label><label>{isArabic ? 'ترتيب العرض' : 'Display order'}<input required min="0" type="number" value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))} /></label><label>{isArabic ? 'الحد الأقصى للمحاولات (اختياري)' : 'Maximum attempts (optional)'}<input min="1" type="number" value={form.maxAttempts ?? ''} onChange={event => setForm(current => ({ ...current, maxAttempts: event.target.value ? Number(event.target.value) : null }))} /></label><label>{isArabic ? 'متاح من (اختياري)' : 'Available from (optional)'}<input type="datetime-local" value={toInputDate(form.availableFrom)} onChange={event => setForm(current => ({ ...current, availableFrom: event.target.value }))} /></label><label>{isArabic ? 'متاح حتى (اختياري)' : 'Available until (optional)'}<input type="datetime-local" value={toInputDate(form.availableUntil)} onChange={event => setForm(current => ({ ...current, availableUntil: event.target.value }))} /></label><label className="span-all">{isArabic ? 'الوصف (اختياري)' : 'Description (optional)'}<textarea rows={3} value={form.description ?? ''} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label></div>
        <div className="exam-policy-grid"><label><input type="checkbox" checked={form.shuffleQuestions} onChange={event => setForm(current => ({ ...current, shuffleQuestions: event.target.checked }))} />{isArabic ? 'ترتيب الأسئلة عشوائي لكل محاولة' : 'Shuffle questions for each attempt'}</label><label><input type="checkbox" checked={form.shuffleOptions} onChange={event => setForm(current => ({ ...current, shuffleOptions: event.target.checked }))} />{isArabic ? 'ترتيب الخيارات عشوائي' : 'Shuffle answer options'}</label><label><input type="checkbox" checked={form.showResultsImmediately} onChange={event => setForm(current => ({ ...current, showResultsImmediately: event.target.checked }))} />{isArabic ? 'إظهار النتيجة بعد التسليم' : 'Show result after submission'}</label><label><input type="checkbox" checked={form.allowReview} onChange={event => setForm(current => ({ ...current, allowReview: event.target.checked }))} />{isArabic ? 'السماح بالمراجعة' : 'Allow review'}</label><label><input type="checkbox" disabled={!form.allowReview} checked={form.showCorrectAnswers} onChange={event => setForm(current => ({ ...current, showCorrectAnswers: event.target.checked }))} />{isArabic ? 'عرض الإجابة الصحيحة في المراجعة' : 'Show correct answers in review'}</label><label><input type="checkbox" disabled={!form.allowReview} checked={form.showExplanations} onChange={event => setForm(current => ({ ...current, showExplanations: event.target.checked }))} />{isArabic ? 'عرض الشرح في المراجعة' : 'Show explanations in review'}</label></div>
        <div className="exam-question-builder"><div className="exam-question-column"><div className="question-editor-head"><div><p className="eyebrow">{isArabic ? 'أسئلة الاختبار' : 'EXAM QUESTIONS'}</p><h4>{selectedQuestions.length} {isArabic ? 'سؤال محدد' : 'selected questions'}</h4></div><ListChecks size={19} /></div>{selectedQuestions.length === 0 ? <div className="table-empty"><FileText size={20} /><strong>{isArabic ? 'أضف أسئلة منشورة من القائمة المقابلة.' : 'Add published questions from the candidate list.'}</strong></div> : selectedQuestions.map((question, index) => <article className="exam-question-row" key={question.questionId}><span>{index + 1}</span><div><strong>{question.text}</strong><small>{question.type} · {question.lectureName ?? (isArabic ? 'على مستوى المادة' : 'Subject-wide')}</small></div><div><button type="button" title={isArabic ? 'أعلى' : 'Up'} disabled={index === 0} onClick={() => moveQuestion(index, -1)}><ArrowUp size={15} /></button><button type="button" title={isArabic ? 'أسفل' : 'Down'} disabled={index === selectedQuestions.length - 1} onClick={() => moveQuestion(index, 1)}><ArrowDown size={15} /></button><button type="button" className="danger" title={isArabic ? 'إزالة' : 'Remove'} onClick={() => removeQuestion(question.questionId)}><X size={15} /></button></div></article>)}</div><div className="exam-question-column"><div className="question-editor-head"><div><p className="eyebrow">{isArabic ? 'بنك الأسئلة المؤهل' : 'ELIGIBLE QUESTION BANK'}</p><h4>{isArabic ? 'الأسئلة المنشورة المصححة آلياً فقط' : 'Published, automatically graded questions only'}</h4></div></div><label className="search-field"><Search size={16} /><input value={candidateQuery} onChange={event => setCandidateQuery(event.target.value)} placeholder={isArabic ? 'ابحث في نص السؤال' : 'Search question text'} /></label><div className="candidate-list">{candidates.length === 0 ? <p>{isArabic ? 'لا توجد أسئلة مؤهلة.' : 'No eligible questions.'}</p> : candidates.map(candidate => <button type="button" key={candidate.id} className={selectedIds.has(candidate.id) ? 'candidate selected' : 'candidate'} onClick={() => addCandidate(candidate)} disabled={selectedIds.has(candidate.id)}><span>{selectedIds.has(candidate.id) ? <CheckCircle2 size={17} /> : <Plus size={17} />}</span><div><strong>{candidate.text}</strong><small>{candidate.type} · {candidate.difficulty} · {candidate.lectureName ?? (isArabic ? 'على مستوى المادة' : 'Subject-wide')}</small></div></button>)}</div></div></div>
        <div className="question-editor-actions"><button type="button" className="clear-filter" disabled={busy} onClick={closeEditor}>{isArabic ? 'إلغاء' : 'Cancel'}</button><button className="primary-action" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}<CheckCircle2 size={16} />{isArabic ? 'حفظ التكوين والأسئلة' : 'Save configuration and questions'}</button></div>
      </form>}

      {resultExam && <section className="exam-results-panel"><div className="question-editor-head"><div><p className="eyebrow">{isArabic ? 'نتائج الاختبار' : 'EXAM RESULTS'}</p><h3>{resultExam.titleAr}</h3></div><button type="button" className="clear-filter" onClick={() => setResultExam(null)}><X size={15} />{isArabic ? 'إغلاق' : 'Close'}</button></div>{resultsLoading ? <div className="table-loading"><LoaderCircle className="spin" size={20} />{isArabic ? 'جارٍ تحميل النتائج…' : 'Loading outcomes…'}</div> : results.length === 0 ? <div className="table-empty"><BarChart3 size={22} /><strong>{isArabic ? 'لا توجد محاولات بعد.' : 'No attempts yet.'}</strong></div> : <div className="admin-table-wrap"><table><thead><tr><th>{isArabic ? 'الطالب' : 'Student'}</th><th>{isArabic ? 'الحالة' : 'Status'}</th><th>{isArabic ? 'النتيجة' : 'Score'}</th><th>{isArabic ? 'الإجابات' : 'Answers'}</th><th>{isArabic ? 'البداية' : 'Started'}</th><th>{isArabic ? 'المحاولة الأولى' : 'First attempt'}</th></tr></thead><tbody>{results.map(result => <tr key={result.sessionId}><td>{result.studentName}</td><td><span className={`status-chip ${result.status === 'Completed' ? 'active' : 'disabled'}`}>{result.status}</span></td><td>{result.score == null ? '—' : `${result.score.toFixed(0)}%`}</td><td>{result.correctAnswers}/{result.answeredQuestions}</td><td>{new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.startedAt))}</td><td>{result.isFirstAttempt ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No')}</td></tr>)}</tbody></table></div>}</section>}
    </>}
  </section>;
}
