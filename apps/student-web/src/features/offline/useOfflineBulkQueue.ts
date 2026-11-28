import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isNativeMediaCacheActive,
  nativeCachePercent,
  nativeCacheStatus,
  nativeCancelDownload,
  nativeEnsureLocal,
  nativeCacheDenyMessage,
  nativeCacheTypeFor,
  type NativeCacheType,
} from '@/utils/native-cache';

/**
 * Owner decision (offline-experience implementation, 2026-11-28) — the
 * library bulk-add queue: lets a student multi-select library files and add
 * them to the encrypted offline store WITHOUT opening them one at a time.
 *
 * Design:
 *  - SEQUENTIAL queue: one ensureLocal at a time (the native executor is
 *    single-threaded anyway; this keeps progress + quota errors honest and
 *    avoids burst-hitting the media-offline rate limit).
 *  - Progress per item (percent) + overall (done/total); items already
 *    `ready` count instantly (idempotent — no duplicate work).
 *  - Cancellation: the current item cancels through the native
 *    cancelDownload surface; queued items simply never start.
 *  - Terminal failures (quota / denied_auth / denied_native_session / error)
 *    are recorded per item with their Arabic message; the queue CONTINUES on
 *    per-item failure but STOPS on `quota` (the shared cap is full — every
 *    later item would fail the same way, so we stop and tell the student to
 *    free space).
 *  - Outside the shell the hook is inert (isIdle, empty summary).
 */

export interface BulkItem {
  contentId: string;
  title: string;
  type: string;
  /** YouTube-hosted video rows are not cacheable — they are rejected upfront. */
  cacheable: boolean;
}

export type BulkItemState =
  | { status: 'pending' }
  | { status: 'downloading'; percent: number }
  | { status: 'ready' }
  | { status: 'canceled' }
  | { status: 'failed'; code: string; message: string };

export interface BulkProgress {
  items: BulkItem[];
  states: Record<string, BulkItemState>;
  currentId: string | null;
  doneCount: number;
  failedCount: number;
  running: boolean;
}

const STOP_CODES = new Set(['quota', 'error:quota']);

export function useOfflineBulkQueue() {
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const cancelRef = useRef(false);
  const active = isNativeMediaCacheActive();

  /** Maps a library row's `type` (PascalCase API enum) onto the native cache type. */
  const cacheTypeForFile = useCallback((rawType: string, youtubeVideoId?: string | null): NativeCacheType | null => {
    const key = (rawType ?? '').trim().toLowerCase();
    return nativeCacheTypeFor(key, youtubeVideoId);
  }, []);

  /** Starts the sequential bulk add. Returns immediately; follow [progress]. */
  const start = useCallback((items: BulkItem[]) => {
    if (!active || items.length === 0) return;
    cancelRef.current = false;
    const states: Record<string, BulkItemState> = {};
    for (const item of items) states[item.contentId] = { status: 'pending' };
    setProgress({ items, states, currentId: null, doneCount: 0, failedCount: 0, running: true });
    void runQueue(items, states);
  }, [active]);

  const runQueue = useCallback(async (items: BulkItem[], states: Record<string, BulkItemState>) => {
    let done = 0;
    let failed = 0;
    let stoppedByQuota = false;

    const patch = (id: string, state: BulkItemState) => {
      states[id] = state;
      setProgress((prev) =>
        prev ? { ...prev, states: { ...states }, doneCount: done, failedCount: failed, currentId: id } : prev,
      );
    };

    for (const item of items) {
      if (cancelRef.current) { patch(item.contentId, { status: 'canceled' }); continue; }
      if (stoppedByQuota) { patch(item.contentId, { status: 'canceled' }); continue; }
      if (!item.cacheable) {
        failed += 1;
        patch(item.contentId, { status: 'failed', code: 'unsupported_type', message: 'نوع الملف غير مدعوم للعرض دون اتصال.' });
        continue;
      }

      const code = nativeEnsureLocal(item.contentId, cacheTypeForFile(item.type)!, { title: item.title });
      if (code == null) {
        failed += 1;
        patch(item.contentId, { status: 'failed', code: 'error', message: 'حدث خطأ أثناء تجهيز الملف دون اتصال.' });
        continue;
      }
      if (code === 'ready') {
        done += 1;
        patch(item.contentId, { status: 'ready' });
        continue;
      }
      if (code === 'started' || code === 'downloading') {
        patch(item.contentId, { status: 'downloading', percent: 0 });
        // Poll until this item settles (bounded: 30 min per item, like the viewer wait).
        const settled = await waitForItem(item.contentId, (percent) => {
          patch(item.contentId, { status: 'downloading', percent });
        }, () => cancelRef.current);
        if (settled === 'ready') {
          done += 1;
          patch(item.contentId, { status: 'ready' });
          continue;
        }
        if (settled === 'canceled') {
          patch(item.contentId, { status: 'canceled' });
          continue;
        }
        const message = nativeCacheDenyMessage(settled) ?? 'حدث خطأ أثناء تجهيز الملف دون اتصال.';
        failed += 1;
        patch(item.contentId, { status: 'failed', code: settled, message });
        if (STOP_CODES.has(settled)) {
          stoppedByQuota = true;
          // Cancel nothing else — queued items are simply marked canceled.
        }
        continue;
      }
      // Terminal deny code straight from ensureLocal.
      const message = nativeCacheDenyMessage(code) ?? 'حدث خطأ أثناء تجهيز الملف دون اتصال.';
      failed += 1;
      patch(item.contentId, { status: 'failed', code, message });
      if (STOP_CODES.has(code)) stoppedByQuota = true;
    }

    setProgress((prev) => (prev ? { ...prev, running: false, currentId: null, doneCount: done, failedCount: failed } : prev));
  }, [cacheTypeForFile]);

  /** Cancels the queue: current item through the native surface, the rest before start. */
  const cancel = useCallback(() => {
    cancelRef.current = true;
    setProgress((prev) => {
      if (prev?.currentId) nativeCancelDownload(prev.currentId);
      return prev;
    });
  }, []);

  const dismiss = useCallback(() => {
    cancelRef.current = true;
    setProgress(null);
  }, []);

  // Cleanup on unmount: stop polling loops.
  useEffect(() => () => { cancelRef.current = true; }, []);

  return { active, progress, start, cancel, dismiss };
}

/** Waits for one item to settle; resolves 'ready' | 'canceled' | terminal code. */
function waitForItem(
  contentId: string,
  onProgress: (percent: number) => void,
  shouldStop: () => boolean,
  timeoutMs = 30 * 60_000,
): Promise<'ready' | 'canceled' | string> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (shouldStop()) { nativeCancelDownload(contentId); resolve('canceled'); return; }
      const status = nativeCacheStatus(contentId);
      if (status !== null) {
        const percent = nativeCachePercent(status);
        if (percent !== null) onProgress(percent);
        if (status === 'ready') { resolve('ready'); return; }
        if (status === 'absent') { resolve('canceled'); return; }
        if (status === 'denied_auth') { resolve('denied_auth'); return; }
        if (status === 'denied_stale') { resolve('denied_stale'); return; }
        if (status.startsWith('error')) { resolve(status); return; }
      }
      if (Date.now() - startedAt > timeoutMs) { resolve('error:timeout'); return; }
      setTimeout(tick, 700);
    };
    tick();
  });
}
