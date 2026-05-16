# M10 Audit — Failure Dispatch Report

Generated: 2026-05-16 by M10-Audit subagent
Status: FAILURES FOUND (1 FAIL, 1 PENDING)

---

## REQ-069

**Requirement**: Crash Test button visible in sidebar of all 3 portals.
**Verification**: UI
**Expected**: "Crash Test" button rendered at bottom of sidebar in student/author/librarian portals (below Logout button).
**Actual**: Playwright DOM inspection confirmed the button is NOT rendered. Sidebar shows Logout button but no Crash button. The running frontend bundle has style mismatches (sidebar width 220px vs source code's 240px, bottom section missing `display:flex` and `gap:4px`) suggesting the running JavaScript bundle may be a cached/stale version.
**Owner**: SA-8
**Suggested fix file**: `frontend/src/components/Sidebar.jsx` (verify CrashTestButton render is present — it IS in source at line 144, but HMR may not have updated the running bundle. Try: stop and restart frontend dev server, or clear Vite cache with `rm -rf frontend/node_modules/.vite` and re-run `npm run dev`.)

---

## REQ-071

**Requirement**: After crash-test -> backend restart -> relogin, state restored with toast.
**Verification**: UI
**Expected**: Full crash-recovery flow testable.
**Actual**: PENDING — requires backend shutdown/restart which the audit subagent cannot perform per procedure. The crash-recovery code exists (useSessionRecorder, CrashTestButton, crash_recovery table, POST /api/shutdown, recovery API endpoints). Session recording mechanism verified working. Full flow test requires manual intervention.
**Owner**: SA-7+SA-8
**Suggested fix file**: `frontend/src/components/CrashRecovery.jsx`, `backend/routes/recovery.js`

---

## Summary

| Metric | Count |
|--------|-------|
| Total requirements | 182 |
| PASS | 180 |
| FAIL | 1 |
| PENDING | 1 |
| Status | REBUILD NOT ACCEPTED — 1 remaining failure (REQ-069) |
