# 17 · Acceptance Checklist (Mandatory — One Item Per Line)

> Every item below is a binary PASS/FAIL check derived directly from [`16_full_requirements_verbatim.md`](16_full_requirements_verbatim.md). The Requirement Audit subagent (M10) walks this file and verifies each item against the running system. **The rebuild is NOT complete until every item is PASS.** No "skip" — if an item cannot pass, it is a BLOCKER and routes back to the owning subagent.
>
> Format: `REQ-<n>` · `<Phase>·<Task>` · `<verification method>` · `<requirement>` · `<owner>`
> Verification methods:
> - `API` — curl/HTTP request returns expected status + shape
> - `DB` — SQLite query returns expected row(s)
> - `UI` — Playwright MCP browser check
> - `CODE` — grep finds expected string/symbol in expected file
> - `FILE` — file exists at expected path

---

## Phase 1 — Main Features (P1-MAIN)

### Task 1 · Student/Staff

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-001 | UI | Register form has fields: username, full_name, password, role (student or staff). | SA-7 |
| REQ-002 | API | `POST /api/auth/register` rejects duplicate username with 409 + error message. | SA-3 |
| REQ-003 | API | `POST /api/auth/register` rejects weak password with 400 + error message. | SA-3 |
| REQ-004 | DB | `users.password_hash` is bcrypt (never plaintext) — `SELECT password_hash` starts with `$2`. | SA-3 |
| REQ-005 | UI | Registration shows success toast on success and error message on failure. | SA-7 |
| REQ-006 | UI | Login form has fields: username, password. | SA-7 |
| REQ-007 | API | `POST /api/auth/login` returns 401 on wrong password; 200 + token on success. | SA-3 |
| REQ-008 | UI | Login shows feedback on success and failure. | SA-7 |
| REQ-009 | UI | Browse Books tab lists approved books with: Title, Author, Publish Date, Availability, Summary. | SA-7+SA-8 |
| REQ-010 | UI | Borrow button checks availability, updates status, and shows confirmation. | SA-8 |
| REQ-011 | DB | After borrow, `books.availability='borrowed'` for the borrowed book. | SA-4 |

### Task 2 · Author

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-012 | UI | Author register form has: username, full_name, password, bio (optional). | SA-7 |
| REQ-013 | API | Author register stores bio in `users.bio`. | SA-3 |
| REQ-014 | UI | Author login form + feedback (same as Student). | SA-7 |
| REQ-015 | UI | Publish New Book form has: title, author_name (pre-filled with full_name), genre, description, file upload. | SA-7 |
| REQ-016 | API | Publish accepts PDF/TXT/DOC/DOCX up to 50 MB. | SA-4 |
| REQ-017 | DB | Submitted books inserted with `status='pending'`. | SA-4 |
| REQ-018 | UI | Confirmation shown after submission. | SA-8 |

### Task 3 · Librarian

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-019 | UI | Librarian register form has: username, full_name, password, employee_id (optional). | SA-7 |
| REQ-020 | API | Librarian register stores employee_id in `users.employee_id`. | SA-3 |
| REQ-021 | UI | Librarian login form + feedback. | SA-7 |
| REQ-022 | UI | Pending Submissions screen lists: Title, Author Username, Author Full Name, Genre, Submitted Date, Status. | SA-7+SA-8 |
| REQ-023 | UI | Approve/Reject buttons show **confirmation dialog** before finalizing. | SA-8 |
| REQ-024 | API | Approve sets `status='approved'`; Reject sets `status='rejected'`. | SA-4 |
| REQ-025 | UI | Status update reflects without page reload; author receives in-app notification. | SA-6+SA-8 |

---

## Phase 1 — Nice-to-Have (P1-NTH)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-026 | API | Username uniqueness enforced **across all 4 user types**. | SA-3 |
| REQ-027 | UI | Empty full_name on register shows error. | SA-7 |
| REQ-028 | UI | Password strength validation: 8+ chars, upper, lower, digit, special. Error message for weak/empty. | SA-7 |
| REQ-029 | API | Login error message when user belongs to a different role than expected (when role-context login is implemented; otherwise: username mismatch returns clear error). | SA-3 |
| REQ-030 | UI | Book modal shows full summary; if summary > N chars, has "Quick Read" popup. | SA-8 |
| REQ-031 | API | `GET /api/books/recommendations` returns books based on borrow history or popularity. | SA-4 |
| REQ-032 | UI | Borrow form enforces max 14 days, min > 0; shows error otherwise. | SA-8 |
| REQ-033 | UI | Borrow confirmation dialog shows: selected book(s), duration, due date, warnings. | SA-8 |
| REQ-034 | UI | Book availability shown with red/black color or equivalent visual indicator. | SA-8 |
| REQ-035 | UI | Publish form supports **multiple genre selection** from predefined list. | SA-8 |
| REQ-036 | API | Author publish form auto-saves draft to `books` with `status='draft'` (every ~3s). | SA-4+SA-8 |
| REQ-037 | UI | Librarian Pending Submissions has search + filter (title, author, genre, submitted date, status). | SA-8 |
| REQ-038 | UI | Librarian can bulk approve/reject pending submissions with confirmation. | SA-7+SA-8 |

