import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  badgeNumber?: string;
  phoneNumber?: string;
  designation?: string;
  departmentWing?: string;
  clearanceLevel?: string;
  isLayerAdmin?: boolean;
  roleId: string;
  roleName: string;
  agencyBranch: 'POLICE' | 'FORENSICS' | 'JUDICIARY' | 'MASTER';
  bodyId?: string;
  organizationId: string;
  organizationName: string;
  organizationCode: string;
  organizationPath: string;
  permissions: string[];
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  isInAgency: (branch: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const res = await api.get<{ authenticated: boolean; user: UserProfile }>('/auth/me');
      if (res.authenticated && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const res = await api.post<{ success: boolean; user: UserProfile }>('/auth/login', { username, password });
      if (res.success && res.user) {
        setUser(res.user);
        return { success: true };
      }
      return { success: false, error: 'Login failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Authentication failed' };
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    setUser(null);
  };

  const hasPermission = (permission: string) => {
    if (!user) return false;
    if (user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN') return true;
    return user.permissions.includes(permission);
  };

  const isInAgency = (branch: string) => {
    if (!user) return false;
    if (user.agencyBranch === 'MASTER') return true;
    return user.agencyBranch === branch;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, isInAgency, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
