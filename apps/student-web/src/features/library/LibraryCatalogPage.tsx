import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText, FileSpreadsheet, Image, Video, Music, ChevronLeft, LoaderCircle, Filter } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import type { LibraryFile } from './services/library-api';
import {
  CatalogEntitlementErrorCard, CatalogErrorCard,
} from '@/features/my-studies/components/CatalogErrorCards';
import { loadCatalogAcrossSubjects } from '@/features/my-studies/utils/catalog-load';
import { variantForReason, EntitlementDeniedError } from '@/features/my-studies/services/courses-api';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';

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
  // Wave 12.5.A (Group 1) — the R69 CoursesCatalog taxonomy, ported: per-subject
  // failures are no longer swallowed (`catch {}` rendered a FALSE "no files").
  const mySubjects = useMySubjects();
  const subjects = mySubjects.data ?? [];
  const [entitlementDenied, setEntitlementDenied] = useState<ReturnType<typeof variantForReason> | null>(null);

  const { data, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ['library-catalog', filterType, page, subjects.map((s) => s.id).join(',')],
    enabled: subjects.length > 0,
    retry: (failureCount, failure) => !(failure instanceof EntitlementDeniedError) && failureCount < 1,
    queryFn: async (): Promise<Array<LibraryFile & { subjectId: string; subjectName: string }>> =>
      loadCatalogAcrossSubjects(subjects.map((s) => s.id), async (subjectId) => {
        const res = await apiClient.get(`/library/subject/${subjectId}`, {
          ...await entitlementRequestConfig(),
          params: { type: filterType || undefined, page: 1, pageSize: 100 },
        });
        const subject = subjects.find((s) => s.id === subjectId);
        const items = res.data?.items ?? [];
        return items.map((f: LibraryFile) => ({
          ...f,
          subjectId,
          subjectName: subject?.nameAr ?? subjectId,
        }));
      }),
  });

  // Idle-time 403 events (mid-session revocation) surface the truthful card.
  const fetchingRef = useRef(false);
  useEffect(() => { fetchingRef.current = isFetching; }, [isFetching]);
  useEffect(() => {
    const onEntitlementError = (event: Event) => {
      if (fetchingRef.current) return;
      const detail = (event as CustomEvent<{ url?: string; reason?: string }>).detail;
      if (!detail?.url) return;
      if (detail.url.includes('/entitlements/issue')) { setEntitlementDenied('no-grants'); return; }
      if (detail.url.includes('/library/')) setEntitlementDenied(variantForReason(detail.reason));
    };
    window.addEventListener('cms-entitlement-error', onEntitlementError);
    return () => window.removeEventListener('cms-entitlement-error', onEntitlementError);
  }, []);
  useEffect(() => {
    if (data !== undefined) setEntitlementDenied(null);
  }, [data]);

  const queryDenied = isError && error instanceof EntitlementDeniedError
    ? variantForReason(error.reason)
    : null;
  if (entitlementDenied || queryDenied) {
    return (
      <CatalogEntitlementErrorCard
        variant={queryDenied ?? entitlementDenied ?? 'device'}
        onRetry={() => { setEntitlementDenied(null); refetch(); }}
        testId="library-catalog-entitlement-error"
      />
    );
  }

  if (mySubjects.isError) {
    return (
      <CatalogErrorCard
        onRetry={() => mySubjects.refetch()}
        testId="library-catalog-error"
        title="تعذّر تحميل المكتبة"
        body="حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
      />
    );
  }

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
      ) : isError ? (
        <CatalogErrorCard
          onRetry={() => refetch()}
          testId="library-catalog-error"
          title="تعذّر تحميل المكتبة"
          body="حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
        />
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
