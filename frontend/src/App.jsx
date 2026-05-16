import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  RECORD_KEY, REFRESH_FLAG, SHOULD_CLEAR_KEY,
  CRASH_TEST_CLOSE_KEY, CRASH_NO_RECOVERY_KEY
} from './components/CrashRecovery';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentPortal from './pages/StudentPortal';
import AuthorPortal from './pages/AuthorPortal';
import LibrarianPortal from './pages/LibrarianPortal';

// =========================================================================
// RecoveryContext — exposes recoveryState, clearRecoveryState, toast, dismissToast
// =========================================================================
export const RecoveryContext = createContext(null);

export function useRecovery() {
  const ctx = useContext(RecoveryContext);
  if (!ctx) {
    throw new Error('useRecovery must be used within RecoveryContext.Provider');
  }
  return ctx;
}

// =========================================================================
// ProtectedRoute — redirects to login if not authenticated,
// redirects to appropriate portal if role doesn't match
// =========================================================================
function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex-center" style={{ height: '100vh', background: 'var(--color-navy)', color: 'var(--color-text-muted)', fontSize: '1.1rem' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const roleMap = {
      student: '/student',
      staff: '/student',
      author: '/author',
      librarian: '/librarian'
    };
    return <Navigate to={roleMap[user.role] || '/login'} replace />;
  }
  return children;
}

// =========================================================================
// PortalRedirect — sends user to their role's portal
// =========================================================================
function PortalRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex-center" style={{ height: '100vh', background: 'var(--color-navy)', color: 'var(--color-text-muted)' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  const roleMap = {
    student: '/student',
    staff: '/student',
    author: '/author',
    librarian: '/librarian'
  };
  return <Navigate to={roleMap[user.role] || '/login'} replace />;
}

// =========================================================================
// CrashRecoveryWrapper — reads flags on mount, decides restoration action
//
// Scenarios:
//   A — Refresh (bv_is_refresh exists): auto-restore state silently
//   B — Normal close (bv_should_clear exists): clear crash record, no toast
//   C — Crash test (CRASH_TEST_CLOSE_KEY set, no REFRESH_FLAG): restore, toast
//   D — Unrecoverable (CRASH_NO_RECOVERY_KEY set): clear all keys, error toast
//   E — No record: normal startup
// =========================================================================
function CrashRecoveryWrapper({ children }) {
  const { user, loading } = useAuth();
  const [recoveryState, setRecoveryState] = useState(null);
  const [toast, setToast] = useState(null);
  const prevUserRef = useRef(null);

  // Read refresh flag synchronously at component creation (before any effect)
  const isRefreshRef = useRef(
    sessionStorage.getItem(REFRESH_FLAG) === 'true'
  );

  useEffect(() => {
    if (loading) return;

    // ---------- Logout transition (user → null) ----------
    if (prevUserRef.current && !user) {
      const prevId = prevUserRef.current.id;
      localStorage.removeItem(RECORD_KEY(prevId));
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      sessionStorage.removeItem(REFRESH_FLAG);
      setRecoveryState(null);
      setToast(null);
      prevUserRef.current = user;
      return;
    }

    // ---------- Only process when user is available ----------
    if (!user) {
      prevUserRef.current = user;
      return;
    }

    const recordKey = RECORD_KEY(user.id);
    const rawRecord = localStorage.getItem(recordKey);
    const isRefresh = isRefreshRef.current;
    const crashTestKey = localStorage.getItem(CRASH_TEST_CLOSE_KEY);
    const noRecoveryKey = localStorage.getItem(CRASH_NO_RECOVERY_KEY);

    // Helper: parse record if valid for this user
    const parseRecord = () => {
      if (!rawRecord) return null;
      try {
        const record = JSON.parse(rawRecord);
        if (String(record.userId) === String(user.id)) {
          return record;
        }
      } catch { /* corrupt record */ }
      return null;
    };

    // Scenario D — Unrecoverable
    if (noRecoveryKey) {
      localStorage.removeItem(CRASH_NO_RECOVERY_KEY);
      localStorage.removeItem(recordKey);
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      sessionStorage.removeItem(REFRESH_FLAG);
      setRecoveryState(null);
      setToast({ type: 'error', message: 'Session not recovered. Starting fresh.' });
    }

    // Scenario A — Refresh (same tab, silent restore)
    else if (isRefresh) {
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      const record = parseRecord();
      if (record) {
        setRecoveryState(record);
      }
      sessionStorage.removeItem(REFRESH_FLAG);
    }

    // Scenario C — Crash test (bv_crash_test set, no refresh flag)
    else if (crashTestKey) {
      localStorage.removeItem(CRASH_TEST_CLOSE_KEY);
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      const record = parseRecord();
      if (record) {
        setRecoveryState(record);
        setToast({ type: 'success', message: 'Session recovered after crash test' });
      }
    }

    // Scenario B — Normal close (bv_should_clear set with no other flags)
    else if (localStorage.getItem(SHOULD_CLEAR_KEY)) {
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      localStorage.removeItem(recordKey);
      sessionStorage.removeItem(REFRESH_FLAG);
      setRecoveryState(null);
    }

    // Scenario E — Record exists but none of the flags above → real crash
    else if (rawRecord) {
      const record = parseRecord();
      if (record) {
        setRecoveryState(record);
        setToast({ type: 'error', message: 'Session recovered after unexpected crash' });
      }
    }

    prevUserRef.current = user;
  }, [user, loading]);

  const clearRecoveryState = useCallback(() => {
    setRecoveryState(null);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <RecoveryContext.Provider value={{ recoveryState, clearRecoveryState, toast, dismissToast }}>
      {toast && (
        <div
          onClick={dismissToast}
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            zIndex: 9999,
            padding: '1rem 1.5rem',
            borderRadius: '4px',
            backgroundColor: toast.type === 'error' ? '#d32f2f' : '#388e3c',
            color: '#fff',
            fontFamily: 'sans-serif',
            fontSize: '0.95rem',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}
        >
          {toast.message}
        </div>
      )}
      {children}
    </RecoveryContext.Provider>
  );
}

// =========================================================================
// App — root component
// Layout: AuthProvider → BrowserRouter → CrashRecoveryWrapper → Routes
// =========================================================================
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CrashRecoveryWrapper>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/portal" element={<PortalRedirect />} />
            <Route
              path="/student"
              element={
                <ProtectedRoute roles={['student', 'staff']}>
                  <StudentPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/author"
              element={
                <ProtectedRoute roles={['author']}>
                  <AuthorPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/librarian"
              element={
                <ProtectedRoute roles={['librarian']}>
                  <LibrarianPortal />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </CrashRecoveryWrapper>
      </BrowserRouter>
    </AuthProvider>
  );
}
