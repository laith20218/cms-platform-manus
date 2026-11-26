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
 *   • Question types: Mcq, TrueFalse, MultipleSelect, Essay, Matching (وصل)
 *   • Options editor: add/remove/reorder options, mark correct
 *   • Essay: model answer + explanation
 *   • Matching (W21.1): two row lists (prompts + targets) with stable client ids,
 *     a target select per prompt (used targets disabled → bijection at input
 *     time), and save-time validation via lib/matchingEditor
 *   • Form: text, type, difficulty, lecture, tags, explanation, reference, year, options, correctAnswer, matching
 *   • Confirm dialog for publish/archive
 */
import { Fragment, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Eye,
  FileText, ImagePlus, Link2, ListFilter, LoaderCircle, Pencil, Plus, PlusCircle, Tags, Upload,
  Search, Send, Trash2, Undo2, X,
} from 'lucide-react';
import { apiRequest, apiDownload, type PagedResult } from '../lib/api';
import { t, localeOf, statusLabel } from '../lib/dictionary';
import { Dialog, Pagination, RowActionsMenu } from '@cms/ui';
import { HardDeleteDialog, type HardDeleteTarget } from './HardDeleteDialog';
import { QuestionImportModal } from './QuestionImportModal';
import { questionDifficultyLabel as difficultyLabel, questionTypeLabel as typeLabel } from '../lib/questionLabels';
import { academicIdsOf, useAcademicContext } from '../lib/academicContext';
import { useQueryParamsWriter, useQueryState } from '../lib/useQueryState';
import { UniversalPreviewDialog } from './preview/UniversalPreviewDialog';
import { fromQuestionPreviewDto, type PreviewQuestion } from './preview/previewTypes';
import {
  emptyMatching, matchingFromDetail, matchingToApiPayload, matchingNumberingLabel, newMatchingRowId,
  removePrompt, removeTarget, takenTargetIds, toggleMultiTarget, validateMatching,
  type MatchingApiDetail, type MatchingFormState, type MatchingNumberingStyle,
} from '../lib/matchingEditor';
import { useUiPermissions } from '../hooks/uiPermissionsContext';

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
  // W21.1 — the FULL وصل payload (prompts + targets + pairs) on Matching rows.
  matching?: MatchingApiDetail | null;
};
type QuestionType = 'Mcq' | 'TrueFalse' | 'MultipleSelect' | 'Essay' | 'Matching';
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
  // W21.1 — only meaningful when type === 'Matching'.
  matching: MatchingFormState;
};

type ConfirmDialog =
  | { id: string; action: 'publish' | 'archive' | 'unpublish' }
  | { id: string; action: 'delete'; text: string }
  | null;

// W14.3 D5 — the editor is a 4-tab form; one Save persists every tab.
// PR-3: the tab labels moved to the dictionary (questions.editor.tabs.<key>).
type EditorTab = 'content' | 'explanation' | 'classification' | 'settings';
const EDITOR_TABS: EditorTab[] = ['content', 'explanation', 'classification', 'settings'];

// W14.3 B.3 — GET /admin/questions/{id}/preview — the PR-4 ADMIN superset
// (student surface + authoring surface: explanation, correct answer, وصل payload)
// consumed through the universal preview normalizer.
type QuestionPreviewApi = {
  id: string; text: string; type: string; difficulty: string; status?: string;
  tags?: string[]; paragraphTag?: string | null; year?: number | null;
  options: { id: string; letter: string; text: string; imageUrl?: string | null; isCorrect?: boolean }[];
  images: { imageUrl: string; altText?: string | null; sortOrder: number }[];
  explanation?: string | null; explanationHtml?: string | null; reference?: string | null;
  correctOptionId?: string | null; correctOptionLetter?: string | null; correctAnswerText?: string | null;
  matching?: unknown;
};

// PR-4 — filter facet payload (GET /admin/questions/facets).
type QuestionFacets = {
  authors: { id: string; name: string }[];
  tags: string[];
};

// W21.1 — Arabic prompt letters for the وصل board (same alphabet as the student
// surface so admins see the labels students will see).