---

## Phase 2 — Main Features (P2-MAIN)

### Task 1.5 Borrowed Book Screen

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-039 | UI | "My Borrows" tab lists currently borrowed books with read button. | SA-7+SA-8 |
| REQ-040 | UI | "Read" opens in-browser PDF reader (pdfjs-dist). | SA-8 |
| REQ-041 | UI | PDF reader supports **bookmark** create/list/delete; saved server-side. | SA-8 |
| REQ-042 | UI | PDF reader supports **text highlight** create/list/delete; saved server-side. | SA-8 |
| REQ-043 | API | Auto-return on expiry: borrow_record.status flips to 'returned', book.availability='available'. | SA-4 |
| REQ-044 | UI | Self-return button works before due date. | SA-8 |

### Task 1.6 Manage Profile (Student/Staff)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-045 | UI | Profile screen allows editing Full Name and Password. | SA-8 |
| REQ-046 | API | Password change validates new password strength. | SA-3 |
| REQ-047 | UI | Success/failure feedback shown. | SA-8 |

### Task 1.7 Notification Board (Student/Staff)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-048 | UI | Notification tab lists items with type, message, timestamp. | SA-8 |
| REQ-049 | DB | Book due reminder notifications generated within 24h of due_date. | SA-6 |
| REQ-050 | DB | Book deletion notice sent **only to users who borrowed that book**. | SA-4+SA-6 |
| REQ-051 | UI | Notifications are clear, timestamped, categorized by type badge. | SA-8 |

### Task 2.4 Published Book Screen (Author)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-052 | UI | Author "My Submissions" lists own books with Title, Genre, Status. | SA-8 |
| REQ-053 | UI | Author can edit own books (title, description, genre, cover). | SA-8 |
| REQ-054 | UI | Author can delete own books with confirmation dialog. | SA-8 |
| REQ-055 | API | Author DELETE on own book sets `status='pending_deletion'` (two-phase). | SA-4 |

### Task 2.5 Manage Profile (Author)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-056 | UI | Author profile screen edits Full Name, Password, Bio. | SA-8 |
| REQ-057 | UI | Validation + success/failure feedback. | SA-8 |

### Task 2.6 Notification Board (Author)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-058 | UI | Author Notifications tab shows approval/rejection updates. | SA-8 |

### Task 3.4 Manage All Users

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-059 | UI | Librarian Manage Users lists all users with view/edit/deactivate actions. | SA-7+SA-8 |
| REQ-060 | API | Toggle-active endpoint flips `users.is_active`. | SA-3 |
| REQ-061 | UI | Deactivate has confirmation dialog. | SA-8 |

### Task 3.5 Manage Own Profile (Librarian)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-062 | UI | Librarian profile screen edits Full Name, Password, Employee ID. | SA-8 |
| REQ-063 | UI | Validation + feedback. | SA-8 |

### Task 3.6 Borrowed Books Record

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-064 | UI | Librarian Borrow Records tab shows: Book Title, Borrower Username, Borrow Date, Return Date, Status. | SA-7+SA-8 |
| REQ-065 | UI | Filtering + search work. | SA-8 |

### Task 3.7 Notification Board (Librarian)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-066 | UI | Librarian Notifications shows: new submissions, user account updates, announcements. | SA-8 |

---

## Phase 2 — Nice-to-Have (P2-NTH)

