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
 *       3. POST /api/v1/library/complete-upload — finalize (triggers scan +
 *          Wave 11.9: application/pdf enqueues the Ghostscript font pass)
 *       4. GET /api/v1/admin/content/files poll (3s) — the R22.5.2 FIVE-STEP
 *          literal timeline: رفع الملف → فحص سلامة الملف → دمج وإصلاح الخطوط
 *          (Arabic) → تحليل جودة العرض → جاهز (+ the health badge: green
 *          «ملف سليم البنية 100%» | yellow «ملف به مشاكل في النص، تم تفعيل
 *          وضع العرض الاحتياطي») | Failed (+ ProcessingErrorModal, Push 10.4
 *          pattern). The panel STAYS OPEN on Ready so the badge stays visible.
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
  AlertTriangle, Archive, CheckCircle2, FileText, FileImage, FileVideo,
  FileAudio, FileCode, HelpCircle, Images, Library, LoaderCircle, MonitorPlay, Plus,
  Pencil, RefreshCw, Search, ShieldCheck, Trash2, Upload, X, Film,
} from 'lucide-react';
import { ConfirmDialog, Dialog, Pagination, RowActionsMenu } from '@cms/ui';
import { HardDeleteDialog, type HardDeleteTarget } from './HardDeleteDialog';
import { apiRequest, type PagedResult, type AdminLibraryFileListItem, type UploadUrlResponse } from '../lib/api';
import { isPdfProcessingActive, pdfHealthBadge, pdfTimelineSteps } from '../lib/mediaProcessing';
import { ProcessingErrorModal } from './ProcessingErrorModal';
import { useUiPermissions } from '../hooks/uiPermissionsContext';
import { CoursesCenter } from './CoursesCenter';
// PR-3 — every inline bilingual string resolves through the shared dictionary
// (`lib/dictionary/library.ts`); wire-status labels resolve through the central
// status registry (libraryType/libraryScan/libraryCategory/publication/
// mediaProtection domains — byte-identical to the legacy local helpers).
import { t, localeOf, statusLabel as registryLabel } from '../lib/dictionary';

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
  /** Wave 13 (F3/Q1) — trusted interactive lesson flag; only honored by the
   *  backend for text/html rows. Defaults ON (the common case for our lessons). */
  enableScripts: boolean;
};

const emptyForm = (): UploadForm => ({
  fileName: '', contentType: 'application/pdf', fileSize: 0,
  subjectId: '', lectureId: '', type: 'Pdf', title: '', description: '', category: '',
  enableScripts: true,
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

// ===== Wave 11.9 — Ghostscript poll cadence (CoursesCenter 10.4 precedent:
// 3-second interval + 15-minute watchdog so a wedged pipeline can't poll forever).
const PDF_POLL_INTERVAL_MS = 3000;
const PDF_POLL_TIMEOUT_MS = 15 * 60 * 1000;
// R22.5.2 — the step-4 beat: «جاري تحليل جودة العرض...» spins briefly after
// Ready lands before the health badge settles (a transition, not a phase).
const PDF_QUALITY_STEP_MS = 900;

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

// Wave 13 (F3) — HTML pipeline badge: Ready=emerald, Failed=red, in-flight=sky.
const contentStatusBadgeClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'ready') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'failed') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-sky-700 bg-sky-50 border-sky-200';
};

// PR-3 — the HTML pipeline labels resolve through the `mediaProtection` registry
// domain; unknown wire values pass through verbatim, exactly as the legacy
// switch default did.
const contentStatusLabel = (status: string, isArabic: boolean) =>
  registryLabel(localeOf(isArabic), 'mediaProtection', status);

// Wave 13 (F3/G-6) — client-side mirror of the server's code-level hard cap:
// text/html uploads above 20 MB are blocked BEFORE any presigned URL is requested
// (13.A.2: the oversized pick still enters the drawer so the size meter can show
// its red state — the disabled submit button + the handleUpload guard keep the
// presign endpoint unreachable for it).
const HTML_MAX_MB = 20;

// 13.A.2 — an HTML lesson pick (MIME or extension; .html downloads often arrive
// as application/octet-stream, so the extension is the real gate).
const isHtmlFile = (file: File) =>
  file.type === 'text/html' || file.name.toLowerCase().endsWith('.html');

// 13.A.2 — HTML pipeline activity, the mirror of isPdfProcessingActive: the three
// in-flight states; Ready/Failed/null are terminal-or-absent.
const isHtmlProcessingActive = (status: string | null | undefined) =>
  status === 'Pending' || status === 'Sanitized' || status === 'CSPApplied';

// 13.A.2 (D) — the four literal HTML stages (amendment wording):
// رفع → تعقيم → حقن حماية CSP → جاهز. Same skeleton as PDF_TIMELINE_STEPS;
// states derive from the row's contentProcessingStatus (3s poll, shared).
const HTML_TIMELINE_STEPS = [
  { key: 'upload', labelAr: 'جاري رفع الملف...', labelEn: 'Uploading the file…' },
  { key: 'sanitize', labelAr: 'جاري تعقيم المحتوى...', labelEn: 'Sanitizing the content…' },
  { key: 'csp', labelAr: 'جاري حقن حماية CSP...', labelEn: 'Injecting the CSP shield…' },
  { key: 'ready', labelAr: 'جاهز ومتاح للطلاب ✅', labelEn: 'Ready and available to students ✅' },
] as const;

type HtmlStepState = 'done' | 'active' | 'failed' | 'pending';
type HtmlTimelineStep = (typeof HTML_TIMELINE_STEPS)[number] & { state: HtmlStepState };

/**
 * 13.A.2 (D) — derives the four HTML step states from ContentProcessingStatus:
 *  • upload   — the local XHR (active while uploadInFlight; done afterwards);
 *  • sanitize — Pending (or not-yet-polled) → active; done once Sanitized+;
 *  • csp      — Sanitized → active; done once CSPApplied/Ready;
 *  • ready    — CSPApplied → active (the ready-swap beat); done at Ready.
 * On Failed, the first substantive stage (sanitize) AND the ready step turn red —
 * the same convention the PDF timeline uses (the DTO exposes no per-stage failure
 * detail; the error modal carries the human sentence). DISCLOSED in the worklog.
 */
