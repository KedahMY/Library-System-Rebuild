// BiblioVault AuthContext — full authentication provider.
// Stores user and token in localStorage for persistence across refreshes.
// Exports: AuthProvider, useAuth, RecoveryContext, useRecovery

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../utils/api.js';

const AuthContext = createContext(null);
const RecoveryContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore auth state from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (e) {
        // Corrupted user data — clear and start fresh
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { token: newToken, user: userData } = res.data;

    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));

    setToken(newToken);
    setUser(userData);

    return userData;
  }, []);

  const register = useCallback(async (formData) => {
    const res = await api.post('/auth/register', formData);

    // NOTE: The current backend returns token+user on register.
    // We do NOT auto-login on register — we show success and redirect to /login.
    return res.data;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export function useRecovery() {
  const ctx = useContext(RecoveryContext);
  return ctx || { recoveryState: null, clearRecoveryState: () => {} };
}

export { RecoveryContext };
export default AuthContext;
