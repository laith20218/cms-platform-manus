import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, FileText, LoaderCircle, Pencil, Plus, RotateCcw, Search, Send, X } from 'lucide-react';
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
    if (!window.confirm(action === 'publish' ? (isArabic ? 'نشر السؤال للطلاب المخوّلين؟' : 'Publish this question for entitled students?') : (isArabic ? 'أرشفة السؤال وإخفاؤه من الطلاب؟' : 'Archive this question and hide it from students?'))) return;
    setBusy(true);
    try {
      await request(`/api/v1/questions/${id}/${action}`, { method: 'POST' });
      onNotice(action === 'publish' ? (isArabic ? 'تم نشر السؤال.' : 'Question published.') : (isArabic ? 'تمت أرشفة السؤال.' : 'Question archived.'));
      await loadQuestions();
    } catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحديث حالة السؤال.'); } finally { setBusy(false); }
  }

  return <section className="questions-center">
    <header className="directory-heading"><div><p className="eyebrow">{isArabic ? 'بنك الأسئلة' : 'QUESTION BANK'}</p><h2>{isArabic ? 'أسئلة المادة وإجاباتها النموذجية' : 'Subject questions and model answers'}</h2></div>{subjectId && <button type="button" className="primary-action" onClick={() => { setForm(emptyForm()); setShowEditor(true); }}><Plus size={17} />{isArabic ? 'سؤال جديد' : 'New question'}</button>}</header>
    <div className="question-scope-grid">
      <label>{isArabic ? 'الجامعة' : 'University'}<select value={universityId} onChange={event => void chooseUniversity(event.target.value)}><option value="">{isArabic ? 'اختر الجامعة' : 'Select university'}</option>{universities.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
      <label>{isArabic ? 'الكلية' : 'College'}<select value={collegeId} disabled={!universityId} onChange={event => void chooseCollege(event.target.value)}><option value="">{isArabic ? 'اختر الكلية' : 'Select college'}</option>{colleges.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
      <label>{isArabic ? 'السنة' : 'Year'}<select value={yearId} disabled={!collegeId} onChange={event => void chooseYear(event.target.value)}><option value="">{isArabic ? 'اختر السنة' : 'Select year'}</option>{years.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
      <label>{isArabic ? 'الفصل' : 'Semester'}<select value={semesterId} disabled={!yearId} onChange={event => void chooseSemester(event.target.value)}><option value="">{isArabic ? 'اختر الفصل' : 'Select semester'}</option>{semesters.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
      <label>{isArabic ? 'المادة' : 'Subject'}<select value={subjectId} disabled={!semesterId} onChange={event => void chooseSubject(event.target.value)}><option value="">{isArabic ? 'اختر المادة' : 'Select subject'}</option>{subjects.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label>
    </div>

    {!subjectId ? <div className="table-empty question-empty"><FileText size={28} /><strong>{isArabic ? 'اختر مادة لفتح بنك أسئلتها.' : 'Select a subject to open its question bank.'}</strong></div> : <>
      <div className="question-toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={isArabic ? 'ابحث في نص السؤال' : 'Search question text'} /></label><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">{isArabic ? 'كل الأنواع' : 'All types'}</option><option value="Mcq">{isArabic ? 'اختيار متعدد' : 'MCQ'}</option><option value="TrueFalse">{isArabic ? 'صح وخطأ' : 'True / false'}</option><option value="MultipleSelect">{isArabic ? 'اختيارات متعددة' : 'Multiple select'}</option><option value="Essay">{isArabic ? 'تحريري' : 'Essay'}</option></select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option><option value="Draft">{isArabic ? 'مسودة' : 'Draft'}</option><option value="Review">{isArabic ? 'مراجعة' : 'Review'}</option><option value="Published">{isArabic ? 'منشور' : 'Published'}</option><option value="Archived">{isArabic ? 'مؤرشف' : 'Archived'}</option></select></div>
      <div className="question-list">{loading ? <div className="table-loading"><LoaderCircle className="spin" size={20} />{isArabic ? 'جارٍ تحميل الأسئلة…' : 'Loading questions…'}</div> : questions.length === 0 ? <div className="table-empty"><FileText size={24} /><strong>{isArabic ? 'لا توجد أسئلة ضمن هذه التصفية.' : 'No questions match these filters.'}</strong></div> : questions.map(question => <article className="question-row" key={question.id}><div className="question-row-main"><div className="question-row-tags"><span className={`status-chip ${question.status === 'Published' ? 'active' : 'disabled'}`}>{question.status === 'Published' ? (isArabic ? 'منشور' : 'Published') : question.status === 'Archived' ? (isArabic ? 'مؤرشف' : 'Archived') : (isArabic ? 'مسودة/مراجعة' : 'Draft / review')}</span><span className="role-tag">{question.type === 'Essay' ? (isArabic ? 'تحريري' : 'Essay') : question.type === 'TrueFalse' ? (isArabic ? 'صح وخطأ' : 'True / false') : question.type}</span><span className="muted-chip">{question.difficulty}</span></div><h3>{question.text}</h3><p>{question.lectureTitle || (isArabic ? 'على مستوى المادة' : 'Subject-level')} · {question.optionsCount} {isArabic ? 'خيارات' : 'options'} · {question.attemptsCount} {isArabic ? 'محاولات' : 'attempts'} · {question.correctRate.toFixed(0)}%</p></div><div className="question-actions"><button type="button" title={isArabic ? 'تعديل' : 'Edit'} disabled={busy} onClick={() => void editQuestion(question.id)}><Pencil size={16} /></button>{question.status !== 'Published' && question.status !== 'Archived' && <button type="button" className="publish-action" title={isArabic ? 'نشر' : 'Publish'} disabled={busy} onClick={() => void lifecycle(question.id, 'publish')}><Send size={16} /></button>}{question.status !== 'Archived' ? <button type="button" className="lifecycle-action" title={isArabic ? 'أرشفة' : 'Archive'} disabled={busy} onClick={() => void lifecycle(question.id, 'archive')}><Archive size={16} /></button> : <span className="archived-indicator"><RotateCcw size={15} />{isArabic ? 'مؤرشف' : 'Archived'}</span>}</div></article>)}</div>
      {showEditor && <form className="question-editor" onSubmit={event => void submit(event)}><div className="question-editor-head"><div><p className="eyebrow">{form.id ? (isArabic ? 'تعديل سؤال' : 'EDIT QUESTION') : (isArabic ? 'سؤال جديد' : 'NEW QUESTION')}</p><h3>{activeSubject ? label(isArabic, activeSubject) : ''}</h3></div><button type="button" className="clear-filter" onClick={() => { setShowEditor(false); setForm(emptyForm()); }}><X size={15} />{isArabic ? 'إغلاق' : 'Close'}</button></div><div className="question-editor-grid"><label className="span-all">{isArabic ? 'نص السؤال' : 'Question text'}<textarea required rows={3} value={form.text} onChange={event => setForm(current => ({ ...current, text: event.target.value }))} /></label><label>{isArabic ? 'النوع' : 'Type'}<select value={form.type} disabled={Boolean(form.id)} onChange={event => changeType(event.target.value as QuestionType)}><option value="Mcq">{isArabic ? 'اختيار متعدد' : 'MCQ'}</option><option value="TrueFalse">{isArabic ? 'صح وخطأ' : 'True / false'}</option><option value="MultipleSelect">{isArabic ? 'اختيارات متعددة' : 'Multiple select'}</option><option value="Essay">{isArabic ? 'تحريري' : 'Essay'}</option></select>{form.id && <small>{isArabic ? 'لا يمكن تغيير النوع بعد الإنشاء.' : 'Type cannot change after creation.'}</small>}</label><label>{isArabic ? 'الصعوبة' : 'Difficulty'}<select value={form.difficulty} onChange={event => setForm(current => ({ ...current, difficulty: event.target.value as FormState['difficulty'] }))}><option value="Easy">{isArabic ? 'سهل' : 'Easy'}</option><option value="Medium">{isArabic ? 'متوسط' : 'Medium'}</option><option value="Hard">{isArabic ? 'صعب' : 'Hard'}</option></select></label><label>{isArabic ? 'المحاضرة (اختياري)' : 'Lecture (optional)'}<select value={form.lectureId} onChange={event => setForm(current => ({ ...current, lectureId: event.target.value }))}><option value="">{isArabic ? 'سؤال عام للمادة' : 'Subject-level question'}</option>{lectures.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}</select></label><label>{isArabic ? 'الوسوم، مفصولة بفواصل' : 'Tags, comma-separated'}<input value={form.tags} onChange={event => setForm(current => ({ ...current, tags: event.target.value }))} /></label><label className="span-all">{isArabic ? 'الشرح الذي يظهر بعد التصحيح' : 'Explanation shown after grading'}<textarea required rows={4} value={form.explanation} onChange={event => setForm(current => ({ ...current, explanation: event.target.value }))} placeholder={isArabic ? 'اكتب التوضيح العلمي للسؤال وإجابته.' : 'Write the scientific explanation.'} /></label><label className="span-all">{isArabic ? 'المرجع (اختياري)' : 'Reference (optional)'}<input value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} /></label></div>
        {isEssay ? <div className="model-answer-panel"><CheckCircle2 size={18} /><label>{isArabic ? 'الإجابة النموذجية للسؤال التحريري' : 'Essay model answer'}<textarea required rows={5} value={form.correctAnswer} onChange={event => setForm(current => ({ ...current, correctAnswer: event.target.value }))} placeholder={isArabic ? 'هذه الإجابة ستظهر للطالب تحت جوابه بعد الضغط على تصحيح.' : 'This answer appears under the student response after grading.'} /></label><p>{isArabic ? 'يُجرى التصحيح الآلي بمطابقة النص بعد توحيد المسافات وحالة الأحرف، مع إظهار الإجابة النموذجية والشرح دائماً.' : 'Automatic grading normalizes whitespace and letter case, then always shows the model answer and explanation.'}</p></div> : <div className="options-editor"><div><p className="eyebrow">{isArabic ? 'الخيارات' : 'OPTIONS'}</p><h4>{isTrueFalse ? (isArabic ? 'حدد الإجابة الصحيحة ثم أضف الشرح أعلاه.' : 'Choose the correct answer, then add the explanation above.') : (isArabic ? 'حدد خياراً صحيحاً واحداً على الأقل.' : 'Mark at least one correct option.')}</h4></div>{form.options.map((option, index) => <label className="option-edit-row" key={`${option.id ?? 'new'}-${index}`}><input type={form.type === 'MultipleSelect' ? 'checkbox' : 'radio'} name="correct-option" checked={option.isCorrect} onChange={event => setForm(current => ({ ...current, options: current.options.map((item, itemIndex) => ({ ...item, isCorrect: form.type === 'MultipleSelect' ? (itemIndex === index ? event.target.checked : item.isCorrect) : itemIndex === index })) }))} /><span>{String.fromCharCode(65 + index)}</span><input required value={option.text} disabled={isTrueFalse} onChange={event => updateOption(index, { text: event.target.value })} />{!isTrueFalse && <button type="button" className="clear-filter" disabled={form.options.length <= 2} onClick={() => setForm(current => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))}><X size={14} /></button>}</label>)}{!isTrueFalse && <button type="button" className="add-option" onClick={() => setForm(current => ({ ...current, options: [...current.options, { text: '', isCorrect: false }] }))}><Plus size={15} />{isArabic ? 'إضافة خيار' : 'Add option'}</button>}</div>}
        <div className="question-editor-actions"><button type="button" className="clear-filter" disabled={busy} onClick={() => { setShowEditor(false); setForm(emptyForm()); }}>{isArabic ? 'إلغاء' : 'Cancel'}</button><button className="primary-action" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}<CheckCircle2 size={16} />{form.id ? (isArabic ? 'حفظ التعديل' : 'Save changes') : (isArabic ? 'حفظ كمسودة' : 'Save draft')}</button></div>
      </form>}
    </>}
  </section>;
}