### Persistent Crash Recovery (CRITICAL)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-067 | CODE | `frontend/src/components/CrashRecovery.jsx` exports `CrashTestButton`. | SA-8 |
| REQ-068 | API | `POST /api/shutdown` exists; calls `process.exit(0)`; no auth required. | SA-6 |
| REQ-069 | UI | Crash Test button visible in sidebar of all 3 portals. | SA-8 |
| REQ-070 | UI | After page refresh (F5), active tab and state are restored. | SA-7+SA-8 |
| REQ-071 | UI | After crash-test → backend restart → relogin, state restored with toast: /Session recovered after crash test\|Session not recovered/. | SA-7+SA-8 |
| REQ-072 | CODE | localStorage keys are exactly: `bv_session_<userId>`, `bv_should_clear`, `bv_crash_test`, `bv_crash_no_recovery`. | SA-8 |
| REQ-073 | CODE | sessionStorage key is exactly: `bv_is_refresh`. | SA-8 |

### Task 1.3 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-074 | UI | Search and filter books: by title, author; filter by genre, publish date, availability. | SA-8 |
| REQ-075 | API | Quick Review endpoint exposes first N pages for unborrowed books. | SA-4 |

### Task 1.4 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-076 | UI | Multi-select borrowing of multiple books at once. | SA-8 |
| REQ-077 | API | Borrow limit = 5 books per user; 6th borrow returns 400. | SA-4 |

### Task 2.3 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-078 | UI | Cover image upload during publication; JPG/PNG validated; size ≤ 2 MB. | SA-4+SA-8 |
| REQ-079 | UI | Book preview before final submit (formatted summary of title, genre, description). | SA-8 |

### Task 3.3 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-080 | UI | Librarian can preview/download uploaded book file from the approval screen. | SA-8 |
| REQ-081 | UI+API | Reject submission can include a `rejection_reason`; stored and shown to author. | SA-4+SA-8 |

### Task 1.5 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-082 | DB | Return reminder warning generated before due date (lazy on /notifications hit). | SA-6 |
| REQ-083 | DB | Auto-return notification generated when book is auto-returned. | SA-4+SA-6 |

### Task 1.6 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-084 | UI | Profile picture upload with format (JPG/PNG) + size (≤5 MB) validation. | SA-3+SA-8 |
| REQ-085 | UI | Password re-authentication prompted before any profile change is saved. | SA-8 |

### Task 1.7 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-086 | UI | Priority notifications (auto-return, book deletion) appear at top of list. | SA-8 |
| REQ-087 | UI+API | Archive notification action; archived items hidden from default list. | SA-6+SA-8 |

### Task 2.4 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-088 | UI+API | Edit allowed only if book is pending OR not borrowed. Server enforces. | SA-4 |
| REQ-089 | UI | Bulk delete with confirmation dialog. | SA-8 |

### Task 2.5 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-090 | UI | Password strength meter shows real-time feedback. | SA-8 |
| REQ-091 | UI | Auto logout after password change. | SA-8 |

### Task 2.6 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-092 | UI | Unread notification counter visible. | SA-8 |
| REQ-093 | UI | Notification search + filter by category. | SA-8 |

### Task 3.4 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-094 | UI | Role-based filter (student/staff/author/librarian). | SA-8 |
| REQ-095 | UI+API | "Add New User" allows librarian to create any role. | SA-3+SA-8 |

### Task 3.5 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-096 | UI | Librarian profile picture upload. | SA-8 |
| REQ-097 | UI | Password strength meter (librarian profile). | SA-8 |

### Task 3.6 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-098 | UI | Advanced filters: overdue, active, returned. | SA-8 |
| REQ-099 | API | CSV/Excel export of borrow records (`/api/books/borrow-records/export`). | SA-4 |

### Task 3.7 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-100 | UI | Priority notifications at top (submissions, profile updates, special requests). | SA-8 |
| REQ-101 | UI | Mark as read + delete notification actions. | SA-6+SA-8 |

---

## Phase 3 — Main Features (P3-MAIN)

### Task 1.8 Reading History

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-102 | UI | Reading History tab shows: Book Title, Author, Borrow Date, Return Date, Reading Duration. | SA-5+SA-8 |
| REQ-103 | UI | Filter + search (date range, author, genre). | SA-8 |
| REQ-104 | API | Reading progress saved automatically (POST /api/history/progress). | SA-5 |

### Task 1.9 Review/Rate Books

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-105 | UI | User can submit written review + 1–5 star rating for a borrowed book. | SA-5+SA-8 |
| REQ-106 | API | Review allowed only if user has borrowed the book (server returns 403 otherwise). | SA-5 |
| REQ-107 | UI | Average rating + reviews displayed on book screen (visible to all users). | SA-8 |
| REQ-108 | DB | Reviews stored with `UNIQUE(user_id, book_id)`. | SA-2+SA-5 |

