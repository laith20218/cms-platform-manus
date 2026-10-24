/**
 * QuestionsCenter — institutional question bank management surface.
 *
 * Composition:
 *   • Page header with section title + live count badge
 *   • Academic hierarchy filter bar (university → college → year → semester → subject)
 *     in a responsive grid
 *   • Toolbar (search · type filter · status filter · new question)
 *   • Responsive table (overflow-x-auto) with question text, type, difficulty,
 *     status, lecture, tags, attempts, correct rate, and row actions
 *     (edit · publish · archive · delete)
 *   • Slide-in editor panel from the right with sections:
 *       — Question text
 *       — Type + difficulty (side by side)
 *       — Lecture + tags
 *       — Reference + year
 *       — Options editor (MCQ / MultipleSelect) OR essay model answer
 *       — Explanation
 *       — Action bar (save draft · publish · archive · close)
 *   • Loading skeletons, empty state, custom confirm dialog
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling is pure Tailwind.
 *
 * Functionality preserved:
 *   • Academic hierarchy filters (universities, colleges, years, semesters, subjects, lectures)
 *   • Question list fetch — `/api/v1/admin/questions?subjectId=&page=&pageSize=`
 *   • Question detail fetch — `/api/v1/questions/{id}`
 *   • Create — `POST /api/v1/questions` with CreateQuestionDto
 *   • Update — `PUT /api/v1/questions/{id}` with UpdateQuestionDto
 *   • Delete — `DELETE /api/v1/questions/{id}`
 *   • Publish — `POST /api/v1/questions/{id}/publish`
 *   • Archive — `POST /api/v1/questions/{id}/archive`
 *   • Question types: Mcq, TrueFalse, MultipleSelect, Essay
 *   • Options editor: add/remove/reorder options, mark correct
 *   • Essay: model answer + explanation
 *   • Form: text, type, difficulty, lecture, tags, explanation, reference, year, options, correctAnswer
 *   • Confirm dialog for publish/archive
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, CheckCircle2, ChevronLeft, ChevronRight,
  FileText, ListFilter, LoaderCircle, Pencil, Plus, PlusCircle,
  Search, Send, Trash2, X,
} from 'lucide-react';
import { apiRequest, type PagedResult } from '../lib/api';

type University = { id: string; nameAr: string; nameEn?: string | null };
type College = { id: string; nameAr: string; nameEn?: string | null };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null };
type Semester = { id: string; nameAr: string; nameEn?: string | null };
type Subject = { id: string; nameAr: string; nameEn?: string | null };
type Lecture = { id: string; titleAr: string; titleEn?: string | null };
type QuestionOption = { id?: string; letter?: string; text: string; isCorrect: boolean; imageUrl?: string | null };
type QuestionSummary = {
  id: string; subjectId: string; lectureId?: string | null;
  text: string; type: string; difficulty: string; status: string; tags: string[];
  lectureTitle?: string | null; optionsCount: number;
  attemptsCount: number; correctRate: number;
  createdAt: string; updatedAt?: string | null;
};
type QuestionDetail = QuestionSummary & {
  reference?: string | null; year?: number | null; paragraphTag?: string | null;
  explanation: string; correctAnswer: string; options: QuestionOption[];
};
type QuestionType = 'Mcq' | 'TrueFalse' | 'MultipleSelect' | 'Essay';
type Difficulty = 'Easy' | 'Medium' | 'Hard';
type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };

type FormState = {
  id?: string;
  text: string;
  type: QuestionType;
  difficulty: Difficulty;
  lectureId: string;
  tags: string;
  explanation: string;
  correctAnswer: string;
  reference: string;
  year: string;
  paragraphTag: string;
  options: QuestionOption[];
};

type ConfirmDialog =
  | { id: string; action: 'publish' | 'archive' }
  | { id: string; action: 'delete'; text: string }
  | null;

const emptyForm = (): FormState => ({
  text: '', type: 'Mcq', difficulty: 'Medium', lectureId: '', tags: '',
  explanation: '', correctAnswer: '', reference: '', year: '', paragraphTag: '',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
});

// ===== Push 2 / Track 1: sticky context (survives "Save & Add Another" + page reloads) =====
const STICKY_KEY = 'cms-questionscenter-sticky-context';
type StickyContext = {
  universityId: string; collegeId: string; yearId: string; semesterId: string; subjectId: string;
  lectureId: string; type: QuestionType; difficulty: Difficulty;
  tags: string; year: string; paragraphTag: string;
};

const readSticky = (): StickyContext | null => {
  try {
    const raw = window.localStorage.getItem(STICKY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StickyContext>;
    if (!parsed.subjectId || !parsed.type || !parsed.difficulty) return null;
    return {
      universityId: parsed.universityId ?? '',
      collegeId: parsed.collegeId ?? '',
      yearId: parsed.yearId ?? '',
      semesterId: parsed.semesterId ?? '',
      subjectId: parsed.subjectId!,
      lectureId: parsed.lectureId ?? '',
      type: parsed.type!,
      difficulty: parsed.difficulty!,
      tags: parsed.tags ?? '',
      year: parsed.year ?? '',
      paragraphTag: parsed.paragraphTag ?? '',
    };
  } catch { return null; }
};

const writeSticky = (context: StickyContext | null) => {
  try {
    if (context) window.localStorage.setItem(STICKY_KEY, JSON.stringify(context));
    else window.localStorage.removeItem(STICKY_KEY);
  } catch { /* storage unavailable (private mode) — sticky context degrades to in-memory only */ }
};

