# 04 · Architecture Lock

This document **freezes** the technical choices for the rebuild. Subagents may not deviate without an explicit `decisions.md` entry signed off by the lead agent.

---

## 1. Stack (locked versions)

| Layer | Choice | Pinned version |
|---|---|---|
| Runtime | Node.js | **≥18.0.0**, recommend 20 LTS |
| Frontend framework | React | **^18.2.0** |
| Frontend router | react-router-dom | **^6.20.0** |
| Bundler | Vite | **^5.0.0** |
| HTTP client | axios | **^1.6.0** |
| Charts | recharts | **^3.8.1** |
| PDF rendering | pdfjs-dist | **^4.10.38** |
| PDF generation (frontend export) | jspdf | **^4.2.1** |
| jspdf tables | jspdf-autotable | **^5.0.7** |
| Backend framework | Express | **^4.18.2** |
| Database | better-sqlite3 | **^11.0.0** |
| Auth | jsonwebtoken | **^9.0.2** |
| Hash | bcryptjs | **^2.4.3** |
| Uploads | multer | **^1.4.5-lts.1** |
| CORS | cors | **^2.8.5** |
| ID generator | uuid | **^9.0.0** |
| CSV (optional) | json2csv | **^6.0.0-alpha.2** |
| PDF generation (server) | pdfkit | **^0.18.0** |
| Env loader | dotenv | **^16.4.0** |
| Server HTTP for LLM | axios | (re-use the backend axios) |

**Do not introduce** TypeScript, Tailwind, Next.js, Prisma/Drizzle, ORM, Redux/Zustand, Jest/Vitest test infra, eslint configs beyond the default vite scaffold. The rebuild stays minimal.

---

## 2. Process & Ports

| Concern | Value |
|---|---|
| Backend port | **8000** (env `PORT`) |
| Frontend dev port | **3000** |
| CORS origin (dev) | `http://localhost:3000` (env `FRONTEND_URL`) |
| JWT secret default | `library-system-secret-key-2024` (env `JWT_SECRET`) |
| JWT TTL | **24h** |
| LLM endpoint | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| LLM model | `qwen3.5-flash` |
| Open Library search | `https://openlibrary.org/search.json` |
| Internet Archive metadata | `https://archive.org/metadata/{ia_id}` |
| Internet Archive download | `https://archive.org/download/{ia_id}/{filename}` |
| OL covers | `https://covers.openlibrary.org/b/id/{cover_id}-L.jpg` |
| Crash-test endpoint | `POST /api/shutdown` |
| Health check | `GET /api/health` |

---

## 3. Repository Layout (locked)

```
library-system/
├── backend/
│   ├── package.json            # "scripts": { "start": "node server.js", "dev": "node server.js" }
│   ├── .env.example
│   ├── server.js               # mounts all routers; CORS; static /uploads; health; shutdown
│   ├── database.js             # init + 3 migrations + processAutoReturns + generateDueReminders
│   ├── seed_dummy_users.js
│   ├── middleware/auth.js      # authenticate, authorize(...roles), generateToken
│   ├── routes/
│   │   ├── auth.js
│   │   ├── books.js
│   │   ├── users.js
│   │   ├── notifications.js
│   │   ├── recovery.js
│   │   ├── reviews.js
│   │   ├── requests.js
│   │   ├── history.js
│   │   ├── stats.js
│   │   ├── librarian.js
│   │   └── llm.js
│   ├── services/
│   │   ├── llm.js
│   │   ├── openlibrary.js
│   │   └── pdfExtract.js
│   ├── data/                   # library.db (auto-created)
│   └── uploads/                # books/ covers/ avatars/  (auto-created)
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── context/AuthContext.jsx
│       ├── utils/api.js
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx
│       │   ├── StudentPortal.jsx
│       │   ├── AuthorPortal.jsx
│       │   └── LibrarianPortal.jsx
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   ├── BookModal.jsx
│       │   ├── PDFReader.jsx
│       │   ├── QuickReview.jsx
│       │   ├── NotificationBoard.jsx
│       │   ├── ProfileEditor.jsx
│       │   ├── CrashRecovery.jsx
│       │   ├── StarRating.jsx
│       │   ├── ReviewSection.jsx
│       │   ├── AuthorReviews.jsx
│       │   ├── AuthorStats.jsx
│       │   ├── BookRequests.jsx
│       │   ├── ManageRequests.jsx
│       │   ├── ManagePublishedBooks.jsx
│       │   ├── ReadingHistory.jsx
│       │   └── DownloadedStats.jsx
│       └── styles/global.css
├── start.bat
├── stop.bat
├── status.bat
├── README.md
└── ai-rebuild/                  # this artifact pack
```

