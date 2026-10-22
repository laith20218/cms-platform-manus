import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText, FileSpreadsheet, Image, Video, Music, ChevronLeft, LoaderCircle, Filter } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import type { LibraryFile } from './services/library-api';

const TYPE_ICONS: Record<string, typeof FileText> = {
  Pdf: FileText, Html: FileText, Image: Image, Video: Video, Audio: Music,
  Summary: FileSpreadsheet, Comprehensive: FileText, Paragraph: FileText,
};

const TYPE_LABELS: Record<string, string> = {
  Pdf: 'PDF', Html: 'HTML', Image: 'صورة', Video: 'فيديو', Audio: 'صوت',
  Summary: 'ملخص', Comprehensive: 'شامل', Paragraph: 'فقرة',
};

export function LibraryCatalogPage() {
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['library-catalog', filterType, page],
    queryFn: async () => {
      const config = await entitlementRequestConfig();
      // Fetch student's subscribed subjects
      const subjectsRes = await apiClient.get('/subjects/my-subjects', config);
      const subjectsList = subjectsRes.data?.items ?? subjectsRes.data ?? [];

      // Fetch library files for each subject in parallel
      const allFiles: Array<LibraryFile & { subjectId: string; subjectName: string }> = [];
      await Promise.all(
        subjectsList.map(async (subject: { id: string; nameAr?: string; name?: string }) => {
          try {
            const res = await apiClient.get(`/library/subject/${subject.id}`, {
              ...await entitlementRequestConfig(),
              params: { type: filterType || undefined, page: 1, pageSize: 100 },
            });
            const items = res.data?.items ?? [];
            items.forEach((f: LibraryFile) => {
              allFiles.push({ ...f, subjectId: subject.id, subjectName: subject.nameAr ?? subject.name ?? subject.id });
            });
          } catch { /* silent — subject may have no files */ }
        })
      );
      return allFiles;
    },
  });

  const files = data ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">المكتبة</h1>
          <p className="text-sm text-[var(--c-text-muted)]">جميع ملفات المكتبة المتاحة لك</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-[var(--c-text-muted)]" />
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] text-sm px-2 text-[var(--c-text)]"
        >
          <option value="">كل الأنواع</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
          <p className="text-[var(--c-text-muted)]">لا توجد ملفات متاحة حالياً</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((file) => {
            const Icon = TYPE_ICONS[file.type] ?? FileText;
            return (
              <Link
                key={file.id}
                to={`/subjects/${file.subjectId}/library`}
                className="flex items-start gap-3 p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[var(--c-text)] truncate">{file.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--c-text-muted)]">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--c-bg-hover)] font-medium">{TYPE_LABELS[file.type] ?? file.type}</span>
                    <span>{file.subjectName}</span>
                    <span>{file.viewsCount} مشاهدة</span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[var(--c-text-muted)] group-hover:text-[var(--c-primary-700)] transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
export { LibraryCatalogPage as default } from "./LibraryCatalogPage";