const freshOptionsForType = (type: QuestionType) =>
  type === 'TrueFalse'
    ? [{ text: 'صح', isCorrect: true }, { text: 'خطأ', isCorrect: false }]
    : emptyForm().options;

const formFromSticky = (context: StickyContext): FormState => ({
  ...emptyForm(),
  type: context.type,
  difficulty: context.difficulty,
  lectureId: context.lectureId,
  tags: context.tags,
  year: context.year,
  paragraphTag: context.paragraphTag,
  options: context.type === 'Essay' ? [] : freshOptionsForType(context.type),
});

const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null; titleAr?: string; titleEn?: string | null }) =>
  arabic ? (item.nameAr ?? item.titleAr ?? '') : (item.nameEn ?? item.titleEn ?? item.nameAr ?? item.titleAr ?? '');

// === Badge tone helpers (Tailwind utility classes — no custom CSS) ===
const typeBadgeClass = (type: string) => {
  switch (type) {
    case 'Mcq': return 'text-teal-700 bg-teal-50 border-teal-200';
    case 'TrueFalse': return 'text-sky-700 bg-sky-50 border-sky-200';
    case 'MultipleSelect': return 'text-violet-700 bg-violet-50 border-violet-200';
    case 'Essay': return 'text-amber-700 bg-amber-50 border-amber-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

const difficultyBadgeClass = (difficulty: string) => {
  switch (difficulty) {
    case 'Easy': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Medium': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Hard': return 'text-red-700 bg-red-50 border-red-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

const statusBadgeClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'published') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'archived') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (value === 'review') return 'text-sky-700 bg-sky-50 border-sky-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const typeLabel = (type: string, isArabic: boolean) => {
  switch (type) {
    case 'Mcq': return isArabic ? 'اختيار من متعدد' : 'MCQ';
    case 'TrueFalse': return isArabic ? 'صح أو خطأ' : 'True / False';
    case 'MultipleSelect': return isArabic ? 'اختيارات متعددة' : 'Multiple select';
    case 'Essay': return isArabic ? 'تحريري' : 'Essay';
    default: return type;
  }
};

const difficultyLabel = (difficulty: string, isArabic: boolean) => {
  switch (difficulty) {
    case 'Easy': return isArabic ? 'سهل' : 'Easy';
    case 'Medium': return isArabic ? 'متوسط' : 'Medium';
    case 'Hard': return isArabic ? 'صعب' : 'Hard';
    default: return difficulty;
  }
};

const statusLabel = (status: string, isArabic: boolean) => {
  const value = status.toLowerCase();
  if (value === 'published') return isArabic ? 'منشور' : 'Published';
  if (value === 'archived') return isArabic ? 'مؤرشف' : 'Archived';
  if (value === 'review') return isArabic ? 'مراجعة' : 'Review';
  return isArabic ? 'مسودة' : 'Draft';
};

export function QuestionsCenter({ token, isArabic, onError, onNotice }: Props) {
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

  // === Questions state ===
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // === Editor state ===
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
    // Push 2 / Track 1: restore the sticky context (cascade + form context) after a reload.
    void (async () => {
      const sticky = readSticky();
      if (!sticky?.subjectId) return;
      try {
        setUniversityId(sticky.universityId); setCollegeId(sticky.collegeId);
        setYearId(sticky.yearId); setSemesterId(sticky.semesterId); setSubjectId(sticky.subjectId);
        if (sticky.universityId) setColleges(await request<College[]>(`/api/v1/universities/${sticky.universityId}/colleges`));
        if (sticky.collegeId) setYears(await request<AcademicYear[]>(`/api/v1/colleges/${sticky.collegeId}/years`));
        if (sticky.yearId) setSemesters(await request<Semester[]>(`/api/v1/years/${sticky.yearId}/semesters`));
        if (sticky.semesterId) setSubjects(await request<Subject[]>(`/api/v1/semesters/${sticky.semesterId}/subjects`));
        if (sticky.subjectId) {
          try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${sticky.subjectId}/lectures`)); }
          catch { /* lectures list is optional for the sticky restore */ }
        }
        setForm(formFromSticky(sticky));
      } catch {
        writeSticky(null); // stale context (deleted academic entity?) — discard silently
      }
    })();
    // Initial reference directory only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!subjectId) { setQuestions([]); return; }
    const timer = window.setTimeout(() => { void loadQuestions(); }, 250);
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
      if (query.trim()) params.set('search', query.trim());
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const result = await request<PagedResult<QuestionSummary>>(`/api/v1/admin/questions?${params.toString()}`);
      setQuestions(result.items);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل الأسئلة.');
    } finally { setLoading(false); }
  }

  async function chooseUniversity(id: string) {
    setUniversityId(id); setCollegeId(''); setYearId(''); setSemesterId(''); setSubjectId('');
    setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setLectures([]);
    setForm(emptyForm());
    if (!id) return;
    try { setColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الكليات.'); }
  }
  async function chooseCollege(id: string) {
    setCollegeId(id); setYearId(''); setSemesterId(''); setSubjectId('');
    setYears([]); setSemesters([]); setSubjects([]); setLectures([]);
    setForm(emptyForm());
    if (!id) return;
    try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل السنوات.'); }
  }
  async function chooseYear(id: string) {
    setYearId(id); setSemesterId(''); setSubjectId('');
    setSemesters([]); setSubjects([]); setLectures([]);
    setForm(emptyForm());
    if (!id) return;
    try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الفصول.'); }
  }
  async function chooseSemester(id: string) {
    setSemesterId(id); setSubjectId(''); setSubjects([]); setLectures([]);
    setForm(emptyForm());
    if (!id) return;
    try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المواد.'); }
  }
  async function chooseSubject(id: string) {
    setSubjectId(id); setLectures([]); setForm(emptyForm()); setShowEditor(false);
    if (!id) return;
    try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${id}/lectures`)); }
    catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المحاضرات.'); }
  }

  function changeType(type: QuestionType) {
    if (type === 'TrueFalse') {
      setForm(current => ({
        ...current, type,
        options: [{ text: 'صح', isCorrect: true }, { text: 'خطأ', isCorrect: false }],
        correctAnswer: '',
      }));
    } else if (type === 'Essay') {
      setForm(current => ({ ...current, type, options: [], correctAnswer: current.correctAnswer }));
    } else {
      setForm(current => ({
        ...current, type,
        options: current.options.length >= 2 ? current.options : emptyForm().options,
        correctAnswer: '',
      }));
    }
  }

  function updateOption(index: number, patch: Partial<QuestionOption>) {
    setForm(current => ({
      ...current,
      options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option),
    }));
  }

  function moveOption(index: number, direction: -1 | 1) {
    setForm(current => {
      const target = index + direction;
      if (target < 0 || target >= current.options.length) return current;
      const next = [...current.options];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, options: next };
    });
  }

  async function editQuestion(id: string) {
    setBusy(true);
    try {
      const detail = await request<QuestionDetail>(`/api/v1/admin/questions/${id}`);
      setForm({
        id: detail.id,
        text: detail.text,
        type: detail.type as QuestionType,
        difficulty: detail.difficulty as Difficulty,
        lectureId: detail.lectureId ?? '',
        tags: detail.tags.join(', '),
        explanation: detail.explanation,
        correctAnswer: detail.correctAnswer,
        reference: detail.reference ?? '',
        year: detail.year != null ? String(detail.year) : '',
        paragraphTag: detail.paragraphTag ?? '',
        options: detail.options.map(option => ({ ...option })),
      });
      setShowEditor(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر فتح السؤال.');
    } finally { setBusy(false); }
  }

  // Push 2 / Track 1: snapshot of the context that survives "Save & Add Another".
  function currentStickyContext(): StickyContext {
    return {
      universityId, collegeId, yearId, semesterId, subjectId,
      lectureId: form.lectureId, type: form.type, difficulty: form.difficulty,
      tags: form.tags, year: form.year, paragraphTag: form.paragraphTag,
    };
  }

  function resetContext() {
    writeSticky(null);
    setForm(emptyForm());
    onNotice(isArabic ? 'تمت إعادة تعيين السياق المحفوظ.' : 'Saved context reset.');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await doSubmit(false);
  }

  async function doSubmit(addAnother: boolean) {
    if (!subjectId || !form.text.trim() || !form.explanation.trim()) return;
    if (isEssay && !form.correctAnswer.trim()) {
      onError(isArabic ? 'اكتب الإجابة النموذجية للسؤال التحريري.' : 'Provide the model answer for the essay question.');
      return;
    }
    if (!isEssay && (form.options.length < 2 || form.options.some(option => !option.text.trim()) || !form.options.some(option => option.isCorrect))) {
      onError(isArabic ? 'أدخل خيارين على الأقل وحدد إجابة صحيحة.' : 'Provide at least two options and mark a correct answer.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        text: form.text.trim(),
        type: form.type,
        subjectId,
        lectureId: form.lectureId || null,
        difficulty: form.difficulty,
        tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        options: isEssay ? [] : form.options.map(option => ({
          id: option.id ?? null,
          text: option.text.trim(),
          isCorrect: option.isCorrect,
          imageUrl: null,
        })),
        correctOptionId: '',
        correctAnswer: isEssay ? form.correctAnswer.trim() : null,
        explanation: form.explanation.trim(),
        reference: form.reference.trim() || null,
        year: form.year.trim() ? Number(form.year.trim()) : null,
        paragraphTag: form.paragraphTag.trim() || null,
      };
      if (form.id) {
        await request(`/api/v1/questions/${form.id}`, { method: 'PUT', headers: requestHeaders, body: JSON.stringify(payload) });
        onNotice(isArabic ? 'تم تحديث السؤال.' : 'Question updated.');
        setForm(emptyForm()); setShowEditor(false); await loadQuestions();
      } else {
        await request('/api/v1/questions', { method: 'POST', headers: requestHeaders, body: JSON.stringify(payload) });
        if (addAnother) {
          // Sticky context: keep cascade/type/difficulty/tags/year/paragraphTag/lecture;
          // clear ONLY text, options, correct answer, explanation, reference.
          const kept = currentStickyContext();
          writeSticky(kept);
          setForm(formFromSticky(kept));
          onNotice(isArabic ? 'تم حفظ السؤال. أضف السؤال التالي — السياق محفوظ.' : 'Question saved. Add the next one — context kept.');
        } else {
          writeSticky(currentStickyContext());
          onNotice(isArabic ? 'تم حفظ السؤال كمسودة.' : 'Question saved as a draft.');
          setForm(emptyForm()); setShowEditor(false);
        }
        await loadQuestions();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر حفظ السؤال.');
    } finally { setBusy(false); }
  }

  async function lifecycle(id: string, action: 'publish' | 'archive') {
    setBusy(true);
    try {
      await request(`/api/v1/questions/${id}/${action}`, { method: 'POST' });
      onNotice(action === 'publish'
        ? (isArabic ? 'تم نشر السؤال.' : 'Question published.')
        : (isArabic ? 'تمت أرشفة السؤال.' : 'Question archived.'));
      await loadQuestions();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحديث حالة السؤال.');
    } finally { setBusy(false); }
  }

  async function deleteQuestion(id: string) {
    setBusy(true);
    try {
      await request(`/api/v1/questions/${id}`, { method: 'DELETE' });
      onNotice(isArabic ? 'تم حذف السؤال.' : 'Question deleted.');
      await loadQuestions();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر حذف السؤال.');
    } finally { setBusy(false); }
  }

  function closeEditor() {
    setShowEditor(false);
    setForm(emptyForm());
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
            <ListFilter className="w-6 h-6" />
          </div>
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--cms-text-muted)' }}
            >
              {isArabic ? 'إدارة المحتوى الأكاديمي' : 'Academic content management'}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {isArabic ? 'بنك الأسئلة' : 'Question Bank'}
              {subjectId && (
                <span
                  className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                  style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
                >
                  {questions.length}
                </span>
              )}
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic
                ? 'أدارة أسئلة المادة، الإجابات النموذجية، والشرح العلمي.'
                : 'Manage subject questions, model answers, and scientific explanations.'}
            </p>
          </div>
        </div>
        {subjectId && (
          <button
            type="button"
            onClick={() => { setForm(readSticky() ? formFromSticky(readSticky()!) : emptyForm()); setShowEditor(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
            style={{ background: 'var(--cms-teal-700)' }}
            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
          >
            <Plus className="w-4 h-4" />
            {isArabic ? 'سؤال جديد' : 'New question'}
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
            <FileText className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
            {isArabic ? 'اختر مادة لفتح بنك أسئلتها.' : 'Select a subject to open its question bank.'}
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
                placeholder={isArabic ? 'ابحث في نص السؤال' : 'Search question text'}
                className="w-full pr-10 pl-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            >
              <option value="">{isArabic ? 'كل الأنواع' : 'All types'}</option>
              <option value="Mcq">{isArabic ? 'اختيار من متعدد' : 'MCQ'}</option>
              <option value="TrueFalse">{isArabic ? 'صح أو خطأ' : 'True / False'}</option>
              <option value="MultipleSelect">{isArabic ? 'اختيارات متعددة' : 'Multiple select'}</option>
              <option value="Essay">{isArabic ? 'تحريري' : 'Essay'}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            >
              <option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option>
              <option value="Draft">{isArabic ? 'مسودة' : 'Draft'}</option>
              <option value="Review">{isArabic ? 'مراجعة' : 'Review'}</option>
              <option value="Published">{isArabic ? 'منشور' : 'Published'}</option>
              <option value="Archived">{isArabic ? 'مؤرشف' : 'Archived'}</option>
            </select>
          </div>

          {/* ===== Question list ===== */}
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
          ) : questions.length === 0 ? (
            <div
              className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16"
              style={{ borderColor: 'var(--cms-line)' }}
            >
              <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                <FileText className="w-6 h-6" />
              </div>
              <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
                {isArabic ? 'لا توجد أسئلة' : 'No questions'}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                {isArabic ? 'لا توجد أسئلة ضمن هذه التصفية.' : 'No questions match these filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                  <tr>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'نص السؤال' : 'Question'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'النوع' : 'Type'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الصعوبة' : 'Difficulty'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الحالة' : 'Status'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'المحاضرة' : 'Lecture'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الوسوم' : 'Tags'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'المحاولات' : 'Attempts'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'نسبة الإصابة' : 'Correct rate'}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{isArabic ? 'إجراءات' : 'Actions'}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
                  {questions.map(question => (
                    <tr key={question.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-sm leading-snug line-clamp-2" style={{ color: 'var(--cms-text)' }}>
                          {question.text}
                        </div>
                        {question.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {question.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="inline-block px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--cms-ivory-200)', color: 'var(--cms-text-muted)' }}>
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${typeBadgeClass(question.type)}`}>
                          {typeLabel(question.type, isArabic)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${difficultyBadgeClass(question.difficulty)}`}>
                          {difficultyLabel(question.difficulty, isArabic)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(question.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          {statusLabel(question.status, isArabic)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                        {question.lectureTitle || (isArabic ? 'على مستوى المادة' : 'Subject-level')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono" style={{ color: 'var(--cms-text-muted)' }}>
                          {question.optionsCount} {isArabic ? 'خيارات' : 'opts'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold" style={{ color: 'var(--cms-text)' }}>{question.attemptsCount}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cms-ivory-200)' }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, Math.max(0, question.correctRate))}%`,
                                background: question.correctRate >= 70 ? 'var(--cms-success)' : question.correctRate >= 40 ? 'var(--cms-warning)' : 'var(--cms-danger)',
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--cms-text)' }}>
                            {question.correctRate.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title={isArabic ? 'تعديل' : 'Edit'}
                            disabled={busy}
                            onClick={() => void editQuestion(question.id)}
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: 'var(--cms-text-muted)' }}
                            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-50)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                            onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {question.status !== 'Published' && question.status !== 'Archived' && (
                            <button
                              type="button"
                              title={isArabic ? 'نشر' : 'Publish'}
                              disabled={busy}
                              onClick={() => setConfirm({ id: question.id, action: 'publish' })}
                              className="p-1.5 rounded-md text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                          {question.status !== 'Archived' ? (
                            <button
                              type="button"
                              title={isArabic ? 'أرشفة' : 'Archive'}
                              disabled={busy}
                              onClick={() => setConfirm({ id: question.id, action: 'archive' })}
                              className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title={isArabic ? 'حذف' : 'Delete'}
                            disabled={busy}
                            onClick={() => setConfirm({ id: question.id, action: 'delete', text: question.text })}
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
                className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md lg:max-w-xl bg-white shadow-2xl overflow-y-auto"
                role="dialog"
                aria-modal="true"
                onMouseDown={(event) => event.stopPropagation()}
                style={{ boxShadow: 'var(--cms-shadow-xl)' }}
              >
                <form onSubmit={event => void submit(event)} className="flex flex-col min-h-full">
                  {/* Editor header */}
                  <div
                    className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b backdrop-blur"
                    style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface-glass)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                        {form.id ? (isArabic ? 'تعديل السؤال' : 'Edit question') : (isArabic ? 'سؤال جديد' : 'New question')}
                      </p>
                      <h3 className="text-base font-bold truncate" style={{ color: 'var(--cms-text)' }}>
                        {activeSubject ? label(isArabic, activeSubject) : (isArabic ? 'بنك الأسئلة' : 'Question Bank')}
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
                    {/* Question text */}
                    <label className="block">
                      <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {isArabic ? 'نص السؤال' : 'Question text'}
                      </span>
                      <textarea
                        required
                        rows={3}
                        value={form.text}
                        onChange={event => setForm(current => ({ ...current, text: event.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                        style={{ borderColor: 'var(--cms-line-strong)' }}
                      />
                    </label>

                    {/* Type + Difficulty (side by side) */}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic ? 'النوع' : 'Type'}
                        </span>
                        <select
                          value={form.type}
                          disabled={Boolean(form.id)}
                          onChange={event => changeType(event.target.value as QuestionType)}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        >
                          <option value="Mcq">{isArabic ? 'اختيار من متعدد' : 'MCQ'}</option>
                          <option value="TrueFalse">{isArabic ? 'صح أو خطأ' : 'True / False'}</option>
                          <option value="MultipleSelect">{isArabic ? 'اختيارات متعددة' : 'Multiple select'}</option>
                          <option value="Essay">{isArabic ? 'تحريري' : 'Essay'}</option>
                        </select>
                        {form.id && (
                          <small className="block mt-1 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                            {isArabic ? 'لا يمكن تغيير النوع بعد الإنشاء.' : 'Type cannot change after creation.'}
                          </small>
                        )}
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic ? 'الصعوبة' : 'Difficulty'}
                        </span>
                        <select
                          value={form.difficulty}
                          onChange={event => setForm(current => ({ ...current, difficulty: event.target.value as Difficulty }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        >
                          <option value="Easy">{isArabic ? 'سهل' : 'Easy'}</option>
                          <option value="Medium">{isArabic ? 'متوسط' : 'Medium'}</option>
                          <option value="Hard">{isArabic ? 'صعب' : 'Hard'}</option>
                        </select>
                      </label>
                    </div>

                    {/* Lecture + Tags */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic ? 'المحاضرة (اختياري)' : 'Lecture (optional)'}
                        </span>
                        <select
                          value={form.lectureId}
                          onChange={event => setForm(current => ({ ...current, lectureId: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        >
                          <option value="">{isArabic ? 'سؤال عام للمادة' : 'Subject-level question'}</option>
                          {lectures.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic ? 'الوسوم (مفصولة بفواصل)' : 'Tags (comma-separated)'}
                        </span>
                        <input
                          value={form.tags}
                          onChange={event => setForm(current => ({ ...current, tags: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                      </label>
                    </div>

                    {/* Reference + Exam year + Paragraph tag (Push 2 / Track 1) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic ? 'المرجع (اختياري)' : 'Reference (optional)'}
                        </span>
                        <input
                          value={form.reference}
                          onChange={event => setForm(current => ({ ...current, reference: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic ? 'سنة الامتحان (اختياري)' : 'Exam year (optional)'}
                        </span>
                        <input
                          type="number"
                          min={1900}
                          max={2100}
                          inputMode="numeric"
                          value={form.year}
                          onChange={event => setForm(current => ({ ...current, year: event.target.value }))}
                          placeholder={isArabic ? 'مثال: 2024' : 'e.g. 2024'}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic ? 'وسم الفقرة (اختياري — موقع السؤال في المنهاج)' : 'Paragraph tag (optional — position in curriculum)'}
                        </span>
                        <input
                          value={form.paragraphTag}
                          onChange={event => setForm(current => ({ ...current, paragraphTag: event.target.value }))}
                          placeholder={isArabic ? 'مثال: الفصل الأول' : 'e.g. Chapter 1'}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                      </label>
                    </div>

                    {/* Options editor OR essay model answer */}
                    {isEssay ? (
                      <div
                        className="rounded-lg border p-4 space-y-3"
                        style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }}
                      >
                        <div className="flex items-center gap-2" style={{ color: 'var(--cms-teal-700)' }}>
                          <CheckCircle2 className="w-4 h-4" />
                          <strong className="text-sm font-semibold">
                            {isArabic ? 'الإجابة النموذجية' : 'Essay model answer'}
                          </strong>
                        </div>
                        <textarea
                          required
                          rows={5}
                          value={form.correctAnswer}
                          onChange={event => setForm(current => ({ ...current, correctAnswer: event.target.value }))}
                          placeholder={isArabic ? 'هذه الإجابة ستظهر للطالب تحت جوابه بعد التصحيح.' : 'This answer appears under the student response after grading.'}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                        <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                          {isArabic
                            ? 'يُجرى التصحيح الآلي بمطابقة النص بعد توحيد المسافات وحالة الأحرف.'
                            : 'Automatic grading normalizes whitespace and letter case.'}
                        </p>
                      </div>
                    ) : (
                      <div
                        className="rounded-lg border p-4 space-y-3"
                        style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                              {isArabic ? 'الخيارات' : 'Options'}
                            </p>
                            <h4 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                              {isTrueFalse
                                ? (isArabic ? 'حدد الإجابة الصحيحة ثم أضف الشرح.' : 'Choose the correct answer, then add the explanation.')
                                : (isArabic ? 'حدد خياراً صحيحاً واحداً على الأقل.' : 'Mark at least one correct option.')}
                            </h4>
                          </div>
                        </div>
                        {form.options.map((option, index) => (
                          <div
                            key={`${option.id ?? 'new'}-${index}`}
                            className="flex items-center gap-2 bg-white rounded-lg border p-2"
                            style={{ borderColor: 'var(--cms-line)' }}
                          >
                            <input
                              type={form.type === 'MultipleSelect' ? 'checkbox' : 'radio'}
                              name="correct-option"
                              checked={option.isCorrect}
                              onChange={event => setForm(current => ({
                                ...current,
                                options: current.options.map((item, itemIndex) => ({
                                  ...item,
                                  isCorrect: form.type === 'MultipleSelect'
                                    ? (itemIndex === index ? event.target.checked : item.isCorrect)
                                    : itemIndex === index,
                                })),
                              }))}
                              className="h-4 w-4 accent-teal-600 shrink-0"
                            />
                            <span className="w-6 text-center text-xs font-semibold shrink-0" style={{ color: 'var(--cms-text-muted)' }}>
                              {String.fromCharCode(65 + index)}
                            </span>
                            <input
                              required
                              value={option.text}
                              disabled={isTrueFalse}
                              onChange={event => updateOption(index, { text: event.target.value })}
                              className="flex-1 px-2 py-1.5 rounded-md border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50"
                              style={{ borderColor: 'var(--cms-line)' }}
                            />
                            {!isTrueFalse && (
                              <>
                                <button
                                  type="button"
                                  title={isArabic ? 'أعلى' : 'Up'}
                                  disabled={index === 0}
                                  onClick={() => moveOption(index, -1)}
                                  className="p-1 rounded transition-colors disabled:opacity-30"
                                  style={{ color: 'var(--cms-text-muted)' }}
                                >
                                  <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  title={isArabic ? 'أسفل' : 'Down'}
                                  disabled={index === form.options.length - 1}
                                  onClick={() => moveOption(index, 1)}
                                  className="p-1 rounded transition-colors disabled:opacity-30"
                                  style={{ color: 'var(--cms-text-muted)' }}
                                >
                                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  title={isArabic ? 'حذف' : 'Remove'}
                                  disabled={form.options.length <= 2}
                                  onClick={() => setForm(current => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))}
                                  className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                        {!isTrueFalse && (
                          <button
                            type="button"
                            onClick={() => setForm(current => ({ ...current, options: [...current.options, { text: '', isCorrect: false }] }))}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed text-xs font-medium transition-colors"
                            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                            onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--cms-teal-400)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                            onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'var(--cms-line-strong)'; event.currentTarget.style.color = 'var(--cms-text-soft)'; }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {isArabic ? 'إضافة خيار' : 'Add option'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Explanation */}
                    <label className="block">
                      <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {isArabic ? 'الشرح' : 'Explanation'}
                      </span>
                      <textarea
                        required
                        rows={4}
                        value={form.explanation}
                        onChange={event => setForm(current => ({ ...current, explanation: event.target.value }))}
                        placeholder={isArabic ? 'اكتب التوضيح العلمي للسؤال وإجابته.' : 'Write the scientific explanation shown after grading.'}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                        style={{ borderColor: 'var(--cms-line-strong)' }}
                      />
                    </label>
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
                    {/* Push 2 / Track 1: reset the saved sticky context */}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={resetContext}
                      className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                      title={isArabic ? 'مسح السياق المحفوظ (الشلال والنوع والوسوم والسنة ووسم الفقرة)' : 'Clear the saved context (cascade, type, tags, year, paragraph tag)'}
                    >
                      {isArabic ? 'إعادة تعيين السياق' : 'Reset context'}
                    </button>
                    {/* Push 2 / Track 1: save & keep the context for rapid question entry */}
                    {!form.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void doSubmit(true); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: 'var(--cms-teal-700)', color: 'var(--cms-teal-700)' }}
                        title={isArabic ? 'حفظ السؤال والبدء بالتالي مع الاحتفاظ بالسياق (الشلال، النوع، الصعوبة، الوسوم، السنة، وسم الفقرة)' : 'Save this question and start the next with the context kept (cascade, type, difficulty, tags, year, paragraph tag)'}
                      >
                        <PlusCircle className="w-4 h-4" />
                        {isArabic ? 'حفظ وإضافة آخر' : 'Save & add another'}
                      </button>
                    )}
                    {form.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { const id = form.id; if (id) void lifecycle(id, 'archive'); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                        style={{ borderColor: 'var(--cms-warning)', color: 'var(--cms-warning)' }}
                      >
                        <Archive className="w-4 h-4" />
                        {isArabic ? 'أرشفة' : 'Archive'}
                      </button>
                    )}
                    {form.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { const id = form.id; if (id) void lifecycle(id, 'publish'); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
                        style={{ background: 'var(--cms-success)' }}
                      >
                        <Send className="w-4 h-4" />
                        {isArabic ? 'نشر' : 'Publish'}
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                      style={{ background: 'var(--cms-teal-700)' }}
                      onMouseEnter={(event) => { if (!busy) event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
                    >
                      {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {form.id
                        ? (isArabic ? 'حفظ التعديل' : 'Save changes')
                        : (isArabic ? 'حفظ كمسودة' : 'Save as draft')}
                    </button>
                  </div>
                </form>
              </aside>
            </>
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
                    ? (isArabic ? 'نشر السؤال' : 'Publish question')
                    : confirm.action === 'archive'
                    ? (isArabic ? 'أرشفة السؤال' : 'Archive question')
                    : (isArabic ? 'حذف السؤال' : 'Delete question')}
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--cms-text-soft)' }}>
                  {confirm.action === 'publish'
                    ? (isArabic ? 'سيُتاح السؤال للطلاب المخوّلين ضمن مادته.' : 'The question will become available to entitled students within its subject.')
                    : confirm.action === 'archive'
                    ? (isArabic ? 'سيُخفى السؤال من الطلاب لكنه يبقى في قاعدة البيانات.' : 'The question will be hidden from students but kept in the database.')
                    : (isArabic ? 'هذا الإجراء دائم. سيُحذف السؤال نهائياً من قاعدة البيانات.' : 'This action is permanent. The question will be removed permanently.')}
                </p>
                {confirm.action === 'delete' && (
                  <p className="text-sm font-medium mt-2 truncate" style={{ color: 'var(--cms-text)' }}>
                    "{confirm.text}"
                  </p>
                )}
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
                  const id = confirm.id;
                  const action = confirm.action;
                  setConfirm(null);
                  if (action === 'delete') void deleteQuestion(id);
                  else void lifecycle(id, action);
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
