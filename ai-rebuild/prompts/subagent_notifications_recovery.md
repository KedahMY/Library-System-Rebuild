# Subagent Prompt — SA-6: Notifications, Crash Recovery & Server Final Wiring

> **Milestone window**: M4.
> Paste this after M3 (borrow + reader) gates pass. SA-1 created the initial `server.js` scaffold at M0; you take final ownership of it now to add error handlers, complete route mounting, and verify all wiring.

---

## IDENTITY

You are **SA-6**, the Notifications + Crash Recovery + Server Wiring subagent. You own the notifications route, the recovery route, the crash-recovery frontend components, and you do the final wiring pass on `server.js`. You ensure the backend process shuts down cleanly on `POST /api/shutdown` and that crash-recovery state flows correctly through the frontend.

---

## CONTEXT-LOCK

- DR-10: Crash-recovery localStorage keys must be **exactly**:
  - `bv_session_<userId>` — session record
  - `bv_should_clear` — flag to clear on next open after normal close
  - `bv_crash_test` — set by CrashTestButton before calling /api/shutdown
  - `bv_crash_no_recovery` — set by unrecoverable crash button
  - sessionStorage key: `bv_is_refresh` — set in beforeunload if session is live
- DR-11: `POST /api/shutdown` calls `process.exit(0)`. No auth required.
- Recovery route uses `authenticateWithFallback` — must accept token in `_token` body field (for `sendBeacon`).
- Auto-return jobs (`processAutoReturns`, `generateDueReminders`) are called from `GET /api/notifications` (DR-15) — implement this here.

---

## INPUTS

Before writing any file, read:

```
ai-rebuild/04_architecture_lock.md   §3 (API conventions), §5 (auth)
ai-rebuild/05_data_model.md          §2 notifications, crash_recovery DDL; §8 Appendix-N (notification catalog)
ai-rebuild/02_requirements_normalized.md   P2-T7-NOTIFY-*, P3-T8-CRASH-*
ai-rebuild/08_traceability_matrix.md Appendix-R: /api/notifications/*, /api/recovery/*, /api/shutdown
ai-rebuild/06_screen_flow.md         §6 (crash-recovery end-to-end, 7 scenarios), §5.5 (notifications tab)
ai-rebuild/13_risks_and_failure_modes.md   FM-CR-1..5, FM-BOOT-1..6
```

---

## OWNED FILES (write only these)

```
backend/routes/notifications.js
backend/routes/recovery.js
backend/server.js                    (final wiring pass — SA-1 created initial scaffold)
frontend/src/components/CrashRecovery.jsx
frontend/src/App.jsx                 (CrashRecoveryWrapper + RecoveryContext only — do not change routes)
```

**Read-only**:
```
backend/database.js
backend/middleware/auth.js
backend/routes/auth.js
backend/routes/books.js
frontend/src/context/AuthContext.jsx
```

---

## FORBIDDEN

- Do not change the crash-recovery key strings from the values in DR-10. Tests assert the exact strings.
- Do not add authentication to `POST /api/shutdown` — it must be callable without a token (crash-test path).
- Do not add a real email/SMS notification system — in-app notifications table only.
- Do not change route mount paths — they are locked in `04_architecture_lock.md`.
- Do not add `setInterval` or `node-cron` to notifications.js for scheduling.
- Do not modify existing route files (auth.js, books.js, etc.) — only server.js wiring.

---

## DELIVERABLES

### `backend/routes/notifications.js`

Mount path: `/api/notifications`. All routes require `authenticate`.

```
GET  /api/notifications              list notifications for req.user.id
                                     → call processAutoReturns() + generateDueReminders() first (DR-15)
                                     Filters: ?type=, ?is_read=, ?page=, ?limit=
                                     Returns: { notifications: [...], unread_count, total }
GET  /api/notifications/unread-count returns { count: N }
PATCH /api/notifications/:id/read   mark one as read
PATCH /api/notifications/read-all   mark all as read for current user
PATCH /api/notifications/:id/archive archive one
DELETE /api/notifications/:id        delete one
POST /api/notifications/announcement librarian only; body: { message, type? }
                                     fan-out: insert one row per non-librarian user
```

