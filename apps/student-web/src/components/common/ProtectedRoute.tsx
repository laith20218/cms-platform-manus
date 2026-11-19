import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/useAuth';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) {
    // D-17 (Wave 18.2): park the intended destination (path + query) in ?next=
    // so LoginPage can resume it after a successful login — deep links into
    // protected surfaces no longer bounce to /dashboard.
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}
