# BiblioVault — E-Book Library Management System

Full-stack e-book library system rebuilt from a reproducibility artifact pack.

## Quick Start

```bash
# 1. Install dependencies
( cd backend  && npm install )
( cd frontend && npm install )

# 2. Configure (copy .env.example, edit backend/.env with your JWT_SECRET)
cp backend/.env.example backend/.env

# 3. Seed demo accounts
( cd backend && node seed_dummy_users.js )

# 4. Run
( cd backend  && npm start )      # Terminal 1 — http://localhost:8000
( cd frontend && npm run dev )    # Terminal 2 — http://localhost:3000
```

Open http://localhost:3000.

**Windows**: run `start.bat` from the project root to open both servers.

## Demo Accounts

| Username | Password | Role |
|---|---|---|
| `student_demo` | `Student@123` | Student |
| `staff_demo` | `Staff@1234` | Staff |
| `author_demo` | `Author@1234` | Author |
| `librarian_demo` | `Librarian@1` | Librarian |

## Roles & Portals

| Role | Path | Highlights |
|---|---|---|
| Student / Staff | `/student` | Browse, multi-borrow (up to 5), PDF reader with bookmarks & highlights, reading history & insights, book requests, notifications, profile |
| Author | `/author` | Publish (with cover + AI summary), drafts auto-save every 3 s, submissions list, edit/delete (two-phase), stats with sentiment chart, reply to reviews |
| Librarian | `/librarian` | Approve/reject (bulk), preview file, manage published books with version history, fulfill student requests via Open Library or manual upload, manage users (incl. bulk + deactivate), borrow records + CSV export, moderate flagged reviews, send announcements |

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | >= 18 (recommend 20 LTS) |
| npm | >= 8 |

## File Layout

```
backend/
  server.js      database.js      seed_dummy_users.js
  .env / .env.example
  middleware/auth.js
  routes/        (auth, books, users, notifications, recovery,
                  reviews, requests, history, stats, librarian, llm)
  services/      (llm, openlibrary, pdfExtract)
  data/library.db  (auto-created)
  uploads/        (books/, covers/, avatars/)
frontend/
  vite.config.js
  src/  App.jsx, main.jsx, context/AuthContext.jsx, utils/api.js
        pages/  (Login, Register, Student, Author, Librarian)
        components/  (Sidebar, BookModal, PDFReader, QuickReview,
                      NotificationBoard, ProfileEditor, CrashRecovery,
                      StarRating, ReviewSection, AuthorReviews, AuthorStats,
                      BookRequests, ManageRequests, ManagePublishedBooks,
                      ReadingHistory, DownloadedStats)
        styles/global.css
start.bat / stop.bat / status.bat
```

## Acceptance Smoke

Run these checks to verify the system:

1. **Health**: `curl http://localhost:8000/api/health` -> `{"status":"ok","timestamp":"..."}`
2. **Auth**: Register a new student at `/register`, then login -> lands on `/student`
3. **Seed a book**: Login as `librarian_demo`, Manage Books -> Add New Book
4. **Borrow**: Login as `student_demo`, Browse -> click book -> Borrow
5. **Approval flow**: Login as `author_demo`, publish a book; as librarian, approve it
6. **Notifications**: Check each portal's Notifications tab
7. **Crash recovery**: Login -> navigate to a non-default tab -> refresh (Ctrl+R) -> active tab restored

## Environment Variables

`backend/.env`:

```
PORT=8000
JWT_SECRET=<your-random-64-char-hex>
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
DASHSCOPE_API_KEY=        # optional — LLM features degrade gracefully without it
INTERNET_ARCHIVE_AUTH=    # optional
```

Without `DASHSCOPE_API_KEY`: summary endpoint returns 500 with clear message; sentiment defaults to "neutral" — all other features work normally.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE :8000` | Another process holds the port. `stop.bat` or `taskkill /F /IM node.exe` |
| Frontend shows blank page | Backend not running, or vite proxy misconfigured |
| Login returns 403 "deactivated" | A librarian flagged the user. Toggle active in Manage Users |
| `/api/llm/summary` always 500 | `DASHSCOPE_API_KEY` not set. Expected behavior |
| Old DB has schema errors | Delete `backend/data/library.db*` and restart |

For the full verification guide see `ai-rebuild/12_rebuild_readme.md`.

## License

MIT — for educational and personal use.
