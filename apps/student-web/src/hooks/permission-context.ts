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
  /** Wave 12.5.A (Group 4) — true when the LAST fetch failed (permissions may be
   *  silently incomplete; consumers can surface a banner). */
  isError: boolean;
  refresh: () => Promise<void>;
}

export const PermissionContext = createContext<PermissionContextValue | undefined>(undefined);