No additional top-level directories. No `tests/` directory (test scripts live under `ai-rebuild/test-pack/` per [`07_test_strategy.md`](07_test_strategy.md)).

---

## 4. Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Files (JS/JSX) | kebab-case for routes, PascalCase for React components | `books.js`, `BookModal.jsx` |
| Functions | camelCase, descriptive verb | `processAutoReturns`, `generateDueReminders` |
| DB tables | snake_case, plural | `borrow_records`, `book_requests` |
| DB columns | snake_case | `created_at`, `due_date` |
| JSON API field names | snake_case (matches DB) | `book_id`, `times_borrowed`, `is_read` |
| URL paths | kebab-case | `/api/books/bulk-borrow`, `/api/books/borrow-records` |
| URL params | `:id` (singular) | `/api/books/:id/borrow` |
| Status enums | snake_case lowercase | `pending_deletion`, `auto_return` |
| Notification types | snake_case lowercase | `due_reminder`, `new_submission` |
| Storage paths (covers, avatars) | relative to `backend/` | `uploads/covers/<uuid>.jpg` |
| Storage path (books) | **absolute** (legacy) | `/abs/path/to/uploads/books/<uuid>-<original>.pdf` |
| UUIDs | v4, hyphenated, stored as TEXT | `9d8c5e2f-...` |

---

## 5. API Response Conventions

- **Success**: `2xx` with JSON body. List endpoints return arrays directly (e.g., `[{...}, ...]`). Aggregate endpoints return an object (`{ books: [...], summary: {...} }`).
- **Validation error**: `400` with `{ error: "<message>" }` or `{ errors: { field: "<message>", ... } }`. The plural `errors` form is used for multi-field validation (register, edit).
- **Auth error**: `401 { error: "Authentication required" | "Invalid or expired token" }`.
- **Authz error**: `403 { error: "Access denied: insufficient permissions" | "<specific reason>" }`.
- **Not found**: `404 { error: "<resource> not found" }`.
- **Server error**: `500 { error: "<message>" }`.
- **File uploads**: validation messages may say `"File too large. Maximum size is 50MB."` (caught from multer in `server.js`).
- Do **not** wrap responses in a generic envelope (`{ data, status }`). The frontend reads top-level shapes directly.

---

## 6. Authentication & Authorization

- `Authorization: Bearer <JWT>` header on every request after login.
- JWT payload: `{ id, username, role, full_name, iat, exp }` — nothing else.
- `authenticate` middleware attaches `req.user`. `authorize('role1', 'role2')` factory restricts to listed roles.
- The recovery route uses `authenticateWithFallback` that also accepts a `_token` field in the JSON body (kept for `sendBeacon` support — not actively wired in the frontend).
- Frontend `utils/api.js` reads `localStorage.token`; on `401` it clears auth and redirects to `/login`, **skipping** URLs matching `/auth/` or `/recovery/`.

---

## 7. Database