const htmlTimelineSteps = (uploadInFlight: boolean, status: string | null | undefined): HtmlTimelineStep[] => {
  const failed = status === 'Failed';
  const ready = status === 'Ready';
  const cspApplied = status === 'CSPApplied';
  const sanitized = status === 'Sanitized';
  const sanitizeSettled = sanitized || cspApplied || ready;
  const sanitizeActive = !uploadInFlight && !sanitizeSettled && !failed;
  return HTML_TIMELINE_STEPS.map((step) => {
    switch (step.key) {
      case 'upload':
        return { ...step, state: uploadInFlight ? 'active' : 'done' };
      case 'sanitize':
        return { ...step, state: uploadInFlight ? 'pending' : sanitizeSettled ? 'done' : sanitizeActive ? 'active' : 'failed' };
      case 'csp':
        return { ...step, state: ready || cspApplied ? 'done' : sanitized ? 'active' : 'pending' };
      case 'ready':
      default:
        return { ...step, state: ready ? 'done' : failed ? 'failed' : cspApplied ? 'active' : 'pending' };
    }
  });
};

// PR-3 — the `libraryType` registry domain (exact-case keys, unknown passes
// through raw) matches the legacy switch byte-for-byte.
const typeLabel = (type: string, isArabic: boolean) =>
  registryLabel(localeOf(isArabic), 'libraryType', type);

// PR-3 — legacy contract kept byte-identical: ANY value other than
// published/archived (draft included) renders the Draft label, so the
// publication registry's «Unspecified» never leaks onto this surface.
const statusLabel = (status: string, isArabic: boolean) => {
  const value = status.toLowerCase();
  if (value === 'published' || value === 'archived') {
    return registryLabel(localeOf(isArabic), 'publication', value);
  }
  return registryLabel(localeOf(isArabic), 'publication', 'draft');
};

