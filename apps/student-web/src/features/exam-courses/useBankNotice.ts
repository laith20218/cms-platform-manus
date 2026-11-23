import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStudentPreferences, saveStudentPreferences } from '@/features/settings/preferences-api';

/**
 * Night Task 8 — the bank practice «تنويه» (notice) state machine.
 *
 * The notice itself comes from existing admin-managed content (the exam-course
 * bundle's Description). Dismissal semantics per the brief:
 *
 *  • «إخفاء» (hide) — dismiss for THIS visit only: the notice reappears the
 *    next time the student enters the section. Tracked in sessionStorage
 *    (per bundle), which dies with the tab/app session — exactly "this visit".
 *  • «عدم العرض مرة أخرى» (never show again) — persisted per STUDENT +
 *    section. Identity always exists here (the surface is authenticated), so
 *    the server-side student preferences store is the source of truth
 *    (W15.0 pass-through JSON, key `bankNoticeHidden.<bundleId>`); localStorage
 *    is the offline-failure fallback so a flaky network never resurrects a
 *    buried notice.
 */

const PREF_KEY_PREFIX = 'bankNoticeHidden.';
const SESSION_KEY_PREFIX = 'cms-bank-notice-session.';

const prefKey = (bundleId: string) => `${PREF_KEY_PREFIX}${bundleId}`;
const sessionKey = (bundleId: string) => `${SESSION_KEY_PREFIX}${bundleId}`;

function readLocalHidden(bundleId: string): boolean {
  try {
    return window.localStorage.getItem(prefKey(bundleId)) === '1';
  } catch {
    return false;
  }
}

function writeLocalHidden(bundleId: string, hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(prefKey(bundleId), '1');
    else window.localStorage.removeItem(prefKey(bundleId));
  } catch {
    /* storage unavailable — the server preference stays authoritative */
  }
}

export interface BankNoticeState {
  /** A notice exists at all (bundle carries description text). */
  hasNotice: boolean;
  /** Hidden for this visit (session-scoped) — «إخفاء». */
  sessionHidden: boolean;
  /** Hidden forever by this student (server preference, localStorage fallback). */
  permHidden: boolean;
  /** True when the notice must be SHOWN on practice press right now. */
  shouldShow: boolean;
  hideForSession: () => void;
  hideForever: () => Promise<void>;
  reopen: () => void;
}

export function useBankNotice(bundleId: string | null | undefined, noticeText: string | null | undefined): BankNoticeState {
  const hasNotice = Boolean(noticeText && noticeText.trim());
  const queryClient = useQueryClient();

  const { data: preferences } = useQuery({
    queryKey: ['student-preferences'],
    queryFn: getStudentPreferences,
    staleTime: 60_000,
  });

  const [sessionHidden, setSessionHidden] = useState(false);
  const [localHidden, setLocalHidden] = useState(false);
  const [forcedOpen, setForcedOpen] = useState(false);

  useEffect(() => {
    if (!bundleId) return;
    try {
      setSessionHidden(window.sessionStorage.getItem(sessionKey(bundleId)) === '1');
    } catch {
      setSessionHidden(false);
    }
    setLocalHidden(readLocalHidden(bundleId));
    setForcedOpen(false);
  }, [bundleId]);

  const permHidden = preferences?.[prefKey(bundleId ?? '')] === true || localHidden;
  const shouldShow = hasNotice && !permHidden && (forcedOpen || !sessionHidden);

  const hideForSession = useCallback(() => {
    if (!bundleId) return;
    try {
      window.sessionStorage.setItem(sessionKey(bundleId), '1');
    } catch {
      /* best-effort; in-memory state still applies for this mount */
    }
    setForcedOpen(false);
    setSessionHidden(true);
  }, [bundleId]);

  const hideForever = useCallback(async () => {
    if (!bundleId) return;
    // Read-merge-write: PUT replaces the whole preferences object (W15.0).
    try {
      const current = await getStudentPreferences();
      await saveStudentPreferences({ ...current, [prefKey(bundleId)]: true });
      await queryClient.invalidateQueries({ queryKey: ['student-preferences'] });
    } catch {
      // Network failure — localStorage fallback so the choice still sticks
      // for this device; the server copy syncs on a later successful write.
      writeLocalHidden(bundleId, true);
      setLocalHidden(true);
    }
    setForcedOpen(false);
    try {
      window.sessionStorage.setItem(sessionKey(bundleId), '1');
    } catch { /* best-effort */ }
    setSessionHidden(true);
  }, [bundleId, queryClient]);

  const reopen = useCallback(() => {
    setForcedOpen(true);
  }, []);

  return { hasNotice, sessionHidden, permHidden, shouldShow, hideForSession, hideForever, reopen };
}
