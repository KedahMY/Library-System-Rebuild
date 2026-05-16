# 12 · Rebuild README (TA-Facing)

> This document is for a human reviewer / TA. It is the deterministic checklist they follow to verify the agent's rebuilt system runs end-to-end.
>
> **You make zero decisions during the smoke flow.** Every value is pinned. The only place a choice exists is `ai-rebuild/14_human_inputs_required.md` — and the agent already shipped with defaults, so you can skip it on first pass.

---

## 0. One-Glance Quick Start (paste this)

```bash
# 1. install
( cd backend  && npm install )
( cd frontend && npm install )

# 2. configure (POSIX)
cp backend/.env.example backend/.env
node -e "require('fs').appendFileSync('backend/.env', '\nJWT_SECRET=' + require('crypto').randomBytes(32).toString('hex') + '\n')"
# (Windows PowerShell equivalents: see §3)

# 3. seed demo accounts
( cd backend && node seed_dummy_users.js )

# 4. run (two terminals)
( cd backend  && npm start )      # terminal 1 — :8000
( cd frontend && npm run dev )    # terminal 2 — :3000
```

Open `http://localhost:3000`. Demo logins are in [§4](#4-seed-demo-accounts).

If the smoke checks in [§6](#6-acceptance-smoke-deterministic) all pass, the rebuild is accepted. **No other decisions required.**

---

## 1. What this is

BiblioVault is a full-stack e-book library system. It was rebuilt from a reproducibility artifact pack (`/ai-rebuild/`) by a Claude Code lead agent orchestrating subagents. The rebuilt repo mirrors the reference implementation in this directory.

Total expected time start-to-accept: **≈8 minutes**.

---

## 2. Prerequisites

| Tool | Version | How to check |
|---|---|---|
| Node.js | **≥ 18** (recommended 20 LTS) | `node --version` |
| npm | **≥ 8** | `npm --version` |
| sqlite3 CLI | optional | `sqlite3 --version` |
| A modern browser | Chrome / Edge / Firefox | — |

OS support: Windows 10/11 (primary), macOS, Linux. The `.bat` helpers are Windows-only; on POSIX use the manual start steps in §5.

---

## 3. First-Time Setup

```bash
# From the project root:
cd backend
npm install
cd ../frontend
npm install
cd ..
```

Then configure environment:

```bash
cd backend
cp .env.example .env       # Windows: copy .env.example .env
```

Edit `backend/.env`:

```
PORT=8000
JWT_SECRET=<paste any random 64-char string>
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
# Optional — the app degrades gracefully if these are blank:
DASHSCOPE_API_KEY=
INTERNET_ARCHIVE_AUTH=
```

`DASHSCOPE_API_KEY` enables:
- AI-generated book summaries (Author / Librarian dashboards)
- Sentiment classification for reviews

Without it: summary endpoints return 500 with a clear message, sentiment defaults to "neutral" — every other feature still works.

---

## 4. Seed Demo Accounts (recommended)

```bash
cd backend
node seed_dummy_users.js
```

Creates four logins (re-running is safe — `INSERT OR IGNORE`):

| Username | Password | Role |
|---|---|---|
| `student_demo` | `Student@123` | Student |
| `staff_demo` | `Staff@1234` | Staff |
| `author_demo` | `Author@1234` | Author |
| `librarian_demo` | `Librarian@1` | Librarian |

---

## 5. Run

### 5.1 Windows (recommended)

From the project root:

```
start.bat       :: opens two console windows (Backend :8000 + Frontend :3000)
status.bat      :: prints whether each is running
stop.bat        :: closes both
```

### 5.2 Manual (any OS)

Two terminals:

```bash
# Terminal 1 — backend
cd backend
npm start
# expect: 🚀 Library API server running on http://localhost:8000
```

```bash
# Terminal 2 — frontend
cd frontend
npm run dev
# expect: VITE v5.x.x ready in NNN ms · Local: http://localhost:3000
```

Open **http://localhost:3000** in a browser.

---

## 6. Acceptance Smoke (deterministic)

Run these in order. Each step has a single PASS criterion. **Do not interpret** — match the literal output.

### 6.1 Health (10 s)
```bash
curl -fsS http://localhost:8000/api/health
```
PASS = response body is `{"status":"ok","timestamp":"..."}`.

### 6.2 Auth round-trip (1 min)
Browser at `http://localhost:3000`:
1. Click "Create one" → register username `acc_smoke`, full name `Smoke Test`, password `Sm0ke!Test`, role student. Submit.
2. After redirect, log in as `acc_smoke / Sm0ke!Test`.

PASS = URL is `/student` AND sidebar shows "Browse Books" tab active.

### 6.3 Seed a book (30 s, requires librarian)
Log out → log in as `librarian_demo / Librarian@1`.
1. Sidebar → "Manage Books" → "Add New Book".
2. Title `Smoke Book`. Author name `QA`. Genre `Fiction`. Description ≥20 chars. Attach any small PDF.
3. Save.

PASS = the book appears in the Manage Books table with `status=approved`.

### 6.4 Borrow + read (1 min, requires student)
Log out → log in as `student_demo / Student@123`.
1. Browse → click "Smoke Book" → modal opens → Borrow 7 days → confirm.
2. Sidebar → "My Borrows" → click "Read".
3. In the reader, click "Add bookmark" on page 1, label `qa`.

PASS = bookmark appears in the right-hand panel.

### 6.5 Approval flow (1 min)
Log in as `author_demo / Author@1234`.
1. "Publish New Book" → title `Author Smoke`, genre Fiction, description ≥20 chars, attach a small PDF. Submit.

Log out → log in as `librarian_demo`.
2. "Pending Submissions" → tick the row → "Approve Selected" → confirm.

PASS = the row's status badge changes to "Approved" without page reload.

### 6.6 Notifications (15 s)
While still logged in as `librarian_demo`, click the Notifications tab.

PASS = there are notifications of type `new_submission` for the books created above, plus `user_update` for the registration in §6.2.

### 6.7 Crash recovery (2 min)
Log in as `student_demo`. Switch to "My Borrows".

**Refresh path:**
1. Press `Ctrl+R`.

PASS = after reload, the active tab is still "My Borrows" (no toast styling required).

**Crash-test path:**
2. In the sidebar, click "Crash Test" → "Yes, Close".
3. The browser tab closes; the backend process exits (its terminal goes idle).
4. In a terminal, restart the backend: `cd backend && npm start`.
5. Open `http://localhost:3000` again → log in as `student_demo`.

PASS = the "My Borrows" tab is the active tab on next mount, AND a toast like "Session recovered after crash test" or "Session not recovered" appears within 3 s.

### 6.8 Negative auth (10 s)
```bash
curl -fsS -o /dev/null -w "%{http_code}" http://localhost:8000/api/books
```
PASS = `401`.

### 6.9 (Optional) LLM summary
Skip unless you set `DASHSCOPE_API_KEY` in `backend/.env`. With key:
- As author, on the Publish form, click "Generate Summary" → description field fills within 10 s.

Without key, this is **expected to 500** — that is not a rebuild failure.

If all of 6.1–6.8 pass, **accept the rebuild**.

---

## 7. File Layout

```
backend/
  server.js
  database.js
  seed_dummy_users.js
  .env / .env.example
  middleware/auth.js
  routes/                  (auth, books, users, notifications, recovery, reviews,
                            requests, history, stats, librarian, llm)
  services/                (llm, openlibrary, pdfExtract)
  data/library.db          (auto-created)
  uploads/                 (books/, covers/, avatars/ — auto-created)
frontend/
  vite.config.js
  src/
    App.jsx, main.jsx
    context/AuthContext.jsx
    utils/api.js
    pages/                 (Login, Register, Student, Author, Librarian)
    components/            (Sidebar, BookModal, PDFReader, QuickReview,
                            NotificationBoard, ProfileEditor, CrashRecovery,
                            StarRating, ReviewSection, AuthorReviews, AuthorStats,
                            BookRequests, ManageRequests, ManagePublishedBooks,
                            ReadingHistory, DownloadedStats)
    styles/global.css
start.bat / stop.bat / status.bat
```

---

## 8. Roles & Portals

| Role | Path | Highlights |
|---|---|---|
| Student / Staff | `/student` | Browse, multi-borrow (up to 5), PDF reader with bookmarks & highlights, reading history & insights, book requests, notifications, profile |
| Author | `/author` | Publish (with cover + AI summary), drafts auto-save every 3 s, submissions list, edit/delete (two-phase), stats with sentiment chart, reply to reviews |
| Librarian | `/librarian` | Approve/reject (bulk), preview file, manage published books with version history, fulfill student requests via Open Library or manual upload, manage users (incl. bulk + deactivate), borrow records + CSV export, moderate flagged reviews, send announcements |

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE :8000` | Another node process holds the port. `stop.bat` or `taskkill /F /PID …` (Windows), `lsof -ti:8000 \| xargs kill` (macOS/Linux). |
| Frontend shows blank page | Backend isn't running, or `vite.config.js` proxy target wrong. Confirm backend on `:8000`. |
| Login returns 403 "Account deactivated" | A librarian flagged the user. Toggle active in Manage Users. |
| File upload returns 400 "File too large" | 50 MB cap on books, 2 MB on covers, 5 MB on avatars. |
| `/api/llm/summary` always 500 | `DASHSCOPE_API_KEY` not set (or invalid). Expected behavior. |
| Open Library download 500 | Restricted item or no PDF in archive. Try one of the listed "alternatives". |
| Old DB has schema errors | The migrations in `database.js` upgrade in place; if it still fails, delete `backend/data/library.db*` and restart. |

---

## 10. Verifying the Rebuild

The lead agent should have placed test logs at `ai-rebuild/test-pack/results/`:

| Log | What passed |
|---|---|
| `M2.log` | Auth + user smoke (A1–A8) |
| `M3.log` | Phase-1 books + Phase-2 borrowing + bookmarks/highlights |
| `M4.log` | Notifications, server wiring |
| `M5.log` | Reviews, requests, history, stats, llm, librarian routes |
| `M8.log` | Playwright suite (auth, student, author, librarian, crash-recovery) |
| `release.log` | Final negative + smoke replay |

Open each log; the last line of each should be `ALL GREEN` (the smoke scripts print this on full pass).

---

## 11. Optional overrides

The rebuild ships with defaults for every choice. The full list of items the original author **may** override is in [`14_human_inputs_required.md`](14_human_inputs_required.md). You can ignore that file for the acceptance smoke; visit it only if the rubric explicitly asks for a different behavior than what §6 demonstrates.

The only setting you typically change is `JWT_SECRET` in `backend/.env` (§3) — already handled by the one-glance quick-start.

---

## 12. License

MIT — for educational and personal use.
