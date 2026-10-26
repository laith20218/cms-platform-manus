/**
 * CoursesCenter — Push 4 / Track 4: course & episode management (Courses tab of the
 * Library center; gated by tab:library.courses).
 *
 * Composition:
 *   • Toolbar (create-course CTA gated by btn:library.course.create)
 *   • Courses table: title, subject, episodes count, status badge, created, row actions
 *     (edit · publish · archive · delete — each btn:library.course.* gated)
 *   • Episode manager drawer per course: ordered episodes (Upload | YouTube),
 *     add-YouTube form, media upload (btn:library.course.episode.upload),
 *     delete episode (btn:library.course.episode.delete)
 *   • SinglePutUploadPanel (Hotfix 10.8f): initiate → ONE presigned PUT URL for the
 *     whole file → single XHR PUT (upload.onprogress progress strip) → complete-upload
 *     (no parts; the server verifies the stored object).
 *
 * The 2.5 GB ceiling is enforced server-side (upload.limit.video_mb); this UI simply
 * surfaces the server's FILE_TOO_LARGE error.
 *
 * Design tokens (--cms-*) applied via inline style; structural styling is Tailwind.
 * Bilingual (ar/en) with dir on the section root. The API remains the security gate —
 * every button here is cosmetic gating only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Archive, Ban, CheckCircle2, ChevronDown, ChevronUp, Film, GraduationCap,
  AlertTriangle, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, Upload, X, Youtube,
} from 'lucide-react';
import {
  apiRequest, type ApiError, type PagedResult, type AdminCourseListItem, type CourseDetail,
  type CourseEpisode, type InitiateUploadResponse,
} from '../lib/api';
import {
  difficultyBadgeClass, difficultyLabel, isProcessingActive, normalizeDifficulty,
  processingChipLabel, type ProcessingStatus,
  probeVideoResolution, targetQualityHeight,
  TARGET_QUALITY_DOWNGRADE_WARNING_AR, TARGET_QUALITY_DOWNGRADE_WARNING_EN,
} from '../lib/mediaProcessing';
import { sniffEpisodeMediaType } from '../lib/mediaType';
import { useUiPermissions } from '../hooks/useUiPermissions';
import { EpisodeEditModal } from './EpisodeEditModal';
import { EpisodeMetadataFields, type EpisodeMetadataValues } from './EpisodeMetadataFields';
import { ProcessingErrorModal } from './ProcessingErrorModal';
import { ProcessingTimeline, type UploadStats } from './ProcessingTimeline';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  subjectId: string;
  refreshSignal?: number;
};

const statusBadgeClass = (status: string) => {
  if (status === 'Published') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (status === 'Archived') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const statusLabel = (status: string, isArabic: boolean) => {
  if (status === 'Published') return isArabic ? 'منشور' : 'Published';
  if (status === 'Archived') return isArabic ? 'مؤرشف' : 'Archived';
  return isArabic ? 'مسودة' : 'Draft';
};

const formatBytes = (bytes?: number | null) => {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};

const VIDEO_MIME_ALLOWLIST = ['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'];

export function CoursesCenter({ token, isArabic, onError, onNotice, subjectId, refreshSignal }: Props) {
  const { can } = useUiPermissions();
  const [courses, setCourses] = useState<AdminCourseListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', coverImageUrl: '' });
  const [editCourse, setEditCourse] = useState<AdminCourseListItem | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', coverImageUrl: '' });

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);

  /**
   * Loads the course list. `silent` refreshes keep the table (and any open
   * episode drawer / upload panel) mounted — a completed upload must never
   * wipe the drawer state the admin is looking at (Push 6 fix).
   */
  const loadCourses = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (subjectId) params.set('subjectId', subjectId);
      const data = await request<PagedResult<AdminCourseListItem>>(`/api/v1/admin/courses?${params.toString()}`);
      setCourses(data.items);
    } catch (error) {
      onError(error instanceof Error ? error.message : isArabic ? 'تعذر تحميل الكورسات.' : 'Failed to load courses.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, refreshSignal]);

  const handleCreate = async () => {
    if (!subjectId || !createForm.title.trim()) {
      onError(isArabic ? 'اختر مادة وأدخل عنوان الكورس.' : 'Select a subject and enter a course title.');
      return;
    }
    setBusy(true);
    try {
      await request('/api/v1/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId,
          title: createForm.title.trim(),
          description: createForm.description.trim() || null,
          coverImageUrl: createForm.coverImageUrl.trim() || null,
        }),
      });
      onNotice(isArabic ? `تم إنشاء الكورس "${createForm.title.trim()}".` : `Course "${createForm.title.trim()}" created.`);
      setShowCreate(false);
      setCreateForm({ title: '', description: '', coverImageUrl: '' });
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : isArabic ? 'فشل إنشاء الكورس.' : 'Failed to create course.');
    } finally { setBusy(false); }
  };

  const handleUpdate = async () => {
    if (!editCourse || !editForm.title.trim()) return;
    setBusy(true);
    try {
      await request(`/api/v1/admin/courses/${editCourse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          coverImageUrl: editForm.coverImageUrl.trim() || null,
        }),
      });
      onNotice(isArabic ? 'تم حفظ تعديلات الكورس.' : 'Course updated.');
      setEditCourse(null);
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : isArabic ? 'فشل حفظ التعديلات.' : 'Failed to update.');
    } finally { setBusy(false); }
  };

  const lifecycle = async (course: AdminCourseListItem, action: 'publish' | 'archive') => {
    setBusy(true);
    try {
      await request(`/api/v1/admin/courses/${course.id}/${action}`, { method: 'POST' });
      onNotice(action === 'publish'
        ? isArabic ? `تم نشر الكورس "${course.title}".` : `Course "${course.title}" published.`
        : isArabic ? `تمت أرشفة الكورس "${course.title}".` : `Course "${course.title}" archived.`);
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : isArabic ? 'فشل الإجراء.' : 'Action failed.');
    } finally { setBusy(false); }
  };

  const handleDelete = async (course: AdminCourseListItem) => {
    if (!window.confirm(isArabic
      ? `حذف نهائي للكورس "${course.title}" وكل حلقاته وملفات الفيديو المخزنة؟`
      : `Permanently delete course "${course.title}" with all episodes and stored videos?`)) return;
    setBusy(true);
    try {
      await request(`/api/v1/admin/courses/${course.id}`, { method: 'DELETE' });
      onNotice(isArabic ? `تم حذف الكورس "${course.title}".` : `Course "${course.title}" deleted.`);
      if (expandedId === course.id) setExpandedId(null);
      await loadCourses();
    } catch (error) {
      onError(error instanceof Error ? error.message : isArabic ? 'فشل حذف الكورس.' : 'Failed to delete course.');
    } finally { setBusy(false); }
  };

  const dir = isArabic ? 'rtl' : 'ltr';
  const copy = isArabic ? {
    title: 'الكورسات', desc: 'إنشاء وإدارة كورسات الفيديو وحلقاتها (رفع وسائط حتى 2.5GB أو يوتيوب).',
    create: 'إنشاء كورس', refresh: 'تحديث', episodes: 'حلقات', episodesCount: 'الحلقات', views: 'مشاهدات',
    created: 'تاريخ الإنشاء', status: 'الحالة', subject: 'المادة', actions: 'إجراءات',
    publish: 'نشر', archive: 'أرشفة', delete: 'حذف', edit: 'تعديل',
    noSubject: 'اختر مادة من التدرج الأكاديمي أعلاه لعرض كورساتها أو إنشاء كورس جديد.',
    noCourses: 'لا توجد كورسات في هذه المادة بعد.',
    formTitle: 'عنوان الكورس', formDesc: 'الوصف', formCover: 'رابط صورة الغلاف (اختياري)',
    save: 'حفظ', cancel: 'إلغاء', createCourse: 'إنشاء كورس جديد', editCourse: 'تعديل الكورس',
    addEpisode: 'إضافة حلقة', youtubeId: 'معرّف فيديو يوتيوب', episodeTitle: 'عنوان الحلقة',
    episodeNumber: 'رقم الحلقة', duration: 'المدة (ثانية، اختياري)', add: 'إضافة', uploadVideo: 'رفع وسائط (فيديو/صوت)',
    uploading: 'جارٍ الرفع…', abort: 'إلغاء الرفع',
    incomplete: 'لم يكتمل الرفع', ready: 'جاهز', close: 'إغلاق', selectFile: 'اختر ملف الفيديو أو الصوت',
  } : {
    title: 'Courses', desc: 'Create and manage video courses and their episodes (media upload up to 2.5GB, or YouTube).',
    create: 'Create course', refresh: 'Refresh', episodes: 'Episodes', episodesCount: 'Episodes', views: 'Views',
    created: 'Created', status: 'Status', subject: 'Subject', actions: 'Actions',
    publish: 'Publish', archive: 'Archive', delete: 'Delete', edit: 'Edit',
    noSubject: 'Pick a subject in the hierarchy above to list or create its courses.',
    noCourses: 'No courses in this subject yet.',
    formTitle: 'Course title', formDesc: 'Description', formCover: 'Cover image URL (optional)',
    save: 'Save', cancel: 'Cancel', createCourse: 'Create new course', editCourse: 'Edit course',
    addEpisode: 'Add episode', youtubeId: 'YouTube video id', episodeTitle: 'Episode title',
    episodeNumber: 'Episode number', duration: 'Duration (seconds, optional)', add: 'Add', uploadVideo: 'Upload media (video/audio)',
    uploading: 'Uploading…', abort: 'Abort upload',
    incomplete: 'Upload incomplete', ready: 'Ready', close: 'Close', selectFile: 'Choose a video or audio file',
  };

  return (
    <section className="space-y-5" dir={dir}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>{copy.desc}</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadCourses()} disabled={busy || loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
            <RefreshCw className="w-4 h-4" /> {copy.refresh}
          </button>
          {can('btn:library.course.create') && subjectId && (
            <button type="button" onClick={() => { setShowCreate(v => !v); setEditCourse(null); }} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--cms-teal-700)' }}>
              <Plus className="w-4 h-4" /> {copy.create}
            </button>
          )}
        </div>
      </div>

      {/* Create course panel */}
      {showCreate && subjectId && (
        <div className="rounded-xl border bg-white p-4 space-y-3" style={{ borderColor: 'var(--cms-line)' }}>
          <h4 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{copy.createCourse}</h4>
          <div className="grid md:grid-cols-3 gap-3">
            <input value={createForm.title} onChange={(e) => setCreateForm(f => ({ ...f, title: e.target.value }))}
              placeholder={copy.formTitle} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
            <input value={createForm.description} onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
              placeholder={copy.formDesc} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
            <input value={createForm.coverImageUrl} onChange={(e) => setCreateForm(f => ({ ...f, coverImageUrl: e.target.value }))}
              placeholder={copy.formCover} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleCreate()} disabled={busy}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
              {copy.save}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} disabled={busy}
              className="px-4 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
              {copy.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Edit course panel */}
      {editCourse && (
        <div className="rounded-xl border bg-white p-4 space-y-3" style={{ borderColor: 'var(--cms-line)' }}>
          <h4 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{copy.editCourse}: {editCourse.title}</h4>
          <div className="grid md:grid-cols-3 gap-3">
            <input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
              placeholder={copy.formTitle} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
            <input value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
              placeholder={copy.formDesc} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
            <input value={editForm.coverImageUrl} onChange={(e) => setEditForm(f => ({ ...f, coverImageUrl: e.target.value }))}
              placeholder={copy.formCover} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleUpdate()} disabled={busy}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
              {copy.save}
            </button>
            <button type="button" onClick={() => setEditCourse(null)} disabled={busy}
              className="px-4 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
              {copy.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Courses table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <LoaderCircle className="w-7 h-7 animate-spin" style={{ color: 'var(--cms-teal-700)' }} />
        </div>
      ) : !subjectId ? (
        <div className="rounded-xl border bg-white text-center py-12" style={{ borderColor: 'var(--cms-line)' }}>
          <GraduationCap className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--cms-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--cms-text)' }}>{copy.noSubject}</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border bg-white text-center py-12" style={{ borderColor: 'var(--cms-line)' }}>
          <Film className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--cms-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--cms-text)' }}>{copy.noCourses}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(course => (
            <div key={course.id} className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="flex items-center gap-3 p-4 flex-wrap">
                <button type="button" className="flex items-center gap-3 flex-1 min-w-[220px] text-start"
                  onClick={() => setExpandedId(expandedId === course.id ? null : course.id)}>
                  <div className="p-2 rounded-lg shrink-0" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                    <Film className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--cms-text)' }}>{course.title}</p>
                    <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                      {course.subjectName} · {course.episodesCount} {copy.episodesCount} · {course.viewsCount} {copy.views}
                    </p>
                  </div>
                </button>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(course.status)}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                  {statusLabel(course.status, isArabic)}
                </span>
                <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                  {new Date(course.createdAt).toLocaleDateString(isArabic ? 'ar' : 'en')}
                </span>
                <div className="flex items-center gap-1">
                  {can('btn:library.course.edit') && (
                    <button type="button" title={copy.edit} disabled={busy}
                      onClick={() => { setEditCourse(course); setEditForm({ title: course.title, description: '', coverImageUrl: '' }); setShowCreate(false); }}
                      className="p-1.5 rounded-md hover:bg-slate-100 transition-colors" style={{ color: 'var(--cms-teal-700)' }}>
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {course.status === 'Draft' && can('btn:library.course.publish') && (
                    <button type="button" title={copy.publish} disabled={busy} onClick={() => void lifecycle(course, 'publish')}
                      className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  {course.status === 'Published' && can('btn:library.course.archive') && (
                    <button type="button" title={copy.archive} disabled={busy} onClick={() => void lifecycle(course, 'archive')}
                      className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors">
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                  {can('btn:library.course.delete') && (
                    <button type="button" title={copy.delete} disabled={busy} onClick={() => void handleDelete(course)}
                      className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <span className="p-1" style={{ color: 'var(--cms-text-muted)' }}>
                    {expandedId === course.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </div>
              </div>
              {expandedId === course.id && (
                <EpisodesManager
                  token={token} isArabic={isArabic} onError={onError} onNotice={onNotice}
                  course={course} onChanged={() => void loadCourses({ silent: true })}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ===== Episodes manager (per course) =====

/** Push 10.4 — ProcessingStatus poll cadence (task book: "every 3 seconds"). */
const PROCESSING_POLL_INTERVAL_MS = 3000;

/** Hotfix 10.6-2 (1.D): continuous polling hard-stops after 15 minutes — a worker that
 * died mid-encode (or a container restart on the memory-constrained host) leaves the
 * statuses frozen at Transcoding_* forever, so the browser must not poll endlessly. */
const PROCESSING_POLL_TIMEOUT_MS = 15 * 60 * 1000;

/** Hotfix 10.6-2 (1.D): the task-book timeout sentence (exact). */
const processingTimeoutMessage = (isArabic: boolean) => isArabic
  ? 'استغرق الترميز وقتاً طويلاً جداً. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.'
  : 'Transcoding is taking too long. Please try again or contact support.';

function buildCopy(isArabic: boolean) {
  return isArabic ? {
    addEpisode: 'إضافة حلقة', youtubeId: 'معرّف فيديو يوتيوب', episodeTitle: 'عنوان الحلقة',
    episodeNumber: 'رقم الحلقة', duration: 'المدة (ثانية، اختياري)', add: 'إضافة', uploadVideo: 'رفع وسائط (فيديو/صوت)',
    uploading: 'جارٍ الرفع…', retry: 'إعادة المحاولة', abort: 'إلغاء الرفع',
    incomplete: 'لم يكتمل الرفع', ready: 'جاهز', close: 'إغلاق', selectFile: 'اختر ملف الفيديو أو الصوت',
    deleteEpisode: 'حذف الحلقة', episodes: 'الحلقات', retrying: 'إعادة المحاولة…',
    editEpisode: 'تعديل بيانات الحلقة', processingChip: 'المعالجة',
  } : {
    addEpisode: 'Add episode', youtubeId: 'YouTube video id', episodeTitle: 'Episode title',
    episodeNumber: 'Episode number', duration: 'Duration (seconds, optional)', add: 'Add', uploadVideo: 'Upload media (video/audio)',
    uploading: 'Uploading…', retry: 'Retry', abort: 'Abort upload',
    incomplete: 'Upload incomplete', ready: 'Ready', close: 'Close', selectFile: 'Choose a video or audio file',
    deleteEpisode: 'Delete episode', episodes: 'Episodes', retrying: 'Retrying…',
    editEpisode: 'Edit episode', processingChip: 'Processing',
  };
}

function EpisodesManager({ token, isArabic, onError, onNotice, course, onChanged }: {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  course: AdminCourseListItem;
  onChanged: () => void | Promise<void>;
}) {
  const copy = buildCopy(isArabic);
  const { can } = useUiPermissions();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [uploadPanel, setUploadPanel] = useState(false);
  const [ytForm, setYtForm] = useState({ title: '', episodeNumber: '', duration: '', youtubeId: '' });
  // Push 10.4 — episode editing + structured error surfacing.
  const [editing, setEditing] = useState<CourseEpisode | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ humanMessage?: string; technicalDetails?: string | null } | null>(null);

  /* ===== Push 10.4 — the processing poller (one loop for the whole drawer) =====
   *
   * One interval, two reasons to run: the upload panel watches the episode it
   * just completed (watched set), and any episode stuck in a non-terminal
   * pipeline status keeps the list chips live. The loop refreshes the SAME
   * `detail` state the drawer renders from — no second source of truth. */
  const [watched, setWatched] = useState<ReadonlySet<string>>(() => new Set());
  const [processingRefresh, setProcessingRefresh] = useState(0);
  /* Hotfix 10.6-2 (1.D): the poller watchdog window (see PROCESSING_POLL_TIMEOUT_MS). */
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const watchEpisode = useCallback((episodeId: string) => {
    setWatched((prev) => {
      if (prev.has(episodeId)) return prev;
      const next = new Set(prev);
      next.add(episodeId);
      return next;
    });
    // Hotfix 10.6-2 (1.D): each newly watched episode re-arms a fresh 15-minute window
    // (an admin actively uploading always keeps a live poller).
    setPollStartedAt(Date.now());
    setPollTimedOut(false);
  }, []);

  const unwatchEpisode = useCallback((episodeId: string) => {
    setWatched((prev) => {
      if (!prev.has(episodeId)) return prev;
      const next = new Set(prev);
      next.delete(episodeId);
      return next;
    });
  }, []);

  /** Forces one immediate poll outside the interval (retry button path). */
  const pollNow = useCallback(() => setProcessingRefresh((n) => n + 1), []);

  const poll = useCallback(async () => {
    try {
      setDetail(await apiRequest<CourseDetail>(`/api/v1/admin/courses/${course.id}`, token));
    } catch {
      /* transient — the interval (or the next manual poll) retries */
    }
  }, [course.id, token]);

  const anyProcessing = (detail?.episodes ?? []).some((episode) => isProcessingActive(episode.processingStatus));
  const pollActive = watched.size > 0 || anyProcessing;

  // Hotfix 10.6-2 (1.D): arm the watchdog window the moment continuous polling
  // activates; disarm when everything settles (all episodes terminal, nothing watched).
  useEffect(() => {
    if (!pollActive) {
      setPollStartedAt(null);
      setPollTimedOut(false);
      return;
    }
    if (pollStartedAt == null) setPollStartedAt(Date.now());
  }, [pollActive, pollStartedAt]);

  useEffect(() => {
    if (pollStartedAt == null || pollTimedOut) return;
    const id = window.setTimeout(() => setPollTimedOut(true), PROCESSING_POLL_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [pollStartedAt, pollTimedOut]);

  useEffect(() => {
    if (!pollTimedOut) return;
    onNotice(processingTimeoutMessage(isArabic));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollTimedOut]);

  const pollEnabled = pollActive && !pollTimedOut;

  useEffect(() => {
    if (!pollEnabled) return;
    void poll(); // first check lands immediately on activation
    const id = window.setInterval(() => void poll(), PROCESSING_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [pollEnabled, poll, processingRefresh]);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);

  const loadDetail = async () => {
    try {
      setDetail(await request<CourseDetail>(`/api/v1/admin/courses/${course.id}`));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to load episodes.');
    }
  };

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  const nextEpisodeNumber = ((detail?.episodes ?? []).reduce((max, e) => Math.max(max, e.episodeNumber), 0) || 0) + 1;

  const addYouTube = async () => {
    if (!ytForm.title.trim() || !ytForm.youtubeId.trim() || !ytForm.episodeNumber.trim()) {
      onError(isArabic ? 'أكمل عنوان الحلقة ورقمها ومعرّف اليوتيوب.' : 'Fill episode title, number and YouTube id.');
      return;
    }
    setBusy(true);
    try {
      await request(`/api/v1/admin/courses/${course.id}/episodes/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ytForm.title.trim(),
          episodeNumber: Number(ytForm.episodeNumber),
          durationSeconds: ytForm.duration ? Number(ytForm.duration) : null,
          youtubeVideoId: ytForm.youtubeId.trim(),
        }),
      });
      onNotice(isArabic ? 'تمت إضافة حلقة اليوتيوب.' : 'YouTube episode added.');
      setYtForm({ title: '', episodeNumber: '', duration: '', youtubeId: '' });
      setShowAdd(false);
      await loadDetail();
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to add episode.');
    } finally { setBusy(false); }
  };

  const deleteEpisode = async (episode: CourseEpisode) => {
    if (!window.confirm(isArabic ? `حذف الحلقة "${episode.title}"${episode.sourceType === 'Upload' ? ' وملف الفيديو المخزن' : ''}؟` : `Delete episode "${episode.title}"${episode.sourceType === 'Upload' ? ' and its stored video' : ''}?`)) return;
    setBusy(true);
    try {
      await request(`/api/v1/admin/courses/episodes/${episode.id}`, { method: 'DELETE' });
      onNotice(isArabic ? 'تم حذف الحلقة.' : 'Episode deleted.');
      await loadDetail();
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to delete episode.');
    } finally { setBusy(false); }
  };

  return (
    <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{copy.episodes} ({detail?.episodes.length ?? 0})</h5>
        <div className="flex gap-2">
          {can('btn:library.course.episode.upload') && (
            <button type="button" onClick={() => { setUploadPanel(v => !v); setShowAdd(false); }} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
              <Upload className="w-3.5 h-3.5" /> {copy.uploadVideo}
            </button>
          )}
          <button type="button" onClick={() => { setShowAdd(v => !v); setUploadPanel(false); }} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
            <Youtube className="w-3.5 h-3.5" /> {copy.addEpisode}
          </button>
        </div>
      </div>

      {/* YouTube add form */}
      {showAdd && (
        <div className="rounded-lg border bg-white p-3 grid md:grid-cols-5 gap-2 items-end" style={{ borderColor: 'var(--cms-line)' }}>
          <input value={ytForm.title} onChange={(e) => setYtForm(f => ({ ...f, title: e.target.value }))} placeholder={copy.episodeTitle} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
          <input value={ytForm.episodeNumber || String(nextEpisodeNumber)} onChange={(e) => setYtForm(f => ({ ...f, episodeNumber: e.target.value }))} placeholder={copy.episodeNumber} inputMode="numeric" className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
          <input value={ytForm.duration} onChange={(e) => setYtForm(f => ({ ...f, duration: e.target.value }))} placeholder={copy.duration} inputMode="numeric" className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
          <input value={ytForm.youtubeId} onChange={(e) => setYtForm(f => ({ ...f, youtubeId: e.target.value }))} placeholder={copy.youtubeId} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
          <button type="button" onClick={() => void addYouTube()} disabled={busy}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
            {copy.add}
          </button>
        </div>
      )}

      {/* Single-PUT upload panel (Hotfix 10.8f) */}
      {uploadPanel && can('btn:library.course.episode.upload') && (
        <SinglePutUploadPanel
          token={token} isArabic={isArabic} onError={onError} onNotice={onNotice}
          courseId={course.id} defaultEpisodeNumber={nextEpisodeNumber}
          episodes={detail?.episodes ?? []}
          watchEpisode={watchEpisode} unwatchEpisode={unwatchEpisode} pollNow={pollNow}
          onDone={async () => { await loadDetail(); await onChanged(); }}
        />
      )}

      {/* Episodes list */}
      <div className="space-y-2">
        {(detail?.episodes ?? []).map(episode => {
          const difficulty = normalizeDifficulty(episode.difficulty);
          const chipLabel = processingChipLabel(episode.processingStatus, isArabic);
          const chipActive = isProcessingActive(episode.processingStatus);
          return (
          <div key={episode.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
              {episode.episodeNumber}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--cms-text)' }}>{episode.title}</p>
              <p className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--cms-text-muted)' }}>
                {episode.sourceType === 'YouTube'
                  ? <span className="inline-flex items-center gap-1"><Youtube className="w-3 h-3" /> YouTube</span>
                  : <span className="inline-flex items-center gap-1"><Film className="w-3 h-3" /> {formatBytes(episode.fileSize)}</span>}
                {episode.durationSeconds ? <span>· {Math.floor(episode.durationSeconds / 60)}د</span> : null}
                {episode.sourceType === 'Upload' && !episode.uploadCompleted && (
                  <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="w-3 h-3" /> {copy.incomplete}</span>
                )}
                {/* Push 10.4 — live pipeline chip (only while processing or failed). */}
                {chipLabel && (
                  <span
                    data-testid={`episode-processing-chip-${episode.id}`}
                    className={`inline-flex items-center gap-1 ${episode.processingStatus === 'Failed' ? 'text-red-600' : 'text-teal-700'}`}
                  >
                    {chipActive && <LoaderCircle className="w-3 h-3 animate-spin" />}
                    {episode.processingStatus === 'Failed' && <AlertCircle className="w-3 h-3" />}
                    {chipLabel}
                  </span>
                )}
              </p>
            </div>
            {/* Push 10.4 — difficulty badge (Easy/Medium/Hard → سهل/متوسط/صعب). */}
            {difficulty !== null && (
              <span
                data-testid={`episode-difficulty-${episode.id}`}
                className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs border shrink-0 ${difficultyBadgeClass(difficulty)}`}
              >
                {difficultyLabel(difficulty, isArabic)}
              </span>
            )}
            {can('btn:library.course.edit') && (
              <button type="button" title={copy.editEpisode} disabled={busy}
                onClick={() => setEditing(episode)}
                data-testid={`episode-edit-button-${episode.id}`}
                className="p-1.5 rounded-md hover:bg-slate-100 transition-colors" style={{ color: 'var(--cms-teal-700)' }}>
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {can('btn:library.course.episode.delete') && (
              <button type="button" title={copy.deleteEpisode} disabled={busy} onClick={() => void deleteEpisode(episode)}
                className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          );
        })}
        {detail && detail.episodes.length === 0 && (
          <p className="text-xs text-center py-3" style={{ color: 'var(--cms-text-muted)' }}>—</p>
        )}
      </div>

      {/* Push 10.4 — episode edit modal (title/description/difficulty + number/duration). */}
      {editing && (
        <EpisodeEditModal
          episode={editing}
          token={token}
          isArabic={isArabic}
          onClose={() => setEditing(null)}
          onSaved={(notice) => {
            onNotice(notice);
            void loadDetail();
            void onChanged();
          }}
          onStructuredError={(payload) => {
            onError(payload.message);
            setErrorDialog({ humanMessage: payload.humanMessage, technicalDetails: payload.technicalDetails });
          }}
        />
      )}

      {/* Push 10.4 — structured API failures from the edit flow (dual-language). */}
      <ProcessingErrorModal
        open={errorDialog !== null}
        onOpenChange={(open) => { if (!open) setErrorDialog(null); }}
        isArabic={isArabic}
        humanMessage={errorDialog?.humanMessage}
        technicalDetails={errorDialog?.technicalDetails}
        testId="manager-error-modal"
      />
    </div>
  );
}


// ===== Single-PUT upload panel (Hotfix 10.8f — multipart abandoned) =====

type UploadState = 'idle' | 'initiating' | 'uploading' | 'completing' | 'processing' | 'ready' | 'failed';

/**
 * SinglePutUploadPanel — Hotfix 10.8f. Production proved Upstash's temporary
 * credentials cannot CreateMultipartUpload on R2 (403 at initiate), so the flow is
 * now: initiate-upload (ONE presigned PUT URL for the whole file — content type and
 * declared size are bound into the signature, exactly like the library-upload flow)
 * → a SINGLE XHR PUT of the File with upload.onprogress feeding the progress strip →
 * complete-upload (no parts; the server HEADs the stored object to prove the PUT
 * landed and re-verifies the size) → the 10.4 processing state machine (uploads
 * stats strip, transcoding ladder, error modal) until Ready/Failed.
 *
 * Honest trade-offs vs the old multipart engine (see WIP_STATUS 10.8f):
 *  - No pause/resume: a single PUT cannot resume mid-file. S3 PUT is atomic — an
 *    interrupted PUT stores nothing — so "Retry" safely re-sends the whole file
 *    against the same URL while it is still valid.
 *  - The presigned URL lives ≤ 10 minutes (Upstash's presign cap): the entire file
 *    must be PUT within that window; slower uploads fail with 403 (expired
 *    signature) and the guidance is to cancel and start over.
 *  - No part-level stats: ONE progress bar fed by XHR upload.onprogress.
 *
 * Push 10.4 contract (carried over):
 *  - 1.A metadata: Title (≤200, required) + Description (≤1000) + Difficulty
 *    (0|1|2) travel in the complete-upload body.
 *  - 1.B progress: size/speed/ETA strip while uploading → the 10.3 ladder with the
 *    task book's Arabic sentences (polled every 3s) → Ready.
 *  - 1.C failures: structured dual-language modal (humanMessage + technicalDetails)
 *    with Copy Error + Retry; the Push 6 inline banner stays as the persistent record.
 */
function SinglePutUploadPanel({ token, isArabic, onError, onNotice, courseId, defaultEpisodeNumber, episodes, watchEpisode, unwatchEpisode, pollNow, onDone }: {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  courseId: string;
  defaultEpisodeNumber: number;
  /** Live episodes (the manager's polled detail) — the processing source of truth. */
  episodes: CourseEpisode[];
  watchEpisode: (episodeId: string) => void;
  unwatchEpisode: (episodeId: string) => void;
  pollNow: () => void;
  onDone: () => void | Promise<void>;
}) {
  const copy = buildCopy(isArabic);
  const [file, setFile] = useState<File | null>(null);
  const [episodeNumber, setEpisodeNumber] = useState(String(defaultEpisodeNumber));
  const [metadata, setMetadata] = useState<EpisodeMetadataValues>({ title: '', description: '', difficulty: 0, targetQuality: 'Auto' });
  const [titleInvalid, setTitleInvalid] = useState(false);
  /* Push 10.7 (2.C) — best-effort probed DISPLAY resolution of the chosen file
   * (null while probing / not a video / unreadable). Drives the downgrade warning. */
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  // Push 6: the failure reason persists inline in the panel (a toast alone is too easy to miss).
  const [lastError, setLastError] = useState<string | null>(null);
  // Push 10.4 (1.C): structured failure payload for the dual-language modal.
  const [errorDialog, setErrorDialog] = useState<{ humanMessage?: string; technicalDetails?: string | null; retryProcessing?: boolean } | null>(null);
  const [retrying, setRetrying] = useState(false);
  /* Push 10.8 (1.C) — the abort-processing round-trip guard + the deliberate-cancel
   * marker (drives the failure banner's copy after the admin cancels an encode). */
  const [cancelling, setCancelling] = useState(false);
  const [cancelledProcessing, setCancelledProcessing] = useState(false);

  /* Hotfix 10.6-2 (1.D): the processing watchdog — if the pipeline is still Transcoding_*
   * after 15 minutes the server-side encode is stuck (worker died / container restarted
   * mid-encode on the memory-constrained host): stop waiting, stop polling and surface
   * the task-book timeout sentence instead of spinning forever. */
  const processingSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (state !== 'processing') {
      processingSinceRef.current = null;
      return;
    }
    if (processingSinceRef.current == null) processingSinceRef.current = Date.now();
    const id = window.setTimeout(() => {
      processingSinceRef.current = null;
      if (episodeId) unwatchEpisode(episodeId);
      setState('failed');
      setLastError(processingTimeoutMessage(isArabic));
      setErrorDialog({
        humanMessage: processingTimeoutMessage(isArabic),
        technicalDetails: null,
        retryProcessing: true,
      });
    }, PROCESSING_POLL_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [state, episodeId, isArabic, unwatchEpisode]);

  // Mutable upload session — the single presigned PUT plus the live XHR (cancellable).
  const sessionRef = useRef<{
    episodeId: string;
    uploadUrl: string;
    /** The sniffed content type — MUST ride the PUT as the Content-Type header: the
     * presigned URL signs it, and file.type may be empty for Arabic-named files. */
    contentType: string;
    file: File;
    xhr: XMLHttpRequest | null;
  } | null>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);

  /**
   * Push 6: the API's global 500 handler answers with a generic English detail
   * ("An unexpected error occurred. Please try again later.") — usually a transient
   * upstream hiccup (storage credentials / R2). Show a clear, actionable Arabic
   * message instead, and keep the retry affordances visible.
   */
  const describeUploadError = (error: unknown, fallback: string): string => {
    const message = error instanceof Error ? error.message : '';
    if (isArabic && /unexpected error occurred/i.test(message)) {
      return 'حدث خطأ مؤقت في الخادم أثناء الرفع — أعد المحاولة، وإن استمر الخطأ فتحقّق من الاتصال ثم أعد المحاولة لاحقاً.';
    }
    return message || fallback;
  };

  /** Rolling speed window for the 1.B strip (reset per PUT attempt). */
  const speedWindowRef = useRef<{ t: number; bytes: number } | null>(null);

  /** Rolling-window upload stats (size · speed · ETA) fed by XHR upload.onprogress. */
  const refreshUploadStats = (loadedBytes: number, totalBytes: number) => {
    const now = Date.now();
    const window = speedWindowRef.current ?? { t: now, bytes: 0 };
    const windowSeconds = Math.max((now - window.t) / 1000, 0.25);
    const speed = Math.max((loadedBytes - window.bytes) / windowSeconds, 0);
    speedWindowRef.current = { t: now, bytes: loadedBytes };
    const remaining = Math.max(totalBytes - loadedBytes, 0);
    setUploadStats({
      uploadedBytes: loadedBytes,
      totalBytes,
      speedBps: speed,
      etaSeconds: speed > 0 ? remaining / speed : Number.POSITIVE_INFINITY,
    });
  };

  const runSession = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setState('uploading');
    speedWindowRef.current = null;
    try {
      // THE 10.8f CORE: one XHR PUT of the whole File against the presigned URL.
      // Mirrors the production-proven library-upload PUT: the sniffed Content-Type
      // rides the request (the URL signs it; file.type may be empty for Arabic-named
      // files) and the browser sets Content-Length from the File — it must equal the
      // declared size signed into the URL or storage rejects the request.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        session.xhr = xhr;
        xhr.open('PUT', session.uploadUrl);
        xhr.setRequestHeader('Content-Type', session.contentType);
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) refreshUploadStats(event.loaded, event.total);
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`HTTP ${xhr.status}`));
        });
        xhr.addEventListener('error', () => reject(new Error(xhr.status === 0
          ? 'network/CORS error (status 0) — the browser blocked the cross-origin PUT to storage; the bucket CORS policy must allow PUT from this origin'
          : 'network error')));
        xhr.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
        xhr.send(session.file);
      });

      // PUT landed → complete (no parts; the server HEADs the stored object and
      // verifies the actual size). 10.4: the metadata fields ride along. 10.7:
      // targetQuality rides the same commit, BEFORE the transcode job is enqueued,
      // so the worker encodes exactly what the admin selected.
      if (sessionRef.current !== session) return; // aborted meanwhile
      setState('completing');
      try {
        await request(`/api/v1/admin/courses/episodes/${session.episodeId}/complete-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: metadata.title.trim(),
            description: metadata.description.trim() || null,
            difficulty: metadata.difficulty,
            targetQuality: metadata.targetQuality,
          }),
        });
        setLastError(null);
        // 10.4: the file is committed — hand over to the processing state
        // machine (the manager's poller feeds this panel the pipeline status).
        setEpisodeId(session.episodeId);
        setState('processing');
        watchEpisode(session.episodeId);
        await onDone();
      } catch (error) {
        setState('failed');
        const apiError = error as ApiError;
        const message = describeUploadError(error, 'complete-upload failed.');
        setLastError(message);
        onError(message);
        setErrorDialog({
          humanMessage: apiError?.humanMessage,
          technicalDetails: apiError?.technicalDetails ?? null,
        });
      }
    } catch (error) {
      // A deliberate cancel (XHR aborted by the Cancel button) — the abort handler
      // owns the panel reset; stay silent here.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState('failed');
      const apiError = error as ApiError;
      const message = describeUploadError(error, 'Upload failed.');
      setLastError(message);
      onError(message);
      setErrorDialog({
        humanMessage: apiError?.humanMessage,
        technicalDetails: apiError?.technicalDetails ?? null,
      });
    }
  };

  const start = async () => {
    if (!file || !metadata.title.trim() || !episodeNumber.trim()) {
      if (!metadata.title.trim()) setTitleInvalid(true);
      onError(isArabic ? 'اختر ملف الفيديو وأدخل عنوان الحلقة ورقمها.' : 'Choose a video file, episode title and number.');
      return;
    }
    // Push 7: honest typing — never invent a content type. The old
    // `file.type || 'video/mp4'` fallback mislabeled an MP3 named `mp3.رقيق`
    // (unrecognized extension → empty file.type) as video/mp4; the student
    // <video> then could not decode the MP3 bytes and the episode never played.
    const contentType = sniffEpisodeMediaType(file, VIDEO_MIME_ALLOWLIST);
    if (!contentType) {
      onError(isArabic
        ? `لا يمكن التعرّف على نوع الملف «${file.name}» — الصيغ المدعومة: MP4, WebM, MOV, MP3, M4A, WAV.`
        : `Unrecognized media type "${file.name}" — supported formats: MP4, WebM, MOV, MP3, M4A, WAV.`);
      return;
    }
    setState('initiating');
    setLastError(null);
    setTitleInvalid(false);
    try {
      const initiated = await request<InitiateUploadResponse>(`/api/v1/admin/courses/${courseId}/episodes/initiate-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          fileSize: file.size,
          title: metadata.title.trim(),
          episodeNumber: Number(episodeNumber),
        }),
      });
      sessionRef.current = {
        episodeId: initiated.episodeId,
        uploadUrl: initiated.uploadUrl,
        contentType,
        file,
        xhr: null,
      };
      setEpisodeId(initiated.episodeId);
      setUploadStats({
        uploadedBytes: 0, totalBytes: file.size, speedBps: 0,
        etaSeconds: Number.POSITIVE_INFINITY,
      });
      await runSession();
    } catch (error) {
      setState('failed');
      const apiError = error as ApiError;
      const message = describeUploadError(error, 'initiate-upload failed.');
      setLastError(message);
      onError(message);
      setErrorDialog({
        humanMessage: apiError?.humanMessage,
        technicalDetails: apiError?.technicalDetails ?? null,
      });
    }
  };

  /** 10.8f: a failed PUT is retried against the SAME presigned URL (still valid
   * within its ~10-minute window). S3 PUT is atomic — the failed attempt stored
   * nothing, so re-sending the whole file is safe and idempotent. A 403 here usually
   * means the URL expired: cancel and start a fresh upload instead. */
  const retry = async () => {
    if (!sessionRef.current) return;
    setLastError(null);
    setErrorDialog(null);
    await runSession();
  };

  const abort = async () => {
    const session = sessionRef.current;
    if (!session) return;
    session.xhr?.abort(); // stop the in-flight PUT (atomic — nothing partial is stored)
    try {
      await request(`/api/v1/admin/courses/episodes/${session.episodeId}/abort-upload`, { method: 'POST' });
      onNotice(isArabic ? 'تم إلغاء الرفع وحذف الحلقة غير المكتملة.' : 'Upload aborted; the incomplete episode was removed.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'abort-upload failed.');
    }
    sessionRef.current = null;
    setState('idle');
    setFile(null);
    setUploadStats(null);
    setEpisodeId(null);
    await onDone();
  };

  /** Fresh upload from the success state (keeps the form, clears the session). */
  const resetForNewUpload = () => {
    sessionRef.current = null;
    setState('idle');
    setUploadStats(null);
    setEpisodeId(null);
  };

  /* ===== 1.B processing transitions (the polled detail drives everything) ===== */

  const processingEpisode = episodeId ? episodes.find((episode) => episode.id === episodeId) : undefined;
  const processingStatus: ProcessingStatus | null | undefined = processingEpisode?.processingStatus;

  useEffect(() => {
    if (state !== 'processing' || !episodeId) return;
    // A retry is in flight — hold transitions until the FORCED poll lands;
    // otherwise the stale Failed status would instantly undo the retry.
    if (retrying) return;

    if (processingStatus === 'Failed') {
      unwatchEpisode(episodeId);
      setState('failed');
      setLastError(isArabic ? 'فشلت معالجة الفيديو على الخادم.' : 'Server-side video processing failed.');
      setErrorDialog({
        humanMessage: isArabic
          ? 'تعذّر تجهيز نسخ المشاهدة لهذه الحلقة على الخادم.'
          : 'The server could not prepare watchable copies for this episode.',
        technicalDetails: processingEpisode?.processingError ?? null,
        retryProcessing: true,
      });
      return;
    }

    const ready = processingStatus === 'Ready'
      // Degradation: the API is not reporting a pipeline status for this
      // episode (today's DTOs) — the source MP4 is already playable, so the
      // honest state is Ready, not an endless spinner.
      || (processingEpisode && processingStatus == null && processingEpisode.uploadCompleted);

    if (ready) {
      unwatchEpisode(episodeId);
      setState('ready');
      onNotice(isArabic ? 'الفيديو جاهز للمشاهدة ✅' : 'The video is ready to watch ✅');
      void onDone();
    }
    // Processing episodes that disappear from the list (deleted elsewhere)
    // or are still unreported simply keep polling — the interval owns them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, episodeId, processingStatus, processingEpisode, retrying]);

  /** 1.C retry for a failed pipeline: re-arm the watcher + force one poll. */
  const retryProcessing = async () => {
    if (!episodeId) return;
    setRetrying(true);
    setErrorDialog(null);
    setLastError(null);
    setCancelledProcessing(false);
    setState('processing');
    watchEpisode(episodeId);
    pollNow();
    await new Promise((resolve) => setTimeout(resolve, 900));
    setRetrying(false);
  };

  /* Push 10.8 (1.C) — "إلغاء المعالجة": POST abort-processing → the backend marks
   * the episode Failed (terminal) and kills the in-flight FFmpeg via the job
   * registry. The upload itself stays committed — only the encode is cancelled. */
  const cancelProcessing = async () => {
    if (!episodeId || cancelling) return;
    setCancelling(true);
    try {
      await request(`/api/v1/admin/courses/episodes/${episodeId}/abort-processing`, { method: 'POST' });
      unwatchEpisode(episodeId);
      sessionRef.current = null; // the upload is long-committed — no resume path after an abort
      setState('failed');
      setCancelledProcessing(true);
      setLastError(isArabic
        ? 'تم إلغاء معالجة هذا الفيديو بناءً على طلبك. لإعادة المحاولة، عدّل الحلقة أو ارفع ملفاً جديداً.'
        : 'Processing was cancelled at your request. To retry, edit the episode or upload a new file.');
      onNotice(isArabic
        ? 'تم إلغاء المعالجة — الحلقة الآن بحالة «فشلت المعالجة».'
        : 'Processing aborted — the episode is now marked Failed.');
      pollNow();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'abort-processing failed.');
    } finally {
      setCancelling(false);
    }
  };

  const busyState = state === 'initiating' || state === 'uploading' || state === 'completing';

  /* Push 10.8 (1.C) — the cancel button lives ONLY while an encode is actually
   * running (Transcoding_*): Pending means queued-not-started, Ready/Failed are
   * terminal. Task-book contract, exactly. */
  const encodeRunning = state === 'processing'
    && typeof processingStatus === 'string'
    && processingStatus.startsWith('Transcoding_');

  /* Push 10.7 (2.C) — the quality dropdown applies to video picks only (the picker
   * accepts audio too; audio never enters the transcoding pipeline). */
  const fileIsVideo = !!file
    && (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(file.name));
  /* Advisory downgrade condition: the probed display resolution sits below the
   * selected target — the backend will encode the closest LOWER rung (never upscale). */
  const qualityCeiling = targetQualityHeight(metadata.targetQuality);
  const qualityExceedsSource = qualityCeiling != null
    && videoResolution != null && qualityCeiling > videoResolution.height;

  const percent = uploadStats && uploadStats.totalBytes > 0
    ? Math.min(100, Math.round((uploadStats.uploadedBytes / uploadStats.totalBytes) * 100))
    : 0;

  const copy2 = isArabic ? {
    start: 'بدء الرفع', another: 'رفع وسائط أخرى',
    details: 'عرض التفاصيل التقنية',
  } : {
    start: 'Start upload', another: 'Upload another media file',
    details: 'View technical details',
  };

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3" style={{ borderColor: 'var(--cms-teal-200)' }}>
      <div className="flex items-center gap-2">
        <Upload className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
        <h5 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{copy.uploadVideo}</h5>
      </div>

      {/* File + episode number, then the 1.A metadata block (title/difficulty
          on one row, description below). 10.7: the file picker also probes the
          video's display resolution for the quality-downgrade warning. */}
      <div className="grid gap-2 md:grid-cols-2">
        <input type="file" accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/webm"
          disabled={busyState || state === 'processing'}
          onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            setFile(picked);
            // Push 10.7 (2.C): probe the display resolution of the picked video
            // (video/audio share this picker; audio resolves null and never warns).
            setVideoResolution(null);
            if (picked) void probeVideoResolution(picked).then(setVideoResolution);
          }}
          className="text-sm px-3 py-2 rounded-lg border w-full" style={{ borderColor: 'var(--cms-line-strong)' }} />
        <input value={episodeNumber} disabled={busyState || state === 'processing'} onChange={(e) => setEpisodeNumber(e.target.value)}
          inputMode="numeric" placeholder={isArabic ? 'رقم الحلقة' : 'Episode number'} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
      </div>
      <EpisodeMetadataFields
        values={metadata}
        onChange={(patch) => {
          if ('title' in patch && patch.title !== undefined && patch.title.trim().length > 0) setTitleInvalid(false);
          setMetadata((values) => ({ ...values, ...patch }));
        }}
        isArabic={isArabic}
        disabled={busyState || state === 'processing'}
        titleInvalid={titleInvalid}
        layout="rows"
        testIdPrefix="upload-metadata"
        /* Push 10.7 — the quality dropdown is meaningless for audio picks. */
        showQuality={fileIsVideo}
      />

      {/* Push 10.7 (2.C) — downgrade warning: the picked video's probed display
          resolution sits below the selected target; the backend will encode the
          closest LOWER rung (never upscale). Advisory only — the selection stays
          as chosen, exactly like the backend contract. */}
      {qualityExceedsSource && (
        <p role="alert" data-testid="upload-quality-downgrade-warning"
          className="flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium"
          style={{ borderColor: 'var(--cms-amber-300, #fcd34d)', color: 'var(--cms-amber-600, #b45309)', background: 'var(--cms-amber-50, #fffbeb)' }}>
          <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span>{isArabic ? TARGET_QUALITY_DOWNGRADE_WARNING_AR : TARGET_QUALITY_DOWNGRADE_WARNING_EN}</span>
        </p>
      )}

      {/* ===== 1.B — the human state machine ===== */}
      {(state === 'uploading' || state === 'initiating' || state === 'completing') && (
        <ProcessingTimeline
          stage="uploading"
          uploadPercent={percent}
          uploadStats={uploadStats}
          isArabic={isArabic}
          testId="upload-processing-timeline"
        />
      )}
      {(state === 'initiating' || state === 'completing') && (
        <p className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--cms-text-soft)' }}>
          <LoaderCircle className="w-4 h-4 animate-spin" />
          {state === 'initiating'
            ? (isArabic ? 'جارٍ تهيئة رابط الرفع…' : 'Requesting the upload URL…')
            : (isArabic ? 'جارٍ التحقق من الملف المرفوع…' : 'Verifying the uploaded file…')}
        </p>
      )}
      {/* The ladder stays mounted through Ready — the admin sees the full
          checklist complete + the bar at 100% under the success banner.
          10.8: the visible steps follow the episode's stored target quality
          (P360 → [Pending, SD, Ready]; Auto → the full five steps). */}
      {(state === 'processing' || state === 'ready') && (
        <ProcessingTimeline
          stage="processing"
          status={state === 'ready' ? 'Ready' : (processingStatus ?? undefined)}
          targetQuality={processingEpisode ? (processingEpisode.targetQuality ?? null) : metadata.targetQuality}
          isArabic={isArabic}
          testId="upload-processing-timeline"
        />
      )}
      {state === 'ready' && (
        <div data-testid="upload-ready-banner" className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          style={{ background: 'rgba(16, 185, 129, 0.06)', borderColor: 'var(--cms-teal-200)', color: 'var(--cms-teal-700)' }}>
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{isArabic ? 'الفيديو جاهز للمشاهدة ✅' : 'The video is ready to watch ✅'}</p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic ? 'اكتملت المعالجة — يمكنك رفع وسائط أخرى أو إغلاق اللوحة.' : 'Processing finished — you can upload another media file or close the panel.'}
            </p>
          </div>
        </div>
      )}

      {/* Push 6: persistent inline failure banner with retry guidance.
          10.8: a DELIBERATE processing abort swaps the headline — it is not a failure. */}
      {state === 'failed' && lastError && (
        <div role="alert" data-testid="upload-error-banner" className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          style={{ background: 'rgba(239, 68, 68, 0.06)', borderColor: 'var(--cms-red-200)', color: 'var(--cms-red-600)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{cancelledProcessing
              ? (isArabic ? 'تم إلغاء المعالجة' : 'Processing cancelled')
              : (isArabic ? 'تعذّر إتمام الرفع' : 'Upload failed')}</p>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>{lastError}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
              {cancelledProcessing
                ? (isArabic ? 'الحالة على الخادم: «فشلت المعالجة» — إعادة المحاولة تكون برفع جديد أو بعد تعديل الحلقة.' : 'Server status: Processing failed — retry with a new upload or after editing the episode.')
                : episodeId && sessionRef.current
                  ? (isArabic ? 'اضغط «إعادة المحاولة» لإعادة إرسال الملف كاملاً — لا توجد أجزاء محفوظة في الرفع الأحادي. إن استمر خطأ 403 فانتهت صلاحية الرابط: ألغِ الرفع وابدأ من جديد.' : 'Press Retry to re-send the entire file — a single PUT keeps no partial parts. A persistent 403 means the URL expired: cancel and start a fresh upload.')
                  : (isArabic ? 'اضغط «بدء الرفع» لإعادة المحاولة.' : 'Press Start upload to try again.')}
            </p>
            {errorDialog && (errorDialog.technicalDetails || errorDialog.humanMessage) && (
              <button type="button" onClick={() => setErrorDialog((dialog) => ({ ...dialog }))}
                data-testid="upload-error-details-button"
                className="mt-2 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
                {copy2.details}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(state === 'idle' || state === 'failed') && (
          <button type="button" onClick={() => void start()} disabled={!file}
            data-testid="upload-start-button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
            <Upload className="w-4 h-4" /> {copy2.start}
          </button>
        )}
        {state === 'ready' && (
          <button type="button" onClick={resetForNewUpload}
            data-testid="upload-another-button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: 'var(--cms-teal-700)' }}>
            <Upload className="w-4 h-4" /> {copy2.another}
          </button>
        )}
        {/* 10.8f: a failed PUT is retried against the SAME presigned URL while it is
            still valid (S3 PUT is atomic — the failed attempt stored nothing). */}
        {state === 'failed' && episodeId && sessionRef.current && (
          <button type="button" onClick={() => void retry()} data-testid="upload-retry-button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: 'var(--cms-teal-700)' }}>
            <RefreshCw className="w-4 h-4" /> {copy.retry}
          </button>
        )}
        {/* 10.8f: the only in-upload control is Cancel — a single PUT cannot pause.
            Cancel aborts the XHR (nothing partial is stored) and removes the episode. */}
        {(state === 'uploading' || (state === 'failed' && episodeId)) && sessionRef.current && (
          <button type="button" onClick={() => void abort()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium text-red-600" style={{ borderColor: 'var(--cms-red-200)' }}>
            <X className="w-4 h-4" /> {copy.abort}
          </button>
        )}
        {/* Push 10.8 (1.C) — "إلغاء المعالجة": visible ONLY while an encode is
            actually running (Transcoding_*). Kills the server-side FFmpeg and
            marks the episode Failed. */}
        {encodeRunning && (
          <button type="button" onClick={() => void cancelProcessing()} disabled={cancelling}
            data-testid="cancel-processing-button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50" style={{ borderColor: 'var(--cms-red-200)' }}>
            {cancelling
              ? <LoaderCircle className="w-4 h-4 animate-spin" />
              : <Ban className="w-4 h-4" />}
            {isArabic ? 'إلغاء المعالجة' : 'Cancel processing'}
          </button>
        )}
      </div>

      {/* ===== 1.C — the dual-language failure modal ===== */}
      <ProcessingErrorModal
        open={errorDialog !== null}
        onOpenChange={(open) => { if (!open) setErrorDialog(null); }}
        isArabic={isArabic}
        humanMessage={errorDialog?.humanMessage}
        technicalDetails={errorDialog?.technicalDetails}
        retrying={retrying}
        onRetry={errorDialog?.retryProcessing
          ? () => void retryProcessing()
          : sessionRef.current
            ? () => { setErrorDialog(null); setLastError(null); void retry(); }
            : undefined}
        testId="upload-error-modal"
      />
    </div>
  );
}
