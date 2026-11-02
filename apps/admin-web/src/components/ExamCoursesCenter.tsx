/**
 * ExamCoursesCenter — W14.3 Phase C (D1): the exam-course bundles screen
 * (الدورات الامتحانية). A bundle is a purchasable, ordered set of bank exams
 * for ONE subject (D6) that the student storefront lists and sells (W14.2 B.2).
 *
 * Endpoints (W14.2 B.1 + the R78 W14.3 list exception):
 *   • List bundles        GET    /api/v1/admin/exam-courses?subjectId=        (R78)
 *   • Create bundle       POST   /api/v1/admin/exam-courses
 *   • Bundle detail       GET    /api/v1/admin/exam-courses/{id}
 *   • Update bundle       PUT    /api/v1/admin/exam-courses/{id}
 *   • Publish / Archive   POST   /api/v1/admin/exam-courses/{id}/publish | /archive
 *   • Delete bundle       DELETE /api/v1/admin/exam-courses/{id}
 *   • Add exam            POST   /api/v1/admin/exam-courses/{id}/exams              { examId }
 *   • Remove exam         DELETE /api/v1/admin/exam-courses/{id}/exams/{examId}
 *   • Reorder exams       PUT    /api/v1/admin/exam-courses/{id}/reorder            { examIds }
 *   • Exam picker         GET    /api/v1/admin/exams?subjectId=&page=&pageSize=     (W14.2 list)
 *   • Cover image         library presign flow — identical to question option images (B.2)
 *
 * Cosmetic gating reuses the exam-management keys (view:exams / btn:exams.*) —
 * the backend deliberately reuses exam verbs for the ExamCourse policies
 * (AdminExamCoursesController.cs header: "so deployed role grants stay valid"),
 * so the UI-permission registry stays v2 with zero drift.
 *
 * §13 discipline: all new directional styling uses logical CSS utilities
 * (text-start / ps-* / pe-* / start-*) — no physical left/right classes.
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, ArrowDown, ArrowUp, ClipboardList, Eye, GraduationCap,
  ImagePlus, Layers, LoaderCircle, PackageOpen, Plus, Search, Send, Trash2, X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { academicIdsOf, useAcademicContext } from '../lib/academicContext';
import { useUiPermissions } from '../hooks/useUiPermissions';

type University = { id: string; nameAr: string; nameEn?: string | null };
type College = { id: string; nameAr: string; nameEn?: string | null };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null };
type Semester = { id: string; nameAr: string; nameEn?: string | null };
type Subject = { id: string; nameAr: string; nameEn?: string | null };

/** Wire shape of the R78 admin list row (ExamCourseListItemDto, camelCase JSON). */
type ExamCourseListItem = {
  id: string; subjectId: string; nameAr: string; nameEn?: string | null; coverUrl?: string | null;
  year: number; semester: number; courseType: string; freeOrPaid: boolean;
  status: string; examsCount: number; sortOrder: number;
};

/** One exam row inside a bundle (ExamCourseItemDto). */
type ExamCourseItem = {
  itemId: string; examId: string; examTitleAr: string; modelLetter?: string | null;
  examTotalQuestions: number; examDurationMinutes: number; examStatus: string; sortOrder: number;
};

/** Wire shape of GET /api/v1/admin/exam-courses/{id} (ExamCourseDetailDto). */
type ExamCourseDetail = {
  id: string; subjectId: string; subjectName: string; nameAr: string; nameEn?: string | null;
  description?: string | null; coverUrl?: string | null; year: number; semester: number;
  courseType: string; freeOrPaid: boolean; sortOrder: number; status: string;
  items: ExamCourseItem[]; createdAt: string; updatedAt: string;
};

/** Wire shape of the W14.2 admin exams list (ExamSummary subset used by the picker). */
type PickerExam = {
  id: string; titleAr: string; examType: string; year: number;
  totalQuestions: number; durationMinutes: number; status: string;
};
type ExamPage = { items: PickerExam[]; page: number; pageSize: number; totalCount: number };

type CourseForm = {
  nameAr: string; nameEn: string; description: string;
  year: string; semester: string; courseType: string; freeOrPaid: boolean;
  coverUrl: string; sortOrder: string;
};

type EditorState = { mode: 'create' } | { mode: 'edit'; detail: ExamCourseDetail } | null;
type ConfirmDialog = { course: ExamCourseListItem; action: 'publish' | 'archive' | 'delete' } | null;

type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };

const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null }) =>
  arabic ? (item.nameAr ?? '') : (item.nameEn ?? item.nameAr ?? '');

const blankCourseForm = (): CourseForm => ({
  nameAr: '', nameEn: '', description: '',
  year: String(new Date().getFullYear()), semester: '1', courseType: 'First', freeOrPaid: false,
  coverUrl: '', sortOrder: '0',
});

const formFromDetail = (detail: ExamCourseDetail): CourseForm => ({
  nameAr: detail.nameAr, nameEn: detail.nameEn ?? '', description: detail.description ?? '',
  year: String(detail.year), semester: String(detail.semester), courseType: detail.courseType,
  freeOrPaid: detail.freeOrPaid, coverUrl: detail.coverUrl ?? '', sortOrder: String(detail.sortOrder),
});

