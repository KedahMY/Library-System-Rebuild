# 13 · Risks & Failure Modes

> Every subsystem in the rebuild has well-known failure modes. This document catalogs them with **symptom → root cause → fix** triples so a subagent (or TA) can diagnose without wandering.
>
> Each entry has a stable ID `FM-<area>-<n>` so logs and decisions can reference them.

---

## 1. Quick Triage Tree

```
Where does the failure surface?

├── At install / boot
│     → §2 Install & Boot
├── At login / register
│     → §3 Auth
├── On a /api/* request
│     → §4 API (route-specific)
├── In the browser UI
│     → §5 Frontend
├── Inside the PDF reader
│     → §6 PDF Reader
├── In the crash-recovery flow
│     → §7 Crash Recovery
├── Talking to LLM / Open Library
│     → §8 External Services
└── In the database
      → §9 Database
```

---

## 2. Install & Boot (`FM-BOOT`)

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-BOOT-1 | `node-gyp` / native-build error on `better-sqlite3` install | Node version mismatch / missing build toolchain | Use Node 18 or 20 LTS. On Windows install build tools via `npm install --global windows-build-tools` (admin) OR install Node from MSI which bundles tools. |
| FM-BOOT-2 | `Error: listen EADDRINUSE :::8000` | Stale node holding port | `stop.bat` (Win) or `lsof -ti:8000 \| xargs kill` (POSIX). |
| FM-BOOT-3 | Frontend boots on `:3000` but `/api/*` always 404 | `vite.config.js` proxy missing or backend not running | Confirm proxy target is `http://localhost:8000`; restart frontend after edits. |
| FM-BOOT-4 | `Error: Cannot find module 'dotenv'` etc. | `npm install` not run in `backend/` | Run `npm install` inside `backend/` AND `frontend/` separately. |
| FM-BOOT-5 | Backend prints DB-init log twice | The `data/` directory or `library.db` was corrupted on a previous run | Delete `backend/data/library.db*` and restart; the schema is rebuilt from scratch by migrations. |
| FM-BOOT-6 | `start.bat` opens windows but they close instantly | Windows path with spaces broke the cmd | Move repo to a path without spaces or quote `"%~dp0backend"`. |

---

## 3. Auth (`FM-AUTH`)

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-AUTH-1 | All `/api/*` calls return 401 even right after login | `localStorage.token` not set or axios interceptor missing | Verify `AuthContext.login()` writes `token` AND `user`; check `utils/api.js` reads `localStorage.token`. |
| FM-AUTH-2 | Login succeeds but PortalRedirect lands on `/portal` blank page | `PortalRedirect` map missing one of the 4 roles | Map: `student`/`staff` → `/student`, `author` → `/author`, `librarian` → `/librarian`. |
| FM-AUTH-3 | Reload kicks user back to `/login` | 401 interceptor matched `/auth/me` or similar — but there is no such endpoint; the actual cause is JWT expiry (24h) or `JWT_SECRET` mismatch (server restarted with different `.env`) | Re-login. To avoid: do not regenerate `JWT_SECRET` between runs in dev. |
| FM-AUTH-4 | `Cannot login. Account deactivated` on a fresh DB | A migration accidentally set `active=0` | Verify `migrateAddNewColumns` sets DEFAULT 1 and existing rows are NOT updated to 0. |
| FM-AUTH-5 | 403 from `PATCH /api/users/:id/deactivate` when targeting another user | Caller is not librarian, or target == self | Confirm token role; cannot deactivate self by design. |
| FM-AUTH-6 | Password reset hits 400 "Password must contain: …" even though string looks fine | UI sent confirmPassword instead of new_password | Ensure the form posts `{current_password, new_password}`. |

---

## 4. API (`FM-API`)

### 4.1 Books

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-API-BOOK-1 | `POST /borrow` returns 400 `Book is currently not available` for a freshly approved book | Race: another user borrowed before this one | Refresh list; expected behavior. |
| FM-API-BOOK-2 | Auto-return never fires for `duration_seconds:10` borrows | None of the trigger routes hit (see DR-15) — frontend not polling | Touch `/api/books/my-borrows` or `/api/notifications` after the timer to trigger lazy sweep. |
| FM-API-BOOK-3 | After `approve-delete`, `library.db` keeps related rows | Cascade deletion order wrong | Order must be: bookmarks → highlights → reading_progress → book_versions → downloaded_books → review_replies (per review id) → reviews → notifications (by related_id+type) → borrow_records → books → file unlink. See `04_architecture_lock.md §7`. |
| FM-API-BOOK-4 | `GET /preview/:id` returns 404 even though file exists in `uploads/books/` | `file_path` stored as absolute from a different OS / install path | The `resolveFilePath` helper must fall back to `path.basename(filePath)` inside `UPLOADS_DIR`. Confirm it's wired. |
| FM-API-BOOK-5 | Cover image fails to display in browser | Stored relative path being treated as URL | Use `/${cover_image}` (preserves the `uploads/` prefix) — vite proxies `/uploads/*` to backend's static mount. |
| FM-API-BOOK-6 | Multer accepts a .exe disguised as `.pdf` | MIME filter not applied | Multer `fileFilter` must check `file.mimetype`, not extension. |

