import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  FileText, Image as ImageIcon, Video, BookOpen, FileCode, AudioLines,
  Bookmark, ChevronLeft, Eye, Loader2,
} from 'lucide-react';
import { libraryApi, type LibraryFile } from './services/library-api';
import { DocumentViewer } from './DocumentViewer';
import { academicApi } from '@/features/subjects/services/academic-api';

// Keys mirror the API's PascalCase enum names (Pdf/Html/…/Paragraph).
const typeConfig = {
  Pdf: { icon: FileText, label: 'PDF', color: 'var(--c-danger-500)', bg: 'var(--c-danger-50)' },
  Html: { icon: FileCode, label: 'HTML', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  Image: { icon: ImageIcon, label: 'صورة', color: 'var(--c-info-500)', bg: 'var(--c-info-50)' },
  Video: { icon: Video, label: 'فيديو', color: 'var(--c-warning-500)', bg: 'var(--c-warning-50)' },
  Audio: { icon: AudioLines, label: 'صوت', color: 'var(--c-info-500)', bg: 'var(--c-info-50)' },
  Summary: { icon: BookOpen, label: 'ملخص', color: 'var(--c-success-500)', bg: 'var(--c-success-50)' },
  Comprehensive: { icon: BookOpen, label: 'شامل', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  Paragraph: { icon: FileText, label: 'فقرة', color: 'var(--c-text-muted)', bg: 'var(--c-bg-hover)' },
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
            const config = typeConfig[file.type as keyof typeof typeConfig] || typeConfig.Paragraph;
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

      {/* File Viewer (Push 9 — Vercel-grade DocumentViewer) */}
      {selectedFile && (
        <DocumentViewer file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </div>
  );
}

// ===== FileViewer moved to DocumentViewer.tsx (Push 9 — full-screen, mobile-first,
// PDF zoom controls, TXT reading column, sandboxed HTML, download button). =====

// ===== Helpers =====
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