const emptyForm = (): FormState => ({
  text: '', type: 'Mcq', difficulty: 'Medium', lectureId: '', tags: '',
  explanation: '', correctAnswer: '', reference: '', year: '', paragraphTag: '',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
  matching: emptyMatching(),
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
  options: context.type === 'Essay' || context.type === 'Matching' ? [] : freshOptionsForType(context.type),
  // A kept Matching context still starts from a FRESH board — prompts/targets
  // never carry over between rapid entries (same discipline as options).
  matching: emptyMatching(),
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
    case 'Matching': return 'text-rose-700 bg-rose-50 border-rose-200';
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

// W22.1 — typeLabel/difficultyLabel now import from the SHARED lib/questionLabels
// (byte-identical glossary; ExamsCenter rides the same map so the centers can
// never drift). The local copies were removed.

// PR-3: the local bilingual status ternaries became registry/dictionary
// lookups with byte-identical output. Published/archived answer from the
// central publication registry; «review» and the legacy unknown-value→«Draft»
// default keep dedicated entries (the registry would render «Unspecified»
// for unknown values, which the legacy helper never did).
const publicationLabel = (status: string, isArabic: boolean) => {
  const locale = localeOf(isArabic);
  const value = status.toLowerCase();
  if (value === 'published' || value === 'archived') return statusLabel(locale, 'publication', value);
  if (value === 'review') return t(locale, 'questions.statusReview');
  return t(locale, 'questions.statusDraft');
};

export function QuestionsCenter({ token, isArabic, onError, onNotice }: Props) {
  // PR-3: every migrated string reads the shared dictionary via `t(locale, …)`.
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

  // === Questions state ===
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  // W2 (admin-ui): server-side pager state — the list was a fixed pageSize=100
  // fetch with no controls (debt D-20).
  const [questionsTotal, setQuestionsTotal] = useState(0);
  // W5 (admin-ui): bulk CSV import modal (matrix row 13 — was UI=none).
  const [importOpen, setImportOpen] = useState(false);

  // PR-4 — the full question-bank working state lives in the URL (PR-2
  // query-state discipline): refresh, deep links, shared links and back/forward
  // restore the exact list view. Academic cascade ids stay under
  // useAcademicContext; these keys own the toolbar/pager/sort state. Multi-key
  // changes (filter change + page reset, clear-all) go through ONE atomic
  // history replace via writeParams (react-router stale-closure quirk).
  const writeParams = useQueryParamsWriter();
  const searchState = useQueryState('q', '');
  const [query, setQuery] = useState(''); // debounced input mirror of ?q=
  const typeFilter = useQueryState('type', '', ['Mcq', 'TrueFalse', 'MultipleSelect', 'Essay', 'Matching']);
  const statusFilter = useQueryState('status', '', ['Draft', 'Review', 'Published', 'Archived']);
  const difficultyFilter = useQueryState('difficulty', '', ['Easy', 'Medium', 'Hard']);
  const lectureFilter = useQueryState('lecture', '');
  const tagsFilter = useQueryState('tags', '');
  const authorFilter = useQueryState('author', '');
  const createdFrom = useQueryState('createdFrom', '');
  const createdTo = useQueryState('createdTo', '');
  const updatedFrom = useQueryState('updatedFrom', '');
  const updatedTo = useQueryState('updatedTo', '');
  const sortState = useQueryState('sort', 'updatedAt', ['updatedAt', 'createdAt', 'attempts', 'text']);
  const orderState = useQueryState('order', 'desc', ['asc', 'desc']);
  const pageState = useQueryState('page', '1');
  const PAGE_SIZE = 25; // PR-4 — real pages (backend default; max 100)

  // PR-4 — facet directory (authors + tags in this subject) for the filter bar.
  const [facets, setFacets] = useState<QuestionFacets | null>(null);
  // PR-4 — bulk tag dialog + CSV export state.
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagAddValue, setTagAddValue] = useState('');
  const [tagRemoveValue, setTagRemoveValue] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState('');
  const [exporting, setExporting] = useState(false);

  // === Editor state ===
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmDialog>(null);

  // === W14.3 Phase B state (D5 tabs + missing actions + image upload) ===
  const [editorTab, setEditorTab] = useState<EditorTab>('content');
  // Snapshot of the row being edited (status + usage) — the detail DTO carries status.
  const [editingRow, setEditingRow] = useState<{ status: string; attemptsCount: number; correctRate: number } | null>(null);
  const [preview, setPreview] = useState<PreviewQuestion | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [uploadingOption, setUploadingOption] = useState<number | null>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const requestHeaders = { 'Content-Type': 'application/json' };

  useEffect(() => {
    void request<PagedResult<University>>('/api/v1/universities?Page=1&PageSize=100')
      .then(data => setUniversities(data.items))
      .catch(error => onError(error instanceof Error ? error.message : t(locale, 'questions.errors.loadUniversities')));
    // W14.3 D4: hydrate the cascade from the URL (`?univ=…&subject=…`). A legacy
    // localStorage sticky (pre-D4) migrates into the URL once; afterwards the sticky
    // keeps only editor defaults (lecture/type/difficulty/tags) for "Save & Add Another".
    void (async () => {
      let ids = academicIdsOf(academic);
      const sticky = readSticky();
      if (!ids.subjectId && sticky?.subjectId) {
        ids = {
          universityId: sticky.universityId, collegeId: sticky.collegeId,
          yearId: sticky.yearId, semesterId: sticky.semesterId, subjectId: sticky.subjectId,
        };
        academic.hydrate(ids); // seed the URL from the legacy sticky
      }
      if (!ids.universityId && !ids.collegeId && !ids.yearId && !ids.semesterId && !ids.subjectId) return;
      try {
        if (ids.universityId) setColleges(await request<College[]>(`/api/v1/universities/${ids.universityId}/colleges`));
        if (ids.collegeId) setYears(await request<AcademicYear[]>(`/api/v1/colleges/${ids.collegeId}/years`));
        if (ids.yearId) setSemesters(await request<Semester[]>(`/api/v1/years/${ids.yearId}/semesters`));
        if (ids.semesterId) setSubjects(await request<Subject[]>(`/api/v1/semesters/${ids.semesterId}/subjects`));
        if (ids.subjectId) {
          try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${ids.subjectId}/lectures`)); }
          catch { /* lectures list is optional for the context restore */ }
        }
        if (sticky?.subjectId === ids.subjectId) setForm(formFromSticky(sticky));
      } catch {
        academic.clear(); // stale context (deleted academic entity?) — drop the URL params
      }
    })();
    // Initial reference directory only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PR-4 — hydrate the search input from the URL once (?q= survives refresh).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setQuery(searchState.value); }, []);

  // PR-4 — debounced write-back: typing updates the input immediately and the
  // URL after 250 ms (the historic debounce cadence).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = query.trim();
      if (next !== searchState.value) searchState.setValue(next);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!subjectId) { setQuestions([]); setQuestionsTotal(0); setFacets(null); return; }
    const timer = window.setTimeout(() => { void loadQuestions(); }, 250);
    return () => window.clearTimeout(timer);
    // Filters are intentionally server-side and URL-persisted (PR-2 discipline).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    subjectId, searchState.value, typeFilter.value, statusFilter.value, difficultyFilter.value,
    lectureFilter.value, tagsFilter.value, authorFilter.value,
    createdFrom.value, createdTo.value, updatedFrom.value, updatedTo.value,
    sortState.value, orderState.value, pageState.value,
  ]);

  // PR-4 — facet directory refresh (authors + tags in the subject, best-effort).
  useEffect(() => {
    if (!subjectId) return;
    setFacets(null);
    void request<QuestionFacets>(`/api/v1/admin/questions/facets?subjectId=${subjectId}`)
      .then(setFacets)
      .catch(() => setFacets(null)); // non-fatal: filters fall back to manual input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const questionsPage = Math.max(1, parseInt(pageState.value, 10) || 1);
  const activeSubject = useMemo(() => subjects.find(subject => subject.id === subjectId), [subjects, subjectId]);
  const isEssay = form.type === 'Essay';
  const isTrueFalse = form.type === 'TrueFalse';
  const isMatching = form.type === 'Matching';

  /** Builds the CURRENT querystring (URL state → server params), shared by list + export. */
  function buildFilterParams(forExport = false) {
    if (!subjectId) return null;
    const params = new URLSearchParams({ subjectId, pageSize: forExport ? '100' : String(PAGE_SIZE) });
    if (!forExport) params.set('page', String(questionsPage));
    if (searchState.value.trim()) params.set('search', searchState.value.trim());
    if (typeFilter.value) params.set('type', typeFilter.value);
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (difficultyFilter.value) params.set('difficulty', difficultyFilter.value);
    if (lectureFilter.value) params.set('lectureId', lectureFilter.value);
    if (tagsFilter.value.trim()) params.set('tags', tagsFilter.value.trim());
    if (authorFilter.value) params.set('authorId', authorFilter.value);
    if (createdFrom.value) params.set('createdFrom', createdFrom.value);
    if (createdTo.value) params.set('createdTo', createdTo.value);
    if (updatedFrom.value) params.set('updatedFrom', updatedFrom.value);
    if (updatedTo.value) params.set('updatedTo', updatedTo.value);
    if (!forExport) {
      params.set('sort', sortState.value);
      params.set('order', orderState.value);
    }
    return params;
  }

  async function loadQuestions() {
    const params = buildFilterParams();
    if (!params) return;
    setLoading(true);
    try {
      const result = await request<PagedResult<QuestionSummary>>(`/api/v1/admin/questions?${params.toString()}`);
      setQuestions(result.items);
      setQuestionsTotal(result.total);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.loadQuestions'));
    } finally { setLoading(false); }
  }

  async function chooseUniversity(id: string) {
    academic.chooseUniversity(id);
    setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setLectures([]);
    setForm(emptyForm());
    if (!id) return;
    try { setColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'questions.errors.loadColleges')); }
  }
  async function chooseCollege(id: string) {
    academic.chooseCollege(id);
    setYears([]); setSemesters([]); setSubjects([]); setLectures([]);
    setForm(emptyForm());
    if (!id) return;
    try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'questions.errors.loadYears')); }
  }
  async function chooseYear(id: string) {
    academic.chooseYear(id);
    setSemesters([]); setSubjects([]); setLectures([]);
    setForm(emptyForm());
    if (!id) return;
    try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'questions.errors.loadSemesters')); }
  }
  async function chooseSemester(id: string) {
    academic.chooseSemester(id);
    setSubjects([]); setLectures([]);
    setForm(emptyForm());
    if (!id) return;
    try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'questions.errors.loadSubjects')); }
  }
  async function chooseSubject(id: string) {
    academic.chooseSubject(id); setLectures([]); setForm(emptyForm()); setShowEditor(false);
    setSelectedIds(new Set()); // selection belongs to the previous subject
    // PR-4 — subject-scoped filters cannot survive a subject switch (stale ids).
    lectureFilter.setValue('');
    tagsFilter.setValue('');
    authorFilter.setValue('');
    pageState.setValue('1');
    if (!id) return;
    try { setLectures(await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${id}/lectures`)); }
    catch (error) { onError(error instanceof Error ? error.message : t(locale, 'questions.errors.loadLectures')); }
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
    } else if (type === 'Matching') {
      // W21.1 — a fresh 2×2 وصل board; options never ride a matching question.
      setForm(current => ({ ...current, type, options: [], correctAnswer: '', matching: emptyMatching() }));
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

  // ===== W21.1 — Matching (وصل) board state helpers =====

  function patchMatching(patch: Partial<MatchingFormState>) {
    setForm(current => ({ ...current, matching: { ...current.matching, ...patch } }));
  }

  function setPromptText(promptId: string, text: string) {
    patchMatching({ prompts: form.matching.prompts.map(prompt => prompt.id === promptId ? { ...prompt, text } : prompt) });
  }

  function setTargetText(targetId: string, text: string) {
    patchMatching({ targets: form.matching.targets.map(target => target.id === targetId ? { ...target, text } : target) });
  }

  function pairPrompt(promptId: string, targetId: string) {
    const pairs = { ...form.matching.pairs };
    if (targetId) pairs[promptId] = targetId;
    else delete pairs[promptId];
    patchMatching({ pairs });
  }

  // Night Task 7.1 — multi-map checkbox toggle for one (prompt, target).
  function toggleMultiPair(promptId: string, targetId: string) {
    patchMatching(toggleMultiTarget(form.matching, promptId, targetId));
  }

  function addPromptRow() {
    patchMatching({ prompts: [...form.matching.prompts, { id: newMatchingRowId(), text: '' }] });
  }

  function addTargetRow() {
    patchMatching({ targets: [...form.matching.targets, { id: newMatchingRowId(), text: '' }] });
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
      const row = questions.find(item => item.id === id) ?? null;
      setEditingRow(row ? { status: row.status, attemptsCount: row.attemptsCount, correctRate: row.correctRate } : null);
      setEditorTab('content'); // D5: every editor opens on المحتوى
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
        // W21.1 — hydrate the وصل board from the admin detail payload; a
        // Matching row without a parseable payload falls back to a fresh 2×2
        // board (the save-time validation still guards it).
        matching: detail.type === 'Matching'
          ? (matchingFromDetail(detail.matching) ?? emptyMatching())
          : emptyMatching(),
      });
      setShowEditor(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.openQuestion'));
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
    onNotice(t(locale, 'questions.notices.contextReset'));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await doSubmit(false);
  }

  async function doSubmit(addAnother: boolean) {
    if (!subjectId) {
      onError(t(locale, 'questions.validation.pickSubjectFirst'));
      return;
    }
    // W14.3 D5: tabs hide fields from the DOM, so HTML5 validation cannot see
    // them — validate manually and jump to the offending tab, fail visibly.
    if (!form.text.trim()) {
      setEditorTab('content');
      onError(t(locale, 'questions.validation.writeQuestionText'));
      return;
    }
    if (isEssay && !form.correctAnswer.trim()) {
      setEditorTab('content');
      onError(t(locale, 'questions.validation.writeModelAnswer'));
      return;
    }
    // W21.1 — وصل invariants BEFORE any network call: ≥2 rows per list, non-empty
    // texts, equal counts, every prompt paired, no target reused (the selects
    // already prevent duplicates at input time — this is defense in depth and
    // guards the hydrated-from-detail path too).
    if (isMatching) {
      const invalid = validateMatching(form.matching, isArabic);
      if (invalid) {
        setEditorTab('content');
        onError(invalid.message);
        return;
      }
    }
    if (!isEssay && !isMatching && (form.options.length < 2 || form.options.some(option => !option.text.trim()) || !form.options.some(option => option.isCorrect))) {
      setEditorTab('content');
      onError(t(locale, 'questions.validation.twoOptionsAndCorrect'));
      return;
    }
    if (!form.explanation.trim()) {
      setEditorTab('explanation');
      onError(t(locale, 'questions.validation.writeExplanation'));
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
        options: isEssay || isMatching ? [] : form.options.map(option => ({
          id: option.id ?? null,
          text: option.text.trim(),
          isCorrect: option.isCorrect,
          // W14.3 B.2 (R75 C2): option images ride the create/update payloads.
          imageUrl: option.imageUrl?.trim() ? option.imageUrl.trim() : null,
        })),
        correctOptionId: '',
        correctAnswer: isEssay ? form.correctAnswer.trim() : null,
        // W21.1 — the وصل payload rides create/update; null on every other type
        // (the API rejects a matching payload on a non-Matching row).
        matching: isMatching ? matchingToApiPayload(form.matching) : null,
        explanation: form.explanation.trim(),
        reference: form.reference.trim() || null,
        year: form.year.trim() ? Number(form.year.trim()) : null,
        paragraphTag: form.paragraphTag.trim() || null,
      };
      if (form.id) {
        await request(`/api/v1/questions/${form.id}`, { method: 'PUT', headers: requestHeaders, body: JSON.stringify(payload) });
        onNotice(t(locale, 'questions.notices.questionUpdated'));
        setForm(emptyForm()); setShowEditor(false); await loadQuestions();
      } else {
        await request('/api/v1/questions', { method: 'POST', headers: requestHeaders, body: JSON.stringify(payload) });
        if (addAnother) {
          // Sticky context: keep cascade/type/difficulty/tags/year/paragraphTag/lecture;
          // clear ONLY text, options, correct answer, explanation, reference.
          const kept = currentStickyContext();
          writeSticky(kept);
          setForm(formFromSticky(kept));
          onNotice(t(locale, 'questions.notices.savedAddAnother'));
        } else {
          writeSticky(currentStickyContext());
          onNotice(t(locale, 'questions.notices.savedDraft'));
          setForm(emptyForm()); setShowEditor(false);
        }
        await loadQuestions();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.saveQuestion'));
    } finally { setBusy(false); }
  }

  async function lifecycle(id: string, action: 'publish' | 'archive' | 'unpublish') {
    setBusy(true);
    try {
      if (action === 'unpublish') {
        // W14.3 B.3 — unpublish lives on the admin controller (W14.2).
        await request(`/api/v1/admin/questions/${id}/unpublish`, { method: 'POST' });
        onNotice(t(locale, 'questions.notices.unpublished'));
      } else {
        await request(`/api/v1/questions/${id}/${action}`, { method: 'POST' });
        onNotice(action === 'publish'
          ? t(locale, 'questions.notices.published')
          : t(locale, 'questions.notices.archived'));
      }
      await loadQuestions();
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.updateStatus'));
    } finally { setBusy(false); }
  }

  async function deleteQuestion(id: string) {
    setBusy(true);
    try {
      await request(`/api/v1/questions/${id}`, { method: 'DELETE' });
      onNotice(t(locale, 'questions.notices.questionDeleted'));
      await loadQuestions();
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.deleteQuestion'));
    } finally { setBusy(false); }
  }

  function closeEditor() {
    setShowEditor(false);
    setForm(emptyForm());
    setEditingRow(null);
    setEditorTab('content');
  }

  // ===== W14.3 B.3 — preview / duplicate / bulk actions =====

  async function previewQuestion(id: string) {
    setPreviewLoading(true);
    try {
      const dto = await request<QuestionPreviewApi>(`/api/v1/admin/questions/${id}/preview`);
      setPreview(fromQuestionPreviewDto(dto));
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.openPreview'));
    } finally { setPreviewLoading(false); }
  }

  async function duplicateQuestion(id: string) {
    setBusy(true);
    try {
      await request(`/api/v1/admin/questions/${id}/duplicate`, { method: 'POST' });
      onNotice(t(locale, 'questions.notices.duplicated'));
      await loadQuestions();
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.duplicateQuestion'));
    } finally { setBusy(false); }
  }

  function toggleSelect(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkAction(action: 'publish' | 'archive') {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const result = await request<{ requested: number; succeeded: number; skipped: number; notFoundIds: string[] }>(
        `/api/v1/admin/questions/bulk-${action}`,
        { method: 'POST', headers: requestHeaders, body: JSON.stringify({ ids: Array.from(selectedIds) }) },
      );
      onNotice(t(locale, 'questions.notices.bulkApplied', { succeeded: result.succeeded, requested: result.requested }));
      setSelectedIds(new Set());
      await loadQuestions();
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.bulkAction'));
    } finally { setBulkBusy(false); }
  }

  // ===== PR-4 — bulk tagging through the existing tag vocabulary =====

  const parseTagInput = (value: string): string[] =>
    value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

  async function submitBulkTag() {
    if (selectedIds.size === 0) { setTagDialogOpen(false); return; }
    const addTags = parseTagInput(tagAddValue);
    const removeTags = parseTagInput(tagRemoveValue);
    if (addTags.length === 0 && removeTags.length === 0) {
      setTagError(t(locale, 'questions.bulk.tagValidation'));
      return;
    }
    if (addTags.some(tag => tag.length > 50) || removeTags.some(tag => tag.length > 50)) {
      setTagError(t(locale, 'questions.bulk.tagValidation'));
      return;
    }
    setTagBusy(true);
    setTagError('');
    try {
      const result = await request<{ requested: number; succeeded: number; skipped: number; notFoundIds: string[] }>(
        '/api/v1/admin/questions/bulk-tag',
        {
          method: 'POST', headers: requestHeaders,
          body: JSON.stringify({ ids: Array.from(selectedIds), addTags, removeTags }),
        },
      );
      onNotice(t(locale, 'questions.bulk.tagApplied', { succeeded: result.succeeded, requested: result.requested }));
      setTagDialogOpen(false);
      setTagAddValue('');
      setTagRemoveValue('');
      await loadQuestions();
      // Refresh the facet directory — new tags may now exist in this subject.
      void request<QuestionFacets>(`/api/v1/admin/questions/facets?subjectId=${subjectId}`)
        .then(setFacets)
        .catch(() => undefined);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.bulkAction'));
    } finally { setTagBusy(false); }
  }

  // ===== PR-4 — CSV export through the authorized backend contract =====

  async function exportCsv() {
    const params = buildFilterParams(true);
    if (!params) return;
    setExporting(true);
    try {
      const { blob, fileName } = await apiDownload(`/api/v1/admin/questions/export?${params.toString()}`, token);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      onNotice(t(locale, 'questions.bulk.exportReady'));
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.bulk.exportFailed'));
    } finally { setExporting(false); }
  }

  /** PR-4 — one click resets every question-bank filter param (ONE atomic history replace). */
  function clearAllFilters() {
    setQuery('');
    writeParams([
      { key: 'q', value: '', defaultValue: '' },
      { key: 'type', value: '', defaultValue: '' },
      { key: 'status', value: '', defaultValue: '' },
      { key: 'difficulty', value: '', defaultValue: '' },
      { key: 'lecture', value: '', defaultValue: '' },
      { key: 'tags', value: '', defaultValue: '' },
      { key: 'author', value: '', defaultValue: '' },
      { key: 'createdFrom', value: '', defaultValue: '' },
      { key: 'createdTo', value: '', defaultValue: '' },
      { key: 'updatedFrom', value: '', defaultValue: '' },
      { key: 'updatedTo', value: '', defaultValue: '' },
      { key: 'sort', value: 'updatedAt', defaultValue: 'updatedAt' },
      { key: 'order', value: 'desc', defaultValue: 'desc' },
      { key: 'page', value: '1', defaultValue: '1' },
    ]);
  }

  /**
   * PR-4 — changing a filter resets to page 1 in the SAME atomic URL write (a
   * filtered list is a new list). Sequential setValue calls would lose the page
   * deletion to react-router's stale-closure quirk (see useQueryParamsWriter).
   */
  function applyFilter(key: string, value: string, defaultValue: string) {
    writeParams([
      { key, value, defaultValue },
      { key: 'page', value: '1', defaultValue: '1' },
    ]);
  }

  // ===== W14.3 B.2 (R75 C2) — option image upload via the library presign flow =====

  async function uploadOptionImage(optionIndex: number, file: File) {
    if (!subjectId) {
      onError(t(locale, 'questions.validation.pickSubjectFirst'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      onError(t(locale, 'questions.upload.notAnImage'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError(t(locale, 'questions.upload.exceedsSizeLimit'));
      return;
    }
    setUploadingOption(optionIndex);
    try {
      // Existing presign flow: upload-url → PUT to object storage → complete-upload.
      const presign = await request<{ uploadUrl: string; fileKey: string; fileId: string }>('/api/v1/library/upload-url', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
          subjectId,
          lectureId: form.lectureId || null,
          type: 'Image',
          title: (form.text.trim() || t(locale, 'questions.upload.optionImageTitle')).slice(0, 120),
          description: null,
        }),
      });
      const put = await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error(t(locale, 'questions.upload.storageFailed', { status: put.status }));
      await request('/api/v1/library/complete-upload', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ fileId: presign.fileId, fileKey: presign.fileKey, actualFileSize: file.size }),
      });
      // Students render <img src={imageUrl}> with no auth header — the value must be
      // a publicly fetchable URL, built from the deployment's public bucket base.
      const publicBase = ((import.meta.env?.VITE_R2_PUBLIC_BASE as string | undefined) ?? '').replace(/\/$/, '');
      if (!publicBase) {
        onError(t(locale, 'questions.upload.publicUrlMissing'));
        return;
      }
      updateOption(optionIndex, { imageUrl: `${publicBase}/${presign.fileKey}` });
      onNotice(t(locale, 'questions.notices.imageAttached'));
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'questions.errors.uploadImage'));
    } finally { setUploadingOption(null); }
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
              {t(locale, 'questions.header.sectionLabel')}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {t(locale, 'questions.header.title')}
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
              {t(locale, 'questions.header.subtitle')}
            </p>
          </div>
        </div>
        {subjectId && can('btn:questions.create') && (
          <button
            type="button"
            onClick={() => { setForm(readSticky() ? formFromSticky(readSticky()!) : emptyForm()); setEditorTab('content'); setShowEditor(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
            style={{ background: 'var(--cms-teal-700)' }}
            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
          >
            <Plus className="w-4 h-4" />
            {t(locale, 'questions.header.newQuestion')}
          </button>
        )}
        {subjectId && can('btn:questions.import') && (
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--cms-teal-700)', color: 'var(--cms-teal-700)', background: 'var(--cms-surface)' }}
            data-testid="open-question-import"
          >
            <Upload className="w-4 h-4" />
            {t(locale, 'questions.header.importQuestions')}
          </button>
        )}
      </header>

      {/* ===== Academic hierarchy filter bar ===== */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-xl border"
        style={{ background: 'var(--cms-ivory-100)', borderColor: 'var(--cms-line)' }}
      >
        {[
          { label: t(locale, 'questions.filters.university'), value: universityId, onChange: chooseUniversity, items: universities, disabled: false },
          { label: t(locale, 'questions.filters.college'), value: collegeId, onChange: chooseCollege, items: colleges, disabled: !universityId },
          { label: t(locale, 'questions.filters.year'), value: yearId, onChange: chooseYear, items: years, disabled: !collegeId },
          { label: t(locale, 'questions.filters.semester'), value: semesterId, onChange: chooseSemester, items: semesters, disabled: !yearId },
          { label: t(locale, 'questions.filters.subject'), value: subjectId, onChange: chooseSubject, items: subjects, disabled: !semesterId },
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
              <option value="">{t(locale, 'questions.filters.select', { label: field.label, labelLower: field.label.toLowerCase() })}</option>
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
            {t(locale, 'questions.empty.pickSubject')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {t(locale, 'questions.empty.hierarchyHint')}
          </p>
        </div>
      ) : (
        <>
          {/* ===== Toolbar (PR-4: the completed filter rail — every value URL-persisted) ===== */}
          <div
            className="rounded-xl border bg-white p-4 space-y-3"
            style={{ borderColor: 'var(--cms-line)' }}
            data-testid="questions-toolbar"
          >
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t(locale, 'questions.toolbar.searchPlaceholder')}
                  aria-label={t(locale, 'questions.toolbar.searchPlaceholder')}
                  className="w-full pr-10 pl-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                  data-testid="questions-search-input"
                />
              </div>
              <select
                value={typeFilter.value}
                onChange={(event) => applyFilter('type', event.target.value, '')}
                aria-label={t(locale, 'questions.toolbar.allTypes')}
                className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
                data-testid="questions-type-filter"
              >
                <option value="">{t(locale, 'questions.toolbar.allTypes')}</option>
                <option value="Mcq">{t(locale, 'questions.typeOptions.mcq')}</option>
                <option value="TrueFalse">{t(locale, 'questions.typeOptions.trueFalse')}</option>
                <option value="MultipleSelect">{t(locale, 'questions.typeOptions.multipleSelect')}</option>
                <option value="Essay">{t(locale, 'questions.typeOptions.essay')}</option>
                <option value="Matching">{t(locale, 'questions.typeOptions.matching')}</option>
              </select>
              <select
                value={statusFilter.value}
                onChange={(event) => applyFilter('status', event.target.value, '')}
                aria-label={t(locale, 'questions.toolbar.allStatuses')}
                className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
                data-testid="questions-status-filter"
              >
                <option value="">{t(locale, 'questions.toolbar.allStatuses')}</option>
                <option value="Draft">{t(locale, 'questions.statusDraft')}</option>
                <option value="Review">{t(locale, 'questions.statusReview')}</option>
                <option value="Published">{t(locale, 'questions.statusPublished')}</option>
                <option value="Archived">{t(locale, 'questions.statusArchived')}</option>
              </select>
              <select
                value={difficultyFilter.value}
                onChange={(event) => applyFilter('difficulty', event.target.value, '')}
                aria-label={t(locale, 'questions.toolbar.difficultyLabel')}
                className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
                data-testid="questions-difficulty-filter"
              >
                <option value="">{t(locale, 'questions.toolbar.allDifficulties')}</option>
                <option value="Easy">{t(locale, 'questions.difficultyOptions.easy')}</option>
                <option value="Medium">{t(locale, 'questions.difficultyOptions.medium')}</option>
                <option value="Hard">{t(locale, 'questions.difficultyOptions.hard')}</option>
              </select>
              <select
                value={lectureFilter.value}
                onChange={(event) => applyFilter('lecture', event.target.value, '')}
                aria-label={t(locale, 'questions.toolbar.lectureLabel')}
                className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[150px]"
                style={{ borderColor: 'var(--cms-line-strong)' }}
                data-testid="questions-lecture-filter"
              >
                <option value="">{t(locale, 'questions.toolbar.allLectures')}</option>
                {lectures.map(lecture => (
                  <option key={lecture.id} value={lecture.id}>{label(isArabic, lecture)}</option>
                ))}
              </select>
              <select
                value={authorFilter.value}
                onChange={(event) => applyFilter('author', event.target.value, '')}
                aria-label={t(locale, 'questions.toolbar.authorLabel')}
                className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[140px]"
                style={{ borderColor: 'var(--cms-line-strong)' }}
                data-testid="questions-author-filter"
              >
                <option value="">{t(locale, 'questions.toolbar.allAuthors')}</option>
                {(facets?.authors ?? []).map(author => (
                  <option key={author.id} value={author.id}>{author.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                <Tags className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="sr-only">{t(locale, 'questions.toolbar.tagsLabel')}</span>
                <input
                  value={tagsFilter.value}
                  onChange={(event) => applyFilter('tags', event.target.value, '')}
                  placeholder={t(locale, 'questions.toolbar.allTags')}
                  list="questions-tags-list"
                  className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[160px]"
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                  data-testid="questions-tags-filter"
                />
                <datalist id="questions-tags-list">
                  {(facets?.tags ?? []).map(tag => <option key={tag} value={tag} />)}
                </datalist>
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                <span>{t(locale, 'questions.toolbar.createdFromLabel')}</span>
                <input
                  type="date"
                  value={createdFrom.value}
                  onChange={(event) => applyFilter('createdFrom', event.target.value, '')}
                  className="px-2 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                  data-testid="questions-created-from"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                <span>{t(locale, 'questions.toolbar.createdToLabel')}</span>
                <input
                  type="date"
                  value={createdTo.value}
                  onChange={(event) => applyFilter('createdTo', event.target.value, '')}
                  className="px-2 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                  data-testid="questions-created-to"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                <span>{t(locale, 'questions.toolbar.updatedFromLabel')}</span>
                <input
                  type="date"
                  value={updatedFrom.value}
                  onChange={(event) => applyFilter('updatedFrom', event.target.value, '')}
                  className="px-2 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                  data-testid="questions-updated-from"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                <span>{t(locale, 'questions.toolbar.updatedToLabel')}</span>
                <input
                  type="date"
                  value={updatedTo.value}
                  onChange={(event) => applyFilter('updatedTo', event.target.value, '')}
                  className="px-2 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                  data-testid="questions-updated-to"
                />
              </label>
              <select
                value={sortState.value}
                onChange={(event) => applyFilter('sort', event.target.value, 'updatedAt')}
                aria-label={t(locale, 'questions.toolbar.sortLabel')}
                className="px-3 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
                data-testid="questions-sort"
              >
                <option value="updatedAt">{t(locale, 'questions.toolbar.sortUpdatedAt')}</option>
                <option value="createdAt">{t(locale, 'questions.toolbar.sortCreatedAt')}</option>
                <option value="attempts">{t(locale, 'questions.toolbar.sortAttempts')}</option>
                <option value="text">{t(locale, 'questions.toolbar.sortText')}</option>
              </select>
              <select
                value={orderState.value}
                onChange={(event) => applyFilter('order', event.target.value, 'desc')}
                aria-label={t(locale, 'questions.toolbar.orderAsc') + ' / ' + t(locale, 'questions.toolbar.orderDesc')}
                className="px-3 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ borderColor: 'var(--cms-line-strong)' }}
                data-testid="questions-order"
              >
                <option value="asc">{t(locale, 'questions.toolbar.orderAsc')}</option>
                <option value="desc">{t(locale, 'questions.toolbar.orderDesc')}</option>
              </select>
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                data-testid="questions-clear-filters"
              >
                {t(locale, 'questions.toolbar.clearFilters')}
              </button>
              {(can('btn:questions.export') || isSuperAdmin) && (
                <button
                  type="button"
                  onClick={() => void exportCsv()}
                  disabled={exporting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-teal-700)', color: 'var(--cms-teal-700)', background: 'var(--cms-surface)' }}
                  data-testid="questions-export-csv"
                >
                  {exporting
                    ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
                  {exporting ? t(locale, 'questions.bulk.exporting') : t(locale, 'questions.bulk.exportCsv')}
                </button>
              )}
            </div>
          </div>

          {/* ===== W14.3 B.3: bulk actions bar ===== */}
          {selectedIds.size > 0 && !loading && (
            <div
              className="flex items-center gap-2 flex-wrap rounded-xl border px-4 py-3"
              style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }}
              role="toolbar"
              aria-label={t(locale, 'questions.bulk.toolbarLabel')}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--cms-teal-700)' }}>
                {t(locale, 'questions.bulk.selected', { count: selectedIds.size })}
              </span>
              {can('btn:questions.publish') && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void bulkAction('publish')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'var(--cms-success)' }}
                >
                  <Send className="w-3.5 h-3.5" />
                  {t(locale, 'questions.bulk.publishSelected')}
                </button>
              )}
              {can('btn:questions.archive') && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void bulkAction('archive')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'var(--cms-warning)' }}
                >
                  <Archive className="w-3.5 h-3.5" />
                  {t(locale, 'questions.bulk.archiveSelected')}
                </button>
              )}
              {can('btn:questions.edit') && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => { setTagError(''); setTagDialogOpen(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-teal-700)', color: 'var(--cms-teal-700)', background: 'var(--cms-surface)' }}
                  data-testid="questions-bulk-tag-open"
                >
                  <Tags className="w-3.5 h-3.5" />
                  {t(locale, 'questions.bulk.tagSelected')}
                </button>
              )}
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
              >
                {t(locale, 'questions.bulk.clearSelection')}
              </button>
            </div>
          )}

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
                {t(locale, 'questions.empty.noQuestions')}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'questions.empty.noQuestionsFiltered')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        aria-label={t(locale, 'questions.table.selectAll')}
                        checked={questions.length > 0 && selectedIds.size === questions.length}
                        onChange={(event) => setSelectedIds(event.target.checked ? new Set(questions.map(item => item.id)) : new Set())}
                        className="h-4 w-4 accent-teal-600"
                      />
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'questions.table.colQuestion')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'questions.table.colType')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'questions.table.colDifficulty')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'questions.table.colStatus')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'questions.table.colLecture')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'questions.table.colTags')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'questions.table.colAttempts')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'questions.table.colCorrectRate')}</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{t(locale, 'questions.table.colActions')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
                  {questions.map(question => (
                    <tr key={question.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={t(locale, 'questions.table.selectQuestion', { text: question.text.slice(0, 40) })}
                          checked={selectedIds.has(question.id)}
                          onChange={() => toggleSelect(question.id)}
                          className="h-4 w-4 accent-teal-600"
                        />
                      </td>
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
                          {publicationLabel(question.status, isArabic)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                        {question.lectureTitle || t(locale, 'questions.table.subjectLevel')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono" style={{ color: 'var(--cms-text-muted)' }}>
                          {question.optionsCount} {t(locale, 'questions.table.optionsCountSuffix')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold" style={{ color: 'var(--cms-text)' }}>{question.attemptsCount}</div>
                      </td>
                      <td className="px-4 py-3">
                        {/* W14.3 B.4: no attempts → say so; never show a misleading red 0%. */}
                        {question.attemptsCount === 0 ? (
                          <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                            {t(locale, 'questions.table.noAttempts')}
                          </span>
                        ) : (
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
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {can('btn:questions.edit') && (
                            <button
                              type="button"
                              title={t(locale, 'questions.actions.edit')}
                              disabled={busy}
                              onClick={() => void editQuestion(question.id)}
                              className="p-1.5 rounded-md transition-colors"
                              style={{ color: 'var(--cms-text-muted)' }}
                              onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-50)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                              onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {/* Command Center P1: row-action ⋮ menu — the 6 secondary actions
                              (preview, duplicate, publish lifecycle, archive, delete) grouped
                              instead of a per-row button cluster. Destructive entries stay
                              confirm-gated downstream via the existing setConfirm flows. */}
                          <RowActionsMenu
                            label={t(locale, 'questions.actions.menuLabel', { text: question.text.slice(0, 40) })}
                            dir={isArabic ? 'rtl' : 'ltr'}
                            items={[
                              {
                                key: 'preview',
                                label: t(locale, 'questions.actions.preview'),
                                icon: <Eye className="w-4 h-4" />,
                                disabled: busy || previewLoading,
                                onSelect: () => void previewQuestion(question.id),
                              },
                              ...(can('btn:questions.create')
                                ? [{
                                    key: 'duplicate',
                                    label: t(locale, 'questions.actions.duplicate'),
                                    icon: <Copy className="w-4 h-4" />,
                                    disabled: busy,
                                    onSelect: () => void duplicateQuestion(question.id),
                                  }]
                                : []),
                              ...(can('btn:questions.publish') && question.status === 'Published'
                                ? [{
                                    key: 'unpublish',
                                    label: t(locale, 'questions.actions.unpublish'),
                                    icon: <Undo2 className="w-4 h-4" />,
                                    disabled: busy,
                                    onSelect: () => setConfirm({ id: question.id, action: 'unpublish' }),
                                  }]
                                : []),
                              ...(can('btn:questions.publish') && question.status !== 'Published' && question.status !== 'Archived'
                                ? [{
                                    key: 'publish',
                                    label: t(locale, 'questions.actions.publish'),
                                    icon: <Send className="w-4 h-4" />,
                                    disabled: busy,
                                    onSelect: () => setConfirm({ id: question.id, action: 'publish' }),
                                  }]
                                : []),
                              ...(can('btn:questions.archive')
                                ? [{
                                    key: 'archive',
                                    label: t(locale, 'questions.actions.archive'),
                                    icon: <Archive className="w-4 h-4" />,
                                    disabled: busy,
                                    dividerBefore: true,
                                    onSelect: () => setConfirm({ id: question.id, action: 'archive' }),
                                  }]
                                : []),
                              ...(can('btn:questions.delete')
                                ? [{
                                    key: 'delete',
                                    label: t(locale, 'questions.actions.delete'),
                                    danger: true,
                                    icon: <Trash2 className="w-4 h-4" />,
                                    disabled: busy,
                                    onSelect: () => setConfirm({ id: question.id, action: 'delete', text: question.text }),
                                  }]
                                : []),
                              ...(isSuperAdmin
                                ? [{
                                    key: 'hard-delete',
                                    label: t(locale, 'questions.actions.hardDelete'),
                                    danger: true,
                                    dividerBefore: true,
                                    icon: <Trash2 className="w-4 h-4" />,
                                    onSelect: () => setHardTarget({ module: 'question', targetId: question.id, label: question.text.slice(0, 60) }),
                                  }]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== W2 (admin-ui): shared pager for the question list ===== */}
          {!loading && questionsTotal > 0 && (
            <Pagination
              page={questionsPage}
              pageSize={PAGE_SIZE}
              total={questionsTotal}
              onPageChange={(next) => pageState.setValue(String(next))}
              dir={isArabic ? 'rtl' : 'ltr'}
              labels={isArabic ? undefined : {
                prev: t(locale, 'questions.pager.prev'),
                next: t(locale, 'questions.pager.next'),
                navLabel: t(locale, 'questions.pager.navLabel'),
                pageOf: (p, tp) => t(locale, 'questions.pager.pageOf', { page: p, totalPages: tp }),
              }}
              testId="questions-list-pagination"
            />
          )}

          {/* ===== W5 (admin-ui): bulk CSV import — explicit start step + honest result report ===== */}
      {importOpen && subjectId && (
        <QuestionImportModal
          token={token}
          isArabic={isArabic}
          subjectId={subjectId}
          onClose={() => setImportOpen(false)}
          onError={onError}
          onNotice={onNotice}
          onImported={() => void loadQuestions()}
        />
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
                        {form.id ? t(locale, 'questions.editor.editTitle') : t(locale, 'questions.header.newQuestion')}
                      </p>
                      <h3 className="text-base font-bold truncate" style={{ color: 'var(--cms-text)' }}>
                        {activeSubject ? label(isArabic, activeSubject) : t(locale, 'questions.header.title')}
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

                  {/* Editor body — W14.3 D5: 4-tab layout; one Save persists every tab */}
                  <div className="flex-1 px-5 py-4 space-y-5">
                    <div role="tablist" aria-label={t(locale, 'questions.editor.tablistLabel')} className="flex gap-1 overflow-x-auto pb-1 border-b" style={{ borderColor: 'var(--cms-line)' }}>
                      {EDITOR_TABS.map(tab => (
                        <button
                          key={tab}
                          type="button"
                          role="tab"
                          aria-selected={editorTab === tab}
                          onClick={() => setEditorTab(tab)}
                          className="px-3 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-colors"
                          style={editorTab === tab
                            ? { background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)', borderBottom: '2px solid var(--cms-teal-600)' }
                            : { color: 'var(--cms-text-muted)' }}
                        >
                          {t(locale, `questions.editor.tabs.${tab}`)}
                        </button>
                      ))}
                    </div>

                    {/* Tab 1 — المحتوى: text, type, options, images */}
                    <div hidden={editorTab !== 'content'} className="space-y-5">
                    {/* Question text */}
                    <label className="block">
                      <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {t(locale, 'questions.editor.questionTextLabel')}
                      </span>
                      <textarea
                        rows={3}
                        value={form.text}
                        onChange={event => setForm(current => ({ ...current, text: event.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                        style={{ borderColor: 'var(--cms-line-strong)' }}
                      />
                    </label>

                    {/* Type (difficulty lives in التصنيف والوسوم — D5) */}
                    <label className="block">
                      <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {t(locale, 'questions.table.colType')}
                      </span>
                      <select
                        value={form.type}
                        disabled={Boolean(form.id)}
                        onChange={event => changeType(event.target.value as QuestionType)}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
                        style={{ borderColor: 'var(--cms-line-strong)' }}
                      >
                        <option value="Mcq">{t(locale, 'questions.typeOptions.mcq')}</option>
                        <option value="TrueFalse">{t(locale, 'questions.typeOptions.trueFalse')}</option>
                        <option value="MultipleSelect">{t(locale, 'questions.typeOptions.multipleSelect')}</option>
                        <option value="Essay">{t(locale, 'questions.typeOptions.essay')}</option>
                        <option value="Matching">{t(locale, 'questions.typeOptions.matching')}</option>
                      </select>
                      {form.id && (
                        <small className="block mt-1 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'questions.editor.typeLocked')}
                        </small>
                      )}
                    </label>

                    {/* Options editor OR essay model answer OR matching board (W21.1) */}
                    {isEssay ? (
                      <div
                        className="rounded-lg border p-4 space-y-3"
                        style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }}
                      >
                        <div className="flex items-center gap-2" style={{ color: 'var(--cms-teal-700)' }}>
                          <CheckCircle2 className="w-4 h-4" />
                          <strong className="text-sm font-semibold">
                            {t(locale, 'questions.editor.modelAnswerTitle')}
                          </strong>
                        </div>
                        <textarea
                          rows={5}
                          value={form.correctAnswer}
                          onChange={event => setForm(current => ({ ...current, correctAnswer: event.target.value }))}
                          placeholder={t(locale, 'questions.editor.modelAnswerPlaceholder')}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                        <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                          {t(locale, 'questions.editor.gradingNote')}
                        </p>
                      </div>
                    ) : isMatching ? (
                      /* ===== W21.1 — the Matching (وصل) board ===== */
                      <div
                        className="rounded-lg border p-4 space-y-3"
                        style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                        data-testid="matching-editor"
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                              {t(locale, 'questions.matching.itemsTitle')}
                            </p>
                            <h4 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                              {form.matching.allowMultiMap
                                ? t(locale, 'questions.matching.hintMulti')
                                : t(locale, 'questions.matching.hintSingle')}
                            </h4>
                          </div>
                          <span
                            data-testid="matching-counts"
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${form.matching.allowMultiMap || form.matching.prompts.length === form.matching.targets.length
                              ? 'text-slate-600 bg-slate-50 border-slate-200'
                              : 'text-red-700 bg-red-50 border-red-200'}`}
                            lang="en"
                          >
                            {form.matching.prompts.length} / {form.matching.targets.length}
                          </span>
                        </div>

                        {/* Night Task 7 — rules row: multi-map toggle + numbering styles */}
                        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white px-3 py-2" style={{ borderColor: 'var(--cms-line)' }} data-testid="matching-rules">
                          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer" style={{ color: 'var(--cms-text-soft)' }}>
                            <input
                              type="checkbox"
                              checked={form.matching.allowMultiMap === true}
                              onChange={event => patchMatching({ allowMultiMap: event.target.checked })}
                              data-testid="matching-allow-multimap"
                              className="h-4 w-4 accent-teal-600"
                            />
                            {t(locale, 'questions.matching.multiMapToggle')}
                          </label>
                          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                            <span className="font-semibold">{t(locale, 'questions.matching.promptNumbering')}</span>
                            <select
                              value={form.matching.promptNumbering ?? 'arabicLetters'}
                              onChange={event => patchMatching({ promptNumbering: event.target.value as MatchingNumberingStyle })}
                              data-testid="matching-prompt-numbering"
                              className="px-2 py-1 rounded-md border text-xs bg-white"
                              style={{ borderColor: 'var(--cms-line)' }}
                            >
                              <option value="arabicLetters">{t(locale, 'questions.matching.numbering.arabicLetters')}</option>
                              <option value="digits">{t(locale, 'questions.matching.numbering.digits')}</option>
                              <option value="latinLetters">{t(locale, 'questions.matching.numbering.latinLetters')}</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                            <span className="font-semibold">{t(locale, 'questions.matching.targetNumbering')}</span>
                            <select
                              value={form.matching.targetNumbering ?? 'digits'}
                              onChange={event => patchMatching({ targetNumbering: event.target.value as MatchingNumberingStyle })}
                              data-testid="matching-target-numbering"
                              className="px-2 py-1 rounded-md border text-xs bg-white"
                              style={{ borderColor: 'var(--cms-line)' }}
                            >
                              <option value="digits">{t(locale, 'questions.matching.numbering.digits')}</option>
                              <option value="arabicLetters">{t(locale, 'questions.matching.numbering.arabicLetters')}</option>
                              <option value="latinLetters">{t(locale, 'questions.matching.numbering.latinLetters')}</option>
                            </select>
                          </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* ===== Prompts (right column in RTL) — each pairs via select ===== */}
                          <div className="space-y-2">
                            <p className="text-xs font-bold" style={{ color: 'var(--cms-text-soft)' }}>
                              {t(locale, 'questions.matching.list1Title')}
                            </p>
                            {form.matching.prompts.map((prompt, index) => {
                              const taken = takenTargetIds(form.matching, prompt.id);
                              return (
                                <div
                                  key={prompt.id}
                                  data-testid={`matching-prompt-row-${prompt.id}`}
                                  className="rounded-lg border bg-white p-2.5 space-y-2"
                                  style={{ borderColor: 'var(--cms-line)' }}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 text-center text-xs font-semibold shrink-0" style={{ color: 'var(--cms-text-muted)' }}>
                                      {matchingNumberingLabel(index, form.matching.promptNumbering ?? 'arabicLetters')}
                                    </span>
                                    <input
                                      value={prompt.text}
                                      onChange={event => setPromptText(prompt.id, event.target.value)}
                                      placeholder={t(locale, 'questions.matching.promptPlaceholder')}
                                      data-testid={`matching-prompt-text-${prompt.id}`}
                                      className="flex-1 px-2 py-1.5 rounded-md border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                      style={{ borderColor: 'var(--cms-line)' }}
                                    />
                                    <button
                                      type="button"
                                      title={t(locale, 'questions.matching.removePrompt')}
                                      disabled={form.matching.prompts.length <= 2}
                                      onClick={() => patchMatching(removePrompt(form.matching, prompt.id))}
                                      data-testid={`matching-prompt-remove-${prompt.id}`}
                                      className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {form.matching.allowMultiMap ? (
                                    /* Night Task 7.1 — multi-map: checkbox chips per target. */
                                    <div className="flex flex-wrap gap-1.5 ps-8" data-testid={`matching-prompt-multipair-${prompt.id}`}>
                                      {form.matching.targets.map((target, targetIndex) => {
                                        const selected = (form.matching.multiPairs?.[prompt.id] ?? []).includes(target.id);
                                        const takenByOther = [...Object.entries(form.matching.multiPairs ?? {})]
                                          .some(([otherPromptId, ids]) => otherPromptId !== prompt.id && ids.includes(target.id));
                                        return (
                                          <label
                                            key={target.id}
                                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${selected
                                              ? 'border-teal-500 bg-teal-50 text-teal-800'
                                              : takenByOther
                                                ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                                                : 'border-slate-300 bg-white text-slate-700 hover:border-teal-400'}`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={selected}
                                              disabled={takenByOther && !selected}
                                              onChange={() => toggleMultiPair(prompt.id, target.id)}
                                              data-testid={`matching-multi-${prompt.id}-${target.id}`}
                                              className="h-3.5 w-3.5 accent-teal-600"
                                            />
                                            <span>{matchingNumberingLabel(targetIndex, form.matching.targetNumbering ?? 'digits')}. {target.text.trim() || t(locale, 'questions.matching.newItem')}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                  <div className="flex items-center gap-2 ps-8">
                                    <Link2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-teal-600)' }} />
                                    <select
                                      value={form.matching.pairs[prompt.id] ?? ''}
                                      onChange={event => pairPrompt(prompt.id, event.target.value)}
                                      data-testid={`matching-prompt-pair-${prompt.id}`}
                                      aria-label={t(locale, 'questions.matching.pairSelectLabel', { label: matchingNumberingLabel(index, form.matching.promptNumbering ?? 'arabicLetters'), index: index + 1 })}
                                      className="flex-1 px-2 py-1.5 rounded-md border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                      style={{ borderColor: 'var(--cms-line)' }}
                                    >
                                      <option value="">{t(locale, 'questions.matching.selectTargetPlaceholder')}</option>
                                      {form.matching.targets.map((target, targetIndex) => (
                                        <option
                                          key={target.id}
                                          value={target.id}
                                          disabled={taken.has(target.id)}
                                        >
                                          {matchingNumberingLabel(targetIndex, form.matching.targetNumbering ?? 'digits')}. {target.text.trim() || t(locale, 'questions.matching.newItem')}
                                          {taken.has(target.id) ? t(locale, 'questions.matching.takenSuffix') : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  )}
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={addPromptRow}
                              data-testid="matching-add-prompt"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed text-xs font-medium transition-colors"
                              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {t(locale, 'questions.matching.addPrompt')}
                            </button>
                          </div>
                          {/* ===== Targets (left column in RTL) ===== */}
                          <div className="space-y-2">
                            <p className="text-xs font-bold" style={{ color: 'var(--cms-text-soft)' }}>
                              {t(locale, 'questions.matching.list2Title')}
                            </p>
                            {form.matching.targets.map((target, index) => {
                              const pairedTo = form.matching.allowMultiMap
                                ? Object.entries(form.matching.multiPairs ?? {}).find(([, ids]) => ids.includes(target.id))
                                : Object.entries(form.matching.pairs).find(([, targetId]) => targetId === target.id);
                              return (
                                <div
                                  key={target.id}
                                  data-testid={`matching-target-row-${target.id}`}
                                  className="flex items-center gap-2 rounded-lg border bg-white p-2.5"
                                  style={{ borderColor: 'var(--cms-line)' }}
                                >
                                  <span className="w-6 text-center text-xs font-semibold shrink-0" style={{ color: 'var(--cms-text-muted)' }}>
                                    {matchingNumberingLabel(index, form.matching.targetNumbering ?? 'digits')}
                                  </span>
                                  <input
                                    value={target.text}
                                    onChange={event => setTargetText(target.id, event.target.value)}
                                    placeholder={t(locale, 'questions.matching.targetPlaceholder')}
                                    data-testid={`matching-target-text-${target.id}`}
                                    className="flex-1 px-2 py-1.5 rounded-md border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    style={{ borderColor: 'var(--cms-line)' }}
                                  />
                                  {pairedTo && (
                                    <span className="text-[10px] font-bold shrink-0" style={{ color: 'var(--cms-teal-700)' }}>
                                      {t(locale, 'questions.matching.paired')}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    title={t(locale, 'questions.matching.removeTarget')}
                                    disabled={form.matching.targets.length <= 2}
                                    onClick={() => patchMatching(removeTarget(form.matching, target.id))}
                                    data-testid={`matching-target-remove-${target.id}`}
                                    className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={addTargetRow}
                              data-testid="matching-add-target"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed text-xs font-medium transition-colors"
                              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {t(locale, 'questions.matching.addTarget')}
                            </button>
                          </div>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                          {form.matching.allowMultiMap
                            ? t(locale, 'questions.matching.gradingMulti')
                            : t(locale, 'questions.matching.gradingSingle')}
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
                              {t(locale, 'questions.options.title')}
                            </p>
                            <h4 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                              {isTrueFalse
                                ? t(locale, 'questions.options.hintTrueFalse')
                                : t(locale, 'questions.options.hintDefault')}
                            </h4>
                          </div>
                        </div>
                        {form.options.map((option, index) => (
                          <Fragment key={`${option.id ?? 'new'}-${index}`}>
                          <div
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
                                  title={t(locale, 'questions.options.moveUp')}
                                  disabled={index === 0}
                                  onClick={() => moveOption(index, -1)}
                                  className="p-1 rounded transition-colors disabled:opacity-30"
                                  style={{ color: 'var(--cms-text-muted)' }}
                                >
                                  <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  title={t(locale, 'questions.options.moveDown')}
                                  disabled={index === form.options.length - 1}
                                  onClick={() => moveOption(index, 1)}
                                  className="p-1 rounded transition-colors disabled:opacity-30"
                                  style={{ color: 'var(--cms-text-muted)' }}
                                >
                                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  title={t(locale, 'questions.options.remove')}
                                  disabled={form.options.length <= 2}
                                  onClick={() => setForm(current => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))}
                                  className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                          {/* W14.3 B.2 (R75 C2): attach an image to this option —
                              upload via the library presign flow or paste a public URL. */}
                          {!isTrueFalse && (
                            <div className="px-2 pb-2 ms-9 space-y-1.5">
                              {(option.imageUrl || uploadingOption === index) && (
                                <div className="flex items-center gap-2">
                                  {option.imageUrl && (
                                    <img
                                      src={option.imageUrl}
                                      alt={t(locale, 'questions.options.imageAlt')}
                                      className="h-10 w-16 rounded border object-cover"
                                      style={{ borderColor: 'var(--cms-line)' }}
                                    />
                                  )}
                                  {uploadingOption === index && (
                                    <LoaderCircle className="w-4 h-4 animate-spin" style={{ color: 'var(--cms-teal-600)' }} />
                                  )}
                                  {option.imageUrl && (
                                    <button
                                      type="button"
                                      title={t(locale, 'questions.options.removeImage')}
                                      onClick={() => updateOption(index, { imageUrl: null })}
                                      className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-3 flex-wrap">
                                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--cms-text-muted)' }}>
                                  <ImagePlus className="w-3.5 h-3.5" />
                                  {uploadingOption === index
                                    ? t(locale, 'questions.options.uploading')
                                    : t(locale, 'questions.options.uploadImage')}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    disabled={busy || uploadingOption !== null}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      event.target.value = '';
                                      if (file) void uploadOptionImage(index, file);
                                    }}
                                  />
                                </label>
                                <input
                                  value={option.imageUrl ?? ''}
                                  onChange={event => updateOption(index, { imageUrl: event.target.value || null })}
                                  placeholder={t(locale, 'questions.options.imageUrlPlaceholder')}
                                  className="flex-1 min-w-[160px] px-2 py-1 rounded-md border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  style={{ borderColor: 'var(--cms-line)' }}
                                />
                              </div>
                            </div>
                          )}
                          </Fragment>
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
                            {t(locale, 'questions.options.addOption')}
                          </button>
                        )}
                      </div>
                    )}

                    </div>

                    {/* Tab 2 — الشرح والمراجع: explanation + reference */}
                    <div hidden={editorTab !== 'explanation'} className="space-y-5">
                    {/* Explanation */}
                    <label className="block">
                      <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {t(locale, 'questions.editor.explanationLabel')}
                      </span>
                      <textarea
                        rows={4}
                        value={form.explanation}
                        onChange={event => setForm(current => ({ ...current, explanation: event.target.value }))}
                        placeholder={t(locale, 'questions.editor.explanationPlaceholder')}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                        style={{ borderColor: 'var(--cms-line-strong)' }}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {t(locale, 'questions.editor.referenceLabel')}
                      </span>
                      <input
                        value={form.reference}
                        onChange={event => setForm(current => ({ ...current, reference: event.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                        style={{ borderColor: 'var(--cms-line-strong)' }}
                      />
                    </label>
                    </div>

                    {/* Tab 3 — التصنيف والوسوم: academic context, difficulty, tags, usage */}
                    <div hidden={editorTab !== 'classification'} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {t(locale, 'questions.editor.lectureLabel')}
                        </span>
                        <select
                          value={form.lectureId}
                          onChange={event => setForm(current => ({ ...current, lectureId: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        >
                          <option value="">{t(locale, 'questions.editor.subjectLevelOption')}</option>
                          {lectures.map(item => <option key={item.id} value={item.id}>{label(isArabic, item)}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {t(locale, 'questions.table.colDifficulty')}
                        </span>
                        <select
                          value={form.difficulty}
                          onChange={event => setForm(current => ({ ...current, difficulty: event.target.value as Difficulty }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        >
                          <option value="Easy">{t(locale, 'questions.difficultyOptions.easy')}</option>
                          <option value="Medium">{t(locale, 'questions.difficultyOptions.medium')}</option>
                          <option value="Hard">{t(locale, 'questions.difficultyOptions.hard')}</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {t(locale, 'questions.editor.tagsLabel')}
                        </span>
                        <input
                          value={form.tags}
                          onChange={event => setForm(current => ({ ...current, tags: event.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {t(locale, 'questions.editor.yearLabel')}
                        </span>
                        <input
                          type="number"
                          min={1900}
                          max={2100}
                          inputMode="numeric"
                          value={form.year}
                          onChange={event => setForm(current => ({ ...current, year: event.target.value }))}
                          placeholder={t(locale, 'questions.editor.yearPlaceholder')}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                          {t(locale, 'questions.editor.paragraphTagLabel')}
                        </span>
                        <input
                          value={form.paragraphTag}
                          onChange={event => setForm(current => ({ ...current, paragraphTag: event.target.value }))}
                          placeholder={t(locale, 'questions.editor.paragraphTagPlaceholder')}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{ borderColor: 'var(--cms-line-strong)' }}
                        />
                      </label>
                    </div>
                    {/* W14.3 D5: usage snapshot for the question being edited. */}
                    {form.id && editingRow && (
                      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'questions.editor.usageTitle')}
                        </p>
                        <div className="flex items-center gap-6 text-sm">
                          <span style={{ color: 'var(--cms-text-soft)' }}>
                            {t(locale, 'questions.table.colAttempts')}:{' '}
                            <strong style={{ color: 'var(--cms-text)' }}>{editingRow.attemptsCount}</strong>
                          </span>
                          <span style={{ color: 'var(--cms-text-soft)' }}>
                            {t(locale, 'questions.table.colCorrectRate')}:{' '}
                            {editingRow.attemptsCount > 0
                              ? <strong style={{ color: 'var(--cms-text)' }}>{editingRow.correctRate.toFixed(0)}%</strong>
                              : <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'questions.table.noAttempts')}</span>}
                          </span>
                        </div>
                      </div>
                    )}
                    </div>

                    {/* Tab 4 — الإعدادات: publish status (+ honest scope note) */}
                    <div hidden={editorTab !== 'settings'} className="space-y-4">
                      <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: 'var(--cms-line)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'questions.settings.publishStatusTitle')}
                        </p>
                        <div>
                          {form.id && editingRow
                            ? <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(editingRow.status)}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                                {publicationLabel(editingRow.status, isArabic)}
                              </span>
                            : <span className="text-sm" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'questions.settings.draftNewQuestion')}</span>}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'questions.settings.actionBarNote')}
                        </p>
                      </div>
                      <div className="rounded-lg border p-4 text-xs leading-relaxed" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)', color: 'var(--cms-text-soft)' }}>
                        {t(locale, 'questions.settings.explanationScopeNote')}
                      </div>
                    </div>
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
                      {t(locale, 'questions.actionBar.close')}
                    </button>
                    {/* Push 2 / Track 1: reset the saved sticky context */}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={resetContext}
                      className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                      title={t(locale, 'questions.actionBar.resetContextTitle')}
                    >
                      {t(locale, 'questions.actionBar.resetContext')}
                    </button>
                    {/* Push 2 / Track 1: save & keep the context for rapid question entry.
                        Push 3: covered by btn:questions.create (Q4) — same family as New question. */}
                    {!form.id && can('btn:questions.create') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void doSubmit(true); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: 'var(--cms-teal-700)', color: 'var(--cms-teal-700)' }}
                        title={t(locale, 'questions.actionBar.saveAddAnotherTitle')}
                      >
                        <PlusCircle className="w-4 h-4" />
                        {t(locale, 'questions.actionBar.saveAddAnother')}
                      </button>
                    )}
                    {form.id && can('btn:questions.archive') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { const id = form.id; if (id) void lifecycle(id, 'archive'); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                        style={{ borderColor: 'var(--cms-warning)', color: 'var(--cms-warning)' }}
                      >
                        <Archive className="w-4 h-4" />
                        {t(locale, 'questions.actions.archive')}
                      </button>
                    )}
                    {form.id && can('btn:questions.publish') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { const id = form.id; if (id) void lifecycle(id, 'publish'); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
                        style={{ background: 'var(--cms-success)' }}
                      >
                        <Send className="w-4 h-4" />
                        {t(locale, 'questions.actions.publish')}
                      </button>
                    )}
                    {form.id && editingRow?.status === 'Published' && can('btn:questions.publish') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { const id = form.id; if (id) { setShowEditor(false); setConfirm({ id, action: 'unpublish' }); } }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                        style={{ borderColor: 'var(--cms-warning)', color: 'var(--cms-warning)' }}
                      >
                        <Undo2 className="w-4 h-4" />
                        {t(locale, 'questions.actions.unpublish')}
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
                        ? t(locale, 'questions.actionBar.saveChanges')
                        : t(locale, 'questions.actionBar.saveAsDraft')}
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
                    : confirm.action === 'unpublish' ? 'var(--cms-warning-50)'
                    : 'var(--cms-teal-50)',
                  color: confirm.action === 'archive' ? 'var(--cms-warning)'
                    : confirm.action === 'delete' ? 'var(--cms-danger)'
                    : confirm.action === 'unpublish' ? 'var(--cms-warning)'
                    : 'var(--cms-teal-700)',
                }}
              >
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                  {confirm.action === 'publish'
                    ? t(locale, 'questions.confirm.publishTitle')
                    : confirm.action === 'archive'
                    ? t(locale, 'questions.confirm.archiveTitle')
                    : confirm.action === 'unpublish'
                    ? t(locale, 'questions.confirm.unpublishTitle')
                    : t(locale, 'questions.confirm.deleteTitle')}
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--cms-text-soft)' }}>
                  {confirm.action === 'publish'
                    ? t(locale, 'questions.confirm.publishBody')
                    : confirm.action === 'archive'
                    ? t(locale, 'questions.confirm.archiveBody')
                    : confirm.action === 'unpublish'
                    ? t(locale, 'questions.confirm.unpublishBody')
                    : t(locale, 'questions.confirm.deleteBody')}
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
                {t(locale, 'questions.confirm.cancel')}
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
                    : confirm.action === 'unpublish' ? 'var(--cms-warning)'
                    : 'var(--cms-teal-700)',
                }}
                onMouseEnter={(event) => {
                  if (confirm.action === 'archive') event.currentTarget.style.background = '#8a5a18';
                  else if (confirm.action === 'delete') event.currentTarget.style.background = '#9c3a31';
                  else if (confirm.action === 'unpublish') event.currentTarget.style.background = '#8a5a18';
                  else event.currentTarget.style.background = 'var(--cms-teal-600)';
                }}
                onMouseLeave={(event) => {
                  if (confirm.action === 'archive') event.currentTarget.style.background = 'var(--cms-warning)';
                  else if (confirm.action === 'delete') event.currentTarget.style.background = 'var(--cms-danger)';
                  else if (confirm.action === 'unpublish') event.currentTarget.style.background = 'var(--cms-warning)';
                  else event.currentTarget.style.background = 'var(--cms-teal-700)';
                }}
              >
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : (
                  confirm.action === 'archive' ? <Archive className="w-4 h-4" />
                  : confirm.action === 'delete' ? <Trash2 className="w-4 h-4" />
                  : confirm.action === 'unpublish' ? <Undo2 className="w-4 h-4" />
                  : <Send className="w-4 h-4" />
                )}
                {confirm.action === 'publish'
                  ? t(locale, 'questions.actions.publish')
                  : confirm.action === 'archive'
                  ? t(locale, 'questions.actions.archive')
                  : confirm.action === 'unpublish'
                  ? t(locale, 'questions.actions.unpublish')
                  : t(locale, 'questions.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PR-4: the UNIVERSAL preview (student-view simulation, zero mutations) ===== */}
      <UniversalPreviewDialog
        open={preview !== null}
        onOpenChange={(open) => { if (!open) setPreview(null); }}
        question={preview}
        isArabic={isArabic}
        testId="questions-preview"
      />

      {/* ===== PR-4: bulk-tag dialog (merge/remove through the existing tag vocabulary) ===== */}
      <Dialog
        open={tagDialogOpen}
        onOpenChange={(open) => { if (!open && !tagBusy) setTagDialogOpen(false); }}
        title={t(locale, 'questions.bulk.tagDialogTitle')}
        dir={isArabic ? 'rtl' : 'ltr'}
        size="md"
        dismissGuard={tagBusy}
        testId="questions-bulk-tag-dialog"
      >
        <div className="space-y-4" data-testid="questions-bulk-tag-content">
          <p className="text-sm" style={{ color: 'var(--cms-text-soft)' }}>
            {t(locale, 'questions.bulk.tagDialogBody', { count: selectedIds.size })}
          </p>
          <div>
            <label htmlFor="questions-bulk-tag-add" className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
              {t(locale, 'questions.bulk.tagAddLabel')}
            </label>
            <input
              id="questions-bulk-tag-add"
              value={tagAddValue}
              onChange={(event) => setTagAddValue(event.target.value)}
              placeholder={t(locale, 'questions.bulk.tagAddPlaceholder')}
              list="questions-tags-list"
              disabled={tagBusy}
              data-testid="questions-bulk-tag-add"
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            />
          </div>
          <div>
            <label htmlFor="questions-bulk-tag-remove" className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
              {t(locale, 'questions.bulk.tagRemoveLabel')}
            </label>
            <input
              id="questions-bulk-tag-remove"
              value={tagRemoveValue}
              onChange={(event) => setTagRemoveValue(event.target.value)}
              placeholder={t(locale, 'questions.bulk.tagRemovePlaceholder')}
              list="questions-tags-list"
              disabled={tagBusy}
              data-testid="questions-bulk-tag-remove"
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'questions.bulk.tagDialogRemoveNote')}
            </p>
          </div>
          {tagError && (
            <p className="text-xs" role="alert" data-testid="questions-bulk-tag-error" style={{ color: 'var(--cms-danger)' }}>
              {tagError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--cms-line)' }}>
            <button
              type="button"
              onClick={() => setTagDialogOpen(false)}
              disabled={tagBusy}
              className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              {t(locale, 'questions.confirm.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void submitBulkTag()}
              disabled={tagBusy}
              data-testid="questions-bulk-tag-confirm"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-bold transition-colors disabled:opacity-50"
              style={{ background: 'var(--cms-teal-700)' }}
            >
              {tagBusy && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {t(locale, 'questions.bulk.tagConfirm', { count: selectedIds.size })}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Command Center P1 (D-4): physical delete, SuperAdmin + re-auth + loud-fail on children. */}
      <HardDeleteDialog
        token={token}
        isArabic={isArabic}
        target={hardTarget}
        consequence={t(locale, 'questions.hardDelete.consequence')}
        onDone={() => { void loadQuestions(); }}
        onClose={() => setHardTarget(null)}
      />
    </section>
  );
}
