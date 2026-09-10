import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAuthToken } from '../lib/api';

export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  badgeNumber?: string;
  governmentId?: string;
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
  requestOtp: (identifier: string) => Promise<{ success: boolean; error?: string; devOtpPreview?: string; message?: string; emailMasked?: string }>;
  verifyOtp: (identifier: string, otp: string) => Promise<{ success: boolean; error?: string }>;
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
        setAuthToken(null);
      }
    } catch {
      setUser(null);
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const requestOtp = async (identifier: string) => {
    try {
      const res = await api.post<{
        success: boolean;
        message?: string;
        emailMasked?: string;
        devOtpPreview?: string;
      }>('/auth/request-otp', { identifier });
      return { success: true, ...res };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to dispatch verification OTP' };
    }
  };

  const verifyOtp = async (identifier: string, otp: string) => {
    try {
      const res = await api.post<{ success: boolean; user: UserProfile; token?: string }>('/auth/verify-otp', { identifier, otp });
      if (res.success && res.user) {
        if (res.token) setAuthToken(res.token);
        setUser(res.user);
        return { success: true };
      }
      return { success: false, error: 'OTP Verification Failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Verification failed. Please check the code.' };
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const res = await api.post<{ success: boolean; user: UserProfile; token?: string }>('/auth/login', { username, password });
      if (res.success && res.user) {
        if (res.token) setAuthToken(res.token);
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
    setAuthToken(null);
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
    <AuthContext.Provider value={{ user, loading, login, requestOtp, verifyOtp, logout, hasPermission, isInAgency, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