const courseTypeLabel = (type: string, isArabic: boolean) => {
  switch (type) {
    case 'First': return isArabic ? 'دورة أولى' : 'First diet';
    case 'Second': return isArabic ? 'دورة ثانية' : 'Second diet';
    case 'Supplementary': return isArabic ? 'دورة تكميلية' : 'Supplementary';
    case 'Model': return isArabic ? 'دورة نموذجية' : 'Model papers';
    case 'Practice': return isArabic ? 'دورة تدريبية' : 'Practice drills';
    default: return type;
  }
};

const courseTypeBadgeClass = (type: string) => {
  switch (type) {
    case 'First': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Second': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Supplementary': return 'text-red-700 bg-red-50 border-red-200';
    case 'Model': return 'text-sky-700 bg-sky-50 border-sky-200';
    case 'Practice': return 'text-slate-600 bg-slate-50 border-slate-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

const statusBadgeClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'published') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'archived') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (value === 'deleted') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const statusLabel = (status: string, isArabic: boolean) => {
  const value = status.toLowerCase();
  if (value === 'published') return isArabic ? 'منشور' : 'Published';
  if (value === 'archived') return isArabic ? 'مؤرشف' : 'Archived';
  if (value === 'deleted') return isArabic ? 'محذوف' : 'Deleted';
  return isArabic ? 'مسودة' : 'Draft';
};

const semesterLabel = (value: number, isArabic: boolean) => {
  if (value === 1) return isArabic ? 'الفصل الأول' : 'Semester 1';
  if (value === 2) return isArabic ? 'الفصل الثاني' : 'Semester 2';
  if (value === 3) return isArabic ? 'الفصل الثالث / صيفي' : 'Semester 3 / summer';
  return isArabic ? `الفصل ${value}` : `Semester ${value}`;
};

const iconBtnClass = 'p-2 rounded-md transition-colors disabled:opacity-50';

