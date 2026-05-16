# 01 · Reference Repository Analysis

> **STATUS: ADVISORY / BACKGROUND ONLY.** This file describes the reference implementation that the artifact pack was reverse-engineered from. It is NOT authoritative for the rebuild. If anything here conflicts with `16_full_requirements_verbatim.md`, `04_architecture_lock.md`, or `05_data_model.md`, those files win. Use this only to understand intent, naming conventions, and approximate scale.

A factual inventory of the source-of-truth implementation in this repo. Captured at commit `eae28ce` on branch `master`, project date `2026-05-14`.

---

## 1. Top-Level Layout

```
library_system/
├── backend/                Express + SQLite REST API (port 8000)
│   ├── server.js           App entry — mounts 11 routers
│   ├── database.js         Schema, migrations, processAutoReturns, generateDueReminders
│   ├── seed_dummy_users.js One-time demo-user seeder
│   ├── .env                PORT, JWT_SECRET, FRONTEND_URL, DASHSCOPE_API_KEY
│   ├── middleware/
│   │   └── auth.js         authenticate, authorize(...roles), generateToken
│   ├── routes/             auth, books, users, notifications, recovery,
│   │                       reviews, requests, history, stats, librarian, llm
│   ├── services/           llm, openlibrary, pdfExtract
│   ├── data/               library.db (+ .db-shm, .db-wal for WAL mode)
│   └── uploads/            books/, covers/, avatars/
├── frontend/               React 18 + Vite 5 SPA (port 3000)
│   ├── vite.config.js      proxies /api, /uploads → :8000
│   ├── index.html
│   └── src/
│       ├── App.jsx         BrowserRouter, AuthProvider, CrashRecoveryWrapper, ProtectedRoute
│       ├── main.jsx
│       ├── context/AuthContext.jsx
│       ├── utils/api.js    axios instance w/ JWT interceptor
│       ├── pages/          LoginPage, RegisterPage, StudentPortal, AuthorPortal, LibrarianPortal
│       ├── components/     16 components (see §3)
│       └── styles/global.css
├── start.bat / stop.bat / status.bat    Windows helpers
└── CLAUDE.md / README.md
```

---

## 2. Backend Routes (authoritative list)

Source code is the source of truth — README has some drift. Lines = file LOC.

| File | LOC | Mount | Endpoints summary |
|---|---:|---|---|
| `routes/auth.js` | 166 | `/api/auth` | `POST /register`, `POST /login` |
| `routes/books.js` | 1157 | `/api/books` | 32 endpoints — see [`08_traceability_matrix.md`](08_traceability_matrix.md) |
| `routes/users.js` | 317 | `/api/users` | profile CRUD, avatar upload, librarian user mgmt |
| `routes/notifications.js` | 132 | `/api/notifications` | list/filter, read/archive/delete, announcements |
| `routes/recovery.js` | 95 | `/api/recovery` | save/get/clear state; `sendBeacon` fallback via body `_token` |
| `routes/reviews.js` | 309 | `/api/reviews` | book reviews, replies, helpful votes, flag/moderate |
| `routes/requests.js` | 365 | `/api/requests` | student requests, librarian fulfillment, OL search/download |
| `routes/history.js` | 232 | `/api/history` | reading history, insights, achievements, progress, export |
| `routes/stats.js` | 194 | `/api/stats` | author stats, downloaded stats, user-activity |
| `routes/librarian.js` | 234 | `/api/librarian` | manage all books, version history, bulk user actions |
| `routes/llm.js` | 38 | `/api/llm` | `POST /summary` — Qwen via DashScope |

Plus, in `server.js`:
- `GET /api/health` — health check
- `POST /api/shutdown` — **crash-test endpoint, calls `process.exit(0)`**
- Static serve: `/uploads` → `backend/uploads/`

Total backend LOC (routes + middleware): **~3,294**.

---

## 3. Frontend Components & Pages

