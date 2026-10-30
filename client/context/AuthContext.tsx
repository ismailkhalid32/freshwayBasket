import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { api, getStoredToken } from '../api/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  isDisconnected: boolean;
  connectionError: string | null;
  isTestMode: boolean;
  toggleTestMode: () => void;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  setupAdmin: (data: any) => Promise<boolean>;
  checkAuthStatus: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isCashier: boolean;
  canCancelInvoice: boolean;
  canVoidPayment: boolean;
  canManageUsers: boolean;
  canViewReports: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'freshway_auth_session_user';
const TEST_MODE_STORAGE_KEY = 'freshway_test_mode_active';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isTestMode, setIsTestMode] = useState<boolean>(() => {
    return localStorage.getItem(TEST_MODE_STORAGE_KEY) === 'true';
  });

  const toggleTestMode = () => {
    const next = !isTestMode;
    setIsTestMode(next);
    localStorage.setItem(TEST_MODE_STORAGE_KEY, String(next));
  };

  const logout = () => {
    api.logout();
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      setIsDisconnected(false);
      setConnectionError(null);

      const status = await api.getAuthStatus();
      setNeedsSetup(status.needsSetup);

      if (!status.needsSetup) {
        const token = getStoredToken();
        if (token) {
          try {
            // Cryptographically verify bearer token with backend
            const verified = await api.getCurrentUser();
            if (verified.authenticated && verified.user) {
              setUser(verified.user);
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(verified.user));
            } else {
              logout();
            }
          } catch {
            // Token expired or invalid -> force clean login
            logout();
          }
        } else {
          // No cryptographic token present -> clear stale session and require login
          logout();
        }
      } else {
        logout();
      }
    } catch (err: any) {
      console.error('Database connection failed:', err);
      setIsDisconnected(true);
      setConnectionError(
        'Database connection offline or unreachable. Please verify server status. No fake data will be loaded.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();

    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('freshway:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('freshway:unauthorized', handleUnauthorized);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    const res = await api.login(username, password);
    if (res.success && res.user) {
      setUser(res.user);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.user));
      return true;
    }
    return false;
  };

  const setupAdmin = async (data: any): Promise<boolean> => {
    const res = await api.setupAdmin(data);
    if (res.success && res.user) {
      setNeedsSetup(false);
      setUser(res.user);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.user));
      return true;
    }
    return false;
  };

  const role = user?.role || 'cashier';
  const isAdmin = role === 'admin';
  const isManager = role === 'manager' || isAdmin;
  const isCashier = role === 'cashier';

  const canCancelInvoice = isAdmin || isManager;
  const canVoidPayment = isAdmin;
  const canManageUsers = isAdmin;
  const canViewReports = isAdmin || isManager;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        needsSetup,
        isDisconnected,
        connectionError,
        isTestMode,
        toggleTestMode,
        login,
        logout,
        setupAdmin,
        checkAuthStatus,
        isAdmin,
        isManager,
        isCashier,
        canCancelInvoice,
        canVoidPayment,
        canManageUsers,
        canViewReports,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