export function ExamCoursesCenter({ token, isArabic, onError, onNotice }: Props) {
  const { can } = useUiPermissions();
  // === Academic hierarchy state (shared URL context, D4) ===
  const [universities, setUniversities] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const academic = useAcademicContext();
  const { universityId, collegeId, yearId, semesterId, subjectId } = academic;

  // === Bundles state ===
  const [courses, setCourses] = useState<ExamCourseListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // === Editor state ===
  const [editor, setEditor] = useState<EditorState>(null);
  const [form, setForm] = useState<CourseForm>(blankCourseForm());
  const [coverBusy, setCoverBusy] = useState(false);

  // === Exam picker state (edit mode only) ===
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerExams, setPickerExams] = useState<PickerExam[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // === Preview + confirm state ===
  const [preview, setPreview] = useState<ExamCourseDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmDialog>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const dir = isArabic ? 'rtl' : 'ltr';
  const bundledExamIds = useMemo(
    () => new Set(editor?.mode === 'edit' ? editor.detail.items.map(item => item.examId) : []),
    [editor],
  );

  // ===== Academic directory + URL-context hydration (same contract as ExamsCenter) =====
  useEffect(() => {
    void request<{ items: University[] }>('/api/v1/universities?Page=1&PageSize=100')
      .then(data => setUniversities(data.items))
      .catch(error => onError(error instanceof Error ? error.message : 'تعذر تحميل الجامعات.'));
    void (async () => {
      const ids = academicIdsOf(academic);
      if (!ids.universityId && !ids.collegeId && !ids.yearId && !ids.semesterId && !ids.subjectId) return;
      try {
        if (ids.universityId) setColleges(await request<College[]>(`/api/v1/universities/${ids.universityId}/colleges`));
        if (ids.collegeId) setYears(await request<AcademicYear[]>(`/api/v1/colleges/${ids.collegeId}/years`));
        if (ids.yearId) setSemesters(await request<Semester[]>(`/api/v1/years/${ids.yearId}/semesters`));
        if (ids.semesterId) setSubjects(await request<Subject[]>(`/api/v1/semesters/${ids.semesterId}/subjects`));
      } catch {
        academic.clear(); // stale context (deleted academic entity?) — drop the URL params
      }
    })();
    // The directory is loaded once per authenticated workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!subjectId) { setCourses([]); return; }
    const timer = window.setTimeout(() => { void loadCourses(); }, 250);
    return () => window.clearTimeout(timer);
    // The bundle list follows the shared subject selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  // Exam picker follows its search box (debounced).
  useEffect(() => {
    if (!pickerOpen || !subjectId) return;
    const timer = window.setTimeout(() => { void loadPicker(); }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, subjectId, pickerQuery]);

  async function chooseUniversity(id: string) {
    academic.chooseUniversity(id);
    setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setCourses([]); closeEditor();
    if (id) {
      try { setColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); }
      catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الكليات.'); }
    }
  }
  async function chooseCollege(id: string) {
    academic.chooseCollege(id);
    setYears([]); setSemesters([]); setSubjects([]); setCourses([]); closeEditor();
    if (id) {
      try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); }
      catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل السنوات.'); }
    }
  }
  async function chooseYear(id: string) {
    academic.chooseYear(id);
    setSemesters([]); setSubjects([]); setCourses([]); closeEditor();
    if (id) {
      try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); }
      catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل الفصول.'); }
    }
  }
  async function chooseSemester(id: string) {
    academic.chooseSemester(id);
    setSubjects([]); setCourses([]); closeEditor();
    if (id) {
      try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); }
      catch (error) { onError(error instanceof Error ? error.message : 'تعذر تحميل المواد.'); }
    }
  }
  function chooseSubject(id: string) {
    academic.chooseSubject(id);
    setCourses([]); closeEditor();
  }

  function closeEditor() {
    setEditor(null);
    setPickerOpen(false);
    setPickerQuery('');
    setForm(blankCourseForm());
  }

  // ===== Data loading =====
  async function loadCourses() {
    if (!subjectId) return;
    setLoading(true);
    try {
      // R78 W14.3 exception endpoint.
      const data = await request<ExamCourseListItem[]>(`/api/v1/admin/exam-courses?subjectId=${subjectId}`);
      setCourses(data);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل الدورات الامتحانية.');
    } finally { setLoading(false); }
  }

  async function loadPicker() {
    if (!subjectId) return;
    setPickerLoading(true);
    try {
      const params = new URLSearchParams({ subjectId, page: '1', pageSize: '100' });
      if (pickerQuery.trim()) params.set('search', pickerQuery.trim());
      const data = await request<ExamPage>(`/api/v1/admin/exams?${params.toString()}`);
      setPickerExams(data.items);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل قائمة الاختبارات.');
    } finally { setPickerLoading(false); }
  }

  // ===== Bundle CRUD =====
  async function submitCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectId) return;
    const year = Number(form.year);
    const semester = Number(form.semester);
    if (!form.nameAr.trim()) return;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      onError(isArabic ? 'السنة يجب أن تكون رقماً صحيحاً (2000-2100).' : 'Year must be a valid number (2000-2100).');
      return;
    }
    setBusy(true);
    try {
      if (editor?.mode === 'edit') {
        const detail = await request<ExamCourseDetail>(`/api/v1/admin/exam-courses/${editor.detail.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim() || null,
            description: form.description.trim() || null, coverUrl: form.coverUrl.trim() || null,
            year, semester, courseType: form.courseType, freeOrPaid: form.freeOrPaid,
            sortOrder: Number(form.sortOrder) || 0,
          }),
        });
        setEditor({ mode: 'edit', detail });
        onNotice(isArabic ? 'تم حفظ بيانات الدورة.' : 'Bundle saved.');
      } else {
        await request<ExamCourseDetail>('/api/v1/admin/exam-courses', {
          method: 'POST',
          body: JSON.stringify({
            subjectId, nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim() || null,
            description: form.description.trim() || null, coverUrl: form.coverUrl.trim() || null,
            year, semester, courseType: form.courseType, freeOrPaid: form.freeOrPaid,
            sortOrder: Number(form.sortOrder) || 0,
          }),
        });
        closeEditor();
        onNotice(isArabic ? 'تم إنشاء الدورة الامتحانية — أضف اختباراتها من زر إدارة الاختبارات.' : 'Bundle created — manage its exams next.');
      }
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر حفظ الدورة الامتحانية.');
    } finally { setBusy(false); }
  }

  async function lifecycle(course: ExamCourseListItem, action: 'publish' | 'archive') {
    setBusy(true);
    try {
      await request(`/api/v1/admin/exam-courses/${course.id}/${action}`, { method: 'POST' });
      onNotice(action === 'publish'
        ? (isArabic ? 'تم نشر الدورة — ستظهر للطلاب المخوّلين.' : 'Bundle published for entitled students.')
        : (isArabic ? 'تمت أرشفة الدورة وإخفاؤها عن الطلاب.' : 'Bundle archived and hidden from students.'));
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.');
    } finally { setBusy(false); }
  }

  async function deleteCourse(course: ExamCourseListItem) {
    setBusy(true);
    try {
      await request(`/api/v1/admin/exam-courses/${course.id}`, { method: 'DELETE' });
      onNotice(isArabic ? 'تم حذف الدورة الامتحانية.' : 'Bundle deleted.');
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر حذف الدورة.');
    } finally { setBusy(false); }
  }

  async function openEdit(course: ExamCourseListItem) {
    setBusy(true);
    try {
      const detail = await request<ExamCourseDetail>(`/api/v1/admin/exam-courses/${course.id}`);
      setForm(formFromDetail(detail));
      setEditor({ mode: 'edit', detail });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل بيانات الدورة.');
    } finally { setBusy(false); }
  }

  async function openPreview(course: ExamCourseListItem) {
    setPreviewLoading(true);
    try {
      setPreview(await request<ExamCourseDetail>(`/api/v1/admin/exam-courses/${course.id}`));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل معاينة الدورة.');
    } finally { setPreviewLoading(false); }
  }

  // ===== Bundle exam management (edit mode) =====
  async function addExamToBundle(examId: string) {
    if (editor?.mode !== 'edit') return;
    setBusy(true);
    try {
      const detail = await request<ExamCourseDetail>(`/api/v1/admin/exam-courses/${editor.detail.id}/exams`, {
        method: 'POST',
        body: JSON.stringify({ examId }),
      });
      setEditor({ mode: 'edit', detail });
      onNotice(isArabic ? 'تمت إضافة الاختبار إلى الدورة.' : 'Exam added to the bundle.');
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر إضافة الاختبار.');
    } finally { setBusy(false); }
  }

  async function removeExamFromBundle(examId: string) {
    if (editor?.mode !== 'edit') return;
    setBusy(true);
    try {
      const detail = await request<ExamCourseDetail>(`/api/v1/admin/exam-courses/${editor.detail.id}/exams/${examId}`, { method: 'DELETE' });
      setEditor({ mode: 'edit', detail });
      onNotice(isArabic ? 'تمت إزالة الاختبار من الدورة.' : 'Exam removed from the bundle.');
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر إزالة الاختبار.');
    } finally { setBusy(false); }
  }

  async function moveItem(index: number, direction: -1 | 1) {
    if (editor?.mode !== 'edit') return;
    const target = index + direction;
    if (target < 0 || target >= editor.detail.items.length) return;
    const items = [...editor.detail.items];
    [items[index], items[target]] = [items[target], items[index]];
    setBusy(true);
    try {
      // Full-list replace: the array index becomes the item's SortOrder.
      const detail = await request<ExamCourseDetail>(`/api/v1/admin/exam-courses/${editor.detail.id}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ examIds: items.map(item => item.examId) }),
      });
      setEditor({ mode: 'edit', detail });
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر إعادة الترتيب.');
    } finally { setBusy(false); }
  }

  // ===== Cover image upload (library presign flow, same as B.2 option images) =====
  async function uploadCover(file: File) {
    if (!subjectId) return;
    if (!file.type.startsWith('image/')) {
      onError(isArabic ? 'الملف المرفق ليس صورة.' : 'The attached file is not an image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError(isArabic ? 'حجم الصورة يتجاوز 5 ميغابايت.' : 'The image exceeds the 5 MB limit.');
      return;
    }
    setCoverBusy(true);
    try {
      const presign = await request<{ uploadUrl: string; fileKey: string; fileId: string }>('/api/v1/library/upload-url', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name, contentType: file.type, fileSize: file.size,
          subjectId, lectureId: null, type: 'Image',
          title: (form.nameAr.trim() || (isArabic ? 'غلاف دورة امتحانية' : 'Exam-course cover')).slice(0, 120),
          description: null,
        }),
      });
      const put = await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error(isArabic ? `فشل رفع الملف إلى التخزين (${put.status}).` : `Storage upload failed (${put.status}).`);
      await request('/api/v1/library/complete-upload', {
        method: 'POST',
        body: JSON.stringify({ fileId: presign.fileId, fileKey: presign.fileKey, actualFileSize: file.size }),
      });
      // The storefront renders <img src> with no auth header — the stored value must
      // be publicly fetchable, built from the deployment's public bucket base.
      const publicBase = ((import.meta.env?.VITE_R2_PUBLIC_BASE as string | undefined) ?? '').replace(/\/$/, '');
      if (!publicBase) {
        onError(isArabic
          ? 'تم رفع الصورة، لكن رابطها العام غير قابل للتوليد — اضبط VITE_R2_PUBLIC_BASE ثم أعد الإرفاق، أو الصق رابط الصورة يدوياً.'
          : 'Image uploaded, but its public URL cannot be derived — set VITE_R2_PUBLIC_BASE and re-attach, or paste the image URL manually.');
        return;
      }
      setForm(current => ({ ...current, coverUrl: `${publicBase}/${presign.fileKey}` }));
      onNotice(isArabic ? 'تم إرفاق صورة الغلاف.' : 'Cover image attached.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر رفع صورة الغلاف.');
    } finally { setCoverBusy(false); }
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';
  const inputStyle = { borderColor: 'var(--cms-line-strong)' };
  const fieldLabel = (text: string) => (
    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>{text}</span>
  );

  return (
    <section className="space-y-6" dir={dir}>
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {isArabic ? 'الدورات الامتحانية' : 'Exam courses'}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {isArabic ? 'باقات الاختبارات القابلة للبيع' : 'Purchasable exam bundles'}
              {subjectId && courses.length > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                  style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
                >
                  {courses.length}
                </span>
              )}
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic
                ? 'أنشئ دورات امتحانية لمادة واحدة، رتّب اختباراتها، وانشرها في المتجر.'
                : 'Create per-subject bundles, order their exams, and publish them to the storefront.'}
            </p>
          </div>
        </div>
        {subjectId && editor === null && can('btn:exams.create') && (
          <button
            type="button"
            onClick={() => { setForm(blankCourseForm()); setEditor({ mode: 'create' }); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
            style={{ background: 'var(--cms-teal-700)' }}
            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
          >
            <Plus className="w-4 h-4" />
            {isArabic ? 'دورة جديدة' : 'New bundle'}
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

      {editor !== null ? (
        /* ================= Bundle editor (create / edit) ================= */
        <form onSubmit={(event) => void submitCourse(event)} className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={closeEditor}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
              >
                <X className="w-4 h-4" />
                {isArabic ? 'رجوع إلى القائمة' : 'Back to list'}
              </button>
              <h3 className="text-lg font-bold" style={{ color: 'var(--cms-text)' }}>
                {editor.mode === 'create'
                  ? (isArabic ? 'دورة امتحانية جديدة' : 'New exam bundle')
                  : (isArabic ? `تعديل: ${editor.detail.nameAr}` : `Edit: ${editor.detail.nameAr}`)}
              </h3>
              {editor.mode === 'edit' && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(editor.detail.status)}`}>
                  {statusLabel(editor.detail.status, isArabic)}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={busy || !form.nameAr.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
              style={{ background: 'var(--cms-teal-700)' }}
              onMouseEnter={(event) => { if (!busy) event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
            >
              {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {editor.mode === 'create' ? (isArabic ? 'إنشاء الدورة' : 'Create bundle') : (isArabic ? 'حفظ التعديلات' : 'Save changes')}
            </button>
          </div>

          {/* ===== Metadata form ===== */}
          <div className="rounded-xl border bg-white p-5" style={{ borderColor: 'var(--cms-line)' }}>
            <h4 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              <Layers className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
              {isArabic ? 'بيانات الدورة' : 'Bundle metadata'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                {fieldLabel(isArabic ? 'الاسم بالعربية *' : 'Arabic name *')}
                <input
                  value={form.nameAr}
                  onChange={(event) => setForm(current => ({ ...current, nameAr: event.target.value }))}
                  required
                  maxLength={200}
                  placeholder={isArabic ? 'مثال: دورة امتحانات نصف السنة' : 'e.g. Midterm exams bundle'}
                  className={inputClass}
                  style={inputStyle}
                />
              </label>
              <label className="block">
                {fieldLabel(isArabic ? 'الاسم بالإنجليزية' : 'English name')}
                <input
                  value={form.nameEn}
                  onChange={(event) => setForm(current => ({ ...current, nameEn: event.target.value }))}
                  maxLength={200}
                  className={inputClass}
                  style={inputStyle}
                />
              </label>
              <label className="block">
                {fieldLabel(isArabic ? 'الوصف' : 'Description')}
                <textarea
                  value={form.description}
                  onChange={(event) => setForm(current => ({ ...current, description: event.target.value }))}
                  rows={3}
                  className={inputClass}
                  style={inputStyle}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  {fieldLabel(isArabic ? 'السنة *' : 'Year *')}
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={form.year}
                    onChange={(event) => setForm(current => ({ ...current, year: event.target.value }))}
                    required
                    className={inputClass}
                    style={inputStyle}
                  />
                </label>
                <label className="block">
                  {fieldLabel(isArabic ? 'الفصل *' : 'Semester *')}
                  <select
                    value={form.semester}
                    onChange={(event) => setForm(current => ({ ...current, semester: event.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="1">{isArabic ? 'الفصل الأول' : 'Semester 1'}</option>
                    <option value="2">{isArabic ? 'الفصل الثاني' : 'Semester 2'}</option>
                    <option value="3">{isArabic ? 'الفصل الثالث / صيفي' : 'Semester 3 / summer'}</option>
                  </select>
                </label>
                <label className="block">
                  {fieldLabel(isArabic ? 'نوع الدورة *' : 'Bundle type *')}
                  <select
                    value={form.courseType}
                    onChange={(event) => setForm(current => ({ ...current, courseType: event.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  >
                    {['First', 'Second', 'Supplementary', 'Model', 'Practice'].map(type => (
                      <option key={type} value={type}>{courseTypeLabel(type, isArabic)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  {fieldLabel(isArabic ? 'السعر' : 'Pricing')}
                  <select
                    value={form.freeOrPaid ? 'paid' : 'free'}
                    onChange={(event) => setForm(current => ({ ...current, freeOrPaid: event.target.value === 'paid' }))}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="free">{isArabic ? 'مجاني' : 'Free'}</option>
                    <option value="paid">{isArabic ? 'مدفوع' : 'Paid'}</option>
                  </select>
                </label>
              </div>
              <label className="block">
                {fieldLabel(isArabic ? 'ترتيب الظهور' : 'Display sort order')}
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => setForm(current => ({ ...current, sortOrder: event.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </label>

              {/* ===== Cover image ===== */}
              <div className="block">
                {fieldLabel(isArabic ? 'صورة الغلاف' : 'Cover image')}
                <div className="flex items-center gap-3 flex-wrap">
                  {form.coverUrl ? (
                    <div className="relative">
                      <img
                        src={form.coverUrl}
                        alt={isArabic ? 'غلاف الدورة' : 'Bundle cover'}
                        className="w-24 h-16 object-cover rounded-lg border"
                        style={{ borderColor: 'var(--cms-line)' }}
                      />
                      <button
                        type="button"
                        onClick={() => setForm(current => ({ ...current, coverUrl: '' }))}
                        aria-label={isArabic ? 'إزالة الغلاف' : 'Remove cover'}
                        className="absolute -top-2 -end-2 p-1 rounded-full bg-white border shadow-sm text-red-600"
                        style={{ borderColor: 'var(--cms-line)' }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="w-24 h-16 rounded-lg border flex items-center justify-center"
                      style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-100)' }}
                    >
                      <ImagePlus className="w-5 h-5" style={{ color: 'var(--cms-text-muted)' }} />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${coverBusy ? 'opacity-60 pointer-events-none' : ''}`}
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                    >
                      {coverBusy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      {isArabic ? 'رفع صورة' : 'Upload image'}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadCover(file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <input
                      value={form.coverUrl}
                      onChange={(event) => setForm(current => ({ ...current, coverUrl: event.target.value }))}
                      placeholder={isArabic ? 'أو الصق رابط الصورة' : 'or paste an image URL'}
                      className="w-56 px-2 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== Bundle exams (edit mode only) ===== */}
          {editor.mode === 'edit' ? (
            <div className="rounded-xl border bg-white p-5" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                  <ClipboardList className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
                  {isArabic ? `اختبارات الدورة (${editor.detail.items.length})` : `Bundle exams (${editor.detail.items.length})`}
                </h4>
                <button
                  type="button"
                  onClick={() => { setPickerQuery(''); setPickerOpen(true); }}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-teal-600)', color: 'var(--cms-teal-700)' }}
                >
                  <Plus className="w-4 h-4" />
                  {isArabic ? 'إضافة اختبار' : 'Add exam'}
                </button>
              </div>
              {editor.detail.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10" style={{ color: 'var(--cms-text-muted)' }}>
                  <PackageOpen className="w-6 h-6 opacity-50" />
                  <p className="mt-2 text-sm">
                    {isArabic ? 'لا توجد اختبارات في الدورة بعد — أضف أول اختبار من بنك المادة.' : 'No exams in this bundle yet — add the first one from the subject bank.'}
                  </p>
                </div>
              ) : (
                <ol className="space-y-2">
                  {editor.detail.items.map((item, index) => (
                    <li
                      key={item.itemId}
                      className="flex items-center gap-3 p-3 rounded-lg border flex-wrap"
                      style={{ borderColor: 'var(--cms-line)' }}
                    >
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
                      >
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-[160px]">
                        <div className="text-sm font-medium leading-snug" style={{ color: 'var(--cms-text)' }}>
                          {item.examTitleAr}
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                          {item.modelLetter && <span className="font-mono">{isArabic ? 'نموذج' : 'Model'} {item.modelLetter}</span>}
                          <span>{item.examTotalQuestions} {isArabic ? 'سؤال' : 'questions'}</span>
                          <span>· {item.examDurationMinutes} {isArabic ? 'دقيقة' : 'min'}</span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border ${statusBadgeClass(item.examStatus)}`}>
                            {statusLabel(item.examStatus, isArabic)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={isArabic ? 'تحريك لأعلى' : 'Move up'}
                          title={isArabic ? 'تحريك لأعلى' : 'Move up'}
                          onClick={() => void moveItem(index, -1)}
                          disabled={busy || index === 0}
                          className={`${iconBtnClass} text-slate-500 hover:bg-slate-100`}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={isArabic ? 'تحريك لأسفل' : 'Move down'}
                          title={isArabic ? 'تحريك لأسفل' : 'Move down'}
                          onClick={() => void moveItem(index, 1)}
                          disabled={busy || index === editor!.detail.items.length - 1}
                          className={`${iconBtnClass} text-slate-500 hover:bg-slate-100`}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={isArabic ? 'إزالة الاختبار' : 'Remove exam'}
                          title={isArabic ? 'إزالة الاختبار' : 'Remove exam'}
                          onClick={() => void removeExamFromBundle(item.examId)}
                          disabled={busy}
                          className={`${iconBtnClass} text-red-600 hover:bg-red-50`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <p className="text-xs rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-muted)', background: 'var(--cms-ivory-100)' }}>
              {isArabic
                ? 'أنشئ الدورة أولاً — بعدها يمكنك إضافة اختبارات المادة وترتيبها.'
                : 'Create the bundle first — then you can add and order the subject exams.'}
            </p>
          )}
        </form>
      ) : !subjectId ? (
        /* ===== No subject selected ===== */
        <div
          className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
            <GraduationCap className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
            {isArabic ? 'اختر مادة لإدارة دوراتها الامتحانية.' : 'Select a subject to manage its exam bundles.'}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {isArabic ? 'التدرج الأكاديمي أعلاه يقودك من الجامعة إلى المادة.' : 'The hierarchy above leads from university down to subject.'}
          </p>
        </div>
      ) : (
        <>
          {/* ===== Bundle list ===== */}
          {loading ? (
            <div className="rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex items-start gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
                        <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                      </div>
                      <div className="h-4 rounded bg-slate-100 animate-pulse w-2/3" />
                    </div>
                    <div className="h-8 w-28 rounded bg-slate-100 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : courses.length === 0 ? (
            <div
              className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16"
              style={{ borderColor: 'var(--cms-line)' }}
            >
              <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                <PackageOpen className="w-6 h-6" />
              </div>
              <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
                {isArabic ? 'لا توجد دورات امتحانية' : 'No exam bundles'}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                {isArabic ? 'أنشئ أول دورة لهذه المادة بزر «دورة جديدة».' : 'Create the first bundle for this subject with "New bundle".'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                  <tr>
                    <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الدورة' : 'Bundle'}</th>
                    <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'السنة / الفصل' : 'Year / Semester'}</th>
                    <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'النوع' : 'Type'}</th>
                    <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'السعر' : 'Pricing'}</th>
                    <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الاختبارات' : 'Exams'}</th>
                    <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الحالة' : 'Status'}</th>
                    <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{isArabic ? 'إجراءات' : 'Actions'}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
                  {courses.map(course => (
                    <tr key={course.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-sm leading-snug" style={{ color: 'var(--cms-text)' }}>
                          {course.nameAr}
                        </div>
                        {course.nameEn && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--cms-text-muted)' }}>{course.nameEn}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                        {course.year} · {semesterLabel(course.semester, isArabic)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${courseTypeBadgeClass(course.courseType)}`}>
                          {courseTypeLabel(course.courseType, isArabic)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${course.freeOrPaid
                          ? 'text-sky-700 bg-sky-50 border-sky-200'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}
                        >
                          {course.freeOrPaid ? (isArabic ? 'مدفوع' : 'Paid') : (isArabic ? 'مجاني' : 'Free')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold" style={{ color: 'var(--cms-text)' }}>{course.examsCount}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(course.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          {statusLabel(course.status, isArabic)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={isArabic ? 'إدارة الدورة' : 'Manage bundle'}
                            title={isArabic ? 'إدارة الدورة' : 'Manage bundle'}
                            onClick={() => void openEdit(course)}
                            disabled={busy}
                            className={`${iconBtnClass} hover:bg-teal-50`}
                            style={{ color: 'var(--cms-text-muted)' }}
                            onMouseEnter={(event) => { event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                            onMouseLeave={(event) => { event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                          >
                            <ClipboardList className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={isArabic ? 'معاينة' : 'Preview'}
                            title={isArabic ? 'معاينة' : 'Preview'}
                            onClick={() => void openPreview(course)}
                            disabled={previewLoading}
                            className={`${iconBtnClass} hover:bg-teal-50`}
                            style={{ color: 'var(--cms-text-muted)' }}
                            onMouseEnter={(event) => { event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                            onMouseLeave={(event) => { event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {course.status !== 'Published' && course.status !== 'Archived' && can('btn:exams.publish') && (
                            <button
                              type="button"
                              aria-label={isArabic ? 'نشر' : 'Publish'}
                              title={isArabic ? 'نشر' : 'Publish'}
                              onClick={() => setConfirm({ course, action: 'publish' })}
                              disabled={busy}
                              className={`${iconBtnClass} text-teal-600 hover:bg-teal-50`}
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                          {course.status !== 'Archived' && can('btn:exams.archive') && (
                            <button
                              type="button"
                              aria-label={isArabic ? 'أرشفة' : 'Archive'}
                              title={isArabic ? 'أرشفة' : 'Archive'}
                              onClick={() => setConfirm({ course, action: 'archive' })}
                              disabled={busy}
                              className={`${iconBtnClass} text-amber-600 hover:bg-amber-50`}
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                          {can('btn:exams.delete') && (
                            <button
                              type="button"
                              aria-label={isArabic ? 'حذف' : 'Delete'}
                              title={isArabic ? 'حذف' : 'Delete'}
                              onClick={() => setConfirm({ course, action: 'delete' })}
                              disabled={busy}
                              className={`${iconBtnClass} text-red-600 hover:bg-red-50`}
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
          )}
        </>
      )}

      {/* ===== Exam picker modal (edit mode) ===== */}
      {pickerOpen && editor?.mode === 'edit' && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={() => !busy && setPickerOpen(false)}
        >
          <div
            className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={isArabic ? 'إضافة اختبار إلى الدورة' : 'Add exam to bundle'}
            style={{ boxShadow: 'var(--cms-shadow-xl)' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-5 border-b" style={{ borderColor: 'var(--cms-line)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                {isArabic ? 'إضافة اختبار من بنك المادة' : 'Add an exam from the subject bank'}
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label={isArabic ? 'إغلاق' : 'Close'}
                className="p-2 rounded-lg transition-colors hover:bg-slate-100"
                style={{ color: 'var(--cms-text-soft)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  placeholder={isArabic ? 'ابحث بعنوان الاختبار' : 'Search by exam title'}
                  className="w-full ps-10 pe-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="overflow-y-auto p-4 space-y-2" style={{ maxHeight: '50vh' }}>
              {pickerLoading ? (
                <div className="flex items-center justify-center py-10" style={{ color: 'var(--cms-text-muted)' }}>
                  <LoaderCircle className="w-5 h-5 animate-spin" />
                </div>
              ) : pickerExams.filter(exam => !bundledExamIds.has(exam.id)).length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--cms-text-muted)' }}>
                  {isArabic ? 'لا توجد اختبارات متاحة للإضافة — كل اختبارات المادة مضافة بالفعل.' : 'Nothing left to add — every subject exam is already in the bundle.'}
                </p>
              ) : (
                pickerExams.filter(exam => !bundledExamIds.has(exam.id)).map(exam => (
                  <div
                    key={exam.id}
                    className="flex items-center gap-3 p-3 rounded-lg border flex-wrap"
                    style={{ borderColor: 'var(--cms-line)' }}
                  >
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-sm font-medium leading-snug" style={{ color: 'var(--cms-text)' }}>{exam.titleAr}</div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                        <span>{exam.examType}</span>
                        <span>· {exam.totalQuestions} {isArabic ? 'سؤال' : 'questions'}</span>
                        <span>· {exam.durationMinutes} {isArabic ? 'دقيقة' : 'min'}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border ${statusBadgeClass(exam.status)}`}>
                          {statusLabel(exam.status, isArabic)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void addExamToBundle(exam.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-medium disabled:opacity-50 transition-colors"
                      style={{ background: 'var(--cms-teal-700)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {isArabic ? 'إضافة' : 'Add'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Preview modal (student storefront view) ===== */}
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={isArabic ? `معاينة: ${preview.nameAr}` : `Preview: ${preview.nameAr}`}
            style={{ boxShadow: 'var(--cms-shadow-xl)' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="min-w-0">
                <h3 className="font-semibold truncate" style={{ color: 'var(--cms-text)' }}>{preview.nameAr}</h3>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border ${courseTypeBadgeClass(preview.courseType)}`}>
                    {courseTypeLabel(preview.courseType, isArabic)}
                  </span>
                  <span>{preview.year} · {semesterLabel(preview.semester, isArabic)}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border ${preview.freeOrPaid
                    ? 'text-sky-700 bg-sky-50 border-sky-200'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}
                  >
                    {preview.freeOrPaid ? (isArabic ? 'مدفوع' : 'Paid') : (isArabic ? 'مجاني' : 'Free')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label={isArabic ? 'إغلاق' : 'Close'}
                className="p-2 rounded-lg transition-colors hover:bg-slate-100 shrink-0"
                style={{ color: 'var(--cms-text-soft)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              {preview.coverUrl && (
                <img
                  src={preview.coverUrl}
                  alt={isArabic ? 'غلاف الدورة' : 'Bundle cover'}
                  className="w-full h-40 object-cover rounded-lg border"
                  style={{ borderColor: 'var(--cms-line)' }}
                />
              )}
              {preview.description && (
                <p className="text-sm" style={{ color: 'var(--cms-text-soft)' }}>{preview.description}</p>
              )}
              <div>
                <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--cms-text)' }}>
                  {isArabic ? `اختبارات الدورة (${preview.items.length}) — بترتيب ظهورها للطالب` : `Bundle exams (${preview.items.length}) — in student order`}
                </h4>
                {preview.items.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: 'var(--cms-text-muted)' }}>
                    {isArabic ? 'لا توجد اختبارات في هذه الدورة بعد.' : 'No exams in this bundle yet.'}
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {preview.items.map((item, index) => (
                      <li key={item.itemId} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--cms-line)' }}>
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
                        >
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium leading-snug" style={{ color: 'var(--cms-text)' }}>{item.examTitleAr}</div>
                          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                            {item.examTotalQuestions} {isArabic ? 'سؤال' : 'questions'} · {item.examDurationMinutes} {isArabic ? 'دقيقة' : 'min'}
                            {item.modelLetter ? ` · ${isArabic ? 'نموذج' : 'Model'} ${item.modelLetter}` : ''}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </div>
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
                    ? (isArabic ? 'نشر الدورة الامتحانية' : 'Publish bundle')
                    : confirm.action === 'archive'
                    ? (isArabic ? 'أرشفة الدورة الامتحانية' : 'Archive bundle')
                    : (isArabic ? 'حذف الدورة الامتحانية' : 'Delete bundle')}
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--cms-text-soft)' }}>
                  {confirm.action === 'publish'
                    ? (isArabic ? 'ستصبح الدورة ظاهرة في متجر الطلاب حسب اشتراكاتهم.' : 'The bundle becomes visible in the student storefront per subscriptions.')
                    : confirm.action === 'archive'
                    ? (isArabic ? 'ستُخفى الدورة من قائمة الطلاب مع الحفاظ على بياناتها.' : 'The bundle is hidden from students; its data is preserved.')
                    : (isArabic ? 'هذا الإجراء دائم. سيُحذف محتوى الدورة من المتجر.' : 'This action is permanent. The bundle content is removed from the storefront.')}
                </p>
                <p className="text-sm font-medium mt-2 truncate" style={{ color: 'var(--cms-text)' }}>
                  "{confirm.course.nameAr}"
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end p-5">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
              >
                {isArabic ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const course = confirm.course;
                  const action = confirm.action;
                  setConfirm(null);
                  if (action === 'delete') void deleteCourse(course);
                  else void lifecycle(course, action);
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
