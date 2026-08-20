import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/useAuth';
import { usePermission } from '@/hooks/usePermission';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

interface PermissionRouteProps {
  children: ReactNode;
  resource: string;
  action?: string;
}

/**
 * Route guard that checks if the user has a specific permission.
 * Usage: <PermissionRoute resource="questions" action="create"><CreateQuestionPage /></PermissionRoute>
 */
export function PermissionRoute({ children, resource, action = 'view' }: PermissionRouteProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { hasPermission, isLoading: permLoading } = usePermission();

  if (authLoading || permLoading) return <LoadingScreen />;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!hasPermission(resource, action)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(255,82,82,0.10)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--c-danger-500)" strokeWidth="2" className="w-8 h-8">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[var(--c-text)] mb-2">ليس لديك صلاحية</h2>
        <p className="text-sm text-[var(--c-text-muted)]">
          لا تملك صلاحية الوصول لهذه الصفحة. تواصل مع المدير إذا كنت تعتقد أن هذا خطأ.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Route guard for admin-only pages.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
