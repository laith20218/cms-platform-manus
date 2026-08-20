import { createContext } from 'react';

export interface User {
  id: string;
  phone: string;
  fullName: string;
  role: 'student' | 'admin' | 'super_admin';
  avatarUrl?: string | null;
  university?: { id: string; nameAr: string };
  college?: { id: string; nameAr: string };
}

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  completeAuthentication: (response: { accessToken: string; refreshToken: string; user: User }) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
