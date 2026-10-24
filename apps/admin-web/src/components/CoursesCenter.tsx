/**
 * CoursesCenter — Push 4 / Track 4: course & episode management (Courses tab of the
 * Library center; gated by tab:library.courses).
 *
 * Composition:
 *   • Toolbar (create-course CTA gated by btn:library.course.create)
 *   • Courses table: title, subject, episodes count, status badge, created, row actions
 *     (edit · publish · archive · delete — each btn:library.course.* gated)
 *   • Episode manager drawer per course: ordered episodes (Upload | YouTube),
 *     add-YouTube form, multipart video upload (btn:library.course.episode.upload),
 *     delete episode (btn:library.course.episode.delete)
 *   • MultipartUploadPanel: initiate → 64 MB parts via presigned PUTs with per-part
 *     retry (×3), overall progress, pause/resume (resume re-syncs with server-side
 *     ListParts via GET multipart-status so parts already stored are never re-sent),
 *     abort, then complete-upload (server verifies the assembled size).
 *
 * The 2.5 GB ceiling is enforced server-side (upload.limit.video_mb); this UI simply
 * surfaces the server's FILE_TOO_LARGE error.
 *
 * Design tokens (--cms-*) applied via inline style; structural styling is Tailwind.
 * Bilingual (ar/en) with dir on the section root. The API remains the security gate —
 * every button here is cosmetic gating only.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Archive, CheckCircle2, ChevronDown, ChevronUp, Film, GraduationCap,
  AlertTriangle, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, Upload, X, Youtube, Pause, Play,
} from 'lucide-react';
import {
  apiRequest, type PagedResult, type AdminCourseListItem, type CourseDetail,
  type CourseEpisode, type InitiateUploadResponse, type MultipartStatus,
} from '../lib/api';
import { sniffEpisodeMediaType } from '../lib/mediaType';
import { useUiPermissions } from '../hooks/useUiPermissions';

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
    title: 'الكورسات', desc: 'إنشاء وإدارة كورسات الفيديو وحلقاتها (رفع متعدد الأجزاء حتى 2.5GB أو يوتيوب).',
    create: 'إنشاء كورس', refresh: 'تحديث', episodes: 'حلقات', episodesCount: 'الحلقات', views: 'مشاهدات',
    created: 'تاريخ الإنشاء', status: 'الحالة', subject: 'المادة', actions: 'إجراءات',
    publish: 'نشر', archive: 'أرشفة', delete: 'حذف', edit: 'تعديل',
    noSubject: 'اختر مادة من التدرج الأكاديمي أعلاه لعرض كورساتها أو إنشاء كورس جديد.',
    noCourses: 'لا توجد كورسات في هذه المادة بعد.',
    formTitle: 'عنوان الكورس', formDesc: 'الوصف', formCover: 'رابط صورة الغلاف (اختياري)',
    save: 'حفظ', cancel: 'إلغاء', createCourse: 'إنشاء كورس جديد', editCourse: 'تعديل الكورس',
    addEpisode: 'إضافة حلقة', youtubeId: 'معرّف فيديو يوتيوب', episodeTitle: 'عنوان الحلقة',
    episodeNumber: 'رقم الحلقة', duration: 'المدة (ثانية، اختياري)', add: 'إضافة', uploadVideo: 'رفع وسائط (فيديو/صوت)',
    uploading: 'جارٍ الرفع…', pause: 'إيقاف مؤقت', resume: 'استئناف', abort: 'إلغاء الرفع',
    incomplete: 'لم يكتمل الرفع', ready: 'جاهز', close: 'إغلاق', selectFile: 'اختر ملف الفيديو أو الصوت',
  } : {
    title: 'Courses', desc: 'Create and manage video courses and their episodes (multipart upload up to 2.5GB, or YouTube).',
    create: 'Create course', refresh: 'Refresh', episodes: 'Episodes', episodesCount: 'Episodes', views: 'Views',
    created: 'Created', status: 'Status', subject: 'Subject', actions: 'Actions',
    publish: 'Publish', archive: 'Archive', delete: 'Delete', edit: 'Edit',
    noSubject: 'Pick a subject in the hierarchy above to list or create its courses.',
    noCourses: 'No courses in this subject yet.',
    formTitle: 'Course title', formDesc: 'Description', formCover: 'Cover image URL (optional)',
    save: 'Save', cancel: 'Cancel', createCourse: 'Create new course', editCourse: 'Edit course',
    addEpisode: 'Add episode', youtubeId: 'YouTube video id', episodeTitle: 'Episode title',
    episodeNumber: 'Episode number', duration: 'Duration (seconds, optional)', add: 'Add', uploadVideo: 'Upload media (video/audio)',
    uploading: 'Uploading…', pause: 'Pause', resume: 'Resume', abort: 'Abort upload',
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
function buildCopy(isArabic: boolean) {
  return isArabic ? {
    addEpisode: 'إضافة حلقة', youtubeId: 'معرّف فيديو يوتيوب', episodeTitle: 'عنوان الحلقة',
    episodeNumber: 'رقم الحلقة', duration: 'المدة (ثانية، اختياري)', add: 'إضافة', uploadVideo: 'رفع وسائط (فيديو/صوت)',
    uploading: 'جارٍ الرفع…', pause: 'إيقاف مؤقت', resume: 'استئناف', abort: 'إلغاء الرفع',
    incomplete: 'لم يكتمل الرفع', ready: 'جاهز', close: 'إغلاق', selectFile: 'اختر ملف الفيديو أو الصوت',
    deleteEpisode: 'حذف الحلقة', episodes: 'الحلقات', retrying: 'إعادة المحاولة…',
  } : {
    addEpisode: 'Add episode', youtubeId: 'YouTube video id', episodeTitle: 'Episode title',
    episodeNumber: 'Episode number', duration: 'Duration (seconds, optional)', add: 'Add', uploadVideo: 'Upload media (video/audio)',
    uploading: 'Uploading…', pause: 'Pause', resume: 'Resume', abort: 'Abort upload',
    incomplete: 'Upload incomplete', ready: 'Ready', close: 'Close', selectFile: 'Choose a video or audio file',
    deleteEpisode: 'Delete episode', episodes: 'Episodes', retrying: 'Retrying…',
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

      {/* Multipart upload panel */}
      {uploadPanel && can('btn:library.course.episode.upload') && (
        <MultipartUploadPanel
          token={token} isArabic={isArabic} onError={onError} onNotice={onNotice}
          courseId={course.id} defaultEpisodeNumber={nextEpisodeNumber}
          onDone={async () => { await loadDetail(); await onChanged(); }}
        />
      )}

      {/* Episodes list */}
      <div className="space-y-2">
        {(detail?.episodes ?? []).map(episode => (
          <div key={episode.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
              {episode.episodeNumber}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--cms-text)' }}>{episode.title}</p>
              <p className="text-xs flex items-center gap-2" style={{ color: 'var(--cms-text-muted)' }}>
                {episode.sourceType === 'YouTube'
                  ? <span className="inline-flex items-center gap-1"><Youtube className="w-3 h-3" /> YouTube</span>
                  : <span className="inline-flex items-center gap-1"><Film className="w-3 h-3" /> {formatBytes(episode.fileSize)}</span>}
                {episode.durationSeconds ? <span>· {Math.floor(episode.durationSeconds / 60)}د</span> : null}
                {episode.sourceType === 'Upload' && !episode.uploadCompleted && (
                  <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="w-3 h-3" /> {copy.incomplete}</span>
                )}
              </p>
            </div>
            {can('btn:library.course.episode.delete') && (
              <button type="button" title={copy.deleteEpisode} disabled={busy} onClick={() => void deleteEpisode(episode)}
                className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {detail && detail.episodes.length === 0 && (
          <p className="text-xs text-center py-3" style={{ color: 'var(--cms-text-muted)' }}>—</p>
        )}
      </div>
    </div>
  );
}

// ===== Multipart upload panel =====
type UploadState = 'idle' | 'initiating' | 'uploading' | 'paused' | 'completing' | 'done' | 'failed';

function MultipartUploadPanel({ token, isArabic, onError, onNotice, courseId, defaultEpisodeNumber, onDone }: {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  courseId: string;
  defaultEpisodeNumber: number;
  onDone: () => void | Promise<void>;
}) {
  const copy = buildCopy(isArabic);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState(String(defaultEpisodeNumber));
  const [state, setState] = useState<UploadState>('idle');
  const [progressBytes, setProgressBytes] = useState(0);
  const [eta, setEta] = useState<string>('');
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [completedParts, setCompletedParts] = useState(0);
  const [totalParts, setTotalParts] = useState(0);
  // Push 6: the failure reason persists inline in the panel (a toast alone is too easy to miss).
  const [lastError, setLastError] = useState<string | null>(null);

  // Mutable upload session — survives pause/resume cycles.
  const sessionRef = useRef<{
    episodeId: string;
    partSize: number;
    partCount: number;
    urls: Map<number, string>;
    etags: Map<number, string>;
    uploadedBytes: Map<number, number>;
    file: File;
    paused: boolean;
    cancelled: boolean;
    startedAt: number;
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

  /** Maps the server's pendingPartUrls (ascending) onto the missing part numbers (ascending). */
  const mapPendingUrls = (status: MultipartStatus, urls: Map<number, string>) => {
    const stored = new Set(status.uploadedParts.map(part => part.partNumber));
    const missing = Array.from({ length: status.partCount }, (_, i) => i + 1).filter(n => !stored.has(n));
    status.pendingPartUrls.forEach((url, index) => {
      if (index < missing.length) urls.set(missing[index], url);
    });
  };

  const putPart = (url: string, blob: Blob) => new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = (xhr.getResponseHeader('ETag') ?? '').replace(/"/g, '');
        etag ? resolve(etag) : reject(new Error('missing ETag'));
      } else reject(new Error(`HTTP ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('network error')));
    xhr.send(blob);
  });

  const runSession = async () => {
    const session = sessionRef.current;
    if (!session) return;
    session.paused = false;
    setState('uploading');

    for (let partNumber = 1; partNumber <= session.partCount; partNumber++) {
      if (session.cancelled) return;
      if (session.paused) { setState('paused'); return; }
      if (session.etags.has(partNumber)) continue; // already stored (resume)

      const url = session.urls.get(partNumber);
      if (!url) { // part URL expired (credentials rotate) — re-fetch via multipart-status
        const status = await request<MultipartStatus>(`/api/v1/admin/courses/episodes/${session.episodeId}/multipart-status`);
        mapPendingUrls(status, session.urls);
      }

      const start = (partNumber - 1) * session.partSize;
      const end = Math.min(partNumber * session.partSize, session.file.size);
      const blob = session.file.slice(start, end);

      let attempt = 0;
      // Per-part retry ×3, then pause with an error surface (the user can resume).
      for (;;) {
        if (session.cancelled) return;
        if (session.paused) { setState('paused'); return; }
        try {
          const etag = await putPart(session.urls.get(partNumber)!, blob);
          session.etags.set(partNumber, etag);
          session.uploadedBytes.set(partNumber, blob.size);
          setCompletedParts(session.etags.size);
          setProgressBytes([...session.uploadedBytes.values()].reduce((a, b) => a + b, 0));
          const elapsed = (Date.now() - session.startedAt) / 1000;
          const speed = [...session.uploadedBytes.values()].reduce((a, b) => a + b, 0) / Math.max(elapsed, 0.001);
          const remaining = session.file.size - [...session.uploadedBytes.values()].reduce((a, b) => a + b, 0);
          setEta(`${(speed / 1024 / 1024).toFixed(1)} MB/s · ~${Math.max(1, Math.round(remaining / Math.max(speed, 1)))}s`);
          break;
        } catch (error) {
          attempt++;
          if (attempt >= 3) {
            session.paused = true;
            setState('paused');
            onError(isArabic
              ? `تعذّر رفع الجزء ${partNumber} بعد 3 محاولات — تم الإيقاف المؤقت. اضغط "استئناف" للمتابعة. (${error instanceof Error ? error.message : 'خطأ'})`
              : `Part ${partNumber} failed after 3 attempts — paused. Press Resume to continue. (${error instanceof Error ? error.message : 'error'})`);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
        }
      }
    }

    // All parts stored → complete (server verifies the assembled size against the ceiling).
    if (session.cancelled) return;
    setState('completing');
    try {
      await request(`/api/v1/admin/courses/episodes/${session.episodeId}/complete-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [...session.etags.entries()].sort((a, b) => a[0] - b[0]).map(([partNumber, etag]) => ({ partNumber, etag })),
        }),
      });
      setState('done');
      setLastError(null);
      onNotice(isArabic ? 'تم رفع الحلقة والتحقق من حجمها بنجاح.' : 'Episode uploaded and size-verified.');
      await onDone();
      sessionRef.current = null;
      setFile(null);
      setTitle('');
    } catch (error) {
      setState('failed');
      const message = describeUploadError(error, 'complete-upload failed.');
      setLastError(message);
      onError(message);
    }
  };

  const start = async () => {
    if (!file || !title.trim() || !episodeNumber.trim()) {
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
    try {
      const initiated = await request<InitiateUploadResponse>(`/api/v1/admin/courses/${courseId}/episodes/initiate-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          fileSize: file.size,
          title: title.trim(),
          episodeNumber: Number(episodeNumber),
        }),
      });
      const urls = new Map<number, string>();
      initiated.partUrls.forEach((url, index) => urls.set(index + 1, url));
      sessionRef.current = {
        episodeId: initiated.episodeId,
        partSize: initiated.partSizeBytes,
        partCount: initiated.partCount,
        urls,
        etags: new Map(),
        uploadedBytes: new Map(),
        file,
        paused: false,
        cancelled: false,
        startedAt: Date.now(),
      };
      setEpisodeId(initiated.episodeId);
      setTotalParts(initiated.partCount);
      setCompletedParts(0);
      setProgressBytes(0);
      await runSession();
    } catch (error) {
      setState('failed');
      const message = describeUploadError(error, 'initiate-upload failed.');
      setLastError(message);
      onError(message);
    }
  };

  const resume = async () => {
    const session = sessionRef.current;
    if (!session) return;
    // Re-sync with the server: parts already stored are listed and never re-sent;
    // fresh presigned URLs are issued for the rest (credentials rotate every ~10 min).
    try {
      const status = await request<MultipartStatus>(`/api/v1/admin/courses/episodes/${session.episodeId}/multipart-status`);
      session.etags = new Map(status.uploadedParts.map(part => [part.partNumber, part.etag]));
      session.uploadedBytes = new Map(status.uploadedParts.map(part => [part.partNumber, part.size]));
      mapPendingUrls(status, session.urls);
      setCompletedParts(session.etags.size);
      setProgressBytes([...session.uploadedBytes.values()].reduce((a, b) => a + b, 0));
    } catch {
      // Offline re-sync failed — local part map is still usable for parts with valid URLs.
    }
    await runSession();
  };

  const pause = () => {
    if (sessionRef.current) sessionRef.current.paused = true;
    setState('paused');
  };

  const abort = async () => {
    const session = sessionRef.current;
    if (!session) return;
    session.cancelled = true;
    session.paused = true;
    try {
      await request(`/api/v1/admin/courses/episodes/${session.episodeId}/abort-upload`, { method: 'POST' });
      onNotice(isArabic ? 'تم إلغاء الرفع وحذف الحلقة غير المكتملة.' : 'Upload aborted; the incomplete episode was removed.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'abort-upload failed.');
    }
    sessionRef.current = null;
    setState('idle');
    setFile(null);
    await onDone();
  };

  const busyState = state === 'initiating' || state === 'uploading' || state === 'completing';
  const percent = file && file.size > 0 ? Math.min(100, Math.round((progressBytes / file.size) * 100)) : 0;

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3" style={{ borderColor: 'var(--cms-teal-200)' }}>
      <div className="flex items-center gap-2">
        <Upload className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
        <h5 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{copy.uploadVideo}</h5>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <input type="file" accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/webm"
          disabled={busyState || state === 'paused'}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-sm px-3 py-2 rounded-lg border w-full" style={{ borderColor: 'var(--cms-line-strong)' }} />
        <input value={title} disabled={busyState || state === 'paused'} onChange={(e) => setTitle(e.target.value)}
          placeholder={isArabic ? 'عنوان الحلقة' : 'Episode title'} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
        <input value={episodeNumber} disabled={busyState || state === 'paused'} onChange={(e) => setEpisodeNumber(e.target.value)}
          inputMode="numeric" placeholder={isArabic ? 'رقم الحلقة' : 'Episode number'} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--cms-line-strong)' }} />
      </div>

      {file && state !== 'idle' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--cms-text-soft)' }}>
            <span>{formatBytes(progressBytes)} / {formatBytes(file.size)} · {completedParts}/{totalParts} parts</span>
            <span>{percent}% {state === 'uploading' ? `· ${eta}` : ''}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--cms-ivory-100)' }}>
            <div className="h-full transition-all" style={{ width: `${percent}%`, background: state === 'failed' ? 'var(--cms-red-500)' : 'var(--cms-teal-600)' }} />
          </div>
        </div>
      )}

      {/* Push 6: persistent inline failure banner with retry guidance */}
      {state === 'failed' && lastError && (
        <div role="alert" data-testid="upload-error-banner" className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          style={{ background: 'rgba(239, 68, 68, 0.06)', borderColor: 'var(--cms-red-200)', color: 'var(--cms-red-600)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{isArabic ? 'تعذّر إتمام الرفع' : 'Upload failed'}</p>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>{lastError}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
              {episodeId
                ? (isArabic ? 'الأجزاء المرفوعة محفوظة — اضغط «استئناف» للمتابعة دون إعادة إرسالها.' : 'Uploaded parts are kept — press Resume to continue without re-sending them.')
                : (isArabic ? 'اضغط «بدء الرفع» لإعادة المحاولة.' : 'Press Start upload to try again.')}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {state === 'idle' || state === 'done' || state === 'failed' ? (
          <button type="button" onClick={() => void start()} disabled={!file}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
            <Upload className="w-4 h-4" /> {isArabic ? 'بدء الرفع' : 'Start upload'}
          </button>
        ) : null}
        {state === 'uploading' && (
          <button type="button" onClick={pause}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
            <Pause className="w-4 h-4" /> {copy.pause}
          </button>
        )}
        {state === 'paused' && (
          <button type="button" onClick={() => void resume()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: 'var(--cms-teal-700)' }}>
            <Play className="w-4 h-4" /> {copy.resume}
          </button>
        )}
        {/* Push 6: a failed session with a live episode can be resumed (e.g. transient 500 at complete) */}
        {state === 'failed' && episodeId && sessionRef.current && (
          <button type="button" onClick={() => { setLastError(null); void resume(); }} data-testid="retry-resume-button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: 'var(--cms-teal-700)' }}>
            <Play className="w-4 h-4" /> {copy.resume}
          </button>
        )}
        {(state === 'paused' || state === 'uploading' || state === 'failed') && episodeId && (
          <button type="button" onClick={() => void abort()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium text-red-600" style={{ borderColor: 'var(--cms-red-200)' }}>
            <X className="w-4 h-4" /> {copy.abort}
          </button>
        )}
        {(state === 'initiating' || state === 'completing') && (
          <span className="inline-flex items-center gap-1.5 px-3 py-2 text-sm" style={{ color: 'var(--cms-text-soft)' }}>
            <LoaderCircle className="w-4 h-4 animate-spin" /> {state === 'initiating' ? (isArabic ? 'جارٍ التهيئة…' : 'Initializing…') : (isArabic ? 'جارٍ الإتمام والتحقق…' : 'Completing & verifying…')}
          </span>
        )}
      </div>
    </div>
  );
}
