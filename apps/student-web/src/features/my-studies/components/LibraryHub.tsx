import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  BookMarked, Bookmark, CalendarDays, ChevronDown, Eye, FileCode, FileSpreadsheet,
  FileText, Image as ImageIcon, LoaderCircle, Music, Search, Target, Video, X,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import { libraryApi } from '@/features/library/services/library-api';
import { DocumentViewer } from '@/features/library/DocumentViewer';
import { cn } from '@/utils';
import { loadCatalogAcrossSubjects } from '../utils/catalog-load';
import { variantForReason, EntitlementDeniedError } from '../services/courses-api';
import type { MySubjectEntry } from '../hooks/useMySubjects';
import { LockedEmptyState } from './LockedEmptyState';
import { CatalogEntitlementErrorCard, CatalogErrorCard } from './CatalogErrorCards';
import { useEntitlementDeniedListener } from '@/features/my-studies/hooks/useEntitlementDeniedListener';

/** Category tabs (Push 5 Task 3) — mirror the backend LibraryFileCategory enum. */
const CATEGORIES = [
  { key: 'all', label: 'الكل' },
  { key: 'Curriculum', label: 'المنهاج' },
  { key: 'Lecture', label: 'المحاضرات' },
  { key: 'Summary', label: 'ملخصات المحاضرات' },
  { key: 'GoldenIdeas', label: 'الأفكار الذهبية' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

/** Format facet keys — mirror the API's LibraryFileType PascalCase enum names. */
type FormatKey = 'all' | 'Pdf' | 'Html' | 'Image' | 'Video' | 'Audio' | 'Summary' | 'Comprehensive' | 'Paragraph';

const TYPE_META: Record<string, { icon: typeof FileText; label: string; color: string; bg: string }> = {
  Pdf: { icon: FileText, label: 'PDF', color: 'var(--c-danger-500)', bg: 'rgba(255,82,82,0.10)' },
  Html: { icon: FileCode, label: 'HTML', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  Image: { icon: ImageIcon, label: 'صورة', color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  Video: { icon: Video, label: 'فيديو', color: 'var(--c-warning-500)', bg: 'rgba(255,179,0,0.10)' },
  Audio: { icon: Music, label: 'صوت', color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  Summary: { icon: FileSpreadsheet, label: 'ملخص', color: 'var(--c-success-500)', bg: 'var(--c-success-50)' },
  Comprehensive: { icon: FileText, label: 'شامل', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  Paragraph: { icon: FileText, label: 'فقرة', color: 'var(--c-text-muted)', bg: 'var(--c-bg-hover)' },
};

const CATEGORY_BADGES: Record<string, { label: string; classes: string }> = {
  Curriculum: { label: 'منهاج', classes: 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]' },
  Lecture: { label: 'محاضرة', classes: 'bg-[var(--c-warning-50)] text-[var(--c-warning-500)]' },
  Summary: { label: 'تلخيص', classes: 'bg-[var(--c-success-50)] text-[var(--c-success-700)]' },
  GoldenIdeas: { label: 'أفكار ذهبية', classes: 'bg-[var(--c-warning-50)] text-[var(--c-warning-500)]' },
};

/** Chip descriptors for the format filter row (Row B) — labels reuse TYPE_META. */
const FORMATS: ReadonlyArray<{ key: FormatKey; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'Pdf', label: TYPE_META.Pdf.label },
  { key: 'Html', label: TYPE_META.Html.label },
  { key: 'Image', label: TYPE_META.Image.label },
  { key: 'Video', label: TYPE_META.Video.label },
  { key: 'Audio', label: TYPE_META.Audio.label },
  { key: 'Summary', label: TYPE_META.Summary.label },
  { key: 'Comprehensive', label: TYPE_META.Comprehensive.label },
  { key: 'Paragraph', label: TYPE_META.Paragraph.label },
];

/** W19.3 (D-23): per-subject page size. The backend PagedResult carries
 *  total/totalPages, so the hub can page past the old single-100 cap. */
const LIBRARY_PAGE_SIZE = 100;

interface HubLibraryFile {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileSize: number;
  viewsCount: number;
  /** Favorites toggle state — required by DocumentViewer's LibraryFile prop. */
  isFavorite: boolean;
  /** Curricular category (Curriculum / Lecture / Summary / GoldenIdeas) — null = uncategorized. */
  category?: string | null;
  createdAt?: string | null;
  /** W20.3 — the six-digit public code (always shown next to the title). */
  publicCode?: string | null;
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
}

/**
 * The unified library surface (Wave 15.5.1a): one component serving BOTH
 * /study?tab=library and /subjects/:slug/library. Fetches every file across
 * the student's entitled subjects (or one subject when `subjectId` is passed),
 * groups it behind two faceted filter rows (category + format, AND logic,
 * counters recompute against the other facet), renders a context-aware
 * breadcrumb + h1, opens the DocumentViewer on card click (A1), and carries
 * the favorites toggle (moved from the legacy LibraryPage).
 */
export function LibraryHub({
  subjectId,
  subjectSlug,
  subjectName,
}: {
  subjectId?: string | null;
  subjectSlug?: string;
  subjectName?: string;
}) {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [activeFormat, setActiveFormat] = useState<FormatKey>('all');
  const [selectedFile, setSelectedFile] = useState<HubLibraryFile | null>(null);
  // W20.4 (owner decision 2) — the file-open loading LAYER: a % progress
  // overlay between the card click and the viewer. Streaming kinds (video/
  // audio) hand off directly — their players own buffering, and a byte-% would
  // misrepresent streaming; every other kind runs a wrapper-level progress
  // fetch of the SAME /library/{id}/content channel the viewers read (C2 rule:
  // progress comes from fetch/XHR in non-frozen code, never from inside the
  // frozen player cores).
  const [opening, setOpening] = useState<{
    file: HubLibraryFile;
    /** 0-100 when the server reports Content-Length; null = indeterminate. */
    percent: number | null;
    failed: boolean;
  } | null>(null);
  const openAbortRef = useRef<AbortController | null>(null);
  // W19.3 (D-23): how many per-subject pages are loaded. «تحميل المزيد» bumps
  // it; the query refetches pages 1..N per subject (bounded in practice —
  // 100 files/page makes deep paging rare).
  const [pagesLoaded, setPagesLoaded] = useState(1);
  // W20.3 — name OR code search. The input drives a debounced committed term
  // that rides the SERVER filter (`?search=` on GET /library/subject/{id}), so
  // the search covers the whole catalog — not just the loaded pages — and the
  // «تم تحميل X من Y» totals stay coherent against the filtered set.
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Wave 15.5.1a — the same context flag drives the h1 + breadcrumb branches.
  const location = useLocation();
  const inStudyContext = location.pathname.startsWith('/study');

  const queryClient = useQueryClient();
  const toggleFavoriteMutation = useMutation({
    mutationFn: (file: HubLibraryFile) => libraryApi.toggleFavorite(file.id, file.isFavorite),
    onSuccess: (_result, file) => {
      // W17.4 — orientation on every save: the student always learns WHAT
      // happened and WHERE to find it (the favorites page), instead of a
      // silent icon flip.
      toast.success(file.isFavorite ? 'أُزيلت من المفضلة' : 'تمت الإضافة إلى المفضلة — تجدها في صفحة المفضلة');
      queryClient.invalidateQueries({ queryKey: ['library-hub'] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
    onError: () => toast.error('تعذّر تحديث المفضلة. تحقق من اتصالك واستحقاقك.'),
  });

  // Use enrolled subjects only when no subjectId is provided. When subjectId
  // is set (LibraryPage context), the props are authoritative — no need to ask
  // the server "what are my subjects?". Same queryKey/queryFn as the shared
  // useMySubjects hook, so cached data is shared with every other call site.
  const {
    data: enrolledSubjects,
    isError: subjectsError,
    isLoading: subjectsLoading,
    refetch: refetchSubjects,
  } = useQuery({
    queryKey: ['my-subjects-entitled'],
    staleTime: 60_000,
    queryFn: async (): Promise<MySubjectEntry[]> => {
      // R69 — GET /subjects/my-subjects is JWT-authorised only (AcademicController
      // runs no X-Entitlement validation on it). Requesting an entitlement token
      // here made the whole My Studies shell throw once POST /entitlements/issue
      // started returning 403 for zero-grant students (R69 §2.B guard) — turning
      // the truthful "locked" state into a false connection error. The subjects
      // list must resolve so every tab can render its own locked state.
      const res = await apiClient.get('/subjects/my-subjects');
      const list = res.data?.items ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: !subjectId,
  });

  // Single-subject contexts (LibraryPage) carry the full descriptor in props;
  // the synthetic row feeds the catalog loader's subjectId/slug/name mapping.
  // /study deep-links (?subjectId=…&tab=library) have no name here — they stay
  // on the enrolled list (filtered to that subject) so the card's subject chip
  // keeps rendering a real name and stale links still hit the locked card.
  const subjects = useMemo<MySubjectEntry[]>(() => {
    if (subjectId && subjectName) {
      return [{
        id: subjectId,
        slug: subjectSlug ?? '',
        nameAr: subjectName,
      }];
    }
    const enrolled = enrolledSubjects ?? [];
    return subjectId ? enrolled.filter((s) => s.id === subjectId) : enrolled;
  }, [subjectId, subjectSlug, subjectName, enrolledSubjects]);
  // Unfiltered entitled list — the locked-state signal (same value the old
  // useMySubjects().data carried); the synthetic row stands in for it only in
  // the single-subject context, where the page itself vouches for access.
  const allSubjects: MySubjectEntry[] = subjectId && subjectName ? subjects : (enrolledSubjects ?? []);

  // Wave 12.5.A (Group 1) — R69 taxonomy: per-subject failures surface, never
  // a silent empty list.
  // W19.3 (D-23): the catalog query now pages per subject (pages 1..pagesLoaded)
  // and carries the summed backend total, so «تحميل المزيد» can honestly show
  // «تم تحميل X من Y ملفاً» instead of silently capping at the first 100.
  const [entitlementDenied, setEntitlementDenied] = useState<ReturnType<typeof variantForReason> | null>(null);
  const { data: catalog, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ['library-hub', subjects.map((s) => s.id).join(','), pagesLoaded, searchTerm],
    enabled: subjects.length > 0,
    retry: (failureCount, failure) => !(failure instanceof EntitlementDeniedError) && failureCount < 1,
    queryFn: async (): Promise<{ files: HubLibraryFile[]; totalFiles: number }> => {
      const pages = await loadCatalogAcrossSubjects(
        subjects.map((s) => s.id),
        // fetchOne returns T[] (one entry per subject); the wrapper carries the
        // subject's files AND its backend total through the aggregator.
        async (subjectId): Promise<{ files: HubLibraryFile[]; total: number }[]> => {
          const subject = subjects.find((s) => s.id === subjectId);
          const files: HubLibraryFile[] = [];
          let total = 0;
          for (let page = 1; page <= pagesLoaded; page++) {
            const res = await apiClient.get(`/library/subject/${subjectId}`, {
              ...(await entitlementRequestConfig()),
              params: { page, pageSize: LIBRARY_PAGE_SIZE, ...(searchTerm ? { search: searchTerm } : {}) },
            });
            total = res.data?.total ?? total;
            const items = res.data?.items ?? [];
            files.push(...items.map((f: Omit<HubLibraryFile, 'subjectId' | 'subjectSlug' | 'subjectName'>) => ({
              ...f,
              subjectId,
              subjectSlug: subject?.slug ?? '',
              subjectName: subject?.nameAr ?? '',
            })));
          }
          return [{ files, total }];
        },
      );
      return {
        files: pages.flatMap((p) => p.files),
        totalFiles: pages.reduce((sum, p) => sum + p.total, 0),
      };
    },
  });
  const files = catalog?.files;
  const totalFiles = catalog?.totalFiles ?? 0;
  const hasMoreFiles = (files?.length ?? 0) < totalFiles;

  const fetchingRef = useRef(false);
  useEffect(() => { fetchingRef.current = isFetching; }, [isFetching]);

  // W20.4 — the open-file orchestration: progress-tracked preload, then handoff
  // to the unchanged DocumentViewer. Abortable (إلغاء) and retryable (إعادة
  // المحاولة) — a failure never leaves a silent blank.
  const openFile = useCallback(async (file: HubLibraryFile) => {
    const rawType = (file.type ?? '').trim().toLowerCase();
    if (rawType === 'video' || rawType === 'audio') {
      // Streaming kinds: the player streams progressively; hand off directly.
      setSelectedFile(file);
      return;
    }
    openAbortRef.current?.abort();
    const controller = new AbortController();
    openAbortRef.current = controller;
    setOpening({ file, percent: 0, failed: false });
    try {
      const config = await entitlementRequestConfig();
      await apiClient.get(`/library/${file.id}/content`, {
        ...config,
        responseType: 'blob',
        signal: controller.signal,
        onDownloadProgress: (event: { loaded: number; total?: number }) => {
          const total = event.total ?? 0;
          setOpening((previous) => {
            if (!previous || previous.file.id !== file.id || previous.failed) return previous;
            if (total > 0) {
              return { ...previous, percent: Math.min(100, Math.round((event.loaded / total) * 100)) };
            }
            // No Content-Length: best-effort crawl (capped at 95% until done).
            const current = previous.percent ?? 0;
            return { ...previous, percent: Math.min(95, current + 3) };
          });
        },
      });
      // Handoff: the layer clears and the (unchanged) DocumentViewer mounts —
      // its own reads of the same content channel now hit a warm transfer.
      setOpening(null);
      setSelectedFile(file);
    } catch (error) {
      if (controller.signal.aborted) {
        setOpening(null);
        return;
      }
      setOpening((previous) =>
        previous && previous.file.id === file.id ? { ...previous, failed: true } : previous);
    }
  }, []);

  // W17.4 — ?openFile= deep link (favorites file cards): once the subject's
  // files resolve, auto-open the DocumentViewer on the target file IN CONTEXT,
  // then clear the param so closing the viewer never re-opens it. A missing
  // target (deleted meanwhile) clears quietly — the grid below is the honest
  // fallback, never a dead end.
  const [searchParams, setSearchParams] = useSearchParams();
  const openFileId = searchParams.get('openFile');
  useEffect(() => {
    if (!openFileId || files === undefined) return;
    const target = files.find((file) => file.id === openFileId);
    if (target) void openFile(target);
    const next = new URLSearchParams(searchParams);
    next.delete('openFile');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep-link effect: runs only when the param or the loaded file set changes
  }, [openFileId, files]);
  // Wave 18.4 (D-30): the shared listener (was a local copy of the same block).
  useEntitlementDeniedListener(
    (url) => url.includes('/library/'),
    setEntitlementDenied,
    { ignoreWhile: () => fetchingRef.current },
  );
  useEffect(() => {
    if (files !== undefined) setEntitlementDenied(null);
  }, [files]);

  const queryDenied = isError && error instanceof EntitlementDeniedError
    ? variantForReason(error.reason)
    : null;

  // Hooks BEFORE any early return (rules-of-hooks): derive the sorted list + tabs
  // regardless of the load state.
  const allFiles = useMemo(
    () => (files ?? []).slice().sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [files],
  );

  // Wave 15.5.1a faceting (AND logic): each facet counts against the OTHER's
  // active value, so chips preview the result of clicking them.
  const matchesFormat = (f: HubLibraryFile) => activeFormat === 'all' || f.type === activeFormat;
  const matchesCategory = (f: HubLibraryFile) => activeCategory === 'all' || f.category === activeCategory;

  const visibleFiles = allFiles.filter(matchesFormat).filter(matchesCategory);

  // Available category chips: always show الكل; show a category chip only when
  // at least one file carries it (clean, honest filtering).
  const availableCategories = useMemo(() => {
    const present = new Set(allFiles.map((f) => f.category ?? ''));
    return CATEGORIES.filter((c) => c.key === 'all' || present.has(c.key));
  }, [allFiles]);

  // Format chips follow the same full-dataset gating for consistency.
  const availableFormats = useMemo(() => {
    const present = new Set(allFiles.map((f) => f.type));
    return FORMATS.filter((x) => x.key === 'all' || present.has(x.key));
  }, [allFiles]);

  const categoryCount = (key: CategoryKey) => (
    key === 'all'
      ? allFiles.filter(matchesFormat).length
      : allFiles.filter(matchesFormat).filter((f) => f.category === key).length
  );
  const formatCount = (key: FormatKey) => (
    key === 'all'
      ? allFiles.filter(matchesCategory).length
      : allFiles.filter(matchesCategory).filter((f) => f.type === key).length
  );

  if (entitlementDenied || queryDenied) {
    return (
      <CatalogEntitlementErrorCard
        variant={queryDenied ?? entitlementDenied ?? 'device'}
        onRetry={() => { setEntitlementDenied(null); refetch(); }}
        testId="library-hub-entitlement-error"
      />
    );
  }

  if (subjectsError) {
    return (
      <CatalogErrorCard
        onRetry={() => refetchSubjects()}
        testId="library-hub-error"
        title="تعذّر تحميل المكتبة"
        body="حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
      />
    );
  }

  // Disabled single-subject queries never load (react-query v5: isLoading is
  // false when enabled is false) — this gate is live only on /study.
  if (subjectsLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="library-loading">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  // Wave 12.5.A (Group 1) — every subject failed → honest error, never "empty".
  if (isError) {
    return (
      <CatalogErrorCard
        onRetry={() => refetch()}
        testId="library-hub-error"
        title="تعذّر تحميل مكتبة المواد"
        body="حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
      />
    );
  }

  // No active code → locked state with the activation CTA.
  if (allSubjects.length === 0) {
    return <LockedEmptyState title="المكتبة مُقفلة" hint="ملفات المحاضرات والمناهج والملخصات تُفتح بعد تفعيل كود الاشتراك لموادك." />;
  }

  // Deep-linked subject the student holds no grant for (stale link).
  if (subjectId && subjects.length === 0) {
    return (
      <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="library-subject-locked">
        <Target className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)]">لا يمكنك الوصول إلى مكتبة هذه المادة بعد</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1">فعّل كوداً يشمل هذه المادة لفتح ملفاتها</p>
      </div>
    );
  }

  return (
    <div>
      {/* Wave 15.5.1a — the /study context already owns the page h1 (دراستي);
          the standalone /subjects/:slug/library route renders its own.
          W17.2 — the local breadcrumb is retired: the global PathTrail in
          AppShell renders the trail on every authenticated page (study and
          subject contexts alike). */}
      {!inStudyContext && (
        <h1 className="text-2xl font-bold">المكتبة الرقمية</h1>
      )}

      {/* W20.3 — name OR code search (server-side `?search=`): matches the
          title or the six-digit public code (typing "1234" finds "001234"). */}
      <div className="mt-5 mb-3" data-testid="library-search-row">
        <label htmlFor="library-hub-search" className="sr-only">ابحث في المكتبة بالاسم أو الرمز</label>
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--c-text-faint)]" aria-hidden="true" />
          <input
            id="library-hub-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ابحث بالاسم أو برمز الملف المكوّن من ٦ أرقام"
            data-testid="library-search-input"
            className="w-full min-h-11 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] py-2.5 pe-10 ps-4 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] transition-colors focus:border-[var(--c-primary-400)] focus:outline-none focus:ring-2 focus:ring-[var(--c-primary-100)]"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="مسح البحث"
              data-testid="library-search-clear"
              className="absolute start-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--c-text-faint)] transition-colors hover:text-[var(--c-text)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Category filter chips (Row A) */}
      <div role="tablist" aria-label="تصنيفات المكتبة" className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 mt-5" data-testid="library-category-tabs">
        {availableCategories.map(({ key, label }) => {
          const active = activeCategory === key;
          return (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={active}
              data-testid={`library-tab-${key}`}
              onClick={() => setActiveCategory(key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border',
                active
                  ? 'text-white border-transparent shadow-sm'
                  : 'text-[var(--c-text-soft)] border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:text-[var(--c-primary-700)]'
              )}
              style={active ? { background: 'var(--grad-primary)' } : undefined}
            >
              {label}
              <span className={cn('text-[11px] px-1.5 py-px rounded-full tabular-nums', active ? 'bg-white/20' : 'bg-[var(--c-bg-hover)]')} lang="en">
                {categoryCount(key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Format filter chips (Row B) — same pill style, TYPE_META icon, faceted count */}
      <div role="tablist" aria-label="صيغ المكتبة" className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-5" data-testid="library-format-tabs">
        {availableFormats.map(({ key, label }) => {
          const active = activeFormat === key;
          const meta = key === 'all' ? null : TYPE_META[key];
          const Icon = meta?.icon;
          return (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={active}
              data-testid={`library-format-${key}`}
              onClick={() => setActiveFormat(key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border',
                active
                  ? 'text-white border-transparent shadow-sm'
                  : 'text-[var(--c-text-soft)] border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:text-[var(--c-primary-700)]'
              )}
              style={active ? { background: 'var(--grad-primary)' } : undefined}
            >
              {Icon && <Icon className="w-3.5 h-3.5" style={active ? undefined : { color: meta?.color }} />}
              {label}
              <span className={cn('text-[11px] px-1.5 py-px rounded-full tabular-nums', active ? 'bg-white/20' : 'bg-[var(--c-bg-hover)]')} lang="en">
                {formatCount(key)}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16" data-testid="library-loading">
          <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
        </div>
      ) : visibleFiles.length === 0 ? (
        <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="library-empty">
          <BookMarked className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
          <p className="text-[var(--c-text-muted)]">
            {searchTerm
              ? 'لا توجد ملفات تطابق البحث'
              : activeCategory === 'all' && activeFormat === 'all'
                ? 'لا توجد ملفات في مكتبتك بعد'
                : 'لا توجد ملفات تطابق هذا التصنيف أو الصيغة'}
          </p>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="press mt-3 inline-flex min-h-11 items-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] hover:text-[var(--c-primary-700)]"
              data-testid="library-search-empty-clear"
            >
              مسح البحث وعرض كل الملفات
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="library-grid">
          {visibleFiles.map((file, index) => {
            const meta = TYPE_META[file.type] ?? TYPE_META.Paragraph;
            const Icon = meta.icon;
            const badge = file.category ? CATEGORY_BADGES[file.category] : null;
            return (
              <motion.div key={file.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}>
                {/* v3.1 — div, not <button>: the favorite <button> nests inside
                    (v2 §1.9), and button-in-button is invalid HTML whose React
                    validateDOMNesting error trips w13.6's console-clean check.
                    role+tabIndex+keydown keep the card fully keyboard-operable. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => void openFile(file)}
                  onKeyDown={(e) => {
                    // The nested favorite button handles its own Enter/Space —
                    // a bubbled keydown from it must not also open the viewer.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault(); // Space scrolls the page otherwise
                      void openFile(file);
                    }
                  }}
                  className="w-full text-start flex items-start gap-3 p-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-md hover:-translate-y-0.5 transition-all group cursor-pointer"
                  data-testid="library-card"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[var(--c-text)] truncate group-hover:text-[var(--c-primary-700)] transition-colors">
                        {file.title}
                      </span>
                      {file.publicCode && (
                        <span
                          className="shrink-0 rounded-md bg-[var(--c-bg-hover)] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--c-text-muted)]"
                          lang="en"
                          data-testid="library-card-code"
                          title="رمز الملف"
                        >
                          {file.publicCode}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--c-text-muted)]">
                      <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                      <span className="inline-flex items-center gap-1">
                        <BookMarked className="w-3.5 h-3.5" />
                        {file.subjectName}
                      </span>
                      {badge && (
                        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', badge.classes)} data-testid="library-card-category">
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[var(--c-text-faint)] mt-1.5">
                      {file.createdAt && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {new Date(file.createdAt).toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{file.viewsCount}</span>
                      {/* W20.4 (owner decision 2) — file size is deliberately NOT
                          shown on student-facing cards anymore. */}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid={`library-card-favorite-${file.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteMutation.mutate(file);
                    }}
                    disabled={toggleFavoriteMutation.isPending}
                    aria-label={file.isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                    className="shrink-0 rounded-md p-1 transition-colors disabled:opacity-50 text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]"
                  >
                    <Bookmark className="w-4 h-4" fill={file.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* W19.3 (D-23): past-the-cap affordance — honest «تم تحميل X من Y ملفاً»
          against the summed backend totals + «تحميل المزيد». Hidden when the
          whole catalog is loaded (nothing is hidden then — no honesty gap).
          X counts CATALOG files (pre-filter) on purpose: the row is about
          loading, not about the active category/format chips. */}
      {hasMoreFiles && (
        <div className="mt-5 flex flex-col items-center gap-2" data-testid="library-load-more">
          <p className="text-xs text-[var(--c-text-muted)]">
            تم تحميل <span lang="en">{allFiles.length}</span> من <span lang="en">{totalFiles}</span> ملفاً
          </p>
          <button
            type="button"
            onClick={() => setPagesLoaded((current) => current + 1)}
            disabled={isFetching}
            className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-5 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] hover:text-[var(--c-primary-700)] disabled:opacity-50"
          >
            {isFetching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
            تحميل المزيد
          </button>
        </div>
      )}

      {/* W20.4 (owner decision 2) — the loading LAYER: % progress between the
          card click and the viewer (see openFile). Retry on failure — never a
          silent blank. Renders above the page; the viewer mounts after it. */}
      {opening && (
        <FileOpenLayer
          file={opening.file}
          percent={opening.percent}
          failed={opening.failed}
          onCancel={() => {
            openAbortRef.current?.abort();
            setOpening(null);
          }}
          onRetry={() => void openFile(opening.file)}
        />
      )}

      {/* Wave 15.5.1a (A1) — single click opens the viewer; the wrapper div is a
          pure test hook (no layout impact). */}
      {selectedFile && (
        <div data-testid="library-file-viewer">
          <DocumentViewer
            file={selectedFile}
            onClose={() => setSelectedFile(null)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * W20.4 (owner decision 2) — the file-open loading layer: determinate % when
 * the server reports Content-Length, a calm indeterminate crawl otherwise.
 * Failure → Arabic retry, never a blank. NOT part of any player core (C2).
 */
function FileOpenLayer({
  file, percent, failed, onCancel, onRetry,
}: {
  file: HubLibraryFile;
  percent: number | null;
  failed: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const meta = TYPE_META[file.type] ?? TYPE_META.Paragraph;
  const Icon = meta.icon;
  return (
    <div
      role="dialog"
      aria-label={failed ? 'تعذّر تحميل الملف' : 'جارٍ تحميل الملف'}
      data-testid="file-open-layer"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[var(--c-bg)] p-4"
      style={{ background: 'rgba(8, 26, 38, 0.66)' }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: meta.bg, color: meta.color }}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--c-text)]">{file.title}</p>
            <p className="mt-0.5 text-xs text-[var(--c-text-muted)]">{failed ? 'تعذّر تحميل الملف — تحقّق من اتصالك' : 'جارٍ تحميل الملف…'}</p>
          </div>
        </div>

        {failed ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              data-testid="file-open-close"
              className="press inline-flex min-h-11 items-center rounded-xl border border-[var(--c-border)] px-4 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)]"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={onRetry}
              data-testid="file-open-retry"
              className="press inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold text-white"
              style={{ background: 'var(--grad-primary)' }}
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <>
            <div
              className="h-2 overflow-hidden rounded-full bg-[var(--c-bg-hover)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              aria-label="تقدّم تحميل الملف"
              data-testid="file-open-progress"
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${percent ?? 8}%`, background: 'var(--grad-primary)' }}
                data-testid="file-open-progress-fill"
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-[var(--c-text-muted)]" lang="en" data-testid="file-open-percent">
                {percent != null ? `${percent}%` : '…'}
              </span>
              <button
                type="button"
                onClick={onCancel}
                data-testid="file-open-cancel"
                className="press inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-[var(--c-text-muted)] transition-colors hover:text-[var(--c-text)]"
              >
                إلغاء
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
