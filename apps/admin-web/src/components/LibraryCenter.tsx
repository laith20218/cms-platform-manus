import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Archive, CheckCircle2, FileText, LoaderCircle, Plus, Search,
  Trash2, Upload, X, AlertCircle, FileImage, FileVideo, FileAudio, FileCode,
} from 'lucide-react';
import { apiRequest, type PagedResult, type AdminLibraryFileListItem, type UploadUrlResponse } from '../lib/api';

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
};

const emptyForm = (): UploadForm => ({
  fileName: '', contentType: 'application/pdf', fileSize: 0,
  subjectId: '', lectureId: '', type: 'Pdf', title: '', description: '',
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

const statusColor = (status: string) => {
  switch (status) {
    case 'Published': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    case 'Archived': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'Draft': return 'text-slate-600 bg-slate-50 border-slate-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

const scanColor = (scan: string) => {
  switch (scan) {
    case 'Clean': return 'text-emerald-600';
    case 'Infected': return 'text-red-600';
    case 'Error': return 'text-amber-600';
    case 'Pending': return 'text-sky-600';
    default: return 'text-slate-500';
  }
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

export function LibraryCenter({ token, isArabic, onError, onNotice }: Props) {
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
    if (!universityId) return;
    void request<PagedResult<College>>(`/api/v1/colleges?Page=1&PageSize=100&universityId=${universityId}`)
      .then(data => setColleges(data.items))
      .catch(() => setColleges([]));
    setCollegeId(''); setYears([]); setYearId(''); setSemesters([]); setSemesterId(''); setSubjects([]); setSubjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityId]);

  useEffect(() => {
    if (!collegeId) return;
    void request<PagedResult<AcademicYear>>(`/api/v1/years?Page=1&PageSize=100&collegeId=${collegeId}`)
      .then(data => setYears(data.items))
      .catch(() => setYears([]));
    setYearId(''); setSemesters([]); setSemesterId(''); setSubjects([]); setSubjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId]);

  useEffect(() => {
    if (!yearId) return;
    void request<PagedResult<Semester>>(`/api/v1/semesters?Page=1&PageSize=100&yearId=${yearId}`)
      .then(data => setSemesters(data.items))
      .catch(() => setSemesters([]));
    setSemesterId(''); setSubjects([]); setSubjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  useEffect(() => {
    if (!semesterId) return;
    void request<PagedResult<Subject>>(`/api/v1/subjects?Page=1&PageSize=100&semesterId=${semesterId}`)
      .then(data => setSubjects(data.items))
      .catch(() => setSubjects([]));
    setSubjectId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterId]);

  useEffect(() => {
    if (!subjectId) { setLectures([]); setLectureId(''); return; }
    void request<PagedResult<Lecture>>(`/api/v1/lectures?Page=1&PageSize=100&subjectId=${subjectId}`)
      .then(data => setLectures(data.items))
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
    if (subjectId || statusFilter || query) void loadFiles(1);
    else { setFiles([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, statusFilter]);

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
      setShowUpload(false);
      setForm(emptyForm());
      setSelectedFile(null);
      setUploadProgress(0);
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

  const copy = useMemo(() => isArabic ? {
    title: 'مركز المكتبة والملفات',
    desc: 'إدارة ملفات المكتبة الرقمية: رفع، نشر، أرشفة، حذف.',
    selectUniversity: 'الجامعة', selectCollege: 'الكلية', selectYear: 'السنة', selectSemester: 'الفصل', selectSubject: 'المادة', selectLecture: 'المحاضرة',
    search: 'ابحث بالعنوان', filterStatus: 'الحالة', filterType: 'النوع', all: 'الكل',
    addFile: 'رفع ملف', refresh: 'تحديث', loading: 'جارٍ التحميل…',
    upload: 'رفع ملف جديد', fileToUpload: 'الملف', title_ar: 'العنوان', description: 'الوصف', type: 'النوع', submit: 'رفع', cancel: 'إلغاء',
    progress: 'التقدم', uploading: 'جارٍ الرفع…',
    status: 'الحالة', scanStatus: 'الفحص', size: 'الحجم', subject: 'المادة', created: 'تاريخ الإنشاء', actions: 'إجراءات',
    publish: 'نشر', archive: 'أرشفة', delete: 'حذف', deleteTitle: 'تأكيد الحذف', deleteText: 'هذا الإجراء دائم. سيُحذف الملف من التخزين والقاعدة.',
    confirmDelete: 'حذف نهائي', close: 'إغلاق',
    noFiles: 'لا توجد ملفات مطابقة.',
    selectFile: 'اختر ملفاً', fillRequired: 'الرجاء اختيار ملف ومادة وعنوان',
  } : {
    title: 'Library & Files Center', desc: 'Manage library files: upload, publish, archive, delete.',
    selectUniversity: 'University', selectCollege: 'College', selectYear: 'Year', selectSemester: 'Semester', selectSubject: 'Subject', selectLecture: 'Lecture',
    search: 'Search by title', filterStatus: 'Status', filterType: 'Type', all: 'All',
    addFile: 'Upload file', refresh: 'Refresh', loading: 'Loading…',
    upload: 'Upload new file', fileToUpload: 'File', title_ar: 'Title', description: 'Description', type: 'Type', submit: 'Upload', cancel: 'Cancel',
    progress: 'Progress', uploading: 'Uploading…',
    status: 'Status', scanStatus: 'Scan', size: 'Size', subject: 'Subject', created: 'Created', actions: 'Actions',
    publish: 'Publish', archive: 'Archive', delete: 'Delete', deleteTitle: 'Confirm delete', deleteText: 'This is permanent. The file will be removed from storage and database.',
    confirmDelete: 'Delete permanently', close: 'Close',
    noFiles: 'No matching files.',
    selectFile: 'Choose file', fillRequired: 'Please select a file, subject, and title',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArabic]);

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{copy.title}</h2>
          <p className="text-sm text-slate-600 mt-1">{copy.desc}</p>
        </div>
        <button
          onClick={() => setShowUpload(v => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          disabled={busy}
        >
          <Plus className="w-4 h-4" /> {copy.addFile}
        </button>
      </header>

      {/* Academic hierarchy filters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <select value={universityId} onChange={(e) => setUniversityId(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="">{copy.selectUniversity}</option>
          {universities.map(u => <option key={u.id} value={u.id}>{label(isArabic, u)}</option>)}
        </select>
        <select value={collegeId} onChange={(e) => setCollegeId(e.target.value)} disabled={!universityId} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50">
          <option value="">{copy.selectCollege}</option>
          {colleges.map(c => <option key={c.id} value={c.id}>{label(isArabic, c)}</option>)}
        </select>
        <select value={yearId} onChange={(e) => setYearId(e.target.value)} disabled={!collegeId} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50">
          <option value="">{copy.selectYear}</option>
          {years.map(y => <option key={y.id} value={y.id}>{label(isArabic, y)}</option>)}
        </select>
        <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} disabled={!yearId} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50">
          <option value="">{copy.selectSemester}</option>
          {semesters.map(s => <option key={s.id} value={s.id}>{label(isArabic, s)}</option>)}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!semesterId} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50">
          <option value="">{copy.selectSubject}</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{label(isArabic, s)}</option>)}
        </select>
        <select value={lectureId} onChange={(e) => setLectureId(e.target.value)} disabled={!subjectId} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50">
          <option value="">{copy.selectLecture}</option>
          {lectures.map(l => <option key={l.id} value={l.id}>{label(isArabic, l)}</option>)}
        </select>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadFiles(1)}
            placeholder={copy.search}
            className="w-full pr-10 pl-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="">{copy.filterStatus}: {copy.all}</option>
          <option value="Draft">Draft</option>
          <option value="Published">Published</option>
          <option value="Archived">Archived</option>
        </select>
        <button onClick={() => loadFiles(page)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
          {copy.refresh}
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <form onSubmit={handleUpload} className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">{copy.upload}</h3>
            <button type="button" onClick={() => { setShowUpload(false); setSelectedFile(null); setUploadProgress(0); }} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{copy.fileToUpload}</label>
              <input
                type="file"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
              />
              {selectedFile && (
                <p className="mt-1 text-xs text-slate-500">{selectedFile.name} • {formatBytes(selectedFile.size)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{copy.title_ar}</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{copy.type}</label>
              <select
                value={form.type}
                onChange={(e) => setForm(f => ({ ...f, type: e.target.value as UploadForm['type'] }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                {(['Pdf', 'Html', 'Image', 'Video', 'Audio', 'Summary', 'Comprehensive', 'Paragraph'] as const).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{copy.description}</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>
          {uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-600">
                <span>{copy.uploading}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-teal-600 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => { setShowUpload(false); setSelectedFile(null); setUploadProgress(0); }} className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
              {copy.cancel}
            </button>
            <button type="submit" disabled={busy || !selectedFile || !form.subjectId || !form.title} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {copy.submit}
            </button>
          </div>
        </form>
      )}

      {/* Files table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <LoaderCircle className="w-6 h-6 animate-spin ml-2" /> {copy.loading}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-12 text-slate-500">{copy.noFiles}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-right px-4 py-3 font-medium">{copy.title_ar}</th>
                <th className="text-right px-4 py-3 font-medium">{copy.type}</th>
                <th className="text-right px-4 py-3 font-medium">{copy.subject}</th>
                <th className="text-right px-4 py-3 font-medium">{copy.size}</th>
                <th className="text-right px-4 py-3 font-medium">{copy.status}</th>
                <th className="text-right px-4 py-3 font-medium">{copy.scanStatus}</th>
                <th className="text-right px-4 py-3 font-medium">{copy.created}</th>
                <th className="text-right px-4 py-3 font-medium">{copy.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {files.map(file => {
                const Icon = fileTypeIcon(file.type);
                return (
                  <tr key={file.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-900">{file.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{file.type}</td>
                    <td className="px-4 py-3 text-slate-600">{file.subjectNameAr}</td>
                    <td className="px-4 py-3 text-slate-600">{formatBytes(file.fileSize)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${statusColor(file.status)}`}>{file.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${scanColor(file.virusScanStatus)}`}>{file.virusScanStatus}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(file.createdAt).toLocaleDateString(isArabic ? 'ar' : 'en')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {file.status === 'Draft' && file.virusScanStatus === 'Clean' && (
                          <button onClick={() => handlePublish(file)} disabled={busy} title={copy.publish} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 disabled:opacity-50">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {file.status === 'Published' && (
                          <button onClick={() => handleArchive(file)} disabled={busy} title={copy.archive} className="p-1.5 rounded hover:bg-amber-50 text-amber-600 disabled:opacity-50">
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setConfirmDelete(file)} disabled={busy} title={copy.delete} className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{copy.deleteTitle}</h3>
                <p className="text-sm text-slate-600 mt-1">{copy.deleteText}</p>
                <p className="text-sm font-medium text-slate-900 mt-2">"{confirmDelete.title}"</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">{copy.cancel}</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} {copy.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