- **Engine**: SQLite via `better-sqlite3` (synchronous API).
- **Pragmas at boot**:
  ```js
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ```
- **Schema**: full DDL in [`05_data_model.md`](05_data_model.md).
- **Migrations**: keep the 3 functions (`migrateAddDraftStatus`, `migrateAddPendingDeletion`, `migrateAddNewColumns`) even on a fresh build — the second migration in particular guards against an existing DB that was created before the constraint update.
- **Transactions**: use `db.transaction(() => { ... })()` for any multi-statement write (borrow/return, bulk actions, delete cascades).
- **Cascades**: **manual** — there are no `ON DELETE CASCADE` in the schema. The cascade order for deleting a book is:
  1. `bookmarks` → `highlights` → `reading_progress` → `book_versions` → `downloaded_books`
  2. `review_replies` (per review) → `reviews`
  3. `notifications` where `related_id = book.id AND type = 'delete_request'`
  4. `borrow_records`
  5. `books`
  6. File on disk (book file + cover image)

---

## 8. File Storage

| Asset | Dir | Max size | MIME filter | Stored field |
|---|---|---|---|---|
| Book file | `backend/uploads/books/` | 50 MB | `application/pdf`, `text/plain`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `books.file_path` (absolute), `books.file_name` (original) |
| Cover image | `backend/uploads/covers/` | 2 MB | `image/jpeg`, `image/png`, `image/jpg` | `books.cover_image` (relative `uploads/covers/<uuid>.ext`) |
| Avatar | `backend/uploads/avatars/` | 5 MB | `image/jpeg`, `image/png`, `image/jpg` | `users.profile_picture` (relative) |

Books served via authenticated `/api/books/view/:id` (inline) and `/api/books/download/:id`. Covers and avatars served via the static `/uploads` mount.

`resolveFilePath()` (in `routes/books.js`) accepts a stored path that may have been written from a different directory layout and falls back to looking up `path.basename(filePath)` inside `uploads/books/`.

---

## 9. Environment Variables

`backend/.env.example`:

```
PORT=8000
JWT_SECRET=change-me-to-a-random-256-bit-value
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
# Optional integrations — app degrades gracefully when unset
DASHSCOPE_API_KEY=
INTERNET_ARCHIVE_AUTH=
```

The rebuilt repo must ship `.env.example` (placeholder values) and **never commit** a real `.env`. The README instructs the TA to copy and edit.

---

## 10. Concurrency & Background Jobs

- Run-on-call only. There is no `setInterval`/`setTimeout` scheduler at boot.
- The two job functions (`processAutoReturns`, `generateDueReminders`) are exported off the `db` module and invoked from inside the following routes (replicate exactly):
  - `processAutoReturns()` called from `POST /api/books/:id/borrow`, `POST /api/books/bulk-borrow`, `GET /api/books/my-borrows`, `GET /api/books/borrow-records`, `GET /api/books/borrow-records/export`, `GET /api/history`, `GET /api/notifications`.
  - `generateDueReminders()` called from `GET /api/books/my-borrows`, `GET /api/notifications`.

---

## 11. Logging

Console logging only. `console.log` for normal flow, `console.error` for failures. No structured logger, no log files. The reference repo logs are noisy in `routes/requests.js` Open Library paths — keep them; they help debug download issues.

---

## 12. Build Outputs

- Frontend `npm run build` produces `frontend/dist/`. The reference repo commits `dist/` — the rebuild may exclude it via `.gitignore` (recommended).
- Backend has no build step.

---

## 13. .gitignore Recommendation

```
node_modules/
backend/data/library.db
backend/data/library.db-shm
backend/data/library.db-wal
backend/uploads/books/*
backend/uploads/covers/*
backend/uploads/avatars/*
!backend/uploads/books/.gitkeep
!backend/uploads/covers/.gitkeep
!backend/uploads/avatars/.gitkeep
backend/.env
frontend/dist/
.DS_Store
*.log
```

---

## 14. Versioning & Compatibility

The rebuild ships at `1.0.0` for both `backend/package.json` and `frontend/package.json`. Bump only with a documented reason (no auto-bumps).

Do not add a CI matrix — the rebuild is local-dev only.
