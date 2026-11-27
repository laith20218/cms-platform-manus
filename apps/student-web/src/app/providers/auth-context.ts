import { createContext } from 'react';

export interface User {
  id: string;
  phone: string;
  fullName: string;
  role: 'student' | 'admin' | 'super_admin';
  avatarUrl?: string | null;
  university?: { id: string; nameAr: string };
  college?: { id: string; nameAr: string };
  /** PR-6 — the login/profile payloads now carry the flag the backend sets
   *  after an administrator password reset. Additive: absent on older API
   *  builds (undefined = no forced change). */
  mustChangePassword?: boolean;
}

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, password: string, options?: { remember?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  completeAuthentication: (response: { accessToken: string; refreshToken: string; user: User }, options?: { remember?: boolean }) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
