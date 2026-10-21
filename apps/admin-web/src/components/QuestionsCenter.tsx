import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Archive, CheckCircle2, FileText, LoaderCircle, Pencil, Plus, RotateCcw, Search, Send, X, ListFilter } from 'lucide-react';
import { apiRequest, type PagedResult } from '../lib/api';

type University = { id: string; nameAr: string; nameEn?: string | null };
type College = { id: string; nameAr: string; nameEn?: string | null };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null };
type Semester = { id: string; nameAr: string; nameEn?: string | null };
type Subject = { id: string; nameAr: string; nameEn?: string | null };
type Lecture = { id: string; titleAr: string; titleEn?: string | null };
type QuestionOption = { id?: string; letter?: string; text: string; isCorrect: boolean; imageUrl?: string | null };
type QuestionSummary = { id: string; subjectId: string; lectureId?: string | null; text: string; type: string; difficulty: string; status: string; tags: string[]; lectureTitle?: string | null; optionsCount: number; attemptsCount: number; correctRate: number; createdAt: string; updatedAt?: string | null };
type QuestionDetail = QuestionSummary & { reference?: string | null; year?: number | null; explanation: string; correctAnswer: string; options: QuestionOption[] };
type QuestionType = 'Mcq' | 'TrueFalse' | 'MultipleSelect' | 'Essay';
type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };

type FormState = { id?: string; text: string; type: QuestionType; difficulty: 'Easy' | 'Medium' | 'Hard'; lectureId: string; tags: string; explanation: string; correctAnswer: string; reference: string; options: QuestionOption[] };
const emptyForm = (): FormState => ({ text: '', type: 'Mcq', difficulty: 'Medium', lectureId: '', tags: '', explanation: '', correctAnswer: '', reference: '', options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }] });
const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null; titleAr?: string; titleEn?: string | null }) => arabic ? (item.nameAr ?? item.titleAr ?? '') : (item.nameEn ?? item.titleEn ?? item.nameAr ?? item.titleAr ?? '');

const statusChipClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'published') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (value === 'archived') return 'text-amber-600 bg-amber-50 border-amber-200';
  if (value === 'review') return 'text-sky-600 bg-sky-50 border-sky-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const statusDisplay = (status: string, isArabic: boolean) => {
  const value = status.toLowerCase();
  if (value === 'published') return isArabic ? 'منشور' : 'Published';
  if (value === 'archived') return isArabic ? 'مؤرشف' : 'Archived';
  if (value === 'review') return isArabic ? 'مراجعة' : 'Review';
  return isArabic ? 'مسودة' : 'Draft';
};

type ConfirmDialog = { id: string; action: 'publish' | 'archive' } | null;

