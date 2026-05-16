# 10 · Subagent Catalog

Eight specialized subagents with **non-overlapping ownership at any given milestone**. Allow-lists are enforced by the lead — touching a path outside one is a protocol violation.

## Ownership Model: who owns what, when

Some files legitimately change in more than one milestone. Instead of granting concurrent ownership (which would cause merge conflicts), this pack uses **time-windowed ownership** — at most one subagent owns a path at a time, and the lead explicitly hands the path off between milestones.

| Shared path | Owned by (milestone) | Then handed off to (milestone) | Notes |
|---|---|---|---|
| `backend/server.js` | SA-1 (M0) | SA-6 (M4) | M0 ships a skeleton with `/api/health`, `/api/shutdown`, CORS, static `/uploads`, and **commented-out** router mounts. M4 uncomments / adds the full mounts + multer error handler. |
| `README.md` | SA-1 (M0 — stub) | SA-6 (M9 — final) | Stub at M0 says "rebuild in progress, see ai-rebuild/12_rebuild_readme.md". Final version mirrors 12_rebuild_readme.md content. |
| `start.bat` / `stop.bat` / `status.bat` | SA-1 (M0) | none | Final at M0; SA-6 only edits if a port or path changes (rare). |
| `.gitignore` | SA-1 (M0) | none | Locked at M0 per `15_env_and_secrets_template.md §3`. |
| `backend/.env.example` | SA-1 (M0) | none | Locked at M0 per `15_env_and_secrets_template.md §1`. |

**Concurrent ownership is forbidden.** If two subagents need to edit the same file in the same milestone, refactor so only one owns it and the other consumes it as read-only.

---

The remainder of this file lists each subagent's contract.

---

## SA-1 · Scaffold & Infrastructure

**Mission**: Stand up the project skeleton — package.json files, vite config, .env.example, .gitignore, start/stop/status .bat helpers, the React/Express bootstrap.

**Owned paths (M0 only; SA-1 does NOT edit these again later)**:
```
start.bat
stop.bat
status.bat
backend/package.json
backend/.env.example
backend/server.js          [SKELETON ONLY — must contain CORS, static /uploads, /api/health, /api/shutdown, and a clearly-marked TODO block where M4 will mount the 11 routers]
frontend/package.json
frontend/vite.config.js
frontend/index.html
frontend/src/main.jsx
frontend/src/styles/global.css
backend/uploads/books/.gitkeep
backend/uploads/covers/.gitkeep
backend/uploads/avatars/.gitkeep
.gitignore
README.md                  [STUB ONLY — single paragraph pointing to ai-rebuild/12_rebuild_readme.md]
```

**Read-only context**: `00_mission.md`, `04_architecture_lock.md`, `15_env_and_secrets_template.md`.

**Deliverables**:
- Backend boots on `:8000`; `curl /api/health` → `{status:"ok"}`.
- Frontend dev server boots on `:3000`; vite proxy targets `:8000` for `/api` and `/uploads`.
- Both `npm install` complete with exit 0 on a clean machine.
- `.env.example` exactly matches `15_env_and_secrets_template.md §1`.
- `.gitignore` exactly matches `15_env_and_secrets_template.md §3`.
- `server.js` contains a clearly-marked `// === ROUTER MOUNTS (M4: SA-6) ===` placeholder block.

**Exit criteria**: Gate A (`00_env.sh`, `01_health.sh`) passes.

**Forbidden**: `backend/routes/*`, `backend/middleware/*`, `backend/services/*`, `backend/database.js`, any file under `frontend/src/` except `main.jsx` and `styles/global.css`.

---

## SA-2 · Database & Migrations

**Mission**: Build `backend/database.js` — schema, pragmas, the 3 migration functions, and `processAutoReturns` / `generateDueReminders`. Also `backend/seed_dummy_users.js`.

**Owned paths**:
```
backend/database.js
backend/seed_dummy_users.js
backend/data/                          (directory creation only, contents are runtime)
```

**Read-only context**: `04_architecture_lock.md`, `05_data_model.md`, `02_requirements_normalized.md` (NFR-DATA rows).

**Deliverables**:
- All 14 tables exist after first boot. `sqlite3 backend/data/library.db ".tables"` matches the list in `05_data_model.md`.
- Pragmas WAL + foreign_keys=ON applied.
- `node seed_dummy_users.js` inserts 4 demo accounts.
- `processAutoReturns` and `generateDueReminders` exported off the `db` module.

**Exit criteria**:
- Manual: run `node -e "require('./backend/database')"` exits 0 and prints "Database initialized successfully".
- Run `node backend/seed_dummy_users.js` twice — second run is a no-op (no errors).

**Forbidden**: routes/, components/, pages/.

