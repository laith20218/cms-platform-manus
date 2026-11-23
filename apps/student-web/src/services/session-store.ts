/**
 * Task 2 (Night Mission) — «تذكّرني» session storage abstraction.
 *
 * Wave 18.2 (D-06) removed the old «تذكّرني» checkbox because it was a SILENT
 * FAKE: the app always wrote tokens to sessionStorage, so the control promised
 * persistence that never existed. This module makes the promise REAL:
 *
 *  - Default (remember = false): tokens live in sessionStorage — wiped when the
 *    tab/browser closes (privacy-safe, identical to the pre-existing behavior).
 *  - Opt-in (remember = true): tokens live in localStorage — they survive
 *    browser restarts and Android WebView restarts (DOM storage is enabled in
 *    the shell), so an opted-in student resumes without re-login.
 *
 * Server contract (unchanged, see SessionService.RotateAsync): refresh tokens
 * are single-use and every rotation opens a fresh 7-day sliding window, so a
 * remembered client that visits at least once a week keeps its session alive;
 * the refresh flow itself needs no changes beyond writing rotations back to
 * the store the session actually lives in.
 *
 * Security notes:
 *  - ONLY the tokens the app already uses are stored. The password is never
 *    persisted or logged.
 *  - clearSession() always wipes BOTH stores + the flag, so logout and forced
 *    session-expiry paths can never leave a stale copy behind.
 */

export const ACCESS_TOKEN_KEY = 'cms-access-token';
export const REFRESH_TOKEN_KEY = 'cms-refresh-token';
/** localStorage flag recording the student's «تذكّرني» choice. Survives page
 *  reloads so mid-session token rotations keep writing to the right store. */
export const REMEMBER_ME_FLAG = 'cms-remember-me';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export function isRememberMeEnabled(): boolean {
  try {
    return localStorage.getItem(REMEMBER_ME_FLAG) === '1';
  } catch {
    return false;
  }
}

export function setRememberMe(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(REMEMBER_ME_FLAG, '1');
    else localStorage.removeItem(REMEMBER_ME_FLAG);
  } catch {
    /* storage unavailable (private mode / disabled DOM storage): the flag is
       best-effort; tokens fall back to sessionStorage below. */
  }
}

/** Read the active session. sessionStorage wins when both exist (the active
 *  tab's copy is always the freshest — it is where a non-persistent login
 *  lives and where rotations are mirrored for the current tab). */
export function readSession(): SessionTokens | null {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  try {
    accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? localStorage.getItem(ACCESS_TOKEN_KEY);
    refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/** Persist a fresh login. `persistent` mirrors the student's «تذكّرني» choice. */
export function writeSession(tokens: SessionTokens, persistent: boolean): void {
  setRememberMe(persistent);
  try {
    if (persistent) {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      // Also mirror into sessionStorage: the active tab keeps a fast copy and
      // a mid-session flag flip can never strand the running tab.
      sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    } else {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      // A login WITHOUT «تذكّرني» must not resurrect an older remembered copy
      // after this tab closes — drop any stale persistent tokens now.
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    /* best-effort: unreadable storage leaves the caller unauthenticated */
  }
}

/** Write rotated tokens back into whichever store(s) currently hold a session,
 *  so the 401 → refresh → retry loop keeps the surviving copy fresh. */
export function writeRotatedTokens(tokens: SessionTokens): void {
  try {
    const inSession = !!sessionStorage.getItem(REFRESH_TOKEN_KEY);
    const persistent = isRememberMeEnabled();
    if (inSession || !persistent) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    }
    if (persistent) {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    }
  } catch {
    /* best-effort */
  }
}

/** Wipe every trace of the session (both stores + the flag). Idempotent. */
export function clearSession(): void {
  setRememberMe(false);
  try {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* best-effort */
  }
}
