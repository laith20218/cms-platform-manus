import { createContext } from 'react';

export interface Permission {
  resource: string;
  actions: string[];
  scope: string;
}

export interface PermissionContextValue {
  permissions: Permission[];
  hasPermission: (resource: string, action: string) => boolean;
  hasAnyPermission: (resource: string) => boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const PermissionContext = createContext<PermissionContextValue | undefined>(undefined);