---

## SA-3 · Auth & User Management

**Mission**: Authentication, authorization middleware, user profile + librarian user management routes.

**Owned paths**:
```
backend/middleware/auth.js
backend/routes/auth.js
backend/routes/users.js
```

**Read-only context**: `04_architecture_lock.md` (§5-6), `08_traceability_matrix.md` (P1-T1, P2-T4, P2-T5 rows), `05_data_model.md` (`users` table).

**Deliverables**:
- All endpoints in `08_traceability_matrix.md` Appendix-R for `/api/auth/*` and `/api/users/*` (incl. avatar upload, deactivate, bulk-action-via-librarian-router is owned by SA-7).
- bcryptjs cost 12; JWT TTL 24h; payload exactly `{id, username, role, full_name}`.
- 401 / 403 / 400 / 404 / 500 behaviors match the contracts in `04_architecture_lock.md §5`.

**Exit criteria**: smoke scripts A1–A8 green; manual matrix rows for P1-T1, P2-T4-PROF, P2-T5-USR.

**Forbidden**: books.js, frontend, database.js (read-only via require).

---

## SA-4 · Books, Borrowing, Bookmarks, Highlights, Drafts

**Mission**: The biggest backend router. Implements `routes/books.js` end to end.

**Owned paths**:
```
backend/routes/books.js
backend/uploads/books/.gitkeep
backend/uploads/covers/.gitkeep
```

**Read-only context**: `04_architecture_lock.md` (§7-8, §10), `05_data_model.md` (books / borrow_records / bookmarks / highlights), `02_requirements_normalized.md` (P1-T2, P1-T3, P1-T4, P2-T1, P2-T2, P2-T6, P2-T7), `08_traceability_matrix.md` Appendix-R.

**Deliverables**:
- 32 endpoints listed in `08_traceability_matrix.md` Appendix-R under `/api/books/*`.
- Multer wired with both `book_file` (50 MB, PDF/TXT/DOC/DOCX) and `cover_image` (2 MB, JPG/PNG).
- `resolveFilePath` helper present for absolute/relative compatibility.
- `processAutoReturns` and `generateDueReminders` called from the exact endpoints listed in DR-15.
- The author edit/delete two-phase flow and librarian approve-delete cascade with file cleanup.

**Exit criteria**: smoke scripts 03_books_phase1.sh, 04_books_phase2.sh, 06_librarian.sh (where they touch /books) — all green.

**Forbidden**: auth.js, users.js, frontend, database.js.

---

## SA-5 · Reviews, Requests, History, Stats, Librarian-router, LLM

**Mission**: The "Phase 3" backend. Implements the remaining six routers plus the two helper services.

**Owned paths**:
```
backend/routes/reviews.js
backend/routes/requests.js
backend/routes/history.js
backend/routes/stats.js
backend/routes/librarian.js
backend/routes/llm.js
backend/services/llm.js
backend/services/openlibrary.js
backend/services/pdfExtract.js
```

**Read-only context**: `04_architecture_lock.md` (§2 endpoints, §10 graceful degradation), `05_data_model.md` (reviews, review_replies, book_requests, reading_progress, book_versions, downloaded_books), `02_requirements_normalized.md` (P3-T1..T7), `08_traceability_matrix.md` Appendix-R.

**Deliverables**:
- All endpoints in `08_traceability_matrix.md` Appendix-R for `/api/reviews`, `/api/requests`, `/api/history`, `/api/stats`, `/api/librarian`, `/api/llm`.
- LLM service uses DashScope (`qwen3.5-flash`), endpoint exactly as locked. Returns 500 with clear message when key missing; `classifySentiment` returns 'neutral' on any error.
- Open Library service: `searchBooks`, `findSimilar`, `downloadIaPdf` (with PDF-candidate scoring), `fetchCover`.
- pdfExtract is intentionally minimal — only `.txt` returns up to 6 KB; everything else returns null.

**Exit criteria**: smoke script 05_books_phase3.sh + the request/review/stats/llm rows in §3.4 of `07_test_strategy.md`.

**Forbidden**: books.js, auth.js, users.js, frontend, database.js.

---

## SA-6 · Notifications, Recovery, Server Wiring, Final README

**Mission**: `routes/notifications.js`, `routes/recovery.js`, final wiring in `server.js`, and the final `README.md` (mirror of `12_rebuild_readme.md`).

**Owned paths**:
```
backend/routes/notifications.js   [created at M4]
backend/routes/recovery.js        [created at M4]
backend/server.js                 [M4: SA-6 takes over from SA-1 — adds all 11 router mounts, multer LIMIT_FILE_SIZE error handler, 404 handler]
README.md                         [M9: SA-6 replaces SA-1's stub with the final README — copy from ai-rebuild/12_rebuild_readme.md but trimmed to project-root style]
```

