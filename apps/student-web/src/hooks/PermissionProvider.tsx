import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { PermissionContext, type Permission } from './permission-context';

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Wave 12.5.A (Group 4) — a failed permissions fetch used to set [] silently,
  // which hid gated features with no explanation. The failure is now a flag in
  // context AND a dismissible top banner with a retry.
  const [isError, setIsError] = useState(false);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await apiClient.get<Permission[]>('/auth/admin/me/permissions');
      setPermissions(res.data);
      setIsError(false);
    } catch {
      setPermissions([]);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('cms-access-token');
    if (token) void fetchPermissions();
    else setIsLoading(false);
  }, [fetchPermissions]);

  const hasPermission = useCallback((resource: string, action: string): boolean => {
    const permission = permissions.find((item) => item.resource === resource);
    return permission?.actions.includes(action) ?? false;
  }, [permissions]);

  const hasAnyPermission = useCallback((resource: string): boolean => {
    const permission = permissions.find((item) => item.resource === resource);
    return (permission?.actions.length ?? 0) > 0;
  }, [permissions]);

  const value = useMemo(() => ({
    permissions,
    hasPermission,
    hasAnyPermission,
    isLoading,
    isError,
    refresh: fetchPermissions,
  }), [permissions, hasPermission, hasAnyPermission, isLoading, isError, fetchPermissions]);

  return (
    <PermissionContext.Provider value={value}>
      {isError && (
        <div
          role="alert"
          data-testid="permissions-error-banner"
          className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-[var(--c-border-strong)] bg-[var(--c-warning-50)] px-4 py-2 text-sm"
        >
          <span className="font-semibold text-[var(--c-text)]">تعذر تحميل الصلاحيات — قد تظهر بعض العناصر مخفية.</span>
          <button
            type="button"
            onClick={() => void fetchPermissions()}
            className="press inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--c-border-strong)] bg-[var(--c-surface)] px-3 py-1 text-xs font-bold text-[var(--c-text)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> إعادة المحاولة
          </button>
        </div>
      )}
      {children}
    </PermissionContext.Provider>
  );
}
