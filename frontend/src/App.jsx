// BiblioVault App — routing shell with crash-recovery wrapper.
// Defines routes, ProtectedRoute, PortalRedirect, and CrashRecoveryWrapper.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  RECORD_KEY,
  REFRESH_FLAG,
  SHOULD_CLEAR_KEY,
  CRASH_TEST_CLOSE_KEY,
  CRASH_NO_RECOVERY_KEY
} from './components/CrashRecovery.jsx';
import { AuthProvider, RecoveryContext, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import StudentPortal from './pages/StudentPortal.jsx';
import AuthorPortal from './pages/AuthorPortal.jsx';
import LibrarianPortal from './pages/LibrarianPortal.jsx';

// ── ProtectedRoute ───────────────────────────────────────────────────────────
// Shows a loading spinner while auth is initializing.
// Redirects to /login if not authenticated.
// If authenticated but role doesn't match, redirects to /portal.
function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#1a1a2e',
        color: '#c9a84c', fontFamily: 'DM Sans, sans-serif', fontSize: '1rem',
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/portal" replace />;
  }

  return children;
}

// ── PortalRedirect ───────────────────────────────────────────────────────────
// Redirects to the correct portal based on user role.
function PortalRedirect() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const roleMap = {
    student: '/student',
    staff: '/student',
    author: '/author',
    librarian: '/librarian'
  };

  const target = roleMap[user.role] || '/login';
  return <Navigate to={target} replace />;
}

// ── CrashRecoveryWrapper ──────────────────────────────────────────────────────
// Implements the crash-recovery decision matrix:
//   A (refresh)      — REFRESH_FLAG set → restore silently
//   B (normal close) — SHOULD_CLEAR_KEY set → clear record, no toast
//   C (crash test)   — CRASH_TEST_CLOSE_KEY set → restore with toast
//   D (no recovery)  — CRASH_NO_RECOVERY_KEY set → clear all, fresh start
//   E (fresh)        — no keys → normal startup
//
// Wraps children in RecoveryContext.Provider.
function CrashRecoveryWrapper({ children }) {
  const { user } = useAuth();
  const [recoveryState, setRecoveryState] = useState(null);
  const [toast, setToast] = useState(null);
  const initialCheckDone = useRef(false);
  const prevUserIdRef = useRef(null);

  // The decision matrix runs once on mount (before auth resolves) and again
  // when the user becomes available (login detected via prevUserIdRef).
  useEffect(() => {
    // Read keys synchronously
    const refreshFlag = sessionStorage.getItem(REFRESH_FLAG);
    const crashTestFlag = localStorage.getItem(CRASH_TEST_CLOSE_KEY);
    const shouldClear = localStorage.getItem(SHOULD_CLEAR_KEY);
    const noRecovery = localStorage.getItem(CRASH_NO_RECOVERY_KEY);

    // Only run the decision if we have a user AND haven't processed for this user yet
    if (!user) {
      // On logout (user transition from something → null), clear user-specific keys
      if (prevUserIdRef.current) {
        localStorage.removeItem(RECORD_KEY(prevUserIdRef.current));
        localStorage.removeItem(SHOULD_CLEAR_KEY);
        prevUserIdRef.current = null;
        setRecoveryState(null);
      }
      return;
    }

    // User is logged in
    prevUserIdRef.current = user.id;

    // Scenario D: No recovery
    if (noRecovery) {
      localStorage.removeItem(CRASH_NO_RECOVERY_KEY);
      localStorage.removeItem(RECORD_KEY(user.id));
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      return;
    }

    // Scenario B: Normal close
    if (shouldClear && !crashTestFlag && !refreshFlag) {
      localStorage.removeItem(RECORD_KEY(user.id));
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      return;
    }

    // Scenario A: Refresh — clean should_clear, restore silently
    if (refreshFlag) {
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      try {
        sessionStorage.removeItem(REFRESH_FLAG);
      } catch (e) { /* ignore */ }
      const recordStr = localStorage.getItem(RECORD_KEY(user.id));
      if (recordStr) {
        try {
          const record = JSON.parse(recordStr);
          if (String(record.userId) === String(user.id)) {
            setRecoveryState({ portal: record.portal, activeTab: record.activeTab, stateSnapshot: record.stateSnapshot });
            // Silent restore — no toast
          }
        } catch (e) { /* ignore parse error */ }
      }
      return;
    }

    // Scenario C: Crash test
    if (crashTestFlag) {
      localStorage.removeItem(CRASH_TEST_CLOSE_KEY);
      localStorage.removeItem(SHOULD_CLEAR_KEY);
      const recordStr = localStorage.getItem(RECORD_KEY(user.id));
      if (recordStr) {
        try {
          const record = JSON.parse(recordStr);
          if (String(record.userId) === String(user.id)) {
            setRecoveryState({ portal: record.portal, activeTab: record.activeTab, stateSnapshot: record.stateSnapshot });
            setToast('Session recovered after crash test');
          }
        } catch (e) { /* ignore parse error */ }
      }
      return;
    }

    // Scenario E: Fresh — check if there's a stale record (real crash scenario)
    const recordStr = localStorage.getItem(RECORD_KEY(user.id));
    if (recordStr) {
      try {
        const record = JSON.parse(recordStr);
        if (String(record.userId) === String(user.id)) {
          setRecoveryState({ portal: record.portal, activeTab: record.activeTab, stateSnapshot: record.stateSnapshot });
          // Real crash — error-styled toast (optional)
        }
      } catch (e) { /* ignore */ }
    }
  }, [user]);

  const clearRecoveryState = useCallback(() => {
    setRecoveryState(null);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <RecoveryContext.Provider value={{ recoveryState, clearRecoveryState }}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            background: toast.includes('crash test') ? '#c9a84c' : '#8b0000',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '6px',
            zIndex: 9999,
            fontFamily: 'DM Sans, sans-serif',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            cursor: 'pointer'
          }}
          onClick={dismissToast}
        >
          {toast}
        </div>
      )}
      {children}
    </RecoveryContext.Provider>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
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
            <Route path="/" element={<Navigate to="/portal" replace />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Routes>
        </CrashRecoveryWrapper>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
