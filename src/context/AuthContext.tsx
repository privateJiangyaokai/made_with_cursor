import React, { createContext, useContext, useState, useCallback } from 'react';

interface AuthState {
  token: string | null;
  accountId: string | null;
  username: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, accountId: string, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: localStorage.getItem('token'),
    accountId: localStorage.getItem('accountId'),
    username: localStorage.getItem('username'),
  }));

  const login = useCallback((token: string, accountId: string, username: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('accountId', accountId);
    localStorage.setItem('username', username);
    setAuth({ token, accountId, username });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('accountId');
    localStorage.removeItem('username');
    setAuth({ token: null, accountId: null, username: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
