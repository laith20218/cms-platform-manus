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
 * D-JS-AUTH (debt closure, 2026-11-24): inside the Android shell, the DURABLE
 * (localStorage) token values are sealed via the origin-guarded native bridge
 * (`CmsNative.sealForLocalPersistence` — AndroidKeyStore AES-256-GCM) before
 * they are written, and unsealed on read. A disk dump of the WebView storage
 * now sees `v1:` ciphertext rows instead of raw JWTs. Best-effort by design:
 * in a plain browser, a pre-upgrade shell, or on any seal failure the store
 * keeps its previous raw behavior — the seal NEVER blocks a login. Values
 * without the `v1:` prefix are legacy raw tokens and pass through unchanged
 * (they get re-sealed on the next write). The tab-scoped sessionStorage mirror
 * stays raw by design: it dies with the tab and is the freshest copy. The
 * seal protects tokens AT REST only — code running in the page always holds
 * the live session (see docs/security/PROTECTION-LIMITS.md).
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
 *    session-expiry paths can never leave a stale copy behind — sealed or raw.
 *  - Phase P (containment): clearSession() additionally notifies the Android
 *    shell (best-effort) so its offline stores wipe with the web session; see
 *    the note on the function itself for the honest version-skew gap.
 */

import {
  isSealedValue,
  nativeNotifyWebSessionEnded,
  sealForLocalPersistence,
  unsealForLocalPersistence,
} from '@/utils/native-bridge';

export const ACCESS_TOKEN_KEY = 'cms-access-token';
export const REFRESH_TOKEN_KEY = 'cms-refresh-token';
/** localStorage flag recording the student's «تذكّرني» choice. Survives page
 *  reloads so mid-session token rotations keep writing to the right store. */
export const REMEMBER_ME_FLAG = 'cms-remember-me';
/** localStorage cache of the last /me profile — durable ONLY for remembered
 *  sessions. Reopen hydrates the shell from it instantly while /me verifies
 *  in the background, so the login form never flashes on a valid session. */
export const REMEMBERED_USER_KEY = 'cms-remembered-user';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Shape stored under [REMEMBERED_USER_KEY]: the /me profile plus the moment
 *  it was cached, so consumers can reject a fossilized copy. */
export interface RememberedUser {
  user: unknown;
  cachedAt: number;
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

/** Reads one token key from a store. Sealed (`v1:`) values are unsealed; legacy
 *  raw values pass through so pre-upgrade installs keep their session. A sealed
 *  value that cannot be unsealed (seal gone / tampered) reads as null — fail
 *  closed, the caller treats it as "no session". */
function readTokenFrom(storage: Storage, key: string): string | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  if (!isSealedValue(raw)) return raw;
  return unsealForLocalPersistence(raw);
}

/** Writes one token key to a store, sealed via the native seal when available.
 *  A failed seal falls back to the raw value (the pre-D-JS-AUTH behavior) —
 *  sealing is best-effort and must never block a login. */
function writeTokenTo(storage: Storage, key: string, token: string): void {
  storage.setItem(key, sealForLocalPersistence(token) ?? token);
}

/** Read the active session. sessionStorage wins when both exist (the active
 *  tab's copy is always the freshest — it is where a non-persistent login
 *  lives and where rotations are mirrored for the current tab). */
export function readSession(): SessionTokens | null {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  try {
    accessToken = readTokenFrom(sessionStorage, ACCESS_TOKEN_KEY) ?? readTokenFrom(localStorage, ACCESS_TOKEN_KEY);
    refreshToken = readTokenFrom(sessionStorage, REFRESH_TOKEN_KEY) ?? readTokenFrom(localStorage, REFRESH_TOKEN_KEY);
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
      // D-JS-AUTH: the durable copies are sealed; the tab-scoped mirror stays
      // raw (fastest path, dies with the tab).
      writeTokenTo(localStorage, ACCESS_TOKEN_KEY, tokens.accessToken);
      writeTokenTo(localStorage, REFRESH_TOKEN_KEY, tokens.refreshToken);
      // Also mirror into sessionStorage: the active tab keeps a fast copy and
      // a mid-session flag flip can never strand the running tab.
      sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    } else {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      // A login WITHOUT «تذكّرني» must not resurrect an older remembered copy
      // after this tab closes — drop any stale persistent tokens AND profile
      // cache now (privacy: nothing durable may outlive the tab-scoped login).
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(REMEMBERED_USER_KEY);
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
      // D-JS-AUTH: rotations re-seal the durable copies too.
      writeTokenTo(localStorage, ACCESS_TOKEN_KEY, tokens.accessToken);
      writeTokenTo(localStorage, REFRESH_TOKEN_KEY, tokens.refreshToken);
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
    localStorage.removeItem(REMEMBERED_USER_KEY);
  } catch {
    /* best-effort */
  }
  // Phase P (containment) wipe hook — logout AND the 401 verdict both end up
  // here, so this is the single place the native offline stores learn the web
  // session died (question packages + bridge runtime state; media cache when
  // no native session survives). Best-effort, fires exactly ONCE per
  // clearSession call, and NEVER throws: older shells without the method are
  // an honest no-op (version-skew gap), and a plain browser has no bridge at
  // all. No data crosses web→native — the only direction is native data
  // destruction. Static import: native-bridge is a leaf util (imports nothing
  // from services), so there is no import cycle.
  notifyNativeSideOfSessionEnd();
}

/** Phase P: the wrapped, once-per-clearSession native wipe notification. */
function notifyNativeSideOfSessionEnd(): void {
  try {
    nativeNotifyWebSessionEnded();
  } catch {
    /* never let the wipe hook break logout */
  }
}

// ---------------------------------------------------------------------------
// Wave A (remember-me hardening) — durable /me profile cache.
//
// Reopen previously blocked on a single /me call before anything rendered: on
// a slow/cold API the student waited, then the catch-all wiped the session
// and the login form appeared even though the refresh token was valid. The
// cache below lets AuthProvider paint the authenticated shell immediately and
// reconcile with /me in the background. Only tokens and the public profile
// object are stored — never a password.
// ---------------------------------------------------------------------------

/** Cache the last known /me profile for remembered sessions. No-op when the
 *  student did not opt in (the strict tab-scoped session stays minimal). */
export function writeRememberedUser(user: unknown): void {
  if (!isRememberMeEnabled()) return;
  try {
    const payload: RememberedUser = { user, cachedAt: Date.now() };
    localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(payload));
  } catch {
    /* best-effort */
  }
}

/** Read the cached profile of a remembered session, or null. A stored copy
 *  older than [maxAgeMs] is treated as absent (the background /me will
 *  replace it) so a fossilized profile can never masquerade as a login. */
export function readRememberedUser(maxAgeMs = REMEMBERED_USER_MAX_AGE_MS): unknown | null {
  try {
    if (!isRememberMeEnabled()) return null;
    const raw = localStorage.getItem(REMEMBERED_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedUser;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.cachedAt !== 'number') return null;
    if (Date.now() - parsed.cachedAt > maxAgeMs) return null;
    return parsed.user ?? null;
  } catch {
    return null;
  }
}

/** Freshness window for the cached profile — one refresh lifetime (7 days,
 *  see SessionService.RotateAsync). Within it the cached profile is rendered
 *  immediately; beyond it only the live /me verdict counts. */
export const REMEMBERED_USER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
