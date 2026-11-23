import { useCallback, useEffect, useState } from 'react';
import { CloudOff, FileText, Film, Image as ImageIcon, Loader2, Music, RefreshCw, Trash2, Wifi, WifiOff, X } from 'lucide-react';
import {
  isNativeCatalogActive,
  nativeListCached,
  nativeOpenLocal,
  nativeRemoveCached,
  type NativeCachedItem,
} from '@/utils/native-cache';
import { useOfflineStatus } from './useOfflineStatus';

/**
 * Night Task 3 — «وضع بدون إنترنت» (offline mode) panel.
 *
 * Opens from the Navbar control beside the notifications bell — even while
 * online — so the student can review everything that was auto-saved to the
 * encrypted native cache (every file VIEWED inside the Android shell is
 * queued through ensureLocal by DocumentViewer's useNativeMediaCache hook).
 *
 * Honesty contract (student-web 18.x rules):
 *  - Inside the Android shell with the Batch-4 catalog bridge: live list of
 *    cached objects (safe metadata only), open/remove per row.
 *  - In a plain browser: an honest empty state — the browser has no native
 *    encrypted cache; it says so instead of faking an empty catalog.
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

function formatBytes(bytes?: number): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

export function OfflinePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const offline = useOfflineStatus();
  const [items, setItems] = useState<NativeCachedItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const catalogActive = isNativeCatalogActive();

  const refresh = useCallback(() => {
    if (!catalogActive) {
      setItems(null);
      return;
    }
    setLoading(true);
    // The bridge is synchronous — a microtask keeps the spinner honest for
    // slow JNI round-trips without blocking paint.
    window.setTimeout(() => {
      setItems(nativeListCached());
      setLoading(false);
    }, 0);
  }, [catalogActive]);

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

  const handleRemove = (contentId: string) => {
    nativeRemoveCached(contentId);
    refresh();
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
            disabled={loading || !catalogActive}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0" data-testid="offline-panel-body">
          {!catalogActive ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="offline-panel-browser-empty">
              <CloudOff className="w-10 h-10 text-[var(--c-text-faint)]" />
              <p className="text-sm font-bold text-[var(--c-text)]">لا يوجد محتوى محفوظ في المتصفّح</p>
              <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--c-text-muted)]">
                التخزين المشفّر للعرض دون اتصال يعمل داخل تطبيق أندرويد — كل ملف تفتحه هناك يُحفَظ تلقائياً ويظهر في هذه اللوحة داخل التطبيق.
              </p>
            </div>
          ) : loading ? (
            <div className="h-full flex items-center justify-center p-8">
              <Loader2 className="w-7 h-7 animate-spin text-[var(--c-primary-700)]" />
            </div>
          ) : !items || items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center" data-testid="offline-panel-empty">
              <CloudOff className="w-10 h-10 text-[var(--c-text-faint)]" />
              <p className="text-sm font-bold text-[var(--c-text)]">لم يُحفَظ أي ملف بعد</p>
              <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--c-text-muted)]">
                افتح أي ملف من المكتبة أو المحاضرات وسيُحفَظ تلقائياً لعرضه دون اتصال.
              </p>
            </div>
          ) : (
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
                      onClick={() => nativeOpenLocal(item.contentId)}
                      aria-label={`فتح ${item.title || 'الملف'} دون اتصال`}
                      className="press min-h-9 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold text-white"
                      style={{ background: 'var(--grad-primary)' }}
                    >
                      فتح
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.contentId)}
                      aria-label={`حذف ${item.title || 'الملف'} من المحفوظات`}
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--c-text-faint)] hover:text-[var(--c-danger-500)] hover:bg-[rgba(255,82,82,0.08)] transition-colors"
                    >
                      <Trash2 className="w-[17px] h-[17px]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-[var(--c-border)] text-[11.5px] text-[var(--c-text-faint)]">
          الملفات المحفوظة مشفّرة ومرتبطة بحسابك — تُفتح دون اتصال من داخل التطبيق فقط.
        </footer>
      </section>
    </div>
  );
}
