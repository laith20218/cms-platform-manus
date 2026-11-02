import { useEffect, useState, type ReactNode } from 'react';
import { authApi } from '@/features/auth/services/auth-api';
import { clearEntitlementToken } from '@/features/entitlements/services/entitlement-api';
import { notifySessionExpired } from '@/services/session-expiry';
import { AuthContext, type User } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('cms-access-token');
    if (token) {
      authApi.me()
        .then(setUser)
        .catch(() => {
          sessionStorage.removeItem('cms-access-token');
          sessionStorage.removeItem('cms-refresh-token');
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

  const completeAuthentication = (response: { accessToken: string; refreshToken: string; user: User }) => {
    sessionStorage.setItem('cms-access-token', response.accessToken);
    sessionStorage.setItem('cms-refresh-token', response.refreshToken);
    setUser(response.user);
  };

  const login = async (phone: string, password: string) => {
    completeAuthentication(await authApi.login(phone, password));
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Local fail-closed cleanup is still required when the network is unavailable.
    } finally {
      sessionStorage.removeItem('cms-access-token');
      sessionStorage.removeItem('cms-refresh-token');
      clearEntitlementToken();
      setUser(null);
      window.location.assign('/login');
    }
  };

  const refreshToken = async () => {
    const refresh = sessionStorage.getItem('cms-refresh-token');
    if (!refresh) return;

    try {
      const { accessToken, refreshToken: newRefresh } = await authApi.refresh(refresh);
      sessionStorage.setItem('cms-access-token', accessToken);
      sessionStorage.setItem('cms-refresh-token', newRefresh);
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
