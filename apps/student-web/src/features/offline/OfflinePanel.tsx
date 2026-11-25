import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  CloudOff, FileQuestion, FileText, Film, GraduationCap, Image as ImageIcon,
  Loader2, MonitorPlay, Music, PackageOpen, RefreshCw, Trash2, Wifi, WifiOff, X,
} from 'lucide-react';
import {
  isNativeCatalogActive,
  nativeListCached,
  nativeOpenLocal,
  nativeRemoveCached,
  NATIVE_MEDIA_CACHE_MAX_BYTES,
  UNCACHEABLE_OFFLINE_NOTE,
  type NativeCachedItem,
} from '@/utils/native-cache';
import {
  isNativePackagesSurfaceActive,
  nativeListOfflinePackages,
  nativeOpenOfflineExam,
  nativeRemoveOfflinePackage,
  type NativeOfflinePackageRow,
} from '@/utils/native-packages';
import {
  isNativeCoursesSurfaceActive,
  nativeListOfflineCourseEpisodes,
  nativeOpenOfflineCourseEpisode,
  nativeRemoveOfflineCourseEpisode,
  YOUTUBE_EPISODE_OFFLINE_NOTE,
  type NativeOfflineCourseEpisodeRow,
} from '@/utils/native-courses';
import { hasNativeShell } from '@/utils/native-bridge';
import { useOfflineStatus } from './useOfflineStatus';
import { formatDate } from '@/utils';

/**
 * Wave 1 (UX 1D) — «وضع بدون إنترنت» becomes a THREE-TAB offline hub:
 * «الملفات» (encrypted library media — the original Night Task 3 list),
 * «حزم الأسئلة» (offline question packages, Wave 2 contract) and
 * «الكورسات» (hosted course episodes, Wave 5 contract).
 *
 * Honesty contract (student-web 18.x rules):
 *  - Each new surface is feature-detected exactly like native-cache.ts: an
 *    older shell (bridge methods absent) gets an honest "update the app"
 *    state; a plain browser gets its own honest line — nothing fakes an
 *    empty list.
 *  - The media tab keeps EXACTLY the Night Task 3 behavior (rows, open /
 *    remove, honest browser + empty states) and stays the DEFAULT tab so
 *    the existing suite passes unchanged.
 *  - While `navigator.onLine === false`: a connectivity banner heads the
 *    panel and the refresh action stays available (onLine is only a hint).
 */

const TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  txt: 'نص',
  html: 'HTML',
  image: 'صورة',
  video: 'فيديو',
  audio: 'صوت',
};

const TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  txt: FileText,
  html: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music,
};

/** Package row status badges (safe metadata only). */
const PACKAGE_STATUS_LABELS: Record<NativeOfflinePackageRow['status'], string> = {
  active: 'صالحة',
  revoked: 'ملغاة',
  unknown: 'غير مؤكدة',
};

const PACKAGE_STATUS_CLASSES: Record<NativeOfflinePackageRow['status'], string> = {
  active: 'bg-[var(--c-success-50)] text-[var(--cms-success-700)]',
  revoked: 'bg-[var(--c-danger-50)] text-[var(--c-danger-700)]',
  unknown: 'bg-[var(--c-bg-hover)] text-[var(--c-text-muted)]',
};

type OfflineTab = 'media' | 'packages' | 'courses';

const TABS: Array<{ id: OfflineTab; label: string; testId: string; icon: typeof FileText }> = [
  { id: 'media', label: 'الملفات', testId: 'offline-panel-tab-media', icon: FileText },
  { id: 'packages', label: 'حزم الأسئلة', testId: 'offline-panel-tab-packages', icon: FileQuestion },
  { id: 'courses', label: 'الكورسات', testId: 'offline-panel-tab-courses', icon: GraduationCap },
];

