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
/** R30.2 — undo/redo depth: strokes, shapes and notes only (per session). */
const HISTORY_LIMIT = 50;

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
  /** R30.2 — the ref is the single synchronous source of truth for history
   *  snapshots: it is updated in the SAME tick as every commit (see
   *  commitAnnotations), so same-tick double commits snapshot correctly. */
  const annotationsRef = useRef<Map<string, PdfAnnotation>>(new Map());

  const commitAnnotations = useCallback((next: Map<string, PdfAnnotation>) => {
    annotationsRef.current = next;
    setAnnotations(next);
  }, []);

  useEffect(() => {
    if (!query.data || hydratedRef.current) return;
    hydratedRef.current = true;
    commitAnnotations(new Map(query.data.map((a) => [a.id, a])));
  }, [query.data, commitAnnotations]);

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

  /* ---- R30.2 — history stack: past / present / future states of the
          annotation map. EVERY upsert() and remove() pushes the PRE-mutation
          snapshot (one eraser gesture = one remove() = one undo unit — the
          Wave 11.11 locked contract). undo()/redo() restore a snapshot and
          persist the DIFF as the same idempotent SaveAnnotationsBatch the
          normal mutations use — zero backend changes, last-write-wins (D.2).
          Refs hold the stacks; historyVersion bumps force re-renders so
          canUndo/canRedo stay honest for the toolbar buttons. ---- */
  const pastRef = useRef<Array<Map<string, PdfAnnotation>>>([]);
  const futureRef = useRef<Array<Map<string, PdfAnnotation>>>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const pushHistory = useCallback(() => {
    pastRef.current.push(new Map(annotationsRef.current));
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const applySnapshot = useCallback((target: Map<string, PdfAnnotation>) => {
    const current = annotationsRef.current;
    const upserts: PdfAnnotation[] = [];
    const deletes: string[] = [];
    target.forEach((annotation, id) => {
      if (current.get(id) !== annotation) upserts.push(annotation);
    });
    current.forEach((_, id) => {
      if (!target.has(id)) deletes.push(id);
    });
    // The undo/redo batch IS the intent: reset the queue first so stale
    // pending entries can never leak into the next flush.
    pendingRef.current.upserts = new Map(upserts.map((a) => [a.id, a]));
    pendingRef.current.deletes = new Set(deletes);
    commitAnnotations(new Map(target));
    schedule();
  }, [commitAnnotations, schedule]);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(new Map(annotationsRef.current));
    applySnapshot(previous);
    setHistoryVersion((v) => v + 1);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(new Map(annotationsRef.current));
    applySnapshot(next);
    setHistoryVersion((v) => v + 1);
  }, [applySnapshot]);

  /** Reset local state when the file changes (component is remounted per file,
   *  but the guard keeps this honest if a host reuses the mount). The history
   *  stacks belong to the previous document and die with it. */
  useEffect(() => {
    hydratedRef.current = false;
    pastRef.current = [];
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, [fileId]);

  /** Queue one annotation create/replace (client-generated id). */
  const upsert = useCallback((annotation: PdfAnnotation) => {
    pushHistory();
    pendingRef.current.upserts.set(annotation.id, annotation);
    pendingRef.current.deletes.delete(annotation.id);
    const next = new Map(annotationsRef.current);
    next.set(annotation.id, annotation);
    commitAnnotations(next);
    schedule();
  }, [schedule, pushHistory, commitAnnotations]);

  /** Queue deletes (smart eraser gestures, shape/note deletion). */
  const remove = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    pushHistory();
    let changed = false;
    const next = new Map(annotationsRef.current);
    ids.forEach((id) => {
      if (!next.has(id)) return;
      changed = true;
      next.delete(id);
      pendingRef.current.upserts.delete(id);
      pendingRef.current.deletes.add(id);
    });
    if (changed) commitAnnotations(next);
    schedule();
  }, [schedule, pushHistory, commitAnnotations]);

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

  return {
    annotations,
    upsert,
    remove,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    /** Read-guard only — bumps on every history mutation to re-render. */
    historyVersion,
    saving,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
