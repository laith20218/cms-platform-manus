import { useContext } from 'react';
import { PermissionContext } from './permission-context';

export function usePermission() {
  const context = useContext(PermissionContext);
  if (!context) throw new Error('usePermission must be used within PermissionProvider');
  return context;
}

export function useCan(resource: string, action: string): boolean {
  const { hasPermission } = usePermission();
  return hasPermission(resource, action);
}

export function useCanView(resource: string): boolean {
  return useCan(resource, 'view');
}

export function useCanCreate(resource: string): boolean {
  return useCan(resource, 'create');
}

export function useCanEdit(resource: string): boolean {
  return useCan(resource, 'edit');
}

export function useCanDelete(resource: string): boolean {
  return useCan(resource, 'delete');
}