function formatBytes(bytes?: number): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ج.ب`;
}

/** Sums the safe byte counts the bridge reports — display only, never a promise. */
function totalCachedBytes(items: NativeCachedItem[]): number {
  return items.reduce(
    (sum, item) => sum + (typeof item.bytes === 'number' && Number.isFinite(item.bytes) && item.bytes > 0 ? item.bytes : 0),
    0,
  );
}

export function OfflinePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const offline = useOfflineStatus();
  const [tab, setTab] = useState<OfflineTab>('media');
  const [items, setItems] = useState<NativeCachedItem[] | null>(null);
  const [packages, setPackages] = useState<NativeOfflinePackageRow[] | null>(null);
  const [courses, setCourses] = useState<NativeOfflineCourseEpisodeRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const catalogActive = isNativeCatalogActive();
  const packagesActive = isNativePackagesSurfaceActive();
  const coursesActive = isNativeCoursesSurfaceActive();
  const anySurfaceActive = catalogActive || packagesActive || coursesActive;
  const shellPresent = hasNativeShell();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // One refresh sweep covers every active surface (the panel refresh button
  // is the manual progress check — no polling loops in W1).
  const refresh = useCallback(() => {
    if (!anySurfaceActive) {
      setItems(null);
      setPackages(null);
      setCourses(null);
      return;
    }
    setLoading(true);
    // The bridge is synchronous — a microtask keeps the spinner honest for
    // slow JNI round-trips without blocking paint.
    window.setTimeout(() => {
      setItems(catalogActive ? nativeListCached() : null);
      setPackages(packagesActive ? nativeListOfflinePackages() : null);
      setCourses(coursesActive ? nativeListOfflineCourseEpisodes() : null);
      setLoading(false);
    }, 0);
  }, [anySurfaceActive, catalogActive, packagesActive, coursesActive]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleRemoveMedia = (contentId: string) => {
    nativeRemoveCached(contentId);
    refresh();
  };

  const handleRemovePackage = (packageId: string) => {
    nativeRemoveOfflinePackage(packageId);
    refresh();
  };

  const handleRemoveCourseEpisode = (episodeId: string) => {
    nativeRemoveOfflineCourseEpisode(episodeId);
    refresh();
  };

  // Arrow keys move between the three tabs (click + aria-selected carry the
  // primary contract; this keeps the tablist fully keyboard-operable).
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const currentIndex = TABS.findIndex((entry) => entry.id === tab);
    const nextIndex = (currentIndex + delta + TABS.length) % TABS.length;
    setTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-[var(--z-modal)]" role="dialog" aria-modal="true" aria-label="وضع بدون إنترنت" data-testid="offline-panel-root">
      {/* click-outside closes */}
      <button type="button" aria-label="إغلاق لوحة وضع بدون إنترنت" onClick={onClose} className="absolute inset-0 bg-black/35 backdrop-blur-[2px] cursor-default" data-testid="offline-panel-backdrop" />
      <section
        data-testid="offline-panel"
        className="absolute top-0 end-0 h-full w-full sm:w-[420px] flex flex-col bg-[var(--cms-surface)] border-s border-[var(--c-border-strong)] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-5 py-4 border-b border-[var(--c-border)]">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--grad-primary)' }}>
            <CloudOff className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-extrabold text-[var(--c-text)]">وضع بدون إنترنت</h2>
            <p className="text-xs text-[var(--c-text-muted)]">كل ما حُفِظ لعرضه دون اتصال</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading || !anySurfaceActive}
            aria-label="تحديث قائمة المحتوى المحفوظ"
            data-testid="offline-panel-refresh"
            className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            data-testid="offline-panel-close"
            className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Connectivity banner (honest hint, not a promise) */}
        <div
          data-testid="offline-panel-connectivity"
          className={`flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold border-b border-[var(--c-border)] ${offline ? 'text-[var(--c-danger-500)] bg-[rgba(255,82,82,0.06)]' : 'text-[var(--c-text-muted)]'}`}
        >
          {offline ? <WifiOff className="w-4 h-4 shrink-0" /> : <Wifi className="w-4 h-4 shrink-0" />}
          {offline ? 'يبدو أنك دون اتصال الآن — يمكنك فتح المحتوى المحفوظ فقط' : 'أنت متصل — يمكن فتح المحتوى المحفوظ وتحديثه'}
        </div>

        {/* Storage meter — real media bytes from the bridge vs the native 5 GiB cap
            (media only: the meter sums cached library files, so it shows on that tab). */}
        {tab === 'media' && catalogActive && items && items.length > 0 && (
          <div className="px-5 py-3 border-b border-[var(--c-border)]" data-testid="offline-panel-meter">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-[var(--c-text-muted)]">
              <span>مساحة التخزين دون اتصال</span>
              <span dir="rtl" data-testid="offline-panel-meter-value">
                {formatBytes(totalCachedBytes(items))} من {formatBytes(NATIVE_MEDIA_CACHE_MAX_BYTES)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--c-border)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(1, (totalCachedBytes(items) / NATIVE_MEDIA_CACHE_MAX_BYTES) * 100))}%`,
                  background: 'var(--grad-primary)',
                }}
              />
            </div>
          </div>
        )}

        {/* Segmented tab control — media is the DEFAULT tab (existing suite parity) */}
        <div
          className="flex gap-1 px-5 py-2.5 border-b border-[var(--c-border)]"
          role="tablist"
          aria-label="أقسام وضع بدون إنترنت"
          data-testid="offline-panel-tabs"
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map(({ id, label, icon: Icon, testId }, index) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                ref={(node) => { tabRefs.current[index] = node; }}
                type="button"
                role="tab"
                id={`offline-panel-tab-control-${id}`}
                aria-selected={selected}
                aria-controls={`offline-panel-panel-${id}`}
                data-testid={testId}
                onClick={() => setTab(id)}
                className={`flex-1 min-h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-bold transition-colors ${selected ? 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]' : 'text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)]'}`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Body — the active tab's panel; the whole area scrolls (long lists) */}
        <div className="flex-1 overflow-y-auto min-h-0" data-testid="offline-panel-body">
          {tab === 'media' ? (
            <div role="tabpanel" id="offline-panel-panel-media" aria-labelledby="offline-panel-tab-control-media">
              <OfflineMediaList items={items} loading={loading} catalogActive={catalogActive} onOpen={nativeOpenLocal} onRemove={handleRemoveMedia} />
            </div>
          ) : tab === 'packages' ? (
            <div role="tabpanel" id="offline-panel-panel-packages" aria-labelledby="offline-panel-tab-control-packages">
              <OfflinePackagesList
                packages={packages}
                loading={loading}
                surfaceActive={packagesActive}
                shellPresent={shellPresent}
                onOpen={nativeOpenOfflineExam}
                onRemove={handleRemovePackage}
              />
            </div>
          ) : (
            <div role="tabpanel" id="offline-panel-panel-courses" aria-labelledby="offline-panel-tab-control-courses">
              <OfflineCourseEpisodesList
                episodes={courses}
                loading={loading}
                surfaceActive={coursesActive}
                shellPresent={shellPresent}
                onOpen={nativeOpenOfflineCourseEpisode}
                onRemove={handleRemoveCourseEpisode}
              />
            </div>
          )}
        </div>

        {/* Arabic honesty (Owner decision 5): what can NEVER be cached offline.
            The media tab keeps the original note; the courses tab carries the
            tailored YouTube note so it never contradicts the hosted episodes
            the tab itself lists. */}
        {(tab === 'media' || tab === 'courses') && (
          <div
            className="px-5 pb-1 text-[11.5px] leading-relaxed text-[var(--c-text-faint)]"
            data-testid="offline-panel-uncacheable-note"
          >
            {tab === 'media' ? UNCACHEABLE_OFFLINE_NOTE : YOUTUBE_EPISODE_OFFLINE_NOTE}
          </div>
        )}

        <footer className="px-5 py-3 border-t border-[var(--c-border)] text-[11.5px] text-[var(--c-text-faint)]">
          الملفات المحفوظة مشفّرة ومرتبطة بحسابك — تُفتح دون اتصال من داخل التطبيق فقط.
        </footer>
      </section>
    </div>
  );
}

