import { useEffect, useRef, useState } from 'react';
import { readSession } from '@/services/session-store';
import {
  isNativePackagesSurfaceActive,
  nativeDownloadOfflinePackage,
  nativeListOfflinePackages,
} from '@/utils/native-packages';

/**
 * Owner decision (offline-experience implementation, 2026-11-28) — automatic
 * FULL-SUBJECT question-package download on the FIRST visit to that subject's
 * question bank (or exam course). Scope discipline:
 *
 *  - Downloads ONLY the visited subject's package — never another subject.
 *  - Idempotent: when the student already holds a usable package for the
 *    subject (active + unexpired, from listOfflinePackages) nothing starts.
 *  - One attempt per subject per app install: a localStorage marker
 *    (`cms.offline.autoPkg.<subjectId>`) records the attempt regardless of
 *    outcome, so repeated navigation, remounts and failed downloads never
 *    hammer the offline-package rate limit (5 requests / 15 min per install).
 *    Retries happen ONLY through the manual «تحميل دون اتصال» CTA.
 *  - Inert outside the Android shell or on old shells (surface absent).
 *  - The download rides the page's web access token exactly like the manual
 *    CTA (web→native direction only; the native side never returns tokens).
 */

const AUTO_MARKER_PREFIX = 'cms.offline.autoPkg.';

function markerKey(subjectId: string): string {
  return AUTO_MARKER_PREFIX + subjectId;
}

function hasAttempted(subjectId: string): boolean {
  try {
    return window.localStorage.getItem(markerKey(subjectId)) !== null;
  } catch {
    return false;
  }
}

function markAttempted(subjectId: string): void {
  try {
    window.localStorage.setItem(markerKey(subjectId), new Date().toISOString());
  } catch {
    /* storage unavailable (private mode) — the in-process ref still guards */
  }
}

/** Clears the auto-download marker (called on logout so a fresh login re-attempts). */
export function clearAutoPackageMarkers(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(AUTO_MARKER_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* best effort */
  }
}

export type AutoPackageState = 'inactive' | 'checking' | 'started' | 'skipped' | 'failed';

/**
 * Triggers the one-shot auto-download for [subjectId] when appropriate.
 * Returns the live state so the page can surface honest Arabic feedback.
 */
export function useAutoSubjectPackage(subjectId: string | null | undefined): AutoPackageState {
  const [state, setState] = useState<AutoPackageState>('inactive');
  const inFlight = useRef(false);

  useEffect(() => {
    if (!subjectId) return;
    if (!isNativePackagesSurfaceActive()) return; // browser or old shell — inert
    if (inFlight.current) return; // StrictMode double-effect guard
    if (hasAttempted(subjectId)) { setState('skipped'); return; }

    inFlight.current = true;
    setState('checking');
    let cancelled = false;

    void (async () => {
      // Idempotency: an existing usable package for THIS subject means no
      // new download (repeated visits must not redownload an unchanged pkg).
      const existing = nativeListOfflinePackages();
      if (existing) {
        const now = Date.now();
        const mine = existing.find(
          (row) =>
            row.subjectIds.includes(subjectId) &&
            row.status === 'active' &&
            (!row.expiresAt || Date.parse(row.expiresAt) > now),
        );
        if (mine) {
          markAttempted(subjectId);
          if (!cancelled) setState('skipped');
          return;
        }
      }

      markAttempted(subjectId); // record BEFORE the call: one attempt, ever, per subject
      const session = readSession();
      const code = nativeDownloadOfflinePackage({
        subjectId,
        accessToken: session?.accessToken,
      });
      if (cancelled) return;
      if (code === 'started' || code === 'ready' || code === 'downloading') {
        setState('started');
      } else {
        // Honest failure: quota / denied_auth / denied_native_session / rate
        // limited — the student retries via the manual CTA when they want to.
        setState('failed');
      }
    })();

    return () => { cancelled = true; };
  }, [subjectId]);

  return state;
}