| File | LOC | Role |
|---|---:|---|
| `pages/LoginPage.jsx` | 85 | Unified login; routes by role on success |
| `pages/RegisterPage.jsx` | 156 | Role picker + dynamic bio/employee_id fields |
| `pages/StudentPortal.jsx` | 669 | 7 tabs: browse, recommendations, my-borrows, history, requests, notifications, profile |
| `pages/AuthorPortal.jsx` | 798 | 7 tabs: publish, submissions, drafts, stats, reviews, notifications, profile |
| `pages/LibrarianPortal.jsx` | 1134 | 10 tabs: pending, all, manage-books, requests, downloaded-stats, flagged-reviews, users, borrow-records, notifications, profile |
| `App.jsx` | 234 | Router + ProtectedRoute + CrashRecoveryWrapper + RecoveryContext |
| `context/AuthContext.jsx` | 76 | login/register/logout + localStorage persistence |
| `utils/api.js` | 39 | axios; baseURL `/api`; JWT injection; 401 → /login |
| `components/Sidebar.jsx` | 58 | Vertical nav with unread badge |
| `components/BookModal.jsx` | 172 | Book details + borrow CTA |
| `components/PDFReader.jsx` | 656 | pdfjs-dist viewer with bookmarks, highlights, progress |
| `components/QuickReview.jsx` | 117 | First-pages-only preview reader |
| `components/NotificationBoard.jsx` | 184 | Filterable inbox with archive/delete |
| `components/ProfileEditor.jsx` | 289 | Edit profile, change password, upload avatar |
| `components/CrashRecovery.jsx` | 193 | Hook + 2 buttons; state machine for 5 flags (see §6) |
| `components/StarRating.jsx` | 38 | Reusable star widget |
| `components/ReviewSection.jsx` | 239 | List/sort reviews + author replies + flag |
| `components/AuthorReviews.jsx` | 186 | Author's reviews dashboard with reply UI |
| `components/AuthorStats.jsx` | 169 | recharts charts: borrows, sentiment, trends |
| `components/BookRequests.jsx` | 146 | Student request submission + history |
| `components/ManageRequests.jsx` | 315 | Librarian request mgmt + Open Library search/download |
| `components/ManagePublishedBooks.jsx` | 304 | Edit/delete published books + version history |
| `components/ReadingHistory.jsx` | 223 | History list, insights, achievements, export |
| `components/DownloadedStats.jsx` | 100 | Librarian downloaded-books stats |

Frontend LOC: **~6,584**. Total project LOC: **~9,878**.

---

## 4. Database Schema (high level)

Created in `backend/database.js`. Detailed DDL is in [`05_data_model.md`](05_data_model.md).

| Table | Purpose | Notable constraints |
|---|---|---|
| `users` | All accounts (4 roles) | UNIQUE username; CHECK role; nullable bio (authors), employee_id (librarians), profile_picture, active (1/0), last_login |
| `books` | All books in all states | CHECK status IN (5 values); CHECK availability IN (2); FK author_id; columns: cover_image, rejection_reason, file_path, file_name, times_borrowed |
| `borrow_records` | Borrow ledger | CHECK status IN (active/returned/overdue); due_date NOT NULL |
| `bookmarks` | Per-page bookmarks per user/book | FK book, user; label optional |
| `highlights` | Text highlights per page | color hex; default `#c9a84c` |
| `notifications` | In-app inbox | type, priority, category, is_read, is_archived, related_id |
| `crash_recovery` | Server-side state mirror | UNIQUE user_id, JSON state_data |
| `reviews` | Star + text | rating 1–5; UNIQUE(user, book); flagged, flag_pending, helpful_count, sentiment, anonymous |
| `review_replies` | Author replies | FK review, author |
| `book_requests` | Student "please add this book" | status pending/approved/rejected/fulfilled; priority normal/urgent; fulfilled_book_id FK |
| `reading_progress` | Latest page per user/book + seconds | UNIQUE(user, book) |
| `book_versions` | Librarian edit history | JSON changes blob |
| `user_activity` | Activity log (sparsely written) | activity_type, details |
| `downloaded_books` | Books pulled via Open Library or manual upload | source ('open_library' / 'manual_upload'), source_url, request_id FK |

**Migrations** auto-run on boot in `initializeDatabase()`:
- `migrateAddDraftStatus()` — rebuilds books table to include `draft` in CHECK constraint.
- `migrateAddPendingDeletion()` — rebuilds books table to include `pending_deletion`.
- `migrateAddNewColumns()` — ALTER TABLE adds `users.profile_picture`, `users.active`, `users.last_login`, `books.cover_image`, `books.rejection_reason`, `reviews.flag_pending`.

---

## 5. Services & External Integrations

| Service | File | Purpose | Env var | Failure mode |
|---|---|---|---|---|
| LLM | `services/llm.js` | Qwen via DashScope-compatible OpenAI endpoint. `chat`, `generateBookSummary`, `classifySentiment` | `DASHSCOPE_API_KEY` | summary → 500; sentiment → 'neutral' |
| Open Library | `services/openlibrary.js` | Search, find-similar, download IA PDF, fetch cover | optional `INTERNET_ARCHIVE_AUTH` | throws; route returns 500 |
| PDF Extract | `services/pdfExtract.js` | Trivial: reads first 6 KB of `.txt`, returns null for PDFs/DOCs | none | returns null |

