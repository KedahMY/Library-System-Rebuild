// BiblioVault Crash Recovery — localStorage session persistence, crash-test buttons,
// and session-recording hook. DR-10 key strings are exact and must not be modified.
//
// Exports:
//   RECORD_KEY, REFRESH_FLAG, SHOULD_CLEAR_KEY, CRASH_TEST_CLOSE_KEY, CRASH_NO_RECOVERY_KEY,
//   SIMULATE_UNRECOVERABLE_CRASH,
//   useSessionRecorder, CrashTestButton, CrashUnrecoverableButton

import { useState, useEffect, useRef, useCallback } from 'react';

// ── DR-10: Crash-recovery localStorage keys (exact — do not change) ──────────
export const RECORD_KEY = (userId) => `bv_session_${userId}`;
export const REFRESH_FLAG = 'bv_is_refresh';          // sessionStorage
export const SHOULD_CLEAR_KEY = 'bv_should_clear';    // localStorage
export const CRASH_TEST_CLOSE_KEY = 'bv_crash_test';  // localStorage
export const CRASH_NO_RECOVERY_KEY = 'bv_crash_no_recovery'; // localStorage
export const SIMULATE_UNRECOVERABLE_CRASH = true;

// ── useSessionRecorder ────────────────────────────────────────────────────────
// Records the user's session state (portal, activeTab, stateSnapshot) to
// localStorage on every meaningful change, every 5 seconds via interval,
// and on window.beforeunload.
//
// Parameters:
//   portal         — string identifying the current portal ('student', 'author', 'librarian')
//   activeTab      — string id of the currently active tab
//   stateSnapshot  — object with portal-specific UI state (filters, selections, etc.)
//   userId         — the logged-in user's id
export function useSessionRecorder(portal, activeTab, stateSnapshot, userId) {
  const latestRef = useRef({ portal, activeTab, stateSnapshot, userId });
  // Keep a ref to the latest values so the interval reads fresh data
  latestRef.current = { portal, activeTab, stateSnapshot, userId };

  // Save function
  const save = useCallback(() => {
    const { portal: p, activeTab: t, stateSnapshot: s, userId: u } = latestRef.current;
    if (!u || !p) return;

    const record = {
      userId: u,
      portal: p,
      activeTab: t,
      stateSnapshot: s,
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(RECORD_KEY(u), JSON.stringify(record));
    } catch (e) {
      console.warn('Failed to save session record:', e.message);
    }
  }, []);

  // Save on every change (via useEffect when deps change)
  useEffect(() => {
    if (!userId) return;

    const record = {
      userId,
      portal,
      activeTab,
      stateSnapshot,
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(RECORD_KEY(userId), JSON.stringify(record));
    } catch (e) {
      console.warn('Failed to save session record:', e.message);
    }
  }, [portal, activeTab, stateSnapshot, userId]);

  // Periodic save every 5 seconds
  useEffect(() => {
    if (!userId) return;

    const intervalId = setInterval(save, 5000);
    return () => clearInterval(intervalId);
  }, [userId, save]);

  // beforeunload handler
  useEffect(() => {
    if (!userId) return;

    const handleBeforeUnload = () => {
      const { portal: p, activeTab: t, stateSnapshot: s, userId: u } = latestRef.current;

      // Check for "no recovery" flag
      if (localStorage.getItem(CRASH_NO_RECOVERY_KEY)) {
        localStorage.removeItem(RECORD_KEY(u));
        localStorage.removeItem(CRASH_NO_RECOVERY_KEY);
        return;
      }

      // Save current state
      const record = {
        userId: u,
        portal: p,
        activeTab: t,
        stateSnapshot: s,
        updatedAt: new Date().toISOString()
      };
      try {
        localStorage.setItem(RECORD_KEY(u), JSON.stringify(record));
      } catch (e) {
        console.warn('Failed to save session record on unload:', e.message);
      }

      // If CRASH_TEST_CLOSE_KEY is NOT present, set flags for normal close
      if (!localStorage.getItem(CRASH_TEST_CLOSE_KEY)) {
        localStorage.setItem(SHOULD_CLEAR_KEY, 'true');
        try {
          sessionStorage.setItem(REFRESH_FLAG, 'true');
        } catch (e) {
          // sessionStorage may not be available in some contexts
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [userId]);
}

// ── CrashTestButton ──────────────────────────────────────────────────────────
// Renders a "Crash Test" button. On click, shows confirmation dialog,
// then POSTs to /api/shutdown and calls window.close().
export function CrashTestButton() {
  const handleClick = () => {
    const confirmed = window.confirm('Crash Test: This will shut down the server. Continue?');
    if (!confirmed) return;

    fetch('http://localhost:8000/api/shutdown', { method: 'POST' })
      .then(() => {
        window.close();
      })
      .catch(() => {
        // If the server shuts down before responding, the fetch may error
        window.close();
      });
  };

  return (
    <button
      onClick={handleClick}
      style={{
        background: '#8b0000',
        color: '#fff',
        border: 'none',
        padding: '6px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        marginTop: '8px',
        width: '100%'
      }}
      title="Simulate a server crash (test recovery flow)"
    >
      Crash Test
    </button>
  );
}

// ── CrashUnrecoverableButton ──────────────────────────────────────────────────
// Renders "Crash (No Recovery)" button. Sets the no-recovery flag, wipes the
// session record, then POSTs to /api/shutdown.
export function CrashUnrecoverableButton() {
  const handleClick = () => {
    const confirmed = window.confirm('Crash (No Recovery): Session will NOT be restored. Continue?');
    if (!confirmed) return;

    // Set the no-recovery flag and wipe the record immediately
    localStorage.setItem(CRASH_NO_RECOVERY_KEY, 'true');

    // Remove session record for any user
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('bv_session_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    fetch('http://localhost:8000/api/shutdown', { method: 'POST' })
      .then(() => {
        window.close();
      })
      .catch(() => {
        window.close();
      });
  };

  return (
    <button
      onClick={handleClick}
      style={{
        background: '#555',
        color: '#fff',
        border: 'none',
        padding: '6px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        marginTop: '4px',
        width: '100%'
      }}
      title="Crash without recovery — session will be lost"
    >
      Crash (No Recovery)
    </button>
  );
}
