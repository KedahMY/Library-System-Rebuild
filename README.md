# BiblioVault — E-Book Library Management System

Full-stack e-book library system rebuilt from a reproducibility artifact pack.

## Quick Start

```bash
# 1. Install dependencies
( cd backend  && npm install )
( cd frontend && npm install )

# 2. Configure (POSIX)
cp backend/.env.example backend/.env
node -e "require('fs').appendFileSync('backend/.env', '\nJWT_SECRET=' + require('crypto').randomBytes(32).toString('hex') + '\n')"

# Windows PowerShell: copy backend\.env.example backend\.env
# Then edit backend\.env and set JWT_SECRET=<any 64-char random hex string>

# 3. Seed demo accounts
( cd backend && node seed_dummy_users.js )

# 4. Run (two terminals)
( cd backend  && npm start )      # Terminal 1 — http://localhost:8000
( cd frontend && npm run dev )    # Terminal 2 — http://localhost:3000
```

Open **http://localhost:3000** in a browser.

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | >= 18 (recommended 20 LTS) | `node --version` |
| npm | >= 8 | `npm --version` |
| Modern browser | Chrome / Edge / Firefox | — |

## Demo Accounts

Run `node backend/seed_dummy_users.js` to create:

| Username | Password | Role |
|----------|----------|------|
| `student_demo` | `Student@123` | Student |
| `staff_demo` | `Staff@1234` | Staff |
| `author_demo` | `Author@1234` | Author |
| `librarian_demo` | `Librarian@1` | Librarian |

## Windows Helpers

```
start.bat       Opens two console windows (Backend :8000 + Frontend :3000)
status.bat      Prints whether each is running
stop.bat        Closes both
```

## Roles & Portals

| Role | Path | Highlights |
|------|------|------------|
| Student / Staff | `/student` | Browse, multi-borrow (up to 5), PDF reader with bookmarks & highlights, reading history & insights, book requests, notifications, profile |
| Author | `/author` | Publish (with cover + AI summary), drafts auto-save every 3s, submissions list, edit/delete (two-phase), stats with sentiment chart, reply to reviews |
| Librarian | `/librarian` | Approve/reject (bulk), preview file, manage published books with version history, fulfill requests via Open Library or manual upload, manage users (incl. bulk + deactivate), borrow records + CSV export, moderate flagged reviews, send announcements |

## Acceptance Smoke (deterministic)

### 6.1 Health
```bash
curl -fsS http://localhost:8000/api/health
```
PASS = `{"status":"ok","timestamp":"..."}`.

### 6.2 Auth round-trip
1. Open http://localhost:3000
2. Click "Create one" → register a new student account → log in
PASS = URL is `/student` AND sidebar shows "Browse" tab active.

### 6.3 Seed a book (requires librarian)
1. Log in as `librarian_demo / Librarian@1`
2. Sidebar → "Manage Books" → "Add New Book"
3. Fill title, author, genre, description (≥20 chars), attach a PDF
PASS = book appears in table with status "approved".

### 6.4 Borrow + read
1. Log in as `student_demo / Student@123`
2. Browse → click a book → Borrow 7 days → confirm
3. Sidebar → "My Books" → click "Read"
PASS = PDF reader opens or the read button navigates correctly.

### 6.5 Approval flow
1. As `author_demo`, publish a new book (Publish tab)
2. As `librarian_demo`, Pending tab → approve the book
PASS = status badge changes to "Approved".

### 6.6 Notifications
While logged in as librarian, click Notifications tab.
PASS = notifications list visible (may include `new_submission` from previous steps).

### 6.7 Crash recovery
1. Login as student → switch to "My Books" tab → press Ctrl+R
PASS = after reload, the active tab is still "My Books".

### 6.8 Negative auth
```bash
curl -fsS -o /dev/null -w "%{http_code}" http://localhost:8000/api/books
```
PASS = `401`.

## Environment Variables

| Variable | Default | Required |
|----------|---------|----------|
| `PORT` | 8000 | No |
| `JWT_SECRET` | `library-system-secret-key-2024` | Set in production |
| `FRONTEND_URL` | `http://localhost:3000` | No |
| `NODE_ENV` | `development` | No |
| `DASHSCOPE_API_KEY` | (empty) | Optional — LLM features degrade gracefully |
| `INTERNET_ARCHIVE_AUTH` | (empty) | Optional |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EADDRINUSE :8000` | Another process holds the port. Run `stop.bat` or kill the node process. |
| Frontend blank page | Backend isn't running or vite proxy target is wrong. Confirm backend on :8000. |
| Login returns 403 "Account deactivated" | A librarian deactivated the user. Toggle active in Manage Users. |
| File upload returns 400 "File too large" | 50 MB cap on books, 2 MB on covers, 5 MB on avatars. |
| `/api/llm/summary` always 500 | `DASHSCOPE_API_KEY` not set. Expected behavior — no key needed. |
| Old DB has schema errors | Delete `backend/data/library.db*` and restart. |

## License

MIT — for educational and personal use.