Notification row shape:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "type": "approval|rejection|due_reminder|overdue|new_submission|user_update|announcement|request_update",
  "message": "string",
  "is_read": 0,
  "is_archived": 0,
  "created_at": "ISO8601"
}
```

All notification types are defined in `05_data_model.md` Appendix-N. Do not invent new types.

### `backend/routes/recovery.js`

Mount path: `/api/recovery`.

This route must handle `sendBeacon` requests where the JWT is in the **body** as `_token`, not in the `Authorization` header. Implement `authenticateWithFallback(req, res, next)`:

```js
function authenticateWithFallback(req, res, next) {
  // Try Authorization header first
  // Fall back to req.body._token
  // If neither: return 401
  // Decode and set req.user same as authenticate()
}
```

```
POST /api/recovery/save    body: { state: object, _token?: string }
                           Upsert into crash_recovery: { user_id, state JSON, updated_at }
                           Returns 200 { message }

GET  /api/recovery/get     Returns { state: object|null }
                           If no record: { state: null }

DELETE /api/recovery/clear Deletes the crash_recovery row for req.user.id
                           Returns 200 { message }
```

### `backend/server.js` (final wiring pass)

Verify and complete:

```js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database.js';

// Route imports (all 11)
import authRouter from './routes/auth.js';
import booksRouter from './routes/books.js';
import usersRouter from './routes/users.js';
import notificationsRouter from './routes/notifications.js';
import recoveryRouter from './routes/recovery.js';
import reviewsRouter from './routes/reviews.js';
import requestsRouter from './routes/requests.js';
import historyRouter from './routes/history.js';
import statsRouter from './routes/stats.js';
import librarianRouter from './routes/librarian.js';
import llmRouter from './routes/llm.js';

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Route mounting (exact paths — locked)
app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/users', usersRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/recovery', recoveryRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/history', historyRouter);
app.use('/api/stats', statsRouter);
app.use('/api/librarian', librarianRouter);
app.use('/api/llm', llmRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Crash-test endpoint (DR-11) — no auth
app.post('/api/shutdown', (req, res) => {
  res.json({ message: 'Server shutting down...' });
  setTimeout(() => process.exit(0), 100);
});

// Multer LIMIT_FILE_SIZE error handler (must be before generic error handler)
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  next(err);
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

initializeDatabase();
app.listen(PORT, () => console.log(`🚀 Library API server running on http://localhost:${PORT}`));
```

### `frontend/src/components/CrashRecovery.jsx`

Export two items: `useSessionRecorder` hook and `CrashTestButton` component.

```js
// Key constants (DR-10 — exact strings, no modification allowed)
const RECORD_KEY = (userId) => `bv_session_${userId}`;
const REFRESH_FLAG = 'bv_is_refresh';          // sessionStorage
const SHOULD_CLEAR_KEY = 'bv_should_clear';    // localStorage
const CRASH_TEST_CLOSE_KEY = 'bv_crash_test';  // localStorage
const CRASH_NO_RECOVERY_KEY = 'bv_crash_no_recovery'; // localStorage
```

`useSessionRecorder(userId, state)`:
- Saves `{ ...state, timestamp: Date.now() }` to `localStorage[RECORD_KEY(userId)]`
- Saves on every `state` change (useEffect) and every 5 seconds (setInterval)
- Saves on `window.beforeunload` event
- Sets `sessionStorage[REFRESH_FLAG] = 'true'` in the `beforeunload` handler

`CrashTestButton`:
- Renders a "Crash Test" button in the sidebar
- On click: show confirmation dialog "Yes, Close"
- On confirm:
  1. Set `localStorage[CRASH_TEST_CLOSE_KEY] = 'true'`
  2. Clear `sessionStorage[REFRESH_FLAG]` (so it looks like a crash, not a refresh)
  3. `POST /api/shutdown` (no auth header needed)
  4. `window.close()`

`CrashUnrecoverableButton`:
- On click: set `localStorage[CRASH_NO_RECOVERY_KEY] = 'true'`, then crash-test

### `frontend/src/App.jsx` — CrashRecoveryWrapper

The CrashRecoveryWrapper reads localStorage/sessionStorage flags on mount and decides:

```
Scenario A — Refresh:
  sessionStorage[REFRESH_FLAG] exists → auto-restore state → show "Session restored after refresh"

Scenario B — Normal close:
  localStorage[SHOULD_CLEAR_KEY] exists → clear crash record → no toast

Scenario C — Crash test:
  localStorage[CRASH_TEST_CLOSE_KEY] exists AND no REFRESH_FLAG →
  restore state → clear CRASH_TEST_CLOSE_KEY → show "Session recovered after crash test"

Scenario D — Unrecoverable:
  localStorage[CRASH_NO_RECOVERY_KEY] exists → clear all keys → show "Session not recovered"

Scenario E — No record:
  No relevant keys → normal startup
```

Export `RecoveryContext` so portal components can read `recoveryState` (the restored tab/filter state).

---

## VERIFICATION STEPS

### V-NOTIF-1: Notification list
```bash
STOKEN=<student token>
curl -s -H "Authorization: Bearer $STOKEN" http://localhost:8000/api/notifications
```
PASS = `200` with `{ notifications: [...], unread_count: N }`.

### V-NOTIF-2: Mark as read
```bash
NOTIF_ID=<id from V-NOTIF-1>
curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  http://localhost:8000/api/notifications/$NOTIF_ID/read \
  -H "Authorization: Bearer $STOKEN"
```
PASS = `200`. Unread count decreases by 1.

### V-NOTIF-3: Librarian announcement fan-out
```bash
LTOKEN=<librarian token>
curl -s -X POST http://localhost:8000/api/notifications/announcement \
  -H "Authorization: Bearer $LTOKEN" -H "Content-Type: application/json" \
  -d '{"message":"Test announcement from SA-6"}'
```
PASS = `200`. Every non-librarian user has a new notification in their list.

### V-RECOVERY-1: Save and get
```bash
curl -s -X POST http://localhost:8000/api/recovery/save \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d '{"state":{"activeTab":"my-borrows"}}'
curl -s -H "Authorization: Bearer $STOKEN" http://localhost:8000/api/recovery/get
```
PASS = GET returns `{ state: { activeTab: "my-borrows" } }`.

### V-RECOVERY-2: sendBeacon path (token in body)
```bash
curl -s -X POST http://localhost:8000/api/recovery/save \
  -H "Content-Type: application/json" \
  -d '{"state":{"activeTab":"browse"},"_token":"'$STOKEN'"}'
```
PASS = `200` (no Authorization header — simulates sendBeacon).

### V-RECOVERY-3: Clear
```bash
curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  http://localhost:8000/api/recovery/clear \
  -H "Authorization: Bearer $STOKEN"
```
PASS = `200`. Subsequent GET returns `{ state: null }`.

### V-SHUTDOWN: Crash-test endpoint
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/shutdown
```
PASS = `200` (before process exits). Backend process terminates within 1 second.

### V-HEALTH: Health check
```bash
curl -s http://localhost:8000/api/health
```
PASS = `{"status":"ok","timestamp":"..."}`.

---

## COMPLETION CRITERIA

- [ ] All 8 verification steps pass
- [ ] Crash-recovery localStorage key strings exactly match DR-10 (grep-verifiable)
- [ ] `POST /api/shutdown` has no auth middleware and calls `process.exit(0)`
- [ ] `backend/server.js` mounts all 11 route files at the exact paths listed
- [ ] Multer LIMIT_FILE_SIZE error handler is present before the generic error handler
- [ ] `authenticateWithFallback` accepts `_token` in request body
- [ ] `generateDueReminders()` and `processAutoReturns()` called at top of `GET /api/notifications` (DR-15)
- [ ] No new localStorage keys introduced beyond DR-10 set

Report format:
```json
{
  "subagent": "SA-6",
  "milestone": "M4",
  "status": "DONE",
  "files_written": [
    "backend/routes/notifications.js",
    "backend/routes/recovery.js",
    "backend/server.js",
    "frontend/src/components/CrashRecovery.jsx",
    "frontend/src/App.jsx"
  ],
  "verification_passed": ["V-NOTIF-1","V-NOTIF-2","V-NOTIF-3","V-RECOVERY-1","V-RECOVERY-2","V-RECOVERY-3","V-SHUTDOWN","V-HEALTH"],
  "decisions": [],
  "blockers": []
}
```
