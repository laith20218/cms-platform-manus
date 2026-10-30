import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { libraryApi } from '@/features/library/services/library-api';
import { getOrCreateInstallationId } from '@/utils';
import type { PdfAnnotation, SaveAnnotationsBatch } from './pdf-types';

/**
 * Wave 11.8 / F2 — annotation hydration + debounced batch persistence.
 *
 * Model: the server list hydrates ONCE on open (TanStack Query), then the
 * player owns a local Map as the live source of truth. Every local mutation
 * feeds a pending queue that flushes as ONE idempotent batch
 * (client-id-keyed upserts + owner-scoped deletes) after a short debounce —
 * the same rhythm as the media progress upsert, but batched because a pen
 * stroke stream can emit many annotations in seconds.
 *
 * Failure semantics: a failed flush re-merges into the pending queue and
 * retries with backoff; nothing is ever dropped silently. Unmount/pagehide
 * flushes ride a keepalive fetch (media-api.upsertProgressKeepalive pattern),
 * because the axios instance cannot be awaited during teardown.
 *
 * Conflict strategy (D.2): last-write-wins per annotation — rows are strictly
 * student-private, so the only collision is the same student on two devices.
 */
const FLUSH_DEBOUNCE_MS = 800;
const MAX_FLUSH_RETRY_DELAY_MS = 8000;

export function usePdfAnnotations(fileId: string) {
  // Hydration — infinite staleTime: the player is the only writer (owner-scoped),
  // so a refetch on window focus would only risk clobbering live local state.
  const query = useQuery({
    queryKey: ['pdf-annotations', fileId],
    queryFn: () => libraryApi.getAnnotations(fileId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  const [annotations, setAnnotations] = useState<Map<string, PdfAnnotation>>(new Map());
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!query.data || hydratedRef.current) return;
    hydratedRef.current = true;
    setAnnotations(new Map(query.data.map((a) => [a.id, a])));
  }, [query.data]);

  /** Reset local state when the file changes (component is remounted per file,
   *  but the guard keeps this honest if a host reuses the mount). */
  useEffect(() => {
    hydratedRef.current = false;
  }, [fileId]);

  const pendingRef = useRef<{
    upserts: Map<string, PdfAnnotation>;
    deletes: Set<string>;
  }>({ upserts: new Map(), deletes: new Set() });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(FLUSH_DEBOUNCE_MS);
  const [saving, setSaving] = useState(false);

  const mergeBack = useCallback((batch: SaveAnnotationsBatch) => {
    batch.upserts.forEach((upsert) => {
      // A delete queued after the upsert wins (client intent order).
      if (!pendingRef.current.deletes.has(upsert.id)) {
        pendingRef.current.upserts.set(upsert.id, upsert as PdfAnnotation);
      }
    });
    batch.deletedIds.forEach((id) => {
      pendingRef.current.upserts.delete(id);
      pendingRef.current.deletes.add(id);
    });
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending.upserts.size === 0 && pending.deletes.size === 0) return;

    const batch: SaveAnnotationsBatch = {
      upserts: Array.from(pending.upserts.values()).map((a) => ({
        id: a.id,
        pageNumber: a.pageNumber,
        annotationType: a.annotationType,
        payload: a.payload,
      })),
      deletedIds: Array.from(pending.deletes),
    };
    // Optimistically clear; re-merge on failure so nothing drops.
    pending.upserts = new Map();
    pending.deletes = new Set();

    setSaving(true);
    try {
      await libraryApi.saveAnnotations(fileId, batch);
      retryDelayRef.current = FLUSH_DEBOUNCE_MS;
    } catch {
      mergeBack(batch);
      // Backoff retry — never drop a stroke silently.
      timerRef.current = setTimeout(() => { void flush(); }, retryDelayRef.current);
      retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_FLUSH_RETRY_DELAY_MS);
    } finally {
      setSaving(false);
    }
  }, [fileId, mergeBack]);

  const schedule = useCallback((delay = FLUSH_DEBOUNCE_MS) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, delay);
  }, [flush]);

  /** Queue one annotation create/replace (client-generated id). */
  const upsert = useCallback((annotation: PdfAnnotation) => {
    pendingRef.current.upserts.set(annotation.id, annotation);
    pendingRef.current.deletes.delete(annotation.id);
    setAnnotations((prev) => {
      const next = new Map(prev);
      next.set(annotation.id, annotation);
      return next;
    });
    schedule();
  }, [schedule]);

  /** Queue deletes (eraser future-phase; used today by nothing — kept symmetrical). */
  const remove = useCallback((ids: string[]) => {
    ids.forEach((id) => {
      pendingRef.current.upserts.delete(id);
      pendingRef.current.deletes.add(id);
      setAnnotations((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });
    schedule();
  }, [schedule]);

  // Teardown flush: keepalive survives pagehide/unload teardown.
  useEffect(() => {
    const flushNow = () => {
      const pending = pendingRef.current;
      if (pending.upserts.size === 0 && pending.deletes.size === 0) return;
      const batch: SaveAnnotationsBatch = {
        upserts: Array.from(pending.upserts.values()).map((a) => ({
          id: a.id,
          pageNumber: a.pageNumber,
          annotationType: a.annotationType,
          payload: a.payload,
        })),
        deletedIds: Array.from(pending.deletes),
      };
      pending.upserts = new Map();
      pending.deletes = new Set();
      try {
        const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
        const token = sessionStorage.getItem('cms-access-token');
        const entitlement = sessionStorage.getItem('cms-signed-entitlement');
        const installationId = getOrCreateInstallationId();
        void fetch(`${base}/library/${fileId}/annotations`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            'Accept-Language': 'ar',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(entitlement ? { 'X-Entitlement': entitlement } : {}),
            'X-Installation-Id': installationId,
            'X-Device-Fingerprint': installationId,
          },
          body: JSON.stringify(batch),
        }).catch(() => { /* best-effort by contract */ });
      } catch {
        /* best-effort by contract */
      }
    };
    const onPageHide = () => flushNow();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      // Component teardown (viewer closed, still alive page): graceful async flush.
      flushNow();
    };
  }, [fileId]);

  return { annotations, upsert, remove, saving, isLoading: query.isLoading, isError: query.isError };
}