**Read-only context**: `04_architecture_lock.md` (§2, §5, §11), `05_data_model.md` (notifications, crash_recovery + Appendix-N), `02_requirements_normalized.md` (P2-T3, P2-T8), `12_rebuild_readme.md` (final README template).

**Deliverables**:
- All notification CRUD endpoints + announcement (`08_traceability_matrix.md` Appendix-R).
- `authenticateWithFallback` middleware accepting `_token` body field (for sendBeacon).
- `POST /api/shutdown` responds then calls `process.exit(0)`.
- All 11 routers mounted in `server.js` with prefixes: `/api/auth`, `/api/books`, `/api/users`, `/api/notifications`, `/api/recovery`, `/api/reviews`, `/api/requests`, `/api/history`, `/api/stats`, `/api/librarian`, `/api/llm`.
- multer `LIMIT_FILE_SIZE` mapped to 400 with `"File too large. Maximum size is 50MB."`.
- Final `README.md` ready by M9.

**Exit criteria**: smoke scripts touching `/api/notifications/*`, `/api/recovery/*`, `/api/shutdown`, `/api/health` — all green; smoke negative N5 returns the exact "File too large" string.

**Forbidden**: any other router's file, any frontend file, `database.js`.

**Handoff in**: `backend/server.js` skeleton from SA-1 (M0).
**Handoff out**: nothing (terminal owner of `server.js` and final `README.md`).

---

## SA-7 · Frontend Pages

**Mission**: The five page-level components — login, register, and the three role portals. Owns `App.jsx`, `AuthContext`, axios util.

**Owned paths**:
```
frontend/src/App.jsx
frontend/src/context/AuthContext.jsx
frontend/src/utils/api.js
frontend/src/pages/LoginPage.jsx
frontend/src/pages/RegisterPage.jsx
frontend/src/pages/StudentPortal.jsx
frontend/src/pages/AuthorPortal.jsx
frontend/src/pages/LibrarianPortal.jsx
```

**Read-only context**: `06_screen_flow.md` (entire file is the spec), `02_requirements_normalized.md` (every Phase row that mentions a tab), `08_traceability_matrix.md` (frontend column).

**Deliverables**:
- 7 student tabs / 7 author tabs / 10 librarian tabs with **the exact id strings** from `06_screen_flow.md`.
- `App.jsx::CrashRecoveryWrapper` implements the decision matrix in `06_screen_flow.md §7.2`.
- `ProtectedRoute` and `PortalRedirect` per `06_screen_flow.md §1`.
- axios util has JWT injector + 401 interceptor that skips `/auth/` and `/recovery/` URLs.

**Exit criteria**: Playwright `auth.spec.ts` and `crash-recovery.spec.ts` pass. The other Playwright specs partially depend on SA-8 components.

**Forbidden**: All components are owned by SA-8; pages may **import** them, not edit them. Backend is read-only.

---

## SA-8 · Frontend Components & Verification

**Mission**: All 16 reusable components — including the heavyweight PDFReader — plus running the Playwright suite and writing test logs.

**Owned paths**:
```
frontend/src/components/Sidebar.jsx
frontend/src/components/BookModal.jsx
frontend/src/components/PDFReader.jsx
frontend/src/components/QuickReview.jsx
frontend/src/components/NotificationBoard.jsx
frontend/src/components/ProfileEditor.jsx
frontend/src/components/CrashRecovery.jsx
frontend/src/components/StarRating.jsx
frontend/src/components/ReviewSection.jsx
frontend/src/components/AuthorReviews.jsx
frontend/src/components/AuthorStats.jsx
frontend/src/components/BookRequests.jsx
frontend/src/components/ManageRequests.jsx
frontend/src/components/ManagePublishedBooks.jsx
frontend/src/components/ReadingHistory.jsx
frontend/src/components/DownloadedStats.jsx
ai-rebuild/test-pack/playwright/         (test scripts and config)
ai-rebuild/test-pack/results/            (logs)
```

**Read-only context**: `06_screen_flow.md` (component interactions), `02_requirements_normalized.md`, `07_test_strategy.md`, the pages from SA-7 (read-only — they import the components).

**Deliverables**:
- All 16 components built per `06_screen_flow.md`.
- `CrashRecovery.jsx` exports `RECORD_KEY`, `REFRESH_FLAG`, `SHOULD_CLEAR_KEY`, `CRASH_TEST_CLOSE_KEY`, `CRASH_NO_RECOVERY_KEY`, `useSessionRecorder`, `CrashTestButton`, `CrashUnrecoverableButton`. `SIMULATE_UNRECOVERABLE_CRASH = true`.
- `PDFReader.jsx` uses pdfjs-dist; fetches via authenticated `/api/books/view/:id`; supports bookmarks, highlights, progress writes.
- Playwright spec files implementing the contracts in `07_test_strategy.md §4`.