export function QuestionsCenter({ token, isArabic, onError, onNotice }: Props) {
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
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmDialog>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const requestHeaders = { 'Content-Type': 'application/json' };

  useEffect(() => {
    void request<PagedResult<University>>('/api/v1/universities?Page=1&PageSize=100')
      .then(data => setUniversities(data.items))
      .catch(error => onError(error instanceof Error ? error.message : 'تعذر تحميل الجامعات.'));
    // Initial reference directory only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!subjectId) { setQuestions([]); return; }
    const timer = window.setTimeout(() => {
      void loadQuestions();
    }, 250);
    return () => window.clearTimeout(timer);
    // Filters are intentionally server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, query, typeFilter, statusFilter]);

  const activeSubject = useMemo(() => subjects.find(subject => subject.id === subjectId), [subjects, subjectId]);
  const isEssay = form.type === 'Essay';
  const isTrueFalse = form.type === 'TrueFalse';

  async function loadQuestions() {
    if (!subjectId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ subjectId, page: '1', pageSize: '100' });
      if (form.lectureId && !showEditor) params.set('lectureId', form.lectureId);
      if (query.trim()) params.set('search', query.trim());
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const result = await request<PagedResult<QuestionSummary>>(`/api/v1/admin/questions?${params.toString()}`);
      setQuestions(result.items);
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الأسئلة.'); } finally { setLoading(false); }
  }

  async function chooseUniversity(id: string) {
    setUniversityId(id); setCollegeId(''); setYearId(''); setSemesterId(''); setSubjectId(''); setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setLectures([]); setForm(emptyForm());
    if (!id) return;
    try { setColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الكليات.'); }
  }
  async function chooseCollege(id: string) {
    setCollegeId(id); setYearId(''); setSemesterId(''); setSubjectId(''); setYears([]); setSemesters([]); setSubjects([]); setLectures([]); setForm(emptyForm());
    if (!id) return;
    try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل السنوات.'); }
  }
  async function chooseYear(id: string) {
    setYearId(id); setSemesterId(''); setSubjectId(''); setSemesters([]); setSubjects([]); setLectures([]); setForm(emptyForm());
    if (!id) return;
    try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الفصول.'); }
  }
  async function chooseSemester(id: string) {
    setSemesterId(id); setSubjectId(''); setSubjects([]); setLectures([]); setForm(emptyForm());
    if (!id) return;
    try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المواد.'); }
  }
  async function chooseSubject(id: string) {
    setSubjectId(id); setLectures([]); setForm(emptyForm()); setShowEditor(false);
    if (!id) return;
    try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${id}/lectures`)); } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المحاضرات.'); }
  }

  function changeType(type: QuestionType) {
    if (type === 'TrueFalse') {
      setForm(current => ({ ...current, type, options: [{ text: 'صح', isCorrect: true }, { text: 'خطأ', isCorrect: false }], correctAnswer: '' }));
    } else if (type === 'Essay') {
      setForm(current => ({ ...current, type, options: [], correctAnswer: current.correctAnswer }));
    } else {
      setForm(current => ({ ...current, type, options: current.options.length >= 2 ? current.options : emptyForm().options, correctAnswer: '' }));
    }
  }

  function updateOption(index: number, patch: Partial<QuestionOption>) {
    setForm(current => ({ ...current, options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) }));
  }

  async function editQuestion(id: string) {
    setBusy(true);
    try {
      const detail = await request<QuestionDetail>(`/api/v1/admin/questions/${id}`);
      setForm({ id: detail.id, text: detail.text, type: detail.type as QuestionType, difficulty: detail.difficulty as FormState['difficulty'], lectureId: detail.lectureId ?? '', tags: detail.tags.join(', '), explanation: detail.explanation, correctAnswer: detail.correctAnswer, reference: detail.reference ?? '', options: detail.options.map(option => ({ ...option })) });
      setShowEditor(true);
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر فتح السؤال.'); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectId || !form.text.trim() || !form.explanation.trim()) return;
    if (isEssay && !form.correctAnswer.trim()) { onError(isArabic ? 'اكتب الإجابة النموذجية للسؤال التحريري.' : 'Provide the model answer for the essay question.'); return; }
    if (!isEssay && (form.options.length < 2 || form.options.some(option => !option.text.trim()) || !form.options.some(option => option.isCorrect))) { onError(isArabic ? 'أدخل خيارين على الأقل وحدد إجابة صحيحة.' : 'Provide at least two options and mark a correct answer.'); return; }
    setBusy(true);
    try {
      const payload = { text: form.text.trim(), type: form.type, subjectId, lectureId: form.lectureId || null, difficulty: form.difficulty, tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean), options: isEssay ? [] : form.options.map(option => ({ id: option.id ?? null, text: option.text.trim(), isCorrect: option.isCorrect, imageUrl: null })), correctOptionId: '', correctAnswer: isEssay ? form.correctAnswer.trim() : null, explanation: form.explanation.trim(), reference: form.reference.trim() || null, year: null };
      if (form.id) {
        await request(`/api/v1/questions/${form.id}`, { method: 'PUT', headers: requestHeaders, body: JSON.stringify(payload) });
        onNotice(isArabic ? 'تم تحديث السؤال.' : 'Question updated.');
      } else {
        await request('/api/v1/questions', { method: 'POST', headers: requestHeaders, body: JSON.stringify(payload) });
        onNotice(isArabic ? 'تم حفظ السؤال كمسودة.' : 'Question saved as a draft.');
      }
      setForm(emptyForm()); setShowEditor(false); await loadQuestions();
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر حفظ السؤال.'); } finally { setBusy(false); }
  }

  async function lifecycle(id: string, action: 'publish' | 'archive') {
    setBusy(true);
    try {
      await request(`/api/v1/questions/${id}/${action}`, { method: 'POST' });
      onNotice(action === 'publish' ? (isArabic ? 'تم نشر السؤال.' : 'Question published.') : (isArabic ? 'تمت أرشفة السؤال.' : 'Question archived.'));
      await loadQuestions();
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحديث حالة السؤال.'); } finally { setBusy(false); }
  }

  const typeLabel = (type: string) => type === 'Essay' ? (isArabic ? 'تحريري' : 'Essay') : type === 'TrueFalse' ? (isArabic ? 'صح وخطأ' : 'True / false') : type;

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <ListFilter className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'بنك الأسئلة' : 'Question bank'}</p>
            <h2 className="text-2xl font-bold text-slate-900">{isArabic ? 'أسئلة المادة وإجاباتها النموذجية' : 'Subject questions and model answers'}</h2>
          </div>
        </div>
        {subjectId && (
          <button type="button" onClick={() => { setForm(emptyForm()); setShowEditor(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" />{isArabic ? 'سؤال جديد' : 'New question'}
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
            <FileText className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">{isArabic ? 'اختر مادة لفتح بنك أسئلتها.' : 'Select a subject to open its question bank.'}</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl bg-white border border-slate-200">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder={isArabic ? 'ابحث في نص السؤال' : 'Search question text'} className="w-full pr-10 pl-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{isArabic ? 'كل الأنواع' : 'All types'}</option>
              <option value="Mcq">{isArabic ? 'اختيار متعدد' : 'MCQ'}</option>
              <option value="TrueFalse">{isArabic ? 'صح وخطأ' : 'True / false'}</option>
              <option value="MultipleSelect">{isArabic ? 'اختيارات متعددة' : 'Multiple select'}</option>
              <option value="Essay">{isArabic ? 'تحريري' : 'Essay'}</option>
            </select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option>
              <option value="Draft">{isArabic ? 'مسودة' : 'Draft'}</option>
              <option value="Review">{isArabic ? 'مراجعة' : 'Review'}</option>
              <option value="Published">{isArabic ? 'منشور' : 'Published'}</option>
              <option value="Archived">{isArabic ? 'مؤرشف' : 'Archived'}</option>
            </select>
          </div>

          {/* Question list */}
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
            ) : questions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center text-center py-16">
                <div className="p-3 rounded-full bg-slate-50 text-slate-400">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">{isArabic ? 'لا توجد أسئلة ضمن هذه التصفية.' : 'No questions match these filters.'}</p>
              </div>
            ) : questions.map(question => (
              <article key={question.id} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300 hover:shadow-sm transition-all">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${statusChipClass(question.status)}`}>{statusDisplay(question.status, isArabic)}</span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs border border-teal-200 text-teal-700 bg-teal-50">{typeLabel(question.type)}</span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs border border-slate-200 text-slate-600 bg-slate-50">{question.difficulty}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 leading-relaxed">{question.text}</h3>
                    <p className="mt-1 text-xs text-slate-500">{question.lectureTitle || (isArabic ? 'على مستوى المادة' : 'Subject-level')} · {question.optionsCount} {isArabic ? 'خيارات' : 'options'} · {question.attemptsCount} {isArabic ? 'محاولات' : 'attempts'} · {question.correctRate.toFixed(0)}%</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" title={isArabic ? 'تعديل' : 'Edit'} disabled={busy} onClick={() => void editQuestion(question.id)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {question.status !== 'Published' && question.status !== 'Archived' && (
                      <button type="button" title={isArabic ? 'نشر' : 'Publish'} disabled={busy} onClick={() => setConfirm({ id: question.id, action: 'publish' })} className="p-1.5 rounded-md text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50">
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    {question.status !== 'Archived' ? (
                      <button type="button" title={isArabic ? 'أرشفة' : 'Archive'} disabled={busy} onClick={() => setConfirm({ id: question.id, action: 'archive' })} className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50">
                        <Archive className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 px-2 py-1">
                        <RotateCcw className="w-3.5 h-3.5" />{isArabic ? 'مؤرشف' : 'Archived'}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Question editor */}
          {showEditor && (
            <form onSubmit={event => void submit(event)} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{form.id ? (isArabic ? 'تعديل سؤال' : 'Edit question') : (isArabic ? 'سؤال جديد' : 'New question')}</p>
                  <h3 className="text-base font-bold text-slate-900">{activeSubject ? label(isArabic, activeSubject) : ''}</h3>
                </div>
                <button type="button" onClick={() => { setShowEditor(false); setForm(emptyForm()); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <X className="w-3.5 h-3.5" />{isArabic ? 'إغلاق' : 'Close'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <label className="block md:col-span-2 lg:col-span-3">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'نص السؤال' : 'Question text'}</span>
                  <textarea required rows={3} value={form.text} onChange={event => setForm(current => ({ ...current, text: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'النوع' : 'Type'}</span>
                  <select value={form.type} disabled={Boolean(form.id)} onChange={event => changeType(event.target.value as QuestionType)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60">
                    <option value="Mcq">{isArabic ? 'اختيار متعدد' : 'MCQ'}</option>
                    <option value="TrueFalse">{isArabic ? 'صح وخطأ' : 'True / false'}</option>
                    <option value="MultipleSelect">{isArabic ? 'اختيارات متعددة' : 'Multiple select'}</option>
                    <option value="Essay">{isArabic ? 'تحريري' : 'Essay'}</option>
                  </select>
                  {form.id && <small className="block mt-1 text-[10px] text-slate-400">{isArabic ? 'لا يمكن تغيير النوع بعد الإنشاء.' : 'Type cannot change after creation.'}</small>}
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الصعوبة' : 'Difficulty'}</span>
                  <select value={form.difficulty} onChange={event => setForm(current => ({ ...current, difficulty: event.target.value as FormState['difficulty'] }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="Easy">{isArabic ? 'سهل' : 'Easy'}</option>
                    <option value="Medium">{isArabic ? 'متوسط' : 'Medium'}</option>
                    <option value="Hard">{isArabic ? 'صعب' : 'Hard'}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المحاضرة (اختياري)' : 'Lecture (optional)'}</span>
                  <select value={form.lectureId} onChange={event => setForm(current => ({ ...current, lectureId: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">{isArabic ? 'سؤال عام للمادة' : 'Subject-level question'}</option>
                    {lectures.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
                  </select>
                </label>
                <label className="block md:col-span-2 lg:col-span-3">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الوسوم، مفصولة بفواصل' : 'Tags, comma-separated'}</span>
                  <input value={form.tags} onChange={event => setForm(current => ({ ...current, tags: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block md:col-span-2 lg:col-span-3">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الشرح الذي يظهر بعد التصحيح' : 'Explanation shown after grading'}</span>
                  <textarea required rows={4} value={form.explanation} onChange={event => setForm(current => ({ ...current, explanation: event.target.value }))} placeholder={isArabic ? 'اكتب التوضيح العلمي للسؤال وإجابته.' : 'Write the scientific explanation.'} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y" />
                </label>
                <label className="block md:col-span-2 lg:col-span-3">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المرجع (اختياري)' : 'Reference (optional)'}</span>
                  <input value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
              </div>

              {isEssay ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-teal-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <strong className="text-sm font-semibold">{isArabic ? 'الإجابة النموذجية للسؤال التحريري' : 'Essay model answer'}</strong>
                  </div>
                  <textarea required rows={5} value={form.correctAnswer} onChange={event => setForm(current => ({ ...current, correctAnswer: event.target.value }))} placeholder={isArabic ? 'هذه الإجابة ستظهر للطالب تحت جوابه بعد الضغط على تصحيح.' : 'This answer appears under the student response after grading.'} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y" />
                  <p className="text-xs text-slate-600">{isArabic ? 'يُجرى التصحيح الآلي بمطابقة النص بعد توحيد المسافات وحالة الأحرف، مع إظهار الإجابة النموذجية والشرح دائماً.' : 'Automatic grading normalizes whitespace and letter case, then always shows the model answer and explanation.'}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'الخيارات' : 'Options'}</p>
                      <h4 className="text-sm font-semibold text-slate-900">{isTrueFalse ? (isArabic ? 'حدد الإجابة الصحيحة ثم أضف الشرح أعلاه.' : 'Choose the correct answer, then add the explanation above.') : (isArabic ? 'حدد خياراً صحيحاً واحداً على الأقل.' : 'Mark at least one correct option.')}</h4>
                    </div>
                  </div>
                  {form.options.map((option, index) => (
                    <label key={`${option.id ?? 'new'}-${index}`} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-2">
                      <input type={form.type === 'MultipleSelect' ? 'checkbox' : 'radio'} name="correct-option" checked={option.isCorrect} onChange={event => setForm(current => ({ ...current, options: current.options.map((item, itemIndex) => ({ ...item, isCorrect: form.type === 'MultipleSelect' ? (itemIndex === index ? event.target.checked : item.isCorrect) : itemIndex === index })) }))} className="h-4 w-4 accent-teal-600" />
                      <span className="w-6 text-center text-xs font-semibold text-slate-500">{String.fromCharCode(65 + index)}</span>
                      <input required value={option.text} disabled={isTrueFalse} onChange={event => updateOption(index, { text: event.target.value })} className="flex-1 px-2 py-1.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50" />
                      {!isTrueFalse && (
                        <button type="button" disabled={form.options.length <= 2} onClick={() => setForm(current => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))} className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </label>
                  ))}
                  {!isTrueFalse && (
                    <button type="button" onClick={() => setForm(current => ({ ...current, options: [...current.options, { text: '', isCorrect: false }] }))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-600 hover:border-teal-400 hover:text-teal-700 transition-colors">
                      <Plus className="w-3.5 h-3.5" />{isArabic ? 'إضافة خيار' : 'Add option'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1 border-t border-slate-100">
                <button type="button" disabled={busy} onClick={() => { setShowEditor(false); setForm(emptyForm()); }} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">{isArabic ? 'إلغاء' : 'Cancel'}</button>
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50" disabled={busy}>
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{form.id ? (isArabic ? 'حفظ التعديل' : 'Save changes') : (isArabic ? 'حفظ كمسودة' : 'Save draft')}
                </button>
              </div>
            </form>
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
                <h3 className="font-semibold text-slate-900">{confirm.action === 'publish' ? (isArabic ? 'نشر السؤال' : 'Publish question') : (isArabic ? 'أرشفة السؤال' : 'Archive question')}</h3>
                <p className="text-sm text-slate-600 mt-1">{confirm.action === 'publish' ? (isArabic ? 'سيُتاح السؤال للطلاب المخوّلين ضمن مادته.' : 'The question will become available to entitled students within its subject.') : (isArabic ? 'سيُخفى السؤال من الطلاب لكنه يبقى في قاعدة البيانات.' : 'The question will be hidden from students but kept in the database.')}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end p-5">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">{isArabic ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={() => { const id = confirm.id; const action = confirm.action; setConfirm(null); void lifecycle(id, action); }} disabled={busy} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors ${confirm.action === 'archive' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
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
