import React, { useRef, useEffect, useCallback } from 'react';

// DR-10: exact localStorage/sessionStorage key strings
export const RECORD_KEY = (userId) => `bv_session_${userId}`;
export const REFRESH_FLAG = 'bv_is_refresh';          // sessionStorage
export const SHOULD_CLEAR_KEY = 'bv_should_clear';    // localStorage
export const CRASH_TEST_CLOSE_KEY = 'bv_crash_test';  // localStorage
export const CRASH_NO_RECOVERY_KEY = 'bv_crash_no_recovery'; // localStorage
export const SIMULATE_UNRECOVERABLE_CRASH = true;

/**
 * useSessionRecorder(portal, activeTab, stateSnapshot)
 *
 * Saves UI snapshot to localStorage every state change and every 5 seconds.
 * On beforeunload:
 *   - If bv_crash_no_recovery present → wipe record, clear key, return
 *   - Else save record
 *   - If bv_crash_test NOT present → set bv_should_clear and sessionStorage.bv_is_refresh='true'
 *
 * The userId is the first argument (the subject-owning user id).
 */
export function useSessionRecorder(userId, portal, activeTab, stateSnapshot) {
  const intervalRef = useRef(null);
  const latestRef = useRef({});

  // Keep ref up to date for the interval and beforeunload
  latestRef.current = { userId, portal, activeTab, stateSnapshot };

  const save = useCallback(() => {
    const { userId: uid, portal: p, activeTab: tab, stateSnapshot: snap } = latestRef.current;
    if (!uid) return;
    const data = {
      userId: uid,
      portal: p,
      activeTab: tab,
      stateSnapshot: snap,
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem(RECORD_KEY(uid), JSON.stringify(data));
    } catch (e) {
      console.error('useSessionRecorder save error:', e);
    }
  }, []);

  // Save on state change
  useEffect(() => {
    save();
  }, [save, userId, portal, activeTab, stateSnapshot]);

  // Periodic save every 5 seconds
  useEffect(() => {
    intervalRef.current = setInterval(save, 5000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [save]);

  // beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { userId: uid, portal: p, activeTab: tab, stateSnapshot: snap } = latestRef.current;

      // If unrecoverable crash flag set → wipe and abort
      if (localStorage.getItem(CRASH_NO_RECOVERY_KEY)) {
        if (uid) {
          localStorage.removeItem(RECORD_KEY(uid));
        }
        localStorage.removeItem(CRASH_NO_RECOVERY_KEY);
        return;
      }

      // Save record
      if (uid) {
        const data = {
          userId: uid,
          portal: p,
          activeTab: tab,
          stateSnapshot: snap,
          updatedAt: Date.now()
        };
        try {
          localStorage.setItem(RECORD_KEY(uid), JSON.stringify(data));
        } catch (e) {
          console.error('beforeunload save error:', e);
        }
      }

      // If bv_crash_test is NOT present, set bv_should_clear and bv_is_refresh
      if (!localStorage.getItem(CRASH_TEST_CLOSE_KEY)) {
        try {
          localStorage.setItem(SHOULD_CLEAR_KEY, 'true');
          sessionStorage.setItem(REFRESH_FLAG, 'true');
        } catch (e) {
          console.error('beforeunload flag set error:', e);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [save]);
}

// =========================================================================
// CrashTestButton
// Sets bv_crash_test, confirms, POSTs /api/shutdown, then window.close()
// =========================================================================
export function CrashTestButton() {
  const handleCrash = () => {
    if (window.confirm('Crash test: This will shut down the server. Continue?')) {
      // Set crash test flag so CrashRecoveryWrapper shows appropriate toast
      try {
        localStorage.setItem(CRASH_TEST_CLOSE_KEY, 'true');
      } catch (e) {
        console.error('CrashTestButton set flag error:', e);
      }

      fetch('http://localhost:8000/api/shutdown', { method: 'POST' })
        .catch(() => {})
        .finally(() => {
          try { window.close(); } catch (e) { /* may fail in some browsers */ }
        });
    }
  };

  return (
    <button onClick={handleCrash} className="crash-test-btn" title="Crash Test (simulate server crash)">
      Crash Test
    </button>
  );
}

// =========================================================================
// CrashUnrecoverableButton
// Sets bv_crash_no_recovery, removes record immediately, then crash-test
// =========================================================================
export function CrashUnrecoverableButton() {
  const handleCrash = () => {
    if (window.confirm('Unrecoverable crash: Session will NOT be restored. Continue?')) {
      try {
        // Set the unrecoverable flag
        localStorage.setItem(CRASH_NO_RECOVERY_KEY, 'true');

        // Wipe session records immediately
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('bv_session_')) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        console.error('CrashUnrecoverableButton set flag error:', e);
      }

      fetch('http://localhost:8000/api/shutdown', { method: 'POST' })
        .catch(() => {})
        .finally(() => {
          try { window.close(); } catch (e) { /* may fail in some browsers */ }
        });
    }
  };

  return (
    <button onClick={handleCrash} className="crash-unrecoverable-btn" title="Crash without recovery">
      Crash (No Recovery)
    </button>
  );
}
