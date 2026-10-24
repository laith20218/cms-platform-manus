/**
 * LibraryCenter — institutional library & files management surface.
 *
 * Composition:
 *   • Page header with section title + live count badge + upload CTA
 *   • Academic hierarchy filter bar (university → college → year → semester →
 *     subject → lecture) in a responsive 6-column grid
 *   • Toolbar (search · status filter · refresh)
 *   • Responsive table (overflow-x-auto) with title (with type icon),
 *     type badge, subject, size, status badge, scan verdict badge,
 *     created date, and row actions (publish · archive · delete)
 *   • Slide-in upload panel from the right with sections:
 *       — File picker (with detected type + size hint)
 *       — Title + Type (side by side)
 *       — Subject + Lecture (side by side)
 *       — Description
 *       — XHR upload progress bar
 *   • Loading skeletons (6 rows with shimmer), empty state, custom
 *     delete-confirm modal with red tint
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling
 * is pure Tailwind utility classes.
 *
 * Functionality preserved (zero API regressions):
 *   • Academic hierarchy filters (universities → colleges → years →
 *     semesters → subjects → lectures) cascading on parent change
 *   • File list fetch — `/api/v1/admin/content/files?page=&pageSize=25`
 *     with optional `subjectId` / `status` / `search` params
 *   • Upload flow:
 *       1. POST /api/v1/library/upload-url — request presigned PUT URL
 *       2. PUT <presigned-url> — direct file upload via XHR w/ progress
 *       3. POST /api/v1/library/complete-upload — finalize (triggers scan)
 *   • Publish — POST /api/v1/library/{id}/publish
 *   • Archive — POST /api/v1/library/{id}/archive
 *   • Delete — DELETE /api/v1/library/{id}
 *   • File types: Pdf, Html, Image, Video, Audio, Summary, Comprehensive,
 *     Paragraph (contentTypeMap auto-detects from MIME on file selection)
 *   • XHR upload with progress reporting
 *   • Delete confirmation modal (custom, red tint)
 *   • Bilingual (ar / en) — every visible string has both forms
 *   • `dir="rtl|ltr"` applied on the section root for proper Arabic layout
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, CheckCircle2, FileText, FileImage, FileVideo,
  FileAudio, FileCode, Library, LoaderCircle, Plus, RefreshCw, Search,
  Trash2, Upload, X, Film,
} from 'lucide-react';
import { apiRequest, type PagedResult, type AdminLibraryFileListItem, type UploadUrlResponse } from '../lib/api';
import { useUiPermissions } from '../hooks/useUiPermissions';
import { CoursesCenter } from './CoursesCenter';

type University = { id: string; nameAr: string; nameEn?: string | null };
type College = { id: string; nameAr: string; nameEn?: string | null };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null };
type Semester = { id: string; nameAr: string; nameEn?: string | null };
type Subject = { id: string; nameAr: string; nameEn?: string | null };
type Lecture = { id: string; titleAr: string; titleEn?: string | null };
type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };

type UploadForm = {
  fileName: string;
  contentType: string;
  fileSize: number;
  subjectId: string;
  lectureId: string;
  type: 'Pdf' | 'Html' | 'Image' | 'Video' | 'Audio' | 'Summary' | 'Comprehensive' | 'Paragraph';
  title: string;
  description: string;
  category: '' | 'Curriculum' | 'Lecture' | 'Summary' | 'GoldenIdeas';
};

const emptyForm = (): UploadForm => ({
  fileName: '', contentType: 'application/pdf', fileSize: 0,
  subjectId: '', lectureId: '', type: 'Pdf', title: '', description: '', category: '',
});

const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null; titleAr?: string; titleEn?: string | null }) =>
  arabic ? (item.nameAr ?? item.titleAr ?? '') : (item.nameEn ?? item.titleEn ?? item.nameAr ?? item.titleAr ?? '');

const fileTypeIcon = (type: string) => {
  switch (type) {
    case 'Pdf': return FileText;
    case 'Image': return FileImage;
    case 'Video': return FileVideo;
    case 'Audio': return FileAudio;
    case 'Html': return FileCode;
    default: return FileText;
  }
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// === Badge tone helpers (Tailwind utility classes — no custom CSS) ===
// Type: Pdf=red, Html=sky, Image=violet, Video=amber, Audio=teal, default=slate.
const typeBadgeClass = (type: string) => {
  switch (type) {
    case 'Pdf': return 'text-red-700 bg-red-50 border-red-200';
    case 'Html': return 'text-sky-700 bg-sky-50 border-sky-200';
    case 'Image': return 'text-violet-700 bg-violet-50 border-violet-200';
    case 'Video': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Audio': return 'text-teal-700 bg-teal-50 border-teal-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

// Status: Published=emerald, Draft=slate, Archived=amber.
const statusBadgeClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'published') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'archived') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

// Scan verdict: Clean=emerald, Pending=sky, Infected=red, Error=amber.
const scanBadgeClass = (scan: string) => {
  const value = scan.toLowerCase();
  if (value === 'clean') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'pending') return 'text-sky-700 bg-sky-50 border-sky-200';
  if (value === 'infected') return 'text-red-700 bg-red-50 border-red-200';
  if (value === 'error') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const typeLabel = (type: string, isArabic: boolean) => {
  switch (type) {
    case 'Pdf': return isArabic ? 'ملف PDF' : 'PDF';
    case 'Html': return isArabic ? 'صفحة HTML' : 'HTML';
    case 'Image': return isArabic ? 'صورة' : 'Image';
    case 'Video': return isArabic ? 'فيديو' : 'Video';
    case 'Audio': return isArabic ? 'صوت' : 'Audio';
    case 'Summary': return isArabic ? 'ملخص' : 'Summary';
    case 'Comprehensive': return isArabic ? 'شامل' : 'Comprehensive';
    case 'Paragraph': return isArabic ? 'فقرة' : 'Paragraph';
    default: return type;
  }
};

const statusLabel = (status: string, isArabic: boolean) => {
  const value = status.toLowerCase();
  if (value === 'published') return isArabic ? 'منشور' : 'Published';
  if (value === 'archived') return isArabic ? 'مؤرشف' : 'Archived';
  return isArabic ? 'مسودة' : 'Draft';
};

const scanLabel = (scan: string, isArabic: boolean) => {
  const value = scan.toLowerCase();
  if (value === 'clean') return isArabic ? 'نظيف' : 'Clean';
  if (value === 'pending') return isArabic ? 'قيد الفحص' : 'Pending';
  if (value === 'infected') return isArabic ? 'مصاب' : 'Infected';
  if (value === 'error') return isArabic ? 'خطأ' : 'Error';
  return scan;
};

const contentTypeMap: Record<string, { type: UploadForm['type']; ct: string }> = {
  'application/pdf': { type: 'Pdf', ct: 'application/pdf' },
  'text/html': { type: 'Html', ct: 'text/html' },
  'image/png': { type: 'Image', ct: 'image/png' },
  'image/jpeg': { type: 'Image', ct: 'image/jpeg' },
  'image/gif': { type: 'Image', ct: 'image/gif' },
  'image/webp': { type: 'Image', ct: 'image/webp' },
  'video/mp4': { type: 'Video', ct: 'video/mp4' },
  'audio/mpeg': { type: 'Audio', ct: 'audio/mpeg' },
  'audio/wav': { type: 'Audio', ct: 'audio/wav' },
};

// Push 4: institutional category (منهاج/محاضرة/تلخيص/أفكار ذهبية) — backend-complete since A2-2,
// surfaced here for the first time. NULL/'' keeps legacy rows uncategorized.
const categoryLabel = (category: string | null | undefined, isArabic: boolean) => {
  switch (category) {
    case 'Curriculum': return isArabic ? 'منهاج' : 'Curriculum';
    case 'Lecture': return isArabic ? 'محاضرة' : 'Lecture';
    case 'Summary': return isArabic ? 'تلخيص' : 'Summary';
    case 'GoldenIdeas': return isArabic ? 'أفكار ذهبية' : 'Golden ideas';
    default: return isArabic ? 'غير مصنّف' : 'Uncategorized';
  }
};

const categoryBadgeClass = (category: string | null | undefined) => {
  switch (category) {
    case 'Curriculum': return 'text-teal-700 bg-teal-50 border-teal-200';
    case 'Lecture': return 'text-sky-700 bg-sky-50 border-sky-200';
    case 'Summary': return 'text-violet-700 bg-violet-50 border-violet-200';
    case 'GoldenIdeas': return 'text-amber-700 bg-amber-50 border-amber-200';
    default: return 'text-slate-500 bg-slate-50 border-slate-200';
  }
};

export function LibraryCenter({ token, isArabic, onError, onNotice }: Props) {
  // Push 3: cosmetic gating — the API policies remain the real boundary.
  const { can } = useUiPermissions();
  // Push 4: documents | courses tabs inside the Library center.
  const [activeTab, setActiveTab] = useState<'files' | 'courses'>('files');
  const [coursesRefresh, setCoursesRefresh] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
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
  const [lectureId, setLectureId] = useState('');

  const [files, setFiles] = useState<AdminLibraryFileListItem[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<UploadForm>(emptyForm());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<AdminLibraryFileListItem | null>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);

  // Load academic hierarchy
  useEffect(() => {
    void request<PagedResult<University>>('/api/v1/universities?Page=1&PageSize=100')
      .then(data => setUniversities(data.items))
      .catch(error => onError(error instanceof Error ? error.message : 'تعذر تحميل الجامعات.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!universityId) { setColleges([]); setCollegeId(''); return; }
    void request<College[]>(`/api/v1/universities/${universityId}/colleges`)
      .then(data => setColleges(Array.isArray(data) ? data : []))
      .catch(() => setColleges([]));
    setCollegeId(''); setYears([]); setYearId(''); setSemesters([]); setSemesterId(''); setSubjects([]); setSubjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityId]);

  useEffect(() => {
    if (!collegeId) { setYears([]); setYearId(''); return; }
    void request<AcademicYear[]>(`/api/v1/colleges/${collegeId}/years`)
      .then(data => setYears(Array.isArray(data) ? data : []))
      .catch(() => setYears([]));
    setYearId(''); setSemesters([]); setSemesterId(''); setSubjects([]); setSubjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId]);

  useEffect(() => {
    if (!yearId) { setSemesters([]); setSemesterId(''); return; }
    void request<Semester[]>(`/api/v1/years/${yearId}/semesters`)
      .then(data => setSemesters(Array.isArray(data) ? data : []))
      .catch(() => setSemesters([]));
    setSemesterId(''); setSubjects([]); setSubjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  useEffect(() => {
    if (!semesterId) { setSubjects([]); setSubjectId(''); return; }
    void request<Subject[]>(`/api/v1/semesters/${semesterId}/subjects`)
      .then(data => setSubjects(Array.isArray(data) ? data : []))
      .catch(() => setSubjects([]));
    setSubjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterId]);

  useEffect(() => {
    if (!subjectId) { setLectures([]); setLectureId(''); return; }
    // Admin lecture listing lives under /admin/content (the student-facing
    // /subjects/{id}/lectures route requires a student entitlement).
    void request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${subjectId}/lectures`)
      .then(data => setLectures(Array.isArray(data) ? data : []))
      .catch(() => setLectures([]));
    setLectureId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  // Load files
  const loadFiles = async (targetPage = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(targetPage), pageSize: '25' });
    if (subjectId) params.set('subjectId', subjectId);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (query.trim()) params.set('search', query.trim());
    try {
      const data = await request<PagedResult<AdminLibraryFileListItem>>(`/api/v1/admin/content/files?${params.toString()}`);
      setFiles(data.items);
      setPage(targetPage);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل الملفات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subjectId || statusFilter || query || categoryFilter) void loadFiles(1);
    else { setFiles([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, statusFilter, categoryFilter]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const detected = contentTypeMap[file.type] ?? { type: 'Pdf' as const, ct: file.type || 'application/octet-stream' };
    setForm(f => ({
      ...f,
      fileName: file.name,
      contentType: detected.ct,
      fileSize: file.size,
      type: detected.type,
      title: f.title || file.name.replace(/\.[^.]+$/, ''),
    }));
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !form.subjectId || !form.title) {
      onError('الرجاء اختيار ملف ومادة وعنوان.');
      return;
    }
    setBusy(true);
    setUploadProgress(0);
    try {
      // 1. Request presigned PUT URL
      const uploadUrlResp = await request<UploadUrlResponse>('/api/v1/library/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: form.fileName,
          contentType: form.contentType,
          fileSize: form.fileSize,
          subjectId: form.subjectId,
          lectureId: form.lectureId || null,
          type: form.type,
          title: form.title,
          description: form.description || null,
          category: form.category || null,
        }),
      });

      // 2. Upload file directly to storage via presigned PUT
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        });
        xhr.addEventListener('load', () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: HTTP ${xhr.status}`)));
        xhr.addEventListener('error', () => reject(new Error('Upload network error')));
        xhr.open('PUT', uploadUrlResp.uploadUrl);
        xhr.setRequestHeader('Content-Type', form.contentType);
        xhr.send(selectedFile);
      });

      // 3. Complete upload (triggers scan + marks as Clean via TrustedFileScanner)
      await request<unknown>(`/api/v1/library/complete-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: uploadUrlResp.fileId,
          fileKey: uploadUrlResp.fileKey,
          actualFileSize: form.fileSize,
          pagesCount: null,
          durationSeconds: null,
          youtubeVideoId: null,
        }),
      });

      onNotice(`تم رفع الملف "${form.title}" بنجاح.`);
      closeUpload();
      await loadFiles(1);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'فشل رفع الملف.');
      setUploadProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async (file: AdminLibraryFileListItem) => {
    setBusy(true);
    try {
      await request<unknown>(`/api/v1/library/${file.id}/publish`, { method: 'POST' });
      onNotice(`تم نشر الملف "${file.title}".`);
      await loadFiles(page);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'فشل نشر الملف.');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (file: AdminLibraryFileListItem) => {
    setBusy(true);
    try {
      await request<unknown>(`/api/v1/library/${file.id}/archive`, { method: 'POST' });
      onNotice(`تمت أرشفة الملف "${file.title}".`);
      await loadFiles(page);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'فشلت أرشفة الملف.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (file: AdminLibraryFileListItem) => {
    setBusy(true);
    try {
      await request<unknown>(`/api/v1/library/${file.id}`, { method: 'DELETE' });
      onNotice(`تم حذف الملف "${file.title}".`);
      setConfirmDelete(null);
      await loadFiles(page);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'فشل حذف الملف.');
    } finally {
      setBusy(false);
    }
  };

  function closeUpload() {
    setShowUpload(false);
    setForm(emptyForm());
    setSelectedFile(null);
    setUploadProgress(0);
  }

  const copy = useMemo(() => isArabic ? {
    eyebrow: 'إدارة المحتوى الرقمي',
    title: 'مركز المكتبة والملفات',
    desc: 'إدارة ملفات المكتبة الرقمية: رفع، نشر، أرشفة، حذف.',
    selectUniversity: 'الجامعة', selectCollege: 'الكلية', selectYear: 'السنة', selectSemester: 'الفصل', selectSubject: 'المادة', selectLecture: 'المحاضرة',
    search: 'ابحث بالعنوان', filterStatus: 'الحالة', all: 'الكل',
    addFile: 'رفع ملف', refresh: 'تحديث', loading: 'جارٍ التحميل…',
    upload: 'رفع ملف جديد', fileToUpload: 'الملف', title_ar: 'العنوان', description: 'الوصف', type: 'النوع', submit: 'رفع', cancel: 'إلغاء',
    progress: 'التقدم', uploading: 'جارٍ الرفع…',
    status: 'الحالة', scanStatus: 'الفحص', size: 'الحجم', subject: 'المادة', created: 'تاريخ الإنشاء', actions: 'إجراءات',
    publish: 'نشر', archive: 'أرشفة', delete: 'حذف', deleteTitle: 'تأكيد الحذف', deleteText: 'هذا الإجراء دائم. سيُحذف الملف من التخزين والقاعدة.',
    confirmDelete: 'حذف نهائي', close: 'إغلاق',
    noFiles: 'لا توجد ملفات مطابقة.',
    noSubject: 'اختر مادة لعرض ملفاتها.',
    noSubjectHint: 'التدرج الأكاديمي أعلاه يقودك من الجامعة إلى المادة.',
    noFilesHint: 'جرّب تعديل التصفية أو الكلمة المفتاحية.',
    selectFile: 'اختر ملفاً', fillRequired: 'الرجاء اختيار ملف ومادة وعنوان',
    selectSubjectForm: 'اختر المادة', selectLectureForm: 'على مستوى المادة',
  } : {
    eyebrow: 'Digital content management',
    title: 'Library & Files Center', desc: 'Manage library files: upload, publish, archive, delete.',
    selectUniversity: 'University', selectCollege: 'College', selectYear: 'Year', selectSemester: 'Semester', selectSubject: 'Subject', selectLecture: 'Lecture',
    search: 'Search by title', filterStatus: 'Status', all: 'All',
    addFile: 'Upload file', refresh: 'Refresh', loading: 'Loading…',
    upload: 'Upload new file', fileToUpload: 'File', title_ar: 'Title', description: 'Description', type: 'Type', submit: 'Upload', cancel: 'Cancel',
    progress: 'Progress', uploading: 'Uploading…',
    status: 'Status', scanStatus: 'Scan', size: 'Size', subject: 'Subject', created: 'Created', actions: 'Actions',
    publish: 'Publish', archive: 'Archive', delete: 'Delete', deleteTitle: 'Confirm delete', deleteText: 'This is permanent. The file will be removed from storage and database.',
    confirmDelete: 'Delete permanently', close: 'Close',
    noFiles: 'No matching files.',
    noSubject: 'Select a subject to view its files.',
    noSubjectHint: 'The hierarchy above leads from university down to subject.',
    noFilesHint: 'Try adjusting the filters or search keywords.',
    selectFile: 'Choose file', fillRequired: 'Please select a file, subject, and title',
    selectSubjectForm: 'Select subject', selectLectureForm: 'Subject-level',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArabic]);

  const dir = isArabic ? 'rtl' : 'ltr';
  const hasFilters = Boolean(subjectId || statusFilter || query);

  return (
    <section className="space-y-6" dir={dir}>
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl"
            style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
          >
            <Library className="w-6 h-6" />
          </div>
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--cms-text-muted)' }}
            >
              {copy.eyebrow}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {copy.title}
              {activeTab === 'files' && files.length > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                  style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
                >
                  {files.length}
                </span>
              )}
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {copy.desc}
            </p>
          </div>
        </div>
        {can('btn:library.upload') && activeTab === 'files' && (
          <button
            type="button"
            onClick={() => { if (!showUpload) { setForm(emptyForm()); setSelectedFile(null); setUploadProgress(0); } setShowUpload(v => !v); }}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
          style={{ background: 'var(--cms-teal-700)' }}
          onMouseEnter={(event) => { if (!busy) event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
          onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
        >
          <Plus className="w-4 h-4" /> {copy.addFile}
        </button>
        )}
      </header>

      {/* ===== Push 4: documents | courses tab bar ===== */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--cms-line)' }} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'files'}
          onClick={() => setActiveTab('files')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'files' ? 'border-teal-600 text-teal-700' : 'border-transparent'}`}
          style={activeTab === 'files' ? undefined : { color: 'var(--cms-text-muted)' }}
        >
          <Library className="w-4 h-4" />
          {isArabic ? 'الملفات' : 'Documents'}
        </button>
        {can('tab:library.courses') && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'courses'}
            onClick={() => { setActiveTab('courses'); setCoursesRefresh(n => n + 1); }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'courses' ? 'border-teal-600 text-teal-700' : 'border-transparent'}`}
            style={activeTab === 'courses' ? undefined : { color: 'var(--cms-text-muted)' }}
          >
            <Film className="w-4 h-4" />
            {isArabic ? 'الكورسات' : 'Courses'}
          </button>
        )}
      </div>

      {/* ===== Academic hierarchy filter bar ===== */}
      <div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4 rounded-xl border"
        style={{ background: 'var(--cms-ivory-100)', borderColor: 'var(--cms-line)' }}
      >
        {[
          { label: copy.selectUniversity, value: universityId, onChange: setUniversityId, items: universities, disabled: false },
          { label: copy.selectCollege, value: collegeId, onChange: setCollegeId, items: colleges, disabled: !universityId },
          { label: copy.selectYear, value: yearId, onChange: setYearId, items: years, disabled: !collegeId },
          { label: copy.selectSemester, value: semesterId, onChange: setSemesterId, items: semesters, disabled: !yearId },
          { label: copy.selectSubject, value: subjectId, onChange: setSubjectId, items: subjects, disabled: !semesterId },
          // The lecture level only applies to documents; courses are subject-scoped.
          ...(activeTab === 'files' ? [{ label: copy.selectLecture, value: lectureId, onChange: setLectureId, items: lectures, disabled: !subjectId }] : []),
        ].map((field) => (
          <label key={field.label} className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
              {field.label}
            </span>
            <select
              value={field.value}
              disabled={field.disabled}
              onChange={(event) => field.onChange(event.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            >
              <option value="">{field.label}</option>
              {field.items.map(item => (
                <option key={item.id} value={item.id}>{label(isArabic, item)}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {activeTab === 'files' ? (<>
      {/* ===== Toolbar ===== */}
      <div
        className="flex flex-wrap gap-3 items-center p-4 rounded-xl border bg-white"
        style={{ borderColor: 'var(--cms-line)' }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void loadFiles(1)}
            placeholder={copy.search}
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
          <option value="">{copy.filterStatus}: {copy.all}</option>
          <option value="Draft">{isArabic ? 'مسودة' : 'Draft'}</option>
          <option value="Published">{isArabic ? 'منشور' : 'Published'}</option>
          <option value="Archived">{isArabic ? 'مؤرشف' : 'Archived'}</option>
        </select>
        {/* Push 4: institutional category filter (منهاج/محاضرة/تلخيص/أفكار ذهبية). */}
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{isArabic ? 'التصنيف: الكل' : 'Category: All'}</option>
          <option value="Curriculum">{isArabic ? 'منهاج' : 'Curriculum'}</option>
          <option value="Lecture">{isArabic ? 'محاضرة' : 'Lecture'}</option>
          <option value="Summary">{isArabic ? 'تلخيص' : 'Summary'}</option>
          <option value="GoldenIdeas">{isArabic ? 'أفكار ذهبية' : 'Golden ideas'}</option>
        </select>
        <button
          type="button"
          onClick={() => void loadFiles(page)}
          disabled={busy || !hasFilters}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          onMouseEnter={(event) => { if (!busy && hasFilters) { event.currentTarget.style.background = 'var(--cms-ivory-100)'; } }}
          onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
        >
          <RefreshCw className="w-4 h-4" /> {copy.refresh}
        </button>
      </div>

      {/* ===== Files list ===== */}
      {loading ? (
        <div className="rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex items-center gap-4">
                <div className="h-4 w-4 rounded bg-slate-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 rounded bg-slate-100 animate-pulse w-1/3" />
                  <div className="flex gap-2">
                    <div className="h-5 w-14 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                  </div>
                </div>
                <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
                <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
                <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
                <div className="h-8 w-16 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : files.length === 0 ? (
        <div
          className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
            <Library className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
            {hasFilters ? copy.noFiles : copy.noSubject}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {hasFilters ? copy.noFilesHint : copy.noSubjectHint}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
              <tr>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.title_ar}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.type}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'التصنيف' : 'Category'}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.subject}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.size}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.status}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.scanStatus}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.created}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">
                  <span className="sr-only">{copy.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
              {files.map(file => {
                const Icon = fileTypeIcon(file.type);
                return (
                  <tr key={file.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-text-muted)' }} />
                        <span className="font-medium leading-snug line-clamp-2" style={{ color: 'var(--cms-text)' }}>
                          {file.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${typeBadgeClass(file.type)}`}>
                        {typeLabel(file.type, isArabic)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${categoryBadgeClass(file.category)}`}>
                        {categoryLabel(file.category, isArabic)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {file.subjectNameAr}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--cms-text-muted)' }}>
                        {formatBytes(file.fileSize)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(file.status)}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        {statusLabel(file.status, isArabic)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${scanBadgeClass(file.virusScanStatus)}`}>
                        {scanLabel(file.virusScanStatus, isArabic)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                      {new Date(file.createdAt).toLocaleDateString(isArabic ? 'ar' : 'en')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {file.status === 'Draft' && file.virusScanStatus === 'Clean' && can('btn:library.publish') && (
                          <button
                            type="button"
                            onClick={() => void handlePublish(file)}
                            disabled={busy}
                            title={copy.publish}
                            className="p-1.5 rounded-md text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {file.status === 'Published' && can('btn:library.archive') && (
                          <button
                            type="button"
                            onClick={() => void handleArchive(file)}
                            disabled={busy}
                            title={copy.archive}
                            className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        {can('btn:library.delete') && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(file)}
                            disabled={busy}
                            title={copy.delete}
                            className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </>) : (
        /* Push 4: the Courses tab shares the academic cascade (subject scope) above. */
        <CoursesCenter
          token={token} isArabic={isArabic} onError={onError} onNotice={onNotice}
          subjectId={subjectId} refreshSignal={coursesRefresh}
        />
      )}

      {/* ===== Slide-in upload panel ===== */}
      {showUpload && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onMouseDown={() => !busy && closeUpload()}
            role="presentation"
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md lg:max-w-xl bg-white shadow-2xl overflow-y-auto"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
            style={{ boxShadow: 'var(--cms-shadow-xl)' }}
          >
            <form onSubmit={handleUpload} className="flex flex-col min-h-full">
              {/* Panel header */}
              <div
                className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b backdrop-blur"
                style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface-glass)' }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                    {copy.upload}
                  </p>
                  <h3 className="text-base font-bold truncate" style={{ color: 'var(--cms-text)' }}>
                    {isArabic ? 'رفع ملف جديد' : 'New file upload'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeUpload}
                  disabled={busy}
                  className="p-1.5 rounded-md transition-colors disabled:opacity-50"
                  style={{ color: 'var(--cms-text-muted)' }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-ivory-200)'; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Panel body */}
              <div className="flex-1 px-5 py-4 space-y-5">
                {/* File picker */}
                <label className="block">
                  <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                    {copy.fileToUpload}
                  </span>
                  <div
                    className="rounded-lg border p-4"
                    style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                  >
                    <input
                      type="file"
                      onChange={(event) => event.target.files?.[0] && handleFileSelect(event.target.files[0])}
                      className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-white file:font-medium file:cursor-pointer file:transition-colors"
                      style={{ accentColor: 'var(--cms-teal-700)' }}
                    />
                    {selectedFile && (
                      <p className="mt-2 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                        {selectedFile.name} • {formatBytes(selectedFile.size)}
                      </p>
                    )}
                  </div>
                </label>

                {/* Title + Type (side by side) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {copy.title_ar}
                    </span>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(event) => setForm(f => ({ ...f, title: event.target.value }))}
                      required
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {copy.type}
                    </span>
                    <select
                      value={form.type}
                      onChange={(event) => setForm(f => ({ ...f, type: event.target.value as UploadForm['type'] }))}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    >
                      {(['Pdf', 'Html', 'Image', 'Video', 'Audio', 'Summary', 'Comprehensive', 'Paragraph'] as const).map(t => (
                        <option key={t} value={t}>{typeLabel(t, isArabic)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Subject + Lecture (side by side) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {copy.selectSubject}
                    </span>
                    <select
                      value={form.subjectId}
                      onChange={(event) => setForm(f => ({ ...f, subjectId: event.target.value, lectureId: '' }))}
                      disabled={!subjects.length}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    >
                      <option value="">{copy.selectSubjectForm}</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{label(isArabic, s)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {copy.selectLecture}
                    </span>
                    <select
                      value={form.lectureId}
                      onChange={(event) => setForm(f => ({ ...f, lectureId: event.target.value }))}
                      disabled={!form.subjectId || !lectures.length}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    >
                      <option value="">{copy.selectLectureForm}</option>
                      {lectures.map(l => (
                        <option key={l.id} value={l.id}>{label(isArabic, l)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Push 4: institutional category (منهاج/محاضرة/تلخيص/أفكار ذهبية) */}
                <label className="block">
                  <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                    {isArabic ? 'التصنيف' : 'Category'}
                  </span>
                  <select
                    value={form.category}
                    onChange={(event) => setForm(f => ({ ...f, category: event.target.value as UploadForm['category'] }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  >
                    <option value="">{isArabic ? 'غير مصنّف' : 'Uncategorized'}</option>
                    <option value="Curriculum">{isArabic ? 'منهاج' : 'Curriculum'}</option>
                    <option value="Lecture">{isArabic ? 'محاضرة' : 'Lecture'}</option>
                    <option value="Summary">{isArabic ? 'تلخيص' : 'Summary'}</option>
                    <option value="GoldenIdeas">{isArabic ? 'أفكار ذهبية' : 'Golden ideas'}</option>
                  </select>
                </label>

                {/* Description */}
                <label className="block">
                  <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                    {copy.description}
                  </span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) => setForm(f => ({ ...f, description: event.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  />
                </label>

                {/* Upload progress */}
                {uploadProgress > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      <span>{copy.uploading}</span>
                      <span className="font-semibold tabular-nums">{uploadProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--cms-ivory-200)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${uploadProgress}%`, background: 'var(--cms-teal-500)' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action bar */}
              <div
                className="sticky bottom-0 flex items-center gap-2 justify-end px-5 py-3 border-t bg-white"
                style={{ borderColor: 'var(--cms-line)' }}
              >
                <button
                  type="button"
                  onClick={closeUpload}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  disabled={busy || !selectedFile || !form.subjectId || !form.title}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ background: 'var(--cms-teal-700)' }}
                  onMouseEnter={(event) => { if (!busy) event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
                >
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {copy.submit}
                </button>
              </div>
            </form>
          </aside>
        </>
      )}

      {/* ===== Delete confirmation modal ===== */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={() => !busy && setConfirmDelete(null)}
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
                style={{ background: 'var(--cms-danger-50)', color: 'var(--cms-danger)' }}
              >
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                  {copy.deleteTitle}
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--cms-text-soft)' }}>
                  {copy.deleteText}
                </p>
                <p className="text-sm font-medium mt-2 truncate" style={{ color: 'var(--cms-text)' }}>
                  &ldquo;{confirmDelete.title}&rdquo;
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end p-5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(confirmDelete)}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--cms-danger)' }}
                onMouseEnter={(event) => { if (!busy) event.currentTarget.style.background = '#9c3a31'; }}
                onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-danger)'; }}
              >
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {copy.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
