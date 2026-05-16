// BiblioVault axios instance with JWT interceptor.
// baseURL: '/api' (proxied by Vite to backend at localhost:8000).
// On 401 from non-auth/non-recovery endpoints, clears auth and redirects to /login.

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// ── Request interceptor: attach Bearer token ─────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: handle 401 ─────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || '';
      // Skip auth and recovery endpoints — they handle their own auth errors
      if (!url.startsWith('/auth/') && !url.startsWith('/recovery/')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Only redirect if not already on /login
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