### 4.2 Reviews

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-API-REV-1 | `POST /api/reviews` returns 403 on a book the user actually borrowed | Borrow record was deleted (e.g., book was hard-deleted) | Expected; borrowing history is the gate. Notify user. |
| FM-API-REV-2 | `sentiment` column always null | LLM call failed silently | `classifySentiment` returns 'neutral' on any error; verify the route does `.catch(() => 'neutral')`. |
| FM-API-REV-3 | Bulk-resolve-flags doesn't update rows | `WHERE flag_pending = 1` filter; the rows weren't pending | Confirm rows are still pending before bulk action. |

### 4.3 Requests / Open Library

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-API-OL-1 | `GET /openlibrary-search` returns 500 `getaddrinfo ENOTFOUND` | No internet in sandbox | Expected offline; route returns 500 with `debug` field. UI shows fallback message. |
| FM-API-OL-2 | `POST /:id/download` returns 401/403 | Restricted IA item | Try one of the listed `alternatives`. Optionally set `INTERNET_ARCHIVE_AUTH`. |
| FM-API-OL-3 | Download succeeds but PDF is 0 bytes / corrupt | First candidate was a redirect to a paywall | The `scorePdfCandidate` heuristic tries higher-scored candidates first; on failure retry. |

### 4.4 LLM

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-API-LLM-1 | `POST /api/llm/summary` returns 500 `DASHSCOPE_API_KEY is not set` | env var empty | Set the key in `backend/.env` and restart. This is **expected behavior** when the key is intentionally unset. |
| FM-API-LLM-2 | Summary returns 4xx model-not-found | DashScope tenant lacks `qwen3.5-flash` | Swap to `qwen-turbo`; log in `notes/decisions.md`. |
| FM-API-LLM-3 | Sentiment all `'neutral'` | LLM unreachable or empty content | Expected fallback — not a bug. |

---

## 5. Frontend (`FM-FE`)

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-FE-1 | Blank white page, console says "Cannot read properties of undefined (reading 'role')" | `useAuth()` user is null but a component dereferences it | Wrap with `if (!user) return null;` or use ProtectedRoute. |
| FM-FE-2 | Notification badge always 0 even after a new notification | Sidebar polls only on `activeTab` change; the user is on the same tab | Acceptable; refresh tab or wait for next mount. |
| FM-FE-3 | Recovery toast appears even on first-ever login | `RECORD_KEY(userId)` collision because login form pre-filled with cached token | Confirm `RECORD_KEY` is keyed by user id, not a static string. |
| FM-FE-4 | `localStorage` quota exceeded | `stateSnapshot` is huge (e.g., contains a serialized book list) | Snapshot must hold only filters / IDs, never full lists. See `06_screen_flow.md §4.1`. |
| FM-FE-5 | Filter inputs lose focus on every keystroke | Component re-creates child input each render | Lift state up; do not define inner components in the render body. |

---

## 6. PDF Reader (`FM-PDF`)

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-PDF-1 | "Loading PDF..." spinner forever | pdfjs worker URL mismatch | Use `import "pdfjs-dist/build/pdf.worker.min.mjs?url"` (Vite) and assign to `GlobalWorkerOptions.workerSrc`. |
| FM-PDF-2 | Pages render upside-down or doubled | Re-render race; mounted twice in React strict mode | Cancel pending render in `useEffect` cleanup; guard with `isMounted` ref. |
| FM-PDF-3 | Highlight selection doesn't capture text | pdfjs text layer disabled | Ensure `renderTextLayer: true` in render task. |
| FM-PDF-4 | Reading-progress endpoint hammered every page change | No throttle | Throttle to ≥10s and only POST when `current_page` actually changed. |

---

