import { useEffect, useState, type ReactNode } from 'react';
import { authApi } from '@/features/auth/services/auth-api';
import { clearEntitlementToken } from '@/features/entitlements/services/entitlement-api';
import { notifySessionExpired } from '@/services/session-expiry';
import {
  readSession,
  writeSession,
  writeRotatedTokens,
  clearSession,
  writeRememberedUser,
  readRememberedUser,
} from '@/services/session-store';
import { isSessionEndingFailure } from '@/utils/api-error';
// Owner decision (offline-experience implementation, 2026-11-28): explicit
// logout warns about unsynchronized offline answers BEFORE the Phase P wipe;
// deletion happens only after the student confirms. Also clears the
// auto-package markers so a fresh login re-attempts first-visit downloads.
import { countPendingOfflineAnswers } from '@/features/offline/offlineLogoutGuard';
import { clearAutoPackageMarkers } from '@/features/offline/useAutoSubjectPackage';
import { AuthContext, type User } from './auth-context';

/** Wave A (remember-me hardening): max attempts for the background /me verify
 *  on app start. Each attempt runs against the live API; when all fail with a
 *  transport fault (offline / Render cold start), the shell keeps showing the
 *  cached session UI instead of a login form. */
const RESTORE_VERIFY_MAX_ATTEMPTS = 3;
/** Delay between background verify attempts (first retry after ~2 s). */
const RETRY_BASE_DELAY_MS = 2000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Task 2 (Night) + Wave A hardening — «تذكّرني» restore:
    //
    // 1. A remembered session hydrates the shell INSTANTLY from the cached
    //    profile (see session-store readRememberedUser), so a valid reopen
    //    never flashes the login form while /me is in flight.
    // 2. The session is wiped ONLY on a definitive server verdict (401/403
    //    via isSessionEndingFailure). The API hosts on Render; a cold-start
    //    timeout on /me used to clearSession() + toast "session expired" —
    //    logging the student out of a perfectly valid remembered session.
    //    Transport faults now keep the session and retry (bounded), because
    //    the server never ruled it dead.
    // 3. Explicit logout / refresh rejection still requires login — the
    //    verdict paths and logout() are unchanged.
    const tokens = readSession();

    if (!tokens) {
      setIsLoading(false);
      return;
    }

    // Instant hydration for remembered sessions (fresh cache only).
    const cachedUser = readRememberedUser() as User | null;
    if (cachedUser) {
      setUser(cachedUser);
      setIsLoading(false);
    }

    let cancelled = false;

    const verify = (attempt: number): void => {
      authApi.me()
        .then((freshUser) => {
          if (cancelled) return;
          setUser(freshUser);
          setIsLoading(false);
          writeRememberedUser(freshUser);
        })
        .catch((error: unknown) => {
          if (cancelled) return;

          // Only the server may end a remembered session: a 401/403 verdict
          // from /me (access token dead AND refresh rejected). Offline,
          // timeouts, 429, and 5xx keep the session — retry instead.
          if (isSessionEndingFailure(error)) {
            clearSession();
            clearEntitlementToken();
            setUser(null);
            setIsLoading(false);
            // Wave 12.5.A (Group 3) — the fail-closed logout keeps its single
            // honest toast: this really is "session ended, log in again".
            notifySessionExpired();
            return;
          }

          // Transport/server fault: keep the (possibly cached) session UI.
          if (attempt < RESTORE_VERIFY_MAX_ATTEMPTS - 1) {
            setTimeout(() => { if (!cancelled) verify(attempt + 1); }, RETRY_BASE_DELAY_MS * (attempt + 1));
            return;
          }

          // Exhausted retries while offline: leave the cached session in
          // place. The next authenticated API call walks the normal
          // 401 → refresh → retry path and resolves the question honestly.
          setIsLoading(false);
        });
    };

    verify(0);

    return () => { cancelled = true; };
  }, []);

  const completeAuthentication = (response: { accessToken: string; refreshToken: string; user: User }, options?: { remember?: boolean }) => {
    writeSession(
      { accessToken: response.accessToken, refreshToken: response.refreshToken },
      // Default OFF (privacy-safe): only an explicit «تذكّرني» opt-in persists.
      options?.remember === true,
    );
    // Wave A — refresh the profile cache on every successful auth so the
    // next reopen hydrates from current data (remembered sessions only).
    writeRememberedUser(response.user);
    setUser(response.user);
  };

  const login = async (phone: string, password: string, options?: { remember?: boolean }) => {
    completeAuthentication(await authApi.login(phone, password), options);
  };

  const logout = async () => {
    // Owner decision (2026-11-28): EXPLICIT logout only. Warn when unsynchronized
    // offline answers exist; wipe them only after confirmation. (The 401 verdict
    // and network-loss paths never reach this prompt — offline content stays.)
    const pending = countPendingOfflineAnswers();
    if (pending > 0) {
      const confirmed = window.confirm(
        `لديك ${pending} إجابة محفوظة دون اتصال لم تُزامَن بعد. تسجيل الخروج سيحذفها نهائياً من هذا الجهاز. هل أنت متأكد أنك تريد المتابعة؟`,
      );
      if (!confirmed) return;
    }
    try {
      await authApi.logout();
    } catch {
      // Local fail-closed cleanup is still required when the network is unavailable.
    } finally {
      clearSession();
      clearEntitlementToken();
      clearAutoPackageMarkers();
      setUser(null);
      window.location.assign('/login');
    }
  };

  const refreshToken = async () => {
    const refresh = readSession()?.refreshToken;
    if (!refresh) return;

    try {
      const { accessToken, refreshToken: newRefresh } = await authApi.refresh(refresh);
      // Rotations write back to whichever store holds the session, preserving
      // the student's «تذكّرني» choice (the flag survives reloads).
      writeRotatedTokens({ accessToken, refreshToken: newRefresh });
    } catch (error: unknown) {
      // Wave A — a transport fault on the refresh call is NOT a session
      // verdict (Render cold start, offline reopen): the single-use refresh
      // token was never consumed, so keep the session and let the next
      // request retry. Only a 401/403 verdict ends the session.
      if (isSessionEndingFailure(error)) {
        notifySessionExpired();
        await logout();
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      refreshToken,
      completeAuthentication,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
