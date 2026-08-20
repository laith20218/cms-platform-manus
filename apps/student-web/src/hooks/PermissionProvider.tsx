import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient } from '@/services/api-client';
import { PermissionContext, type Permission } from './permission-context';

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await apiClient.get<Permission[]>('/auth/admin/me/permissions');
      setPermissions(res.data);
    } catch {
      setPermissions([]);
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
    refresh: fetchPermissions,
  }), [permissions, hasPermission, hasAnyPermission, isLoading, fetchPermissions]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}