**Exit criteria**: Gate C — all Playwright specs green; logs saved to `ai-rebuild/test-pack/results/`.

**Forbidden**: Pages, backend, App.jsx.

---

## Ownership Matrix (time-windowed; no concurrent owners)

| Path glob | Milestone window | Owner | Disposition |
|---|---|---|---|
| `backend/server.js` skeleton | M0 | SA-1 | placeholder mounts |
| `backend/server.js` full | M4 | SA-6 | terminal owner |
| `backend/package.json`, `.env.example`, `.gitignore` | M0 | SA-1 | terminal |
| `start.bat`, `stop.bat`, `status.bat` | M0 | SA-1 | terminal |
| `backend/database.js`, `backend/seed_dummy_users.js` | M1 | SA-2 | terminal |
| `backend/middleware/auth.js`, `backend/routes/auth.js`, `backend/routes/users.js` | M2 | SA-3 | terminal |
| `backend/routes/books.js` | M3 | SA-4 | terminal |
| `backend/routes/notifications.js`, `backend/routes/recovery.js` | M4 | SA-6 | terminal |
| `backend/routes/reviews.js`, `requests.js`, `history.js`, `stats.js`, `librarian.js`, `llm.js` | M5 | SA-5 | terminal |
| `backend/services/llm.js`, `openlibrary.js`, `pdfExtract.js` | M5 | SA-5 | terminal |
| `backend/uploads/{books,covers,avatars}/.gitkeep` | M0 | SA-1 | terminal |
| `frontend/package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/styles/global.css` | M0 | SA-1 | terminal |
| `frontend/src/App.jsx`, `src/context/AuthContext.jsx`, `src/utils/api.js`, `src/pages/*` | M6 | SA-7 | terminal |
| `frontend/src/components/*` | M7 | SA-8 | terminal |
| `ai-rebuild/test-pack/smoke/*` | M0–M9 | shared (whoever creates the script) | Smoke scripts are content-stable once written; subagents that add a script for their gate write to a path matching `0X_<area>.sh` and never edit another SA's script. |
| `ai-rebuild/test-pack/playwright/*` | M7–M8 | SA-8 | terminal |
| `ai-rebuild/test-pack/results/*` | M0–M10 | Verifier + Audit (read-only for everyone else) | Append-only logs. |
| `ai-rebuild/test-pack/results/requirement_audit.log` | M10 | Audit subagent | Terminal — written exclusively by the M10 audit (`ai-rebuild/prompts/subagent_requirement_audit.md`). |
| `ai-rebuild/notes/audit_failures.md` | M10 | Audit subagent | Terminal — written exclusively by the M10 audit. |
| `README.md` stub | M0 | SA-1 | placeholder |
| `README.md` final | M9 | SA-6 | terminal |
| `ai-rebuild/notes/decisions.md` | M0–M10 | shared (append-only) | Anyone may append; nobody edits prior entries. |

---

## Handoff Sequence

```
M0 →   SA-1
M1 →   SA-2
M2 →   SA-3
M3 →   SA-4 (depends on SA-2, SA-3)
M4 →   SA-6 (notifications, recovery, server wiring)
M5 →   SA-5 (parallel with SA-7 if smoke gate B-2 not yet required)
M6 →   SA-7 (depends on SA-3 routes for auth)
M7 →   SA-8 (depends on SA-7 pages; can start StarRating/BookModal earlier)
M8 →   Verifier runs Playwright
M9 →   SA-1 / SA-6 finalize README + scripts
M10 →  Requirement Audit subagent (HARD GATE)
        — walks all 182 REQ-* in 17_acceptance_checklist.md
        — on failure: lead re-spawns owners and re-runs audit (max 5 cycles)
```

---

## Anti-pattern Flags

If any of these happens, the lead agent must reject the subagent's work and re-brief:

| Flag | Reason |
|---|---|
| Subagent edits a path outside its allow-list | Ownership violation. |
| Subagent adds a dependency not in `04_architecture_lock.md §1` | Stack drift. |
| Subagent introduces TypeScript files | Out of scope. |
| Subagent removes `processAutoReturns`/`generateDueReminders` calls | Breaks AR-004/AR-005 contracts. |
| Subagent changes notification `type` strings | Breaks frontend rendering and reduces traceability. |
| Subagent merges files together (e.g., books.js into a single router barrel) | Layout drift; pages and tests expect the path layout. |