Endpoint: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`. Model: `qwen3.5-flash`.

---

## 6. Crash Recovery State Machine

The single most-subtle subsystem. Lives in `frontend/src/components/CrashRecovery.jsx` and `frontend/src/App.jsx` (CrashRecoveryWrapper).

**Storage keys** (verbatim — assert these in tests):
- `bv_session_<userId>` — localStorage. Full UI snapshot, per-user.
- `bv_is_refresh` — sessionStorage. Set on `beforeunload`; consumed on next mount.
- `bv_should_clear` — localStorage. Set on normal close to schedule cleanup.
- `bv_crash_test` — localStorage. Set by CrashTestButton **before** POSTing `/api/shutdown`.
- `bv_crash_no_recovery` — localStorage. Set by CrashUnrecoverableButton **before** wiping record.

**Decision matrix on mount** (after user is loaded):

| `bv_is_refresh` | `bv_crash_test` | record exists? | Action |
|---|---|---|---|
| true | — | yes | Restore (silent-success message) |
| — | true | yes | Restore ("recovered after crash test") |
| — | — | yes | Restore ("session not recovered" / error styling) — true crash path |
| — | — | no | Fresh start |

**`beforeunload` flow**:
- If `bv_crash_no_recovery` is set → wipe record, return.
- Otherwise: save record. If `bv_crash_test` is NOT set → set `bv_should_clear` and `bv_is_refresh`.

**Saver hook (`useSessionRecorder`)**:
- Saves immediately when tracked snapshot changes.
- Periodic save every 5 seconds.
- Saves on `beforeunload`.

`SIMULATE_UNRECOVERABLE_CRASH = true` exposes the second crash button in all portals.

---

## 7. Notable Implementation Details (mind these)

- **CORS**: backend allows `process.env.FRONTEND_URL || 'http://localhost:3000'` with `credentials: true`. Vite proxy means JWT travels same-origin in dev.
- **File uploads**:
  - Books → `backend/uploads/books/<uuid>-<original>.ext`. Stored `file_path` is **absolute**.
  - Covers → `backend/uploads/covers/<uuid>.ext`. Stored `cover_image` is **relative** (`uploads/covers/...`).
  - Avatars → `backend/uploads/avatars/<uuid>.ext`. Stored `profile_picture` is **relative**.
- **Static serving**: `/uploads` is served unauthenticated (book files reach the client via authenticated `/api/books/view/:id` instead; covers and avatars rely on the static path).
- **PDF view paths**: three endpoints serve PDFs differently:
  - `/api/books/view/:id` — inline, authenticated, any approved status.
  - `/api/books/download/:id` — attachment, authenticated.
  - `/api/books/preview/:id` — librarian only.
  - `/api/books/quick-review/:id` — approved-only, frontend limits page count.
- **CSV export**: hand-built CSV in `/api/books/borrow-records/export`, `/api/history/export?format=csv`, `/api/stats/author/export`.
- **PDF export**: pdfkit used in `/api/history/export?format=pdf`.
- **Borrow timing**: both `duration_days` (1–14) and `duration_seconds` (10–300) accepted on `POST /api/books/:id/borrow`. The seconds path exists to test auto-return without waiting.
- **Auto-return + due reminders**: lazy; triggered by frontend calls to certain endpoints (see Rule DR-15).

---

## 8. Demo Credentials (seeded by `seed_dummy_users.js`)

| Username | Password | Role |
|---|---|---|
| `student_demo` | `Student@123` | student |
| `staff_demo` | `Staff@1234` | staff |
| `author_demo` | `Author@1234` | author |
| `librarian_demo` | `Librarian@1` | librarian |

Inserted with `INSERT OR IGNORE` — safe to re-run.

---

## 9. Known Inconsistencies in the Reference (to fix in the rebuild)

| ID | Drift | Resolution |
|---|---|---|
| INC-1 | `README.md` says backend on port **5000**; `.bat` files, vite proxy, .env, and code all use **8000**. | Port is **8000**. Rebuilt README must reflect this. |
| INC-2 | `README.md` does not document the `bulk-return`, `pending_deletion`, `approve-delete`, `reject-delete`, `quick-review` endpoints. | They exist — keep them and document. |
| INC-3 | `routes/books.js:419` writes `file_path` as **absolute** path, but cover paths are relative. Inconsistent serialization. | Keep behavior (some clients depend on it via `resolveFilePath`). |
| INC-4 | The book "fulfilled by librarian via OL/manual" sets `author_id = librarian.id`. So stats can show librarian as an author of those books. | Acceptable — `downloaded_books` table distinguishes source. |
| INC-5 | `/api/reviews/:id/helpful` is a simple monotonic increment, no per-user dedup. | Keep behavior; flag for Phase-3 nice-to-have if asked. |
| INC-6 | `services/llm.js` references model `qwen3.5-flash`. Some DashScope tenants use `qwen-turbo` etc. | Keep `qwen3.5-flash`; if 4xx from API, document fallback in `decisions.md`. |
| INC-7 | `routes/recovery.js` uses `authenticateWithFallback` that reads `_token` from body — required for `sendBeacon`-on-unload. Frontend currently does **not** call this path; design preserves the option. | Keep; tests do not depend on this path. |

---

## 10. Source-of-Truth Anchors

When the rebuild needs to verify "did I match the reference?" — these files are the authority:

- Routes contract: `backend/routes/*.js`
- DB schema: `backend/database.js` `initializeDatabase()` body
- Auth rules: `backend/middleware/auth.js` + `backend/routes/auth.js`
- Crash recovery: `frontend/src/components/CrashRecovery.jsx` + `frontend/src/App.jsx::CrashRecoveryWrapper`
- Portal layouts: `frontend/src/pages/*Portal.jsx` (NAV_ITEMS arrays)
- LLM contract: `backend/services/llm.js`
- Open Library contract: `backend/services/openlibrary.js`