// PR-3 — the `libraryScan` registry domain (lower-cased keys, unknown passes
// through the raw wire value) matches the legacy switch byte-for-byte.
const scanLabel = (scan: string, isArabic: boolean) =>
  registryLabel(localeOf(isArabic), 'libraryScan', scan);

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
// PR-3 — the `libraryCategory` registry domain (exact-case keys, unknown →
// «غير مصنّف»/«Uncategorized») matches the legacy switch byte-for-byte.
const categoryLabel = (category: string | null | undefined, isArabic: boolean) =>
  registryLabel(localeOf(isArabic), 'libraryCategory', category);

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
  // PR-3 — dictionary locale derived from the legacy bilingual flag.
  const locale = localeOf(isArabic);
  // Push 3: cosmetic gating — the API policies remain the real boundary.
  const { can, bundle } = useUiPermissions();
  // Command Center P1: hard delete is a SuperAdmin-only system action (backend-gated too).
  const isSuperAdmin = bundle?.isSuperAdmin ?? false;
  const [hardTarget, setHardTarget] = useState<HardDeleteTarget | null>(null);
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
  // W2 (admin-ui): server-side total feeds the shared pager — the previous
  // fixed pageSize=25 without controls made rows 26+ unreachable (debt D-19).
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<UploadForm>(emptyForm());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<AdminLibraryFileListItem | null>(null);
  // W-coverage (row 21): metadata edit (PUT /library/{id} — existed with no UI).
  const [editTarget, setEditTarget] = useState<AdminLibraryFileListItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editLectureId, setEditLectureId] = useState('');
  const [editDifficulty, setEditDifficulty] = useState('');
  const [editTargetQuality, setEditTargetQuality] = useState('');
  // W2 (admin-ui): publish/archive were single-click, NO confirmation (debt
  // D-07/D-08) — one click made content student-visible/hidden. Now gated by
  // an explicit ConfirmDialog with consequence text.
  const [publishTarget, setPublishTarget] = useState<AdminLibraryFileListItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminLibraryFileListItem | null>(null);
  // Wave 11.9 — the file id the upload panel tracks through the Ghostscript
  // pipeline + the failure modal payload (raw GS stderr tail).
  const [trackingFileId, setTrackingFileId] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  // R22.5.2 — the local XHR phase feeds timeline step 1 («جاري رفع الملف...");
  // qualityChecking is the step-4 beat (brief spinner before the badge settles).
  const [uploadInFlight, setUploadInFlight] = useState(false);
  const [qualityChecking, setQualityChecking] = useState(false);
  // 13.A.2 — which pipeline the tracking panel walks ('pdf' Ghostscript | 'html'
  // sanitize+CSP); set at submit, cleared on close.
  const [trackingKind, setTrackingKind] = useState<'pdf' | 'html' | null>(null);
  // 13.A.2 (A) — live LOCAL preview of the picked HTML file (FileReader → srcDoc;
  // never uploaded, never sent anywhere — the note under the frame says so).
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [htmlPreviewLoading, setHtmlPreviewLoading] = useState(false);

  // 13.A.2 (C) — the size validator state: true only for HTML picks above the
  // G-6 hard cap (disables submit; the meter shows the red state).
  const htmlTooLarge = selectedFile != null && isHtmlFile(selectedFile)
    && selectedFile.size > HTML_MAX_MB * 1024 * 1024;
  // R22.3 — the failure modal payload: the human sentence, the raw technical
  // evidence, and the backend's diagnosticReport (الخط الأصلي... report).
  const [fontErrorModal, setFontErrorModal] = useState<{
    human: string | null; technical: string | null; diagnostic: string | null;
  } | null>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);

  // Load academic hierarchy
  useEffect(() => {
    void request<PagedResult<University>>('/api/v1/universities?Page=1&PageSize=100')
      .then(data => setUniversities(data.items))
      .catch(error => onError(error instanceof Error ? error.message : t(locale, 'library.errors.loadUniversities')));
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
      setTotal(data.total);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'library.errors.loadFiles'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subjectId || statusFilter || query || categoryFilter) void loadFiles(1);
    else { setFiles([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, statusFilter, categoryFilter]);

  // ===== Wave 11.9 — Ghostscript processing tracker =====
  // complete-upload no longer closes the panel: the uploaded row is tracked
  // through the admin list (the fresh file is the newest row on page 1) until
  // the Ghostscript pipeline resolves Ready | Failed.
  const trackedFile = useMemo(
    () => files.find((file) => file.id === trackingFileId) ?? null,
    [files, trackingFileId],
  );
  const trackingStatus = trackedFile?.pdfProcessingStatus;
  const htmlTrackingStatus = trackedFile?.contentProcessingStatus;
  // 13.A.2 — kind-aware activity gate: the shared 3s poller runs for whichever
  // pipeline the submitted row belongs to (PDF Ghostscript | HTML sanitize+CSP).
  const trackingActive = trackingFileId != null && (
    trackingKind === 'pdf' ? isPdfProcessingActive(trackingStatus)
      : trackingKind === 'html' ? isHtmlProcessingActive(htmlTrackingStatus)
        : false
  );

  // R22.5.2 — the tracked row left the visible list (filter change / refresh
  // race) while tracking: stop the poller + hide the timeline instead of letting
  // the 15-minute watchdog spin on an unobservable row (the panel stays open;
  // the R22.5.2 timeline now SURVIVES Ready by design, so this can happen).
  useEffect(() => {
    if (trackingFileId != null && !uploadInFlight && trackedFile == null) {
      setTrackingFileId(null);
      setPollTimedOut(false);
    }
  }, [trackingFileId, trackedFile, uploadInFlight]);

  // Poll every 3s while the pipeline runs (CoursesCenter pattern + watchdog).
  useEffect(() => {
    if (!trackingActive || pollTimedOut) return;
    const id = window.setInterval(() => { void loadFiles(1); }, PDF_POLL_INTERVAL_MS);
    const watchdog = window.setTimeout(() => setPollTimedOut(true), PDF_POLL_TIMEOUT_MS);
    return () => { window.clearInterval(id); window.clearTimeout(watchdog); };
    // The refresh targets page 1 explicitly; re-creating the interval on filter
    // changes is unnecessary (loadFiles closes over the current filters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingActive, pollTimedOut]);

  // R22.5.2 — the step-4 beat: once Ready lands the quality step spins briefly,
  // then the health badge settles (deterministic, timer-driven).
  useEffect(() => {
    if (!qualityChecking) return;
    const timer = window.setTimeout(() => setQualityChecking(false), PDF_QUALITY_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [qualityChecking]);

  // Terminal resolution: Ready → the panel STAYS OPEN — the timeline settles into
  // its completed state and renders until the admin closes it (X / إلغاء).
  // Failed → error modal. 13.A.2: the terminal effect is KIND-AWARE — PDF rows
  // keep the font messaging; HTML rows settle their 4-step timeline with the
  // «جاهز» badge (green check) or surface the ProcessingErrorModal.
  useEffect(() => {
    if (!trackingFileId) return;
    if (trackingKind === 'pdf') {
      if (trackingStatus == null) return;
      if (trackingStatus === 'Ready') {
        const broken = trackedFile?.healthStatus === 'BrokenArabic';
        onNotice(t(locale,
          broken ? 'library.processing.pdfReadyBroken' : 'library.processing.pdfReadyFixed',
          { title: trackedFile?.title ?? '' }));
        setQualityChecking(true); // brief «تحليل جودة العرض» beat, then the badge
      } else if (trackingStatus === 'Failed') {
        setFontErrorModal({
          human: t(locale, 'library.processing.pdfFailedHuman'),
          technical: trackedFile?.processingError ?? null,
          // R22.2 — the support collapsible prefers the structured diagnosticReport;
          // the raw stderr tail is the fallback so support ALWAYS gets evidence.
          diagnostic: trackedFile?.diagnosticReport ?? trackedFile?.processingError ?? null,
        });
        setTrackingFileId(null); // stop the poller; the timeline hides, the form stays usable
      }
    } else if (trackingKind === 'html') {
      if (htmlTrackingStatus == null) return;
      if (htmlTrackingStatus === 'Ready') {
        onNotice(t(locale, 'library.processing.htmlReady', { title: trackedFile?.title ?? '' }));
      } else if (htmlTrackingStatus === 'Failed') {
        setFontErrorModal({
          human: t(locale, 'library.processing.htmlFailedHuman'),
          // HTML rows carry no stderr-style payload — the human sentence is the evidence.
          technical: null,
          diagnostic: null,
        });
        setTrackingFileId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingFileId, trackingKind, trackingStatus, htmlTrackingStatus]);

  // 13.A.2 (A) — live LOCAL preview: read the picked HTML file into srcDoc with
  // FileReader (in-browser only — no upload, no network). Re-reads on every new
  // selection; cleared for non-HTML picks and on close.
  useEffect(() => {
    if (!selectedFile || !isHtmlFile(selectedFile)) {
      setHtmlPreview(null);
      setHtmlPreviewLoading(false);
      return;
    }
    setHtmlPreviewLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setHtmlPreview(typeof reader.result === 'string' ? reader.result : null);
      setHtmlPreviewLoading(false);
    };
    reader.onerror = () => {
      setHtmlPreview(null);
      setHtmlPreviewLoading(false);
    };
    reader.readAsText(selectedFile, 'utf-8');
  }, [selectedFile]);

  const handleFileSelect = (file: File) => {
    // Wave 13 (G-6) — client-side 20 MB hard cap for HTML lessons: an oversized
    // pick is ALLOWED into the drawer so the 13.A.2 size meter can show its red
    // state, but the submit button is disabled and handleUpload re-guards — no
    // presigned URL is ever requested for an oversized file.
    setSelectedFile(file);
    const detected = contentTypeMap[file.type] ?? { type: 'Pdf' as const, ct: file.type || 'application/octet-stream' };
    setForm(f => ({
      ...f,
      fileName: file.name,
      contentType: detected.ct,
      fileSize: file.size,
      type: detected.type,
      title: f.title || file.name.replace(/\.[^.]+$/, ''),
      // Interactive-lesson flag resets to ON on every new HTML selection (A.4 default).
      enableScripts: detected.ct === 'text/html' ? true : f.enableScripts,
    }));
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !form.subjectId || !form.title) {
      onError(t(locale, 'library.errors.validation'));
      return;
    }
    // 13.A.2 (C) — belt over the disabled submit button: never presign an
    // oversized HTML lesson (the server enforces the same 20 MB cap).
    if (htmlTooLarge) {
      onError(t(locale, 'library.errors.htmlTooLarge', { limit: HTML_MAX_MB }));
      return;
    }
    setBusy(true);
    setUploadProgress(0);
    setUploadInFlight(true);
    setQualityChecking(false);
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
          // Wave 13 (F3) — the backend re-gates this against text/html.
          enableScripts: form.enableScripts,
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
          // Wave 13 (F3) — contract symmetry; the authoritative flag was persisted
          // on the row at upload-url time.
          enableScripts: form.enableScripts,
        }),
      });

      setUploadProgress(100);
      if (form.type === 'Pdf') {
        // Wave 11.9: complete-upload committed PdfProcessingStatus=Pending and
        // the worker is picking the Ghostscript job up — DON'T close the panel:
        // walk the R22.5.2 five-step timeline to the Ready badge | Failed modal.
        setTrackingKind('pdf');
        setTrackingFileId(uploadUrlResp.fileId);
        setPollTimedOut(false);
        await loadFiles(1);
      } else if (form.type === 'Html') {
        // 13.A.2 (D) — HTML rows walk their own 4-step timeline (رفع → تعقيم →
        // حقن حماية CSP → جاهز) driven by contentProcessingStatus polling —
        // the same panel-stays-open contract as the Ghostscript timeline.
        setTrackingKind('html');
        setTrackingFileId(uploadUrlResp.fileId);
        setPollTimedOut(false);
        await loadFiles(1);
      } else {
        // R22.5.2 guardrail — non-PDF rows never enter the Ghostscript pipeline;
        // tracking them would spin the timeline forever (11.9 regression fix).
        onNotice(t(locale, 'library.processing.uploadedNotice'));
        closeUpload();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'library.errors.upload'));
      setUploadProgress(0);
    } finally {
      setBusy(false);
      setUploadInFlight(false);
    }
  };

  const handlePublish = async (file: AdminLibraryFileListItem) => {
    setBusy(true);
    try {
      await request<unknown>(`/api/v1/library/${file.id}/publish`, { method: 'POST' });
      onNotice(`تم نشر الملف "${file.title}".`);
      setPublishTarget(null);
      await loadFiles(page);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'library.errors.publish'));
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (file: AdminLibraryFileListItem) => {
    setBusy(true);
    try {
      await request<unknown>(`/api/v1/library/${file.id}/archive`, { method: 'POST' });
      onNotice(`تمت أرشفة الملف "${file.title}".`);
      setArchiveTarget(null);
      await loadFiles(page);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'library.errors.archive'));
    } finally {
      setBusy(false);
    }
  };

  // W-coverage (row 21): metadata update — difficulty/targetQuality are PATCH-optional
  // (empty selection = leave the stored value untouched per the DTO contract).
  const openEdit = (file: AdminLibraryFileListItem) => {
    setEditTarget(file);
    setEditTitle(file.title);
    setEditDescription('');
    setEditTags('');
    setEditLectureId(file.lectureId ?? '');
    setEditDifficulty('');
    setEditTargetQuality('');
  };

  const handleUpdateMetadata = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!editTarget || !editTitle.trim() || busy) return;
    setBusy(true);
    try {
      await request<unknown>(`/api/v1/library/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          tags: editTags.split(',').map((tag) => tag.trim()).filter(Boolean),
          lectureId: editLectureId || null,
          ...(editDifficulty ? { difficulty: editDifficulty } : {}),
          ...(editTargetQuality ? { targetQuality: editTargetQuality } : {}),
        }),
      });
      onNotice(`تم تحديث بيانات الملف "${editTitle.trim()}".`);
      setEditTarget(null);
      await loadFiles(page);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'library.errors.updateMetadata'));
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
      onError(error instanceof Error ? error.message : t(locale, 'library.errors.delete'));
    } finally {
      setBusy(false);
    }
  };

  function closeUpload() {
    setShowUpload(false);
    setForm(emptyForm());
    setSelectedFile(null);
    setUploadProgress(0);
    setTrackingFileId(null);
    setTrackingKind(null);
    setPollTimedOut(false);
    setUploadInFlight(false);
    setQualityChecking(false);
    setFontErrorModal(null);
    setHtmlPreview(null);
    setHtmlPreviewLoading(false);
  }

  // PR-3 — the legacy inline bilingual copy object now resolves through the
  // shared dictionary; the KEYS are unchanged so every `copy.*` consumer below
  // keeps working, the VALUES are dictionary-sourced (byte-identical strings).
  const copy = useMemo(() => ({
    eyebrow: t(locale, 'library.header.eyebrow'),
    title: t(locale, 'library.header.title'),
    desc: t(locale, 'library.header.desc'),
    selectUniversity: t(locale, 'library.fields.university'), selectCollege: t(locale, 'library.fields.college'), selectYear: t(locale, 'library.fields.year'), selectSemester: t(locale, 'library.fields.semester'), selectSubject: t(locale, 'library.fields.subject'), selectLecture: t(locale, 'library.fields.lecture'),
    search: t(locale, 'library.toolbar.search'), filterStatus: t(locale, 'common.status'), all: t(locale, 'common.all'),
    addFile: t(locale, 'library.toolbar.addFile'), refresh: t(locale, 'library.toolbar.refresh'), loading: t(locale, 'library.toolbar.loading'),
    upload: t(locale, 'library.upload.panelEyebrow'), fileToUpload: t(locale, 'library.fields.file'), title_ar: t(locale, 'library.fields.title'), description: t(locale, 'library.fields.description'), type: t(locale, 'library.fields.type'), submit: t(locale, 'library.upload.submit'), cancel: t(locale, 'common.cancel'),
    progress: t(locale, 'library.upload.progress'), uploading: t(locale, 'library.upload.uploading'),
    status: t(locale, 'common.status'), scanStatus: t(locale, 'library.fields.scan'), size: t(locale, 'library.fields.size'), subject: t(locale, 'library.fields.subject'), created: t(locale, 'library.fields.created'), actions: t(locale, 'library.fields.actions'),
    publish: t(locale, 'library.actions.publish'), archive: t(locale, 'library.actions.archive'), delete: t(locale, 'library.actions.delete'), deleteTitle: t(locale, 'library.confirm.deleteTitle'), deleteText: t(locale, 'library.confirm.deleteText'),
    confirmDelete: t(locale, 'library.confirm.deleteButton'), close: t(locale, 'common.close'),
    noFiles: t(locale, 'library.list.noFiles'),
    noSubject: t(locale, 'library.list.noSubject'),
    noSubjectHint: t(locale, 'library.list.noSubjectHint'),
    noFilesHint: t(locale, 'library.list.noFilesHint'),
    selectFile: t(locale, 'library.upload.selectFile'), fillRequired: t(locale, 'library.upload.fillRequired'),
    selectSubjectForm: t(locale, 'library.upload.selectSubjectForm'), selectLectureForm: t(locale, 'library.upload.selectLectureForm'),
  }), [locale]);

  const dir = isArabic ? 'rtl' : 'ltr';
  const hasFilters = Boolean(subjectId || statusFilter || query);

  // ===== R22.5.2 — the five literal timeline steps (رفع → فحص سلامة → دمج وإصلاح
  // الخطوط → تحليل جودة العرض → جاهز) + the health badge. Visible for PDF uploads
  // from the first submit; on Ready it SETTLES (badge visible) until closed.
  // 13.A.2 — KIND-AWARE: the Ghostscript timeline may only follow PDF rows. The
  // old `trackingFileId != null` disjunct broke the moment HTML uploads started
  // setting trackingFileId too — an HTML upload would spin the PDF timeline's
  // «فحص سلامة الملف» step forever (caught by the §13 timeline screenshot).
  const pdfTimelineVisible = (uploadInFlight && form.type === 'Pdf')
    || (trackingFileId != null && trackingKind === 'pdf');
  const timelineSteps = pdfTimelineVisible
    ? pdfTimelineSteps({
        uploadInFlight,
        status: trackingFileId != null ? trackingStatus : null,
        qualityChecking,
      })
    : [];
  const timelineActive = timelineSteps.find((step) => step.state === 'active');
  const timelineSettled = timelineSteps.length > 0 && timelineSteps.every((step) => step.state === 'done');
  const timelineFailed = trackingStatus === 'Failed';
  const healthBadge = timelineSettled && !timelineFailed ? pdfHealthBadge(trackedFile?.healthStatus) : null;

  // ===== 13.A.2 (D) — the 4-step HTML timeline (رفع → تعقيم → حقن حماية CSP →
  // جاهز). Visible for HTML uploads from the first submit; driven by the same
  // 3s poll; settles with the «جاهز» badge until the admin closes the panel.
  const htmlTimelineVisible = (uploadInFlight && form.contentType === 'text/html')
    || (trackingFileId != null && trackingKind === 'html');
  const htmlTimelineStepsView = htmlTimelineVisible
    ? htmlTimelineSteps(uploadInFlight, uploadInFlight ? null : htmlTrackingStatus)
    : [];
  const htmlTimelineSettled = htmlTimelineStepsView.length > 0
    && htmlTimelineStepsView.every((step) => step.state === 'done');

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
          {t(locale, 'library.tabs.files')}
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
            {t(locale, 'library.tabs.courses')}
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
          aria-label={copy.filterStatus}
          className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{copy.filterStatus}: {copy.all}</option>
          <option value="Draft">{statusLabel('Draft', isArabic)}</option>
          <option value="Published">{statusLabel('Published', isArabic)}</option>
          <option value="Archived">{statusLabel('Archived', isArabic)}</option>
        </select>
        {/* Push 4: institutional category filter (منهاج/محاضرة/تلخيص/أفكار ذهبية). */}
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label={t(locale, 'library.fields.category')}
          className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{t(locale, 'library.toolbar.categoryAll')}</option>
          <option value="Curriculum">{categoryLabel('Curriculum', isArabic)}</option>
          <option value="Lecture">{categoryLabel('Lecture', isArabic)}</option>
          <option value="Summary">{categoryLabel('Summary', isArabic)}</option>
          <option value="GoldenIdeas">{categoryLabel('GoldenIdeas', isArabic)}</option>
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
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'library.fields.category')}</th>
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
                      {/* Wave 13 (F3) — HTML pipeline badge (mirrors the Ghostscript
                          status surface; only text/html rows carry the key). */}
                      {file.type === 'Html' && file.contentProcessingStatus && (
                        <span
                          className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${contentStatusBadgeClass(file.contentProcessingStatus)}`}
                          data-testid="html-content-status-badge"
                        >
                          {contentStatusLabel(file.contentProcessingStatus, isArabic)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                      {new Date(file.createdAt).toLocaleDateString(isArabic ? 'ar' : 'en')}
                    </td>
                    <td className="px-4 py-3">
                      {/* Command Center P1: row-action ⋮ menu — convert/publish/archive/delete
                          grouped into one trigger. Destructive entries stay confirm-gated
                          downstream (publishTarget / archiveTarget / confirmDelete). */}
                      <RowActionsMenu
                        label={t(locale, 'library.actions.rowMenuLabel', { title: file.title })}
                        dir={isArabic ? 'rtl' : 'ltr'}
                        items={[
                          ...(file.type === 'Pdf'
                            ? [{
                                // R22.4 — Wave 12 placeholder: the escape hatch for severely
                                // broken PDFs (image conversion) is VISIBLE but not built.
                                key: 'convert-images',
                                label: t(locale, 'library.actions.convertToImages'),
                                icon: <Images className="w-4 h-4" />,
                                disabled: busy,
                                onSelect: () => onNotice(t(locale, 'library.actions.convertNotice')),
                              }]
                            : []),
                          // W6 (complete API coverage): metadata edit joins the menu.
                          {
                            key: 'edit-metadata',
                            label: t(locale, 'library.actions.editMetadata'),
                            icon: <Pencil className="w-4 h-4" />,
                            disabled: busy,
                            onSelect: () => openEdit(file),
                          },
                          ...(file.status === 'Draft' && file.virusScanStatus === 'Clean' && can('btn:library.publish')
                            ? [{
                                key: 'publish',
                                label: copy.publish,
                                icon: <CheckCircle2 className="w-4 h-4" />,
                                disabled: busy,
                                onSelect: () => setPublishTarget(file),
                              }]
                            : []),
                          ...(file.status === 'Published' && can('btn:library.archive')
                            ? [{
                                key: 'archive',
                                label: copy.archive,
                                icon: <Archive className="w-4 h-4" />,
                                disabled: busy,
                                onSelect: () => setArchiveTarget(file),
                              }]
                            : []),
                          ...(can('btn:library.delete')
                            ? [{
                                key: 'delete',
                                label: copy.delete,
                                danger: true,
                                icon: <Trash2 className="w-4 h-4" />,
                                disabled: busy,
                                dividerBefore: true,
                                onSelect: () => setConfirmDelete(file),
                              }]
                            : []),
                          ...(isSuperAdmin
                            ? [{
                                key: 'hard-delete',
                                label: t(locale, 'library.actions.hardDelete'),
                                danger: true,
                                icon: <Trash2 className="w-4 h-4" />,
                                onSelect: () => setHardTarget({ module: 'library-file', targetId: file.id, label: file.title }),
                              }]
                            : []),
                        ]}
                      />                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== W2 (admin-ui): shared pager — rows beyond page 1 are reachable now ===== */}
      {!loading && total > 0 && (
        <Pagination
          page={page}
          pageSize={25}
          total={total}
          onPageChange={(next) => void loadFiles(next)}
          dir={isArabic ? 'rtl' : 'ltr'}
          labels={isArabic ? undefined : {
            prev: 'Previous', next: 'Next', navLabel: 'File list pagination',
            pageOf: (p, tp) => `Page ${p} of ${tp}`,
          }}
          testId="library-files-pagination"
        />
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
            className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md lg:max-w-xl bg-white shadow-2xl overflow-y-auto cms-drawer-in"
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
                    {t(locale, 'library.upload.panelTitle')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeUpload}
                  disabled={busy}
                  data-testid="upload-panel-close"
                  aria-label={copy.close}
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
                      {(['Pdf', 'Html', 'Image', 'Video', 'Audio', 'Summary', 'Comprehensive', 'Paragraph'] as const).map(typeValue => (
                        <option key={typeValue} value={typeValue}>{typeLabel(typeValue, isArabic)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* ===== 13.A.2 — the premium HTML upload experience (A/B/C) =====
                    Rendered only for real text/html uploads. A: live LOCAL preview
                    (sandboxed srcDoc); B: security switch; C: size validator. The
                    injected CSP allows inline scripts ONLY when the switch is on;
                    the sanitizer (13.A.1) preserves script/style/handlers but still
                    strips every external XSS vector. */}
                {form.contentType === 'text/html' && (
                  <div className="space-y-4" data-testid="html-upload-experience">
                    {/* (A) Live preview — local-only, sandboxed, mirrors the student rules */}
                    <section
                      className="rounded-xl border overflow-hidden"
                      style={{ borderColor: 'var(--cms-line)' }}
                      data-testid="html-preview-panel"
                    >
                      <header
                        className="flex items-center justify-between gap-2 px-4 py-3"
                        style={{ background: 'var(--cms-ivory-50)', borderBottom: '1px solid var(--cms-line)' }}
                      >
                        <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                          <MonitorPlay className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-teal-700)' }} />
                          {t(locale, 'library.upload.html.previewTitle')}
                        </span>
                        <span
                          className="inline-flex items-center rounded-full border bg-white px-2 py-0.5 text-[11px]"
                          style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-muted)' }}
                        >
                          {t(locale, 'library.upload.html.localOnly')}
                        </span>
                      </header>
                      <div className="p-3">
                        {htmlPreviewLoading ? (
                          <div
                            className="h-56 sm:h-64 rounded-lg border animate-pulse"
                            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-100)' }}
                            aria-hidden="true"
                          />
                        ) : (
                          <iframe
                            srcDoc={htmlPreview ?? ''}
                            sandbox={form.enableScripts ? 'allow-scripts' : ''}
                            title={t(locale, 'library.upload.html.previewFrameTitle')}
                            className="w-full h-56 sm:h-64 rounded-lg border bg-white"
                            data-testid="html-preview-frame"
                          />
                        )}
                        <p
                          className="mt-2 text-[11px] leading-relaxed"
                          style={{ color: 'var(--cms-text-muted)' }}
                          data-testid="html-preview-note"
                        >
                          {t(locale, 'library.upload.html.previewNote')}
                        </p>
                      </div>
                    </section>

                    {/* (B) Security switch — 44px touch target, animated thumb, verbatim ruling copy */}
                    <section
                      className="rounded-xl border p-4"
                      style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                      data-testid="upload-enable-scripts-row"
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.enableScripts}
                        onClick={() => setForm(f => ({ ...f, enableScripts: !f.enableScripts }))}
                        className="flex w-full min-h-[44px] items-center justify-between gap-3 text-start cursor-pointer"
                        data-testid="upload-enable-scripts"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>
                            {t(locale, 'library.upload.html.enableScripts')}
                          </span>
                          <span className="mt-1 block text-[11px] leading-relaxed" style={{ color: 'var(--cms-text-muted)' }}>
                            {t(locale, 'library.upload.html.enableScriptsHint')}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200"
                          style={{ background: form.enableScripts ? 'var(--cms-teal-600)' : 'var(--cms-ivory-300)' }}
                        >
                          <span
                            className={`absolute top-0.5 start-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${form.enableScripts ? 'ltr:translate-x-5 rtl:-translate-x-5' : ''}`}
                          />
                        </span>
                      </button>
                      {/* What the admin gets regardless of the toggle — kills the "is this safe?" question. */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {[
                          t(locale, 'library.upload.html.chipCsp'),
                          t(locale, 'library.upload.html.chipVirus'),
                          t(locale, 'library.upload.html.chipSandbox'),
                        ].map((chip) => (
                          <span
                            key={chip}
                            className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px]"
                            style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}
                          >
                            <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: 'var(--cms-teal-600)' }} />
                            {chip}
                          </span>
                        ))}
                      </div>
                    </section>

                    {/* (C) Size validator — n MB / 20 MB, red hard-limit state */}
                    <section
                      className="rounded-xl border p-4"
                      style={{ borderColor: htmlTooLarge ? 'var(--cms-danger)' : 'var(--cms-line)' }}
                      data-testid="html-size-meter"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                        <span className="font-medium">{t(locale, 'library.upload.html.sizeLabel')}</span>
                        <span
                          className={`font-semibold tabular-nums ${htmlTooLarge ? 'text-red-700' : ''}`}
                          data-testid="html-size-readout"
                        >
                          {formatBytes(selectedFile?.size ?? 0)} / {HTML_MAX_MB} MB
                        </span>
                      </div>
                      <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--cms-ivory-200)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, ((selectedFile?.size ?? 0) / (HTML_MAX_MB * 1024 * 1024)) * 100)}%`,
                            background: htmlTooLarge ? 'var(--cms-danger)' : 'var(--cms-teal-500)',
                          }}
                        />
                      </div>
                      {htmlTooLarge && (
                        <p
                          className="mt-2 text-xs font-medium leading-relaxed"
                          style={{ color: 'var(--cms-danger)' }}
                          data-testid="html-size-error"
                          role="alert"
                        >
                          {t(locale, 'library.upload.html.sizeError', { limit: HTML_MAX_MB })}
                        </p>
                      )}
                    </section>
                  </div>
                )}

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
                    {t(locale, 'library.fields.category')}
                  </span>
                  <select
                    value={form.category}
                    onChange={(event) => setForm(f => ({ ...f, category: event.target.value as UploadForm['category'] }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)' }}
                  >
                    <option value="">{categoryLabel('', isArabic)}</option>
                    <option value="Curriculum">{categoryLabel('Curriculum', isArabic)}</option>
                    <option value="Lecture">{categoryLabel('Lecture', isArabic)}</option>
                    <option value="Summary">{categoryLabel('Summary', isArabic)}</option>
                    <option value="GoldenIdeas">{categoryLabel('GoldenIdeas', isArabic)}</option>
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

                {/* Upload progress (non-PDF, non-HTML uploads — PDF shows the
                    R22.5.2 five-step timeline, HTML the 13.A.2 four-step one) */}
                {uploadProgress > 0 && !pdfTimelineVisible && !htmlTimelineVisible && (
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

                {/* R22.5.2 — the 5-STEP LITERAL timeline (never combined):
                    رفع الملف → فحص سلامة الملف → دمج وإصلاح الخطوط (+ sub-text,
                    ? tooltip) → تحليل جودة العرض → جاهز + health badge | فشل */}
                {pdfTimelineVisible && (
                  <div
                    className="space-y-2 rounded-lg border p-3"
                    data-testid="pdf-processing-timeline"
                    style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold" style={{ color: 'var(--cms-text)' }}>
                      <span className="inline-flex items-center gap-1.5">
                        {t(locale, 'library.processing.pdfTitle')}
                        {/* The task-book tooltip — WHY this step exists, in plain Arabic. */}
                        <span
                          className="inline-flex cursor-help"
                          title={t(locale, 'library.processing.pdfTooltip')}
                          aria-label={t(locale, 'library.processing.pdfTooltip')}
                          role="note"
                          data-testid="pdf-fonts-tooltip"
                        >
                          <HelpCircle className="w-3.5 h-3.5" style={{ color: 'var(--cms-text-muted)' }} />
                        </span>
                      </span>
                      <span className="tabular-nums" style={{ color: 'var(--cms-text-soft)' }} data-testid="pdf-timeline-percent">
                        {timelineFailed
                          ? '—'
                          : uploadInFlight
                            ? `${uploadProgress}%`
                            : `${timelineActive?.progress ?? 100}%`}
                      </span>
                    </div>
                    {timelineSteps.map((step) => {
                      const label = step.state === 'failed' && step.key === 'ready'
                        ? t(locale, 'library.processing.pdfFailedStep')
                        : (isArabic ? step.labelAr : step.labelEn);
                      const sub = step.state === 'active'
                        ? (isArabic ? step.subTextAr : step.subTextEn) ?? null
                        : null;
                      return (
                        <div
                          key={step.key}
                          className="flex items-start gap-2 text-xs"
                          data-testid={`pdf-phase-${step.key}`}
                          data-phase-state={step.state}
                        >
                          {step.state === 'done' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#059669' }} />}
                          {step.state === 'active' && <LoaderCircle className="w-4 h-4 shrink-0 mt-0.5 animate-spin" style={{ color: 'var(--cms-teal-600)' }} />}
                          {step.state === 'failed' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--cms-danger)' }} />}
                          {step.state === 'pending' && <span className="w-4 h-4 shrink-0 mt-0.5 rounded-full border" style={{ borderColor: 'var(--cms-line-strong)' }} />}
                          <div className="min-w-0">
                            <span style={{ color: step.state === 'pending' ? 'var(--cms-text-soft)' : 'var(--cms-text)' }}>{label}</span>
                            {sub && (
                              <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--cms-text-muted)' }} data-testid={`pdf-phase-${step.key}-sub`}>
                                {sub}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* R22.5.1 / R22.5.2 — the health badge on the settled Ready state:
                        Healthy → green «ملف سليم البنية 100%»; BrokenArabic → yellow
                        «ملف به مشاكل في النص، تم تفعيل وضع العرض الاحتياطي». */}
                    {healthBadge && (
                      <div className="pt-1">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${healthBadge.className}`}
                          data-testid="pdf-health-badge"
                          data-health={healthBadge.tone}
                        >
                          {healthBadge.tone === 'Healthy'
                            ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                          <span>{isArabic ? healthBadge.labelAr : healthBadge.labelEn}</span>
                        </span>
                      </div>
                    )}
                    {pollTimedOut && trackingActive && (
                      <p className="text-xs" style={{ color: 'var(--cms-danger)' }}>
                        {t(locale, 'library.processing.pollTimeout')}
                      </p>
                    )}
                  </div>
                )}

                {/* ===== 13.A.2 (D) — the 4-STEP HTML timeline (رفع → تعقيم →
                    حقن حماية CSP → جاهز). Same skeleton as the R22.5.2 PDF
                    timeline; driven by contentProcessingStatus on the shared 3s
                    poll; settles with the «جاهز — الحماية مفعّلة» green-check badge. */}
                {htmlTimelineVisible && (
                  <div
                    className="space-y-2 rounded-lg border p-3"
                    data-testid="html-processing-timeline"
                    style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold" style={{ color: 'var(--cms-text)' }}>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--cms-teal-600)' }} />
                        {t(locale, 'library.processing.htmlTitle')}
                      </span>
                      <span className="tabular-nums" style={{ color: 'var(--cms-text-soft)' }} data-testid="html-timeline-percent">
                        {uploadInFlight ? `${uploadProgress}%` : htmlTimelineSettled ? '100%' : '—'}
                      </span>
                    </div>
                    {htmlTimelineStepsView.map((step) => {
                      const label = step.state === 'failed' && step.key === 'ready'
                        ? t(locale, 'library.processing.htmlFailedStep')
                        : (isArabic ? step.labelAr : step.labelEn);
                      return (
                        <div
                          key={step.key}
                          className="flex items-start gap-2 text-xs"
                          data-testid={`html-phase-${step.key}`}
                          data-phase-state={step.state}
                        >
                          {step.state === 'done' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#059669' }} />}
                          {step.state === 'active' && <LoaderCircle className="w-4 h-4 shrink-0 mt-0.5 animate-spin" style={{ color: 'var(--cms-teal-600)' }} />}
                          {step.state === 'failed' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--cms-danger)' }} />}
                          {step.state === 'pending' && <span className="w-4 h-4 shrink-0 mt-0.5 rounded-full border" style={{ borderColor: 'var(--cms-line-strong)' }} />}
                          <span style={{ color: step.state === 'pending' ? 'var(--cms-text-soft)' : 'var(--cms-text)' }}>{label}</span>
                        </div>
                      );
                    })}
                    {/* The settled «جاهز» badge — green check, per the ruling. */}
                    {htmlTimelineSettled && (
                      <div className="pt-1">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                          data-testid="html-ready-badge"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{t(locale, 'library.processing.htmlReadyBadge')}</span>
                        </span>
                      </div>
                    )}
                    {pollTimedOut && trackingActive && (
                      <p className="text-xs" style={{ color: 'var(--cms-danger)' }}>
                        {t(locale, 'library.processing.pollTimeout')}
                      </p>
                    )}
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
                  disabled={busy || !selectedFile || !form.subjectId || !form.title || htmlTooLarge}
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

      {/* ===== W2 (admin-ui): explicit confirm gates for every file lifecycle
          action (publish / archive / delete) — previously publish+archive fired
          on a single click with no confirmation (D-07/D-08) and delete used a
          hand-rolled modal without Esc/focus trap (D-12). ===== */}
      <ConfirmDialog
        open={publishTarget !== null}
        onOpenChange={(next) => { if (!next) setPublishTarget(null); }}
        title={t(locale, 'library.confirm.publishTitle')}
        description={publishTarget
          ? t(locale, 'library.confirm.publishDescription', { title: publishTarget.title })
          : undefined}
        confirmLabel={copy.publish}
        cancelLabel={copy.cancel}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => { if (publishTarget) void handlePublish(publishTarget); }}
        testId="library-publish-confirm"
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(next) => { if (!next) setArchiveTarget(null); }}
        title={t(locale, 'library.confirm.archiveTitle')}
        description={archiveTarget
          ? t(locale, 'library.confirm.archiveDescription', { title: archiveTarget.title })
          : undefined}
        confirmLabel={copy.archive}
        cancelLabel={copy.cancel}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => { if (archiveTarget) void handleArchive(archiveTarget); }}
        testId="library-archive-confirm"
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(next) => { if (!next) setConfirmDelete(null); }}
        title={copy.deleteTitle}
        description={confirmDelete
          ? `${copy.deleteText} "${confirmDelete.title}"`
          : undefined}
        confirmLabel={copy.confirmDelete}
        cancelLabel={copy.cancel}
        variant="danger"
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => { if (confirmDelete) void handleDelete(confirmDelete); }}
        testId="library-delete-confirm"
      />

      {/* ===== W-coverage (row 21): metadata edit modal (PUT /library/{id}) ===== */}
      {editTarget && (
        <Dialog
          open
          onOpenChange={(next) => { if (!next && !busy) setEditTarget(null); }}
          title={t(locale, 'library.metadata.title')}
          description={editTarget.title}
          dir={isArabic ? 'rtl' : 'ltr'}
          size="sm"
          dismissGuard={busy}
          testId="library-edit-dialog"
        >
          <form onSubmit={(event) => { event.preventDefault(); void handleUpdateMetadata(event); }} className="px-5 py-4 space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor="library-edit-title" className="block text-xs font-semibold" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'library.fields.title')} <span aria-hidden="true" style={{ color: 'var(--cms-danger)' }}>*</span>
              </label>
              <input
                id="library-edit-title"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                required
                maxLength={200}
                disabled={busy}
                data-testid="library-edit-title"
                className="w-full h-10 px-3 rounded-lg border text-sm disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="library-edit-description" className="block text-xs font-semibold" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'library.fields.description')}
              </label>
              <textarea
                id="library-edit-description"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                rows={3}
                maxLength={1000}
                disabled={busy}
                placeholder={t(locale, 'library.metadata.descriptionPlaceholder')}
                data-testid="library-edit-description"
                className="w-full rounded-lg border text-sm p-2.5 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="library-edit-tags" className="block text-xs font-semibold" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'library.metadata.tagsLabel')}
              </label>
              <input
                id="library-edit-tags"
                value={editTags}
                onChange={(event) => setEditTags(event.target.value)}
                disabled={busy}
                placeholder="مراجعة, نهائي"
                data-testid="library-edit-tags"
                className="w-full h-10 px-3 rounded-lg border text-sm disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="library-edit-lecture" className="block text-xs font-semibold" style={{ color: 'var(--cms-text-soft)' }}>
                  {t(locale, 'library.fields.lecture')}
                </label>
                <select
                  id="library-edit-lecture"
                  value={editLectureId}
                  onChange={(event) => setEditLectureId(event.target.value)}
                  disabled={busy}
                  data-testid="library-edit-lecture"
                  className="w-full h-10 px-3 rounded-lg border text-sm disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                >
                  <option value="">{t(locale, 'library.metadata.noLecture')}</option>
                  {lectures.map((l) => <option key={l.id} value={l.id}>{label(isArabic, l)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="library-edit-difficulty" className="block text-xs font-semibold" style={{ color: 'var(--cms-text-soft)' }}>
                  {t(locale, 'library.metadata.difficulty')}
                </label>
                <select
                  id="library-edit-difficulty"
                  value={editDifficulty}
                  onChange={(event) => setEditDifficulty(event.target.value)}
                  disabled={busy}
                  data-testid="library-edit-difficulty"
                  className="w-full h-10 px-3 rounded-lg border text-sm disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                >
                  <option value="">{t(locale, 'library.metadata.unchanged')}</option>
                  <option value="Easy">{registryLabel(locale, 'questionDifficulty', 'Easy')}</option>
                  <option value="Medium">{registryLabel(locale, 'questionDifficulty', 'Medium')}</option>
                  <option value="Hard">{registryLabel(locale, 'questionDifficulty', 'Hard')}</option>
                </select>
              </div>
            </div>
            {editTarget.type === 'Video' && (
              <div className="space-y-1.5">
                <label htmlFor="library-edit-quality" className="block text-xs font-semibold" style={{ color: 'var(--cms-text-soft)' }}>
                  {t(locale, 'library.metadata.targetQuality')}
                </label>
                <select
                  id="library-edit-quality"
                  value={editTargetQuality}
                  onChange={(event) => setEditTargetQuality(event.target.value)}
                  disabled={busy}
                  data-testid="library-edit-quality"
                  className="w-full h-10 px-3 rounded-lg border text-sm disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                >
                  <option value="">{t(locale, 'library.metadata.unchanged')}</option>
                  <option value="Auto">Auto</option>
                  <option value="P360">360p</option>
                  <option value="P720">720p</option>
                  <option value="P1080">1080p</option>
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={busy}
                data-testid="library-edit-cancel"
                className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
              >
                {t(locale, 'common.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy || !editTitle.trim()}
                data-testid="library-edit-save"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--cms-teal-700)' }}
              >
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t(locale, 'common.save')}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* ===== Wave 11.9 / R22.3 — PDF font-processing failure modal ===== */}
      <ProcessingErrorModal
        open={fontErrorModal !== null}
        onOpenChange={(open) => { if (!open) setFontErrorModal(null); }}
        isArabic={isArabic}
        headline={t(locale, 'library.processing.errorHeadline')}
        humanMessage={fontErrorModal?.human}
        technicalDetails={fontErrorModal?.technical}
        diagnosticReport={fontErrorModal?.diagnostic}
        testId="pdf-processing-error-modal"
      />

      {/* Command Center P1 (D-4): physical delete, SuperAdmin + re-auth + loud-fail on children. */}
      <HardDeleteDialog
        token={token}
        isArabic={isArabic}
        target={hardTarget}
        consequence={t(locale, 'library.confirm.hardDeleteConsequence')}
        onDone={() => { void loadFiles(page); }}
        onClose={() => setHardTarget(null)}
      />
    </section>
  );
}
