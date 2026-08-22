import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  FileText, Image as ImageIcon, Video, BookOpen, FileCode,
  Bookmark, ChevronLeft, Eye, Loader2, X, Download, Shield,
} from 'lucide-react';
import { libraryApi, type LibraryFile, type FileAccess } from './services/library-api';
import { academicApi } from '@/features/subjects/services/academic-api';

const typeConfig = {
  pdf: { icon: FileText, label: 'PDF', color: 'var(--c-danger-500)', bg: 'rgba(255,82,82,0.10)' },
  html: { icon: FileCode, label: 'HTML', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  image: { icon: ImageIcon, label: 'صورة', color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  video: { icon: Video, label: 'فيديو', color: 'var(--c-warning-500)', bg: 'rgba(255,179,0,0.10)' },
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

      {/* File Viewer Modal */}
      <AnimatePresence>
        {selectedFile && (
          <FileViewer file={selectedFile} onClose={() => setSelectedFile(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ===== File Viewer Component =====
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
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
      style={{ background: 'var(--c-overlay)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[var(--c-surface)] rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--c-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: config.bg, color: config.color }}>
              <config.icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[var(--c-text)]">{file.title}</h3>
              <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
                <span style={{ color: config.color }}>{config.label}</span>
                {file.pagesCount && <span lang="en">{file.pagesCount} صفحة</span>}
                {file.durationSeconds && <span lang="en">{Math.floor(file.durationSeconds / 60)}:{String(file.durationSeconds % 60).padStart(2, '0')}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Watermark indicator */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(25,118,210,0.08)', color: 'var(--c-primary-700)' }}>
              <Shield className="w-3.5 h-3.5" />
              محمي بـ Watermark
            </div>
            {/* Download disabled indicator */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[rgba(255,82,82,0.08)] text-[var(--c-danger-500)]">
              <Download className="w-3.5 h-3.5" />
              التنزيل معطّل
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--c-text-muted)] hover:bg-[var(--c-neutral-100)] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-[var(--c-neutral-50)]" style={{ position: 'relative' }}>
          {/* Watermark overlay */}
          {access && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
              style={{
                backgroundImage: `linear-gradient(45deg, transparent 40%, rgba(25,118,210,0.03) 50%, transparent 60%)`,
                backgroundSize: '300px 300px',
              }}
            >
              <div className="absolute transform -rotate-45 text-[var(--c-primary-700)] opacity-5 text-2xl font-bold whitespace-nowrap"
                style={{ top: '20%', left: '10%' }}>
                {access.watermark.studentName} - {access.watermark.studentPhone}
              </div>
              <div className="absolute transform -rotate-45 text-[var(--c-primary-700)] opacity-5 text-2xl font-bold whitespace-nowrap"
                style={{ top: '60%', left: '30%' }}>
                {access.watermark.siteName} - {access.watermark.timestamp}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>
          ) : access ? (
            file.type === 'pdf' ? (
              <iframe src={`${access.accessUrl}#toolbar=0&navpanes=0`} className="w-full h-[70vh]" style={{ border: 'none' }} title={file.title} />
            ) : file.type === 'html' ? (
              <iframe src={access.accessUrl} className="w-full h-[70vh]" style={{ border: 'none' }} title={file.title} sandbox="allow-same-origin" />
            ) : file.type === 'video' ? (
              <div className="aspect-video max-w-3xl mx-auto">
                <iframe src={access.accessUrl} className="w-full h-full rounded-xl" style={{ border: 'none' }} title={file.title} allowFullScreen />
              </div>
            ) : file.type === 'image' ? (
              <div className="flex items-center justify-center p-8">
                <img src={access.accessUrl} alt={file.title} className="max-w-full max-h-[70vh] rounded-xl" />
              </div>
            ) : file.type === 'paragraph' || file.type === 'summary' || file.type === 'comprehensive' ? (
              <iframe
                src={access.accessUrl}
                className="w-full h-[70vh] bg-white"
                style={{ border: 'none' }}
                title={file.title}
                sandbox=""
              />
            ) : (
              <div className="text-center py-20 text-[var(--c-text-muted)]">نوع الملف غير مدعوم</div>
            )
          ) : (
            <div className="text-center py-20 text-[var(--c-text-muted)]">تعذّر تحميل الملف</div>
          )}
        </div>

        {/* Footer with watermark info */}
        {access && (
          <div className="p-3 border-t border-[var(--c-border)] bg-[var(--c-surface)] flex items-center justify-between text-xs">
            <span className="text-[var(--c-text-muted)]">
              <Shield className="w-3 h-3 inline-block me-1" />
              هذا المحتوى محمي. أي تسريب سيُعزى إلى: <strong className="text-[var(--c-text)]">{access.watermark.studentName}</strong>
            </span>
            <span className="text-[var(--c-text-faint)]" lang="en">
              تنتهي صلاحية الرابط: {new Date(access.expiresAt).toLocaleTimeString('ar')}
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ===== Helpers =====
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
