import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  BookMarked, Bookmark, CalendarDays, Eye, FileCode, FileSpreadsheet,
  FileText, Image as ImageIcon, LoaderCircle, Music, Target, Video,
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
  const [entitlementDenied, setEntitlementDenied] = useState<ReturnType<typeof variantForReason> | null>(null);
  const { data: files, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ['library-hub', subjects.map((s) => s.id).join(',')],
    enabled: subjects.length > 0,
    retry: (failureCount, failure) => !(failure instanceof EntitlementDeniedError) && failureCount < 1,
    queryFn: async (): Promise<HubLibraryFile[]> =>
      loadCatalogAcrossSubjects(subjects.map((s) => s.id), async (subjectId) => {
        const res = await apiClient.get(`/library/subject/${subjectId}`, {
          ...(await entitlementRequestConfig()),
          params: { page: 1, pageSize: 100 },
        });
        const subject = subjects.find((s) => s.id === subjectId);
        const items = res.data?.items ?? [];
        return items.map((f: Omit<HubLibraryFile, 'subjectId' | 'subjectSlug' | 'subjectName'>) => ({
          ...f,
          subjectId,
          subjectSlug: subject?.slug ?? '',
          subjectName: subject?.nameAr ?? '',
        }));
      }),
  });

  const fetchingRef = useRef(false);
  useEffect(() => { fetchingRef.current = isFetching; }, [isFetching]);

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
    if (target) setSelectedFile(target);
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
            {activeCategory === 'all' && activeFormat === 'all'
              ? 'لا توجد ملفات في مكتبتك بعد'
              : 'لا توجد ملفات تطابق هذا التصنيف أو الصيغة'}
          </p>
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
                  onClick={() => setSelectedFile(file)}
                  onKeyDown={(e) => {
                    // The nested favorite button handles its own Enter/Space —
                    // a bubbled keydown from it must not also open the viewer.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault(); // Space scrolls the page otherwise
                      setSelectedFile(file);
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
                      <span>{formatSize(file.fileSize)}</span>
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

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
