import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  FileText, Image as ImageIcon, Video, BookOpen, FileCode, AudioLines,
  Bookmark, ChevronLeft, Eye, Loader2, X, ExternalLink, FileQuestion, AlertTriangle,
} from 'lucide-react';
import { libraryApi, type LibraryFile, type FileAccess } from './services/library-api';
import { academicApi } from '@/features/subjects/services/academic-api';

const typeConfig = {
  pdf: { icon: FileText, label: 'PDF', color: 'var(--c-danger-500)', bg: 'rgba(255,82,82,0.10)' },
  html: { icon: FileCode, label: 'HTML', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  image: { icon: ImageIcon, label: 'صورة', color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  video: { icon: Video, label: 'فيديو', color: 'var(--c-warning-500)', bg: 'rgba(255,179,0,0.10)' },
  audio: { icon: AudioLines, label: 'صوت', color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  summary: { icon: BookOpen, label: 'ملخص', color: 'var(--c-success-500)', bg: 'var(--c-success-50)' },
  comprehensive: { icon: BookOpen, label: 'شامل', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  paragraph: { icon: FileText, label: 'فقرة', color: 'var(--c-text-muted)', bg: 'var(--c-neutral-100)' },
};

export default function LibraryPage() {
  const { subjectSlug } = useParams<{ subjectSlug: string }>();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<LibraryFile | null>(null);
  const [filterType, setFilterType] = useState<string | undefined>(undefined);

  const { data: subject, isLoading: subjectLoading } = useQuery({
    queryKey: ['subject', subjectSlug],
    queryFn: () => academicApi.getSubjectBySlug(subjectSlug!),
    enabled: !!subjectSlug,
  });
  const subjectId = subject?.id;

  const { data, isLoading: filesLoading } = useQuery({
    queryKey: ['library', subjectId, filterType],
    queryFn: () => libraryApi.getFiles(subjectId!, filterType),
    enabled: !!subjectId,
  });

  const isLoading = subjectLoading || filesLoading;
  const files: LibraryFile[] = data?.items || [];
  const toggleFavorite = useMutation({
    mutationFn: (file: LibraryFile) => libraryApi.toggleFavorite(file.id, file.isFavorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', subjectId] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
    onError: () => toast.error('تعذر تحديث المفضلة. تحقق من اتصالك واستحقاقك.'),
  });

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
        <Link to="/dashboard" className="hover:text-[var(--c-primary-700)]">الرئيسية</Link>
        <ChevronLeft className="w-3 h-3" />
        <Link to={`/subjects/${subjectSlug}`} className="hover:text-[var(--c-primary-700)]">المادة</Link>
        <ChevronLeft className="w-3 h-3" />
        <span className="font-semibold text-[var(--c-text)]">المكتبة</span>
      </div>

      <h1 className="text-2xl font-bold">المكتبة الرقمية</h1>

      {/* Type Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterType(undefined)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${!filterType ? 'bg-[var(--c-primary-700)] text-white' : 'bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)]'}`}
        >
          الكل
        </button>
        {Object.entries(typeConfig).map(([type, config]) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${filterType === type ? 'bg-[var(--c-primary-700)] text-white' : 'bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)]'}`}
          >
            <config.icon className="w-3.5 h-3.5" />
            {config.label}
          </button>
        ))}
      </div>

      {/* Files Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>
      ) : files.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-muted)] opacity-50" />
          <p className="text-[var(--c-text-muted)]">لا توجد ملفات في المكتبة بعد</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file, i) => {
            const config = typeConfig[file.type as keyof typeof typeConfig] || typeConfig.paragraph;
            const Icon = config.icon;
            return (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedFile(file)}
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5 cursor-pointer hover:border-[var(--c-primary-200)] hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: config.bg, color: config.color }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--c-text)] truncate">{file.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)] mt-0.5">
                      <span style={{ color: config.color }}>{config.label}</span>
                      {file.pagesCount && <span lang="en">{file.pagesCount} صفحة</span>}
                      {file.durationSeconds && <span lang="en">{Math.floor(file.durationSeconds / 60)}د</span>}
                    </div>
                  </div>
                </div>

                {file.description && (
                  <p className="text-xs text-[var(--c-text-muted)] line-clamp-2 mb-3">{file.description}</p>
                )}

                {/* Thumbnail for images/videos */}
                {file.thumbnailUrl && (
                  <div className="mb-3 rounded-lg overflow-hidden h-24 bg-[var(--c-neutral-100)]">
                    <img src={file.thumbnailUrl} alt={file.title} className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-[var(--c-text-muted)]">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    <strong className="text-[var(--c-text-soft)]" lang="en">{file.viewsCount}</strong> مشاهدة
                  </span>
                  <div className="flex items-center gap-2">
                    <span lang="en">{formatFileSize(file.fileSize)}</span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFavorite.mutate(file);
                      }}
                      disabled={toggleFavorite.isPending}
                      aria-label={file.isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                      className={`rounded-md p-1 transition-colors disabled:opacity-50 ${file.isFavorite ? 'text-[var(--c-primary-700)]' : 'text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]'}`}
                    >
                      <Bookmark className="h-4 w-4" fill={file.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* File Viewer Modal (Radix Dialog) */}
      {selectedFile && (
        <FileViewer file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </div>
  );
}

// ===== File Viewer (Push 8 — Radix Dialog, zero technical clutter) =====

/**
 * Premium file viewer: a focus-trapped Radix Dialog sized for reading. All
 * technical/anti-piracy texts (lease expiry countdown, download warnings)
 * are gone from the UI — the invisible watermark overlay is the protection.
 * PDFs render in a native embed with an open-in-new-tab fallback; unknown
 * types get a calm card instead of a raw "unsupported" dead end.
 */
export function FileViewer({ file, onClose }: { file: LibraryFile; onClose: () => void }) {
  const [access, setAccess] = useState<FileAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewStartTime] = useState(Date.now());
  const recordedRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    libraryApi.getAccess(file.id)
      .then((data) => setAccess(data))
      .catch(() => toast.error('تعذّر الوصول للملف'))
      .finally(() => setLoading(false));
  }, [file.id]);

  // Record view on close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!recordedRef.current && access) {
        const duration = Math.round((Date.now() - viewStartTime) / 1000);
        libraryApi.recordView(file.id, duration);
        recordedRef.current = true;
      }
    };

    return () => handleBeforeUnload();
  }, [file.id, viewStartTime, access]);

  const config = typeConfig[file.type as keyof typeof typeConfig] || typeConfig.paragraph;

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="dialog-overlay fixed inset-0 z-[var(--z-modal)] backdrop-blur-[3px]"
          style={{ background: 'rgba(8, 26, 38, 0.60)' }}
        />
        <DialogPrimitive.Content
          data-testid="file-viewer"
          className="dialog-center fixed left-1/2 top-1/2 z-[calc(var(--z-modal)+1)] flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl bg-[var(--c-surface)] shadow-2xl outline-none"
        >
          {/* Header — file identity + close. No lease countdowns, no warnings. */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: config.bg, color: config.color }}>
                <config.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate font-bold text-[var(--c-text)]">
                  {file.title}
                </DialogPrimitive.Title>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
                  <span style={{ color: config.color }}>{config.label}</span>
                  {file.pagesCount ? <span lang="en">{file.pagesCount} صفحة</span> : null}
                  {file.durationSeconds ? (
                    <span lang="en">{Math.floor(file.durationSeconds / 60)}:{String(file.durationSeconds % 60).padStart(2, '0')}</span>
                  ) : null}
                  {access && (
                    <button
                      type="button"
                      onClick={() => window.open(access.accessUrl, '_blank', 'noopener,noreferrer')}
                      className="press inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--c-border)] px-2.5 py-1 font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-300)] hover:text-[var(--c-primary-700)]"
                      aria-label="فتح الملف في نافذة جديدة"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> نافذة جديدة
                    </button>
                  )}
                </div>
              </div>
            </div>
            <DialogPrimitive.Close
              aria-label="إغلاق"
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="relative flex-1 overflow-auto bg-[var(--c-neutral-50)]">
            {/* Watermark overlay — silent protection, no visual clutter */}
            {access && (
              <div
                className="pointer-events-none absolute inset-0 z-10"
                style={{
                  backgroundImage: 'linear-gradient(45deg, transparent 40%, rgba(25,118,210,0.03) 50%, transparent 60%)',
                  backgroundSize: '300px 300px',
                }}
              >
                <div className="absolute -rotate-45 whitespace-nowrap text-2xl font-bold text-[var(--c-primary-700)] opacity-[0.05]" style={{ top: '20%', left: '10%' }}>
                  {access.watermark.studentName} - {access.watermark.studentPhone}
                </div>
                <div className="absolute -rotate-45 whitespace-nowrap text-2xl font-bold text-[var(--c-primary-700)] opacity-[0.05]" style={{ top: '60%', left: '30%' }}>
                  {access.watermark.siteName} - {access.watermark.timestamp}
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" />
              </div>
            ) : access ? (
              file.type === 'pdf' ? (
                <iframe
                  src={`${access.accessUrl}#toolbar=0&navpanes=0`}
                  className="h-[74vh] w-full bg-white"
                  style={{ border: 'none' }}
                  title={file.title}
                />
              ) : file.type === 'html' ? (
                <iframe
                  src={access.accessUrl}
                  className="h-[74vh] w-full bg-white"
                  style={{ border: 'none' }}
                  title={file.title}
                  sandbox="allow-same-origin"
                />
              ) : file.type === 'video' ? (
                <div className="mx-auto aspect-video max-w-3xl">
                  {access.accessUrl.includes('youtube.com/embed')
                    ? <iframe src={access.accessUrl} className="h-full w-full rounded-2xl" style={{ border: 'none' }} title={file.title} allowFullScreen />
                    : <video src={access.accessUrl} className="h-full w-full rounded-2xl" controls controlsList="nodownload" />}
                </div>
              ) : file.type === 'audio' ? (
                <div className="mx-auto flex min-h-56 max-w-3xl items-center justify-center p-8">
                  <audio src={access.accessUrl} className="w-full" controls controlsList="nodownload" />
                </div>
              ) : file.type === 'image' ? (
                <div className="flex items-center justify-center p-8">
                  <img src={access.accessUrl} alt={file.title} className="max-h-[74vh] rounded-2xl" />
                </div>
              ) : file.type === 'paragraph' || file.type === 'summary' || file.type === 'comprehensive' ? (
                <iframe
                  src={access.accessUrl}
                  className="h-[74vh] w-full bg-white"
                  style={{ border: 'none' }}
                  title={file.title}
                  sandbox=""
                />
              ) : (
                // Unknown type — calm card with a real action, never a dead end.
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center" data-testid="file-unknown-type">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-primary-50)]">
                    <FileQuestion className="h-9 w-9 text-[var(--c-primary-700)]" />
                  </div>
                  <div>
                    <p className="font-bold text-[var(--c-text)]">لا يمكن عرض هذا الملف داخل التطبيق</p>
                    <p className="mt-1 text-sm text-[var(--c-text-muted)]">يمكنك فتحه في نافذة مستقلة بضغطة واحدة</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open(access.accessUrl, '_blank', 'noopener,noreferrer')}
                    className="press inline-flex min-h-11 items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-bold text-white shadow-md"
                    style={{ background: 'var(--c-primary-700)' }}
                  >
                    <ExternalLink className="h-4 w-4" /> فتح الملف
                  </button>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-danger-50)]">
                  <AlertTriangle className="h-9 w-9 text-[var(--c-danger-500)]" />
                </div>
                <p className="font-bold text-[var(--c-text)]">تعذّر تحميل الملف</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="press inline-flex min-h-11 items-center rounded-2xl border border-[var(--c-border)] px-5 py-2 text-sm font-bold text-[var(--c-text-soft)]"
                >
                  إغلاق
                </button>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ===== Helpers =====
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