// ===== Tab 1 — media (Night Task 3 behavior, extracted verbatim) =====

function OfflineMediaList({ items, loading, catalogActive, onOpen, onRemove }: {
  items: NativeCachedItem[] | null;
  loading: boolean;
  catalogActive: boolean;
  onOpen: (contentId: string) => void;
  onRemove: (contentId: string) => void;
}) {
  if (!catalogActive) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="offline-panel-browser-empty">
        <CloudOff className="w-10 h-10 text-[var(--c-text-faint)]" />
        <p className="text-sm font-bold text-[var(--c-text)]">لا يوجد محتوى محفوظ في المتصفّح</p>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--c-text-muted)]">
          التخزين المشفّر للعرض دون اتصال يعمل داخل تطبيق أندرويد — كل ملف تفتحه هناك يُحفَظ تلقائياً ويظهر في هذه اللوحة داخل التطبيق.
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--c-primary-700)]" />
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="offline-panel-empty">
        <CloudOff className="w-10 h-10 text-[var(--c-text-faint)]" />
        <p className="text-sm font-bold text-[var(--c-text)]">لم يُحفَظ أي ملف بعد</p>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--c-text-muted)]">
          افتح أي ملف من المكتبة أو المحاضرات وسيُحفَظ تلقائياً لعرضه دون اتصال.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--c-border)]" data-testid="offline-panel-list">
      {items.map((item) => {
        const Icon = TYPE_ICONS[item.type] ?? FileText;
        const size = formatBytes(item.bytes);
        return (
          <li key={item.contentId} className="flex items-center gap-3 px-5 py-3.5" data-testid={`offline-item-${item.contentId}`}>
            <div className="w-9 h-9 rounded-[10px] bg-[var(--c-primary-50)] text-[var(--c-primary-700)] flex items-center justify-center shrink-0">
              <Icon className="w-[18px] h-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold text-[var(--c-text)] truncate">{item.title || 'ملف بدون عنوان'}</p>
              <p className="text-[11.5px] text-[var(--c-text-muted)]" dir="rtl">
                {TYPE_LABELS[item.type] ?? item.type}
                {size ? ` · ${size}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpen(item.contentId)}
              aria-label={`فتح ${item.title || 'الملف'} دون اتصال`}
              className="press min-h-9 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold text-white"
              style={{ background: 'var(--grad-primary)' }}
            >
              فتح
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.contentId)}
              aria-label={`حذف ${item.title || 'الملف'} من المحفوظات`}
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--c-text-faint)] hover:text-[var(--c-danger-500)] hover:bg-[rgba(255,82,82,0.08)] transition-colors"
            >
              <Trash2 className="w-[17px] h-[17px]" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ===== Tab 2 — offline question packages (Wave 2 bridge contract) =====

function OfflinePackagesList({ packages, loading, surfaceActive, shellPresent, onOpen, onRemove }: {
  packages: NativeOfflinePackageRow[] | null;
  loading: boolean;
  surfaceActive: boolean;
  shellPresent: boolean;
  onOpen: (packageId: string) => void;
  onRemove: (packageId: string) => void;
}) {
  if (!surfaceActive) {
    // Honesty contract: older shells explain the upgrade path; a plain
    // browser explains that package storage is Android-shell-only.
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="offline-packages-unavailable">
        <PackageOpen className="w-10 h-10 text-[var(--c-text-faint)]" />
        <p className="text-sm font-bold text-[var(--c-text)]">
          {shellPresent ? 'حزم الأسئلة دون اتصال تتوفر بعد تحديث التطبيق إلى الإصدار الأحدث.' : 'حزم الأسئلة دون اتصال تعمل داخل تطبيق أندرويد فقط.'}
        </p>
        {!shellPresent && (
          <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--c-text-muted)]">
            تخزين الحزم دون اتصال مشفّر ومرتبط بحسابك — لا يوفّره المتصفّح.
          </p>
        )}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--c-primary-700)]" />
      </div>
    );
  }
  if (!packages || packages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="offline-packages-empty">
        <FileQuestion className="w-10 h-10 text-[var(--c-text-faint)]" />
        <p className="text-sm font-bold text-[var(--c-text)]">لم تُحمَّل أي حزمة بعد</p>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--c-text-muted)]">
          افتح صفحة اختبار أو صفحة مادة واضغط «تحميل دون اتصال».
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--c-border)]" data-testid="offline-packages-list">
      {packages.map((row) => {
        const title = row.title || 'حزمة أسئلة';
        const meta: string[] = [];
        if (row.questionCount != null) meta.push(`${row.questionCount} سؤال`);
        if (row.pendingAnswerCount != null && row.pendingAnswerCount > 0) meta.push(`إجابات بانتظار المزامنة: ${row.pendingAnswerCount}`);
        meta.push(`تنتهي: ${formatDate(row.expiresAt)}`);
        return (
          <li key={row.packageId} className="flex items-center gap-3 px-5 py-3.5" data-testid={`offline-package-${row.packageId}`}>
            <div className="w-9 h-9 rounded-[10px] bg-[var(--c-primary-50)] text-[var(--c-primary-700)] flex items-center justify-center shrink-0">
              <FileQuestion className="w-[18px] h-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="flex items-center gap-2 min-w-0">
                <span className="text-[13.5px] font-bold text-[var(--c-text)] truncate">{title}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${PACKAGE_STATUS_CLASSES[row.status]}`}
                  data-testid={`offline-package-status-${row.packageId}`}
                >
                  {PACKAGE_STATUS_LABELS[row.status]}
                </span>
              </p>
              <p className="text-[11.5px] text-[var(--c-text-muted)] mt-0.5" dir="rtl">
                {meta.join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpen(row.packageId)}
              aria-label={`بدء امتحان ${title} دون اتصال`}
              data-testid={`offline-package-open-${row.packageId}`}
              className="press min-h-9 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold text-white"
              style={{ background: 'var(--grad-primary)' }}
            >
              بدء الامتحان
            </button>
            <button
              type="button"
              onClick={() => onRemove(row.packageId)}
              aria-label={`حذف ${title} من الحزم المحفوظة`}
              data-testid={`offline-package-remove-${row.packageId}`}
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--c-text-faint)] hover:text-[var(--c-danger-500)] hover:bg-[rgba(255,82,82,0.08)] transition-colors"
            >
              <Trash2 className="w-[17px] h-[17px]" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ===== Tab 3 — hosted course episodes (Wave 5 bridge contract) =====

function OfflineCourseEpisodesList({ episodes, loading, surfaceActive, shellPresent, onOpen, onRemove }: {
  episodes: NativeOfflineCourseEpisodeRow[] | null;
  loading: boolean;
  surfaceActive: boolean;
  shellPresent: boolean;
  onOpen: (episodeId: string) => void;
  onRemove: (episodeId: string) => void;
}) {
  if (!surfaceActive) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="offline-courses-unavailable">
        <MonitorPlay className="w-10 h-10 text-[var(--c-text-faint)]" />
        <p className="text-sm font-bold text-[var(--c-text)]">
          {shellPresent ? 'تحميل حلقات الكورس دون اتصال يتوفر بعد تحديث التطبيق.' : 'تحميل حلقات الكورس دون اتصال يعمل داخل تطبيق أندرويد فقط.'}
        </p>
        {!shellPresent && (
          <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--c-text-muted)]">
            تخزين الحلقات دون اتصال مشفّر ومرتبط بحسابك — لا يوفّره المتصفّح.
          </p>
        )}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--c-primary-700)]" />
      </div>
    );
  }
  if (!episodes || episodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="offline-courses-empty">
        <MonitorPlay className="w-10 h-10 text-[var(--c-text-faint)]" />
        <p className="text-sm font-bold text-[var(--c-text)]">لم تُحمَّل أي حلقة بعد</p>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--c-text-muted)]">
          افتح صفحة الكورس واضغط «تحميل دون اتصال» بجانب الحلقة.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--c-border)]" data-testid="offline-courses-list">
      {episodes.map((row) => {
        const title = row.title || 'حلقة كورس';
        const Icon = row.type === 'audio' ? Music : MonitorPlay;
        const size = formatBytes(row.bytes);
        return (
          <li key={row.episodeId} className="flex items-center gap-3 px-5 py-3.5" data-testid={`offline-course-episode-${row.episodeId}`}>
            <div className="w-9 h-9 rounded-[10px] bg-[var(--c-primary-50)] text-[var(--c-primary-700)] flex items-center justify-center shrink-0">
              <Icon className="w-[18px] h-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold text-[var(--c-text)] truncate">{title}</p>
              <p className="text-[11.5px] text-[var(--c-text-muted)]" dir="rtl">
                {row.type === 'audio' ? 'صوت' : 'فيديو'}
                {size ? ` · ${size}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpen(row.episodeId)}
              aria-label={`فتح ${title} دون اتصال`}
              data-testid={`offline-course-open-${row.episodeId}`}
              className="press min-h-9 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold text-white"
              style={{ background: 'var(--grad-primary)' }}
            >
              فتح
            </button>
            <button
              type="button"
              onClick={() => onRemove(row.episodeId)}
              aria-label={`حذف ${title} من الحلقات المحفوظة`}
              data-testid={`offline-course-remove-${row.episodeId}`}
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--c-text-faint)] hover:text-[var(--c-danger-500)] hover:bg-[rgba(255,82,82,0.08)] transition-colors"
            >
              <Trash2 className="w-[17px] h-[17px]" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
