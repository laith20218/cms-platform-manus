import { useEffect, useState, type ReactNode } from 'react';
import { authApi } from '@/features/auth/services/auth-api';
import { clearEntitlementToken } from '@/features/entitlements/services/entitlement-api';
import { notifySessionExpired } from '@/services/session-expiry';
import { readSession, writeSession, writeRotatedTokens, clearSession } from '@/services/session-store';
import { AuthContext, type User } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Task 2 (Night) — «تذكّرني»: the restore path now reads the active store
    // (sessionStorage first, then a remembered localStorage copy), so an
    // opted-in student stays signed in across browser/app restarts while the
    // default stays the strict tab-scoped session.
    const tokens = readSession();
    if (tokens) {
      authApi.me()
        .then(setUser)
        .catch(() => {
          clearSession();
          clearEntitlementToken();
          // Wave 12.5.A (Group 3) — any /me failure (server error, network blip,
          // expired session) previously logged the student out with NO signal.
          notifySessionExpired();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const completeAuthentication = (response: { accessToken: string; refreshToken: string; user: User }, options?: { remember?: boolean }) => {
    writeSession(
      { accessToken: response.accessToken, refreshToken: response.refreshToken },
      // Default OFF (privacy-safe): only an explicit «تذكّرني» opt-in persists.
      options?.remember === true,
    );
    setUser(response.user);
  };

  const login = async (phone: string, password: string, options?: { remember?: boolean }) => {
    completeAuthentication(await authApi.login(phone, password), options);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Local fail-closed cleanup is still required when the network is unavailable.
    } finally {
      clearSession();
      clearEntitlementToken();
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
    } catch {
      // Wave 12.5.A (Group 3) — same single-toast contract as the api-client path.
      notifySessionExpired();
      await logout();
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