## 7. Crash Recovery (`FM-CR`)

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-CR-1 | Refresh always shows "session recovered after crash test" toast | `bv_crash_test` accidentally written during normal flow | The button's click handler must NOT set the key; the key is checked only as a marker AFTER an unload. Verify exact string `bv_crash_test`. |
| FM-CR-2 | After "Crash (No Recovery)" the next login still restores state | `bv_crash_no_recovery` flag was removed before `beforeunload` fired | Set the key and **also** immediately `localStorage.removeItem(RECORD_KEY(userId))` (do both — don't rely on unload). |
| FM-CR-3 | Logout doesn't clear record | Logout effect didn't capture `prevUserRef.current` before user → null | The cleanup must use a `useRef` updated AFTER the effect runs; see `App.jsx` reference. |
| FM-CR-4 | Recovery sometimes restores into wrong user | `RECORD_KEY` key collision; record's `userId` doesn't match logged-in user | Always check `String(record.userId) === String(user.id)` before applying. |
| FM-CR-5 | sessionStorage `bv_is_refresh` never present after refresh | Some browsers wipe sessionStorage when the tab is duplicated; user is in a new tab | Document: refresh-detection works only within the same tab. |

---

## 8. External Services (`FM-EXT`)

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-EXT-1 | DashScope returns 429 | Rate limit hit | Backoff + retry once with `temperature=0.5`. Document in decisions. |
| FM-EXT-2 | Open Library `search.json` returns empty docs for valid title | Their fuzzy matcher; try `q=` instead of `title=` | Out of scope for rebuild. |
| FM-EXT-3 | Internet Archive 503 sustained | IA is down | Show "Open Library temporarily unavailable" in UI; do not block librarian. |

---

## 9. Database (`FM-DB`)

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-DB-1 | `SQLITE_CONSTRAINT_CHECK` on book insert with status `pending_deletion` | Schema is at v1 (before migration 2) | Run `migrateAddPendingDeletion`; or delete library.db and restart. |
| FM-DB-2 | `SQLITE_CONSTRAINT_FOREIGNKEY` on book approve-delete | Cascade order wrong; trying to delete book before borrow_records | Use the exact order in `FM-API-BOOK-3`. |
| FM-DB-3 | WAL files grow without bound | High write churn, WAL never checkpoints | Acceptable in dev. To clean: stop the app, delete `*.db-shm`/`*.db-wal`. |
| FM-DB-4 | `UNIQUE constraint failed: reviews.user_id, reviews.book_id` on second review | Insert path used instead of upsert | The route does `existing` lookup; if exists, UPDATE — do not INSERT. |
| FM-DB-5 | `database is locked` under concurrent writes | Multiple processes writing | Run only one backend. Don't open the DB in a separate sqlite3 shell with write intent while the app is running. |

---

## 10. Cross-cutting

| ID | Symptom | Root cause | Fix |
|---|---|---|---|
| FM-X-1 | "It works in dev, fails when I deploy" | Out of scope — rebuild is local-dev only | Don't try to deploy. |
| FM-X-2 | Tests pass individually, fail in sequence | Shared DB state | Recreate fresh `library.db` before each acceptance run; smoke scripts must `rm backend/data/library.db*` between gates if isolation matters. |
| FM-X-3 | Agent edits a file outside its allow-list | Subagent ownership violation | Lead must reject and re-brief per `10_subagents.md::Anti-pattern Flags`. |
| FM-X-4 | Reference repo contradicts a doc in `/ai-rebuild` | Doc wins (the pack is canonical) | Log the discrepancy in `notes/decisions.md`. |

---

## 11. Recovery Procedures

### 11.1 Hard reset (clean DB, fresh upload dirs)

```bash
cd backend
rm -f data/library.db data/library.db-shm data/library.db-wal
rm -rf uploads/books/* uploads/covers/* uploads/avatars/*
node seed_dummy_users.js
npm start
```

### 11.2 Reset only crash-recovery state (in browser DevTools)

```js
localStorage.removeItem('bv_should_clear');
localStorage.removeItem('bv_crash_test');
localStorage.removeItem('bv_crash_no_recovery');
Object.keys(localStorage).filter(k => k.startsWith('bv_session_'))
  .forEach(k => localStorage.removeItem(k));
sessionStorage.removeItem('bv_is_refresh');
```

### 11.3 Reset only stuck borrows (single SQL)

```sql
UPDATE borrow_records SET status='returned', return_date=CURRENT_TIMESTAMP WHERE status='active';
UPDATE books SET availability='available';
```

---

## 12. Severity Legend (for `decisions.md`)

| Severity | Definition |
|---|---|
| BLOCKER | Gate cannot pass; rebuild halts. |
| MAJOR | Feature partially broken but workaround exists. |
| MINOR | Cosmetic or edge-case; can ship. |
| INFO | Intentional deviation; no fix needed. |