### Task 1.10 Request New Book

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-109 | UI | Form to request a book: title, author, genre, reason. | SA-5+SA-8 |
| REQ-110 | API | `POST /api/requests` creates a pending request; librarians notified. | SA-5+SA-6 |
| REQ-111 | UI | Confirmation feedback on submit. | SA-8 |
| REQ-112 | API+UI | Notification sent to requester once librarian fulfills the request. | SA-5+SA-6 |

### Task 2.7 LLM Book Summary

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-113 | UI | "Generate Summary" button on publish form calls `/api/llm/summary`. | SA-5+SA-8 |
| REQ-114 | UI | Authors can edit the generated summary before final submission. | SA-8 |
| REQ-115 | API | LLM service returns 500 with clear message if `DASHSCOPE_API_KEY` missing (graceful degradation, no crash). | SA-5 |

### Task 2.8 View Stats

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-116 | UI | Author Stats tab shows reads, average ratings, reviews count, borrow counts. | SA-5+SA-8 |
| REQ-117 | UI | **Bar chart AND pie chart** rendered (recharts). | SA-8 |

### Task 2.9 Review & Feedback Handling

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-118 | UI | Author can view all reviews on own books. | SA-8 |
| REQ-119 | UI+API | Author can reply to a review; reply stored and displayed. | SA-5+SA-8 |
| REQ-120 | UI+API | Author can flag inappropriate reviews. | SA-5+SA-8 |
| REQ-121 | API+UI | Replying to a review sends a notification to the reviewer. | SA-5+SA-6 |

### Task 3.8 Manage Published Books

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-122 | UI | Librarian Manage Published Books screen — list + edit + add. | SA-7+SA-8 |
| REQ-123 | UI+API | Librarian can add a new book with: Title, Author Names, Genre, Description (LLM-generated), File, Cover. | SA-5+SA-8 |
| REQ-124 | UI | Validation + confirmation dialogs on edits and additions. | SA-8 |

### Task 3.9 Manage Book Requests & Download

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-125 | UI | Librarian Manage Requests screen — approve/reject. | SA-7+SA-8 |
| REQ-126 | API | Open Library / Internet Archive search + download integrated. | SA-5 |
| REQ-127 | API | If downloaded book has no summary, LLM generates one. | SA-5 |
| REQ-128 | UI | Confirmation feedback on each action. | SA-8 |

---

## Phase 3 — Nice-to-Have (P3-NTH)

### Task 1.5 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-129 | UI+API | Partial return: select one or multiple borrowed books to return. | SA-4+SA-8 |
| REQ-130 | UI | Reading screen auto-closes when borrowing period expires. | SA-8 |
| REQ-131 | UI | Search + filter borrowed books (by title, author, genre, publish date, availability). | SA-8 |

### Task 1.6 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-132 | UI | Password re-auth on profile changes. | SA-8 |
| REQ-133 | UI | Auto logout on password change. | SA-8 |

### Task 1.7 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-134 | UI | Unread notification counter (student). | SA-8 |
| REQ-135 | UI | Search + filter notifications by category. | SA-8 |

### Task 2.4 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-136 | API | Delete only if pending OR not borrowed (server enforces). | SA-4 |
| REQ-137 | UI | Authors can read their own books (published and unpublished). | SA-8 |

### Task 2.5 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-138 | UI | Author profile picture upload. | SA-8 |
| REQ-139 | UI | Password strength meter (author profile). | SA-8 |

### Task 2.6 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-140 | UI | Priority notifications at top (rejection, deletion by librarian). | SA-8 |
| REQ-141 | UI | Archive notifications (author). | SA-8 |

### Task 3.4 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-142 | UI+API | Activity Log: last login, no. of borrowed books per user. | SA-3+SA-8 |
| REQ-143 | UI+API | Bulk Account Actions: deactivate/update multiple at once. | SA-3+SA-8 |
| REQ-144 | UI | Manage other librarian accounts. | SA-8 |

### Task 3.5 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-145 | UI | Password re-auth on librarian profile changes. | SA-8 |
| REQ-146 | UI | Auto logout on password change (librarian). | SA-8 |

### Task 3.6 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-147 | UI | Overdue books shown in red. | SA-8 |

### Task 3.7 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-148 | UI | Archive notifications (librarian). | SA-8 |
| REQ-149 | UI | Search + filter notifications by type, date, urgency. | SA-8 |

### Task 1.8 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-150 | API+UI | Export reading history as PDF and CSV. | SA-5 |
| REQ-151 | UI | Graphical insights: charts of reading trends (genres, average duration). | SA-5+SA-8 |
| REQ-152 | UI | Bookmark integration with reading history (show last bookmarked page). | SA-8 |
| REQ-153 | UI+API | Achievements / badges (e.g., "Read 10 books"). | SA-5+SA-8 |

### Task 1.9 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-154 | UI+API | Anonymous reviews option. | SA-5+SA-8 |
| REQ-155 | UI | Review sorting (most recent, most helpful). | SA-8 |

### Task 1.10 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-156 | UI | Request tracking (Pending / Approved / Rejected). | SA-8 |
| REQ-157 | API+UI | Duplicate request detection — notify user if already requested. | SA-5+SA-8 |
| REQ-158 | UI+API | Librarian can mark urgent (priority) requests. | SA-5+SA-8 |
| REQ-159 | UI | Request history visible to user. | SA-8 |

### Task 2.7 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-160 | UI+API | Multiple summary styles: short / medium / detailed. | SA-5+SA-8 |

### Task 2.8 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-161 | UI | Customizable dashboard (toggle which metrics display). | SA-8 |
| REQ-162 | UI+API | Download stats reports in PDF and Excel. | SA-5 |
| REQ-163 | UI | Trend analysis: weekly + monthly borrowing trends. | SA-5+SA-8 |

### Task 2.9 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-164 | API | Sentiment analysis classifies reviews positive/neutral/negative. | SA-5 |
| REQ-165 | UI | Reply templates available. | SA-8 |
| REQ-166 | UI | Feedback analytics: aggregated sentiment + rating stats. | SA-8 |

### Task 3.8 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-167 | UI+API | Bulk edit/delete of published books. | SA-5+SA-8 |
| REQ-168 | API+DB | Version history of book detail changes stored. | SA-5 |
| REQ-169 | UI | Advanced filters (genre, author, approval status). | SA-8 |

### Task 3.9 enhancements

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-170 | UI | Request prioritization (urgency / popularity highlight). | SA-8 |
| REQ-171 | UI+API | Auto-suggest alternatives if requested book unavailable. | SA-5+SA-8 |
| REQ-172 | API+UI | Notify users when similar-title books are uploaded by authors. | SA-5+SA-6 |
| REQ-173 | UI | Download progress indicator while pulling from Open Library. | SA-8 |
| REQ-174 | UI | Request analytics (most-requested genres/authors). | SA-5+SA-8 |
| REQ-175 | UI+API | Downloaded book stats screen (mirror of author stats — librarian view). | SA-5+SA-8 |

---

## Non-functional / Cross-cutting (NFR)

| ID | Verify | Requirement | Owner |
|---|---|---|---|
| REQ-176 | UI | Consistent navigation (sidebar) across all 3 portals. | SA-7 |
| REQ-177 | UI | Responsive layout works at 1280×720 and 375×667 (mobile snapshot). | SA-7+SA-8 |
| REQ-178 | CODE | All passwords hashed with bcrypt cost 12; never logged in plaintext. | SA-3 |
| REQ-179 | CODE | All SQL uses prepared statements (grep for `db.prepare`). | SA-2+SA-4+SA-5 |
| REQ-180 | FILE | README.md exists at project root with setup steps + run commands. | SA-1+SA-6 |
| REQ-181 | CODE | Each source file has at least one top-level comment explaining its purpose. | All SAs |
| REQ-182 | FILE | Project zips cleanly (no node_modules, no .env, no library.db). | SA-1 |

---

## Audit Procedure

The M10 Requirement Audit subagent (`ai-rebuild/prompts/subagent_requirement_audit.md`) walks this file **top-to-bottom** and for each REQ-* runs the indicated verification:

- **API** items: shell-out `curl` against `localhost:8000`.
- **DB** items: shell-out `sqlite3 backend/data/library.db "<query>"`.
- **UI** items: Playwright MCP tool calls (`mcp__playwright__browser_*`).
- **CODE** items: `Grep` for the named symbol/string in the named file.
- **FILE** items: `Glob` for the file path.

Each REQ-* check writes a row to `ai-rebuild/test-pack/results/requirement_audit.log`:
```
REQ-<n>: PASS  or  REQ-<n>: FAIL — <reason>
```

Final line: `ALL REQUIREMENTS PASS (182/182)` or `MISSING: <comma-separated REQ ids>`.

**The rebuild is NOT accepted until this log's final line is `ALL REQUIREMENTS PASS`.**
