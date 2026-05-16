# 02 · Normalized Requirements

> **STATUS: SUPPORTING.** Provides stable `P{n}-T{n}-AREA-nnn` IDs referenced by `08_traceability_matrix.md`. The canonical rubric text lives in [`16_full_requirements_verbatim.md`](16_full_requirements_verbatim.md), and the binding acceptance criteria are in [`17_acceptance_checklist.md`](17_acceptance_checklist.md). If anything below conflicts with 16, file 16 wins.

> Every requirement has a stable ID: `P{phase}-T{task}-{AREA}-{nnn}`. The traceability matrix ([`08_traceability_matrix.md`](08_traceability_matrix.md)) maps each ID to code locations, screens, and tests.
>
> **MoSCoW**: `MUST` = required for SC pass · `SHOULD` = required for full credit · `COULD` = nice-to-have, implement after MUSTs · `WON'T` = explicitly out of scope.

These requirements are reverse-engineered from the reference implementation in this repository. If a coursework rubric differs in wording, prefer the rubric — but verify behavior against this document.

---

## Phase 1 — Core (P1)

### T1 · Registration & Login (`REG` / `LOG`)

| ID | Pri | Requirement |
|---|---|---|
| P1-T1-REG-001 | MUST | Unified registration form supports all four roles: `student`, `staff`, `author`, `librarian`. |
| P1-T1-REG-002 | MUST | Username unique across all roles; min 3 chars; `^[a-zA-Z0-9_]+$`. |
| P1-T1-REG-003 | MUST | Password ≥8 chars and must contain ≥1 upper, ≥1 lower, ≥1 digit, ≥1 special (`!@#$%^&*(),.?":{}|<>`). |
| P1-T1-REG-004 | MUST | Author registration may include `bio`. Librarian registration may include `employee_id`. Both are optional. |
| P1-T1-REG-005 | MUST | Server hashes password with bcryptjs cost 12; never stores plaintext. |
| P1-T1-REG-006 | SHOULD | Successful registration notifies all librarians via in-app notification. |
| P1-T1-LOG-007 | MUST | `POST /api/auth/login` accepts `{username,password}`, returns `{token, user}`; JWT TTL 24h. |
| P1-T1-LOG-008 | MUST | Deactivated accounts (`users.active=0`) cannot log in; server returns 403. |
| P1-T1-LOG-009 | SHOULD | On successful login, server stamps `users.last_login = CURRENT_TIMESTAMP`. |
| P1-T1-LOG-010 | MUST | After login, frontend routes student/staff → `/student`, author → `/author`, librarian → `/librarian`. |
| P1-T1-LOG-011 | MUST | `ProtectedRoute` blocks access to a portal that doesn't match the user's role and redirects to `/portal`. |
| P1-T1-LOG-012 | MUST | 401 from any non-`/auth/`, non-`/recovery/` endpoint forces logout and redirect to `/login`. |

### T2 · Book Browsing & Borrowing (`BOOK` / `BORROW`)

| ID | Pri | Requirement |
|---|---|---|
| P1-T2-BOOK-001 | MUST | `GET /api/books` returns all `status='approved'` books, ordered by `publish_date DESC`. |
| P1-T2-BOOK-002 | MUST | Student/staff browse view filters by title/author/genre/availability/publish date (frontend-side OK). |
| P1-T2-BOOK-003 | MUST | A book card shows title, author, genre(s), availability, cover thumbnail; clicking opens a modal with full description and a borrow CTA. |
| P1-T2-BORROW-004 | MUST | `POST /api/books/:id/borrow` requires student/staff role; accepts `duration_days` (1–14) OR `duration_seconds` (10–300). Sets `borrow_records.status='active'`, `books.availability='borrowed'`, increments `times_borrowed`. |
| P1-T2-BORROW-005 | MUST | Borrow limit = 5 active borrows per user. Server returns 400 when exceeded. |
| P1-T2-BORROW-006 | MUST | User cannot have two simultaneous active borrows of the same book. |
| P1-T2-BORROW-007 | MUST | `POST /api/books/:id/return` flips `borrow_records.status='returned'`, sets `return_date`, restores book to `available`, archives related due/auto-return notifications. |
| P1-T2-BORROW-008 | SHOULD | UI shows due date and overdue badge. |

### T3 · Author Submissions (`SUB`)

| ID | Pri | Requirement |
|---|---|---|
| P1-T3-SUB-001 | MUST | Author can submit a new book: title, genre(s), description (≥20 chars), file (PDF/TXT/DOC/DOCX, ≤50 MB). |
| P1-T3-SUB-002 | SHOULD | Author can attach a cover image (JPG/PNG, ≤2 MB). |
| P1-T3-SUB-003 | MUST | On submit, book is inserted with `status='pending'`; librarians receive a `new_submission` notification. |
| P1-T3-SUB-004 | MUST | Author sees own submissions list with status badges (`pending`, `approved`, `rejected`, `pending_deletion`). |

### T4 · Librarian Approval (`APP`)

| ID | Pri | Requirement |
|---|---|---|
| P1-T4-APP-001 | MUST | Librarian sees pending submissions list with sortable/filterable columns (title, author, genre, status, date range). |
| P1-T4-APP-002 | MUST | Approve: sets `status='approved'`, `availability='available'`, `publish_date=now()`. Notifies author. |
| P1-T4-APP-003 | MUST | Reject: sets `status='rejected'`, stores optional `rejection_reason`. Notifies author. |
| P1-T4-APP-004 | SHOULD | Librarian can preview the uploaded book file before deciding. |
| P1-T4-APP-005 | SHOULD | Bulk approve/reject across selected pending books. |

---

## Phase 2 — Extended (P2)

### T1 · PDF Reader, Bookmarks & Highlights (`READ` / `BM` / `HL`)

| ID | Pri | Requirement |
|---|---|---|
| P2-T1-READ-001 | MUST | In-browser PDF reader using pdfjs-dist; opens any approved book the user has borrowed (or any role can view via `/api/books/view/:id`). |
| P2-T1-READ-002 | SHOULD | Reader supports zoom, page navigation, jump-to-page, and reading-progress tracking (`reading_progress` table). |
| P2-T1-BM-003 | MUST | User can add page-level bookmarks with optional label; list, navigate, delete from reader panel. |
| P2-T1-HL-004 | MUST | User can add text highlights with chosen color (default `#c9a84c`); list, delete from reader panel. |
| P2-T1-READ-005 | COULD | "Quick Review" mode (first N pages only) accessible without borrowing — endpoint `/api/books/quick-review/:id` exists. |

### T2 · Multi-Borrow, Recommendations, Auto-Return (`MULTI` / `REC` / `AR`)

| ID | Pri | Requirement |
|---|---|---|
| P2-T2-MULTI-001 | MUST | Select multiple available books and borrow in one action via `POST /api/books/bulk-borrow`. Respects the 5-book limit (rejects whole batch if it would exceed). |
| P2-T2-MULTI-002 | SHOULD | Confirmation dialog shows due date before committing. |
| P2-T2-REC-003 | MUST | `GET /api/books/recommendations` returns top 3 by `times_borrowed`. |
| P2-T2-AR-004 | MUST | Overdue active borrows are auto-returned (status=returned, return_date=now, book→available) and the user gets an `auto_return` urgent notification. Triggered lazily on hits to `/api/books/borrow-records`, `/api/books/my-borrows`, `/api/books/:id/borrow`, `/api/history`, `/api/notifications`. |
| P2-T2-AR-005 | MUST | Due-date reminder: books due within 24h generate a one-shot `due_reminder` notification per book per day. |

### T3 · Notifications (`NOTIF`)

| ID | Pri | Requirement |
|---|---|---|
| P2-T3-NOTIF-001 | MUST | Every portal exposes a Notifications tab listing items for the current user. |
| P2-T3-NOTIF-002 | MUST | Filters: category, priority, type, search across title+message, archived toggle. |
| P2-T3-NOTIF-003 | MUST | Per-item: mark-read, archive, delete. Bulk: mark-all-read. |
| P2-T3-NOTIF-004 | MUST | Unread count is exposed via `GET /api/notifications/unread-count`. |
| P2-T3-NOTIF-005 | SHOULD | Librarian can broadcast an announcement to all users or to a specific role. |
| P2-T3-NOTIF-006 | MUST | Notification types include `due_reminder`, `auto_return`, `approval`, `rejection`, `announcement`, `new_submission`, `user_update`, `new_request`, `request_rejected`, `request_fulfilled`, `book_deleted`, `book_edited`, `new_review`, `review_reply`, `review_flag`, `similar_book_added`, `delete_request`. |

### T4 · Profile & Password Management (`PROF`)

| ID | Pri | Requirement |
|---|---|---|
| P2-T4-PROF-001 | MUST | All users can edit profile (full_name; bio for authors; employee_id for librarians) via `PUT /api/users/profile`. Requires `current_password` re-auth. |
| P2-T4-PROF-002 | MUST | Change password via `PUT /api/users/password` with strength validation; current password required. |
| P2-T4-PROF-003 | MUST | Upload profile picture (JPG/PNG, ≤5 MB) via `POST /api/users/profile-picture`. Old image is deleted from disk. |
| P2-T4-PROF-004 | SHOULD | Name change notifies other librarians. |

### T5 · User Management (`USR`)

| ID | Pri | Requirement |
|---|---|---|
| P2-T5-USR-001 | MUST | Librarian lists all users with role + name search filters. |
| P2-T5-USR-002 | MUST | Librarian can create new users in any role. |
| P2-T5-USR-003 | MUST | Librarian can edit user (full_name, role, bio, employee_id). |
| P2-T5-USR-004 | MUST | Librarian can toggle `users.active`. Cannot deactivate self. |
| P2-T5-USR-005 | SHOULD | Bulk actions: deactivate, activate, change-role (via `POST /api/librarian/users/bulk-action`). |

### T6 · Borrow Records & CSV Export (`REC`)

| ID | Pri | Requirement |
|---|---|---|
| P2-T6-REC-001 | MUST | Librarian sees all borrow records with search (title/borrower) and filters (status, date range). |
| P2-T6-REC-002 | MUST | Export borrow records as CSV via `GET /api/books/borrow-records/export`. |

### T7 · Author Edit/Delete & Drafts (`EDIT` / `DRAFT`)

| ID | Pri | Requirement |
|---|---|---|
| P2-T7-EDIT-001 | MUST | Author can edit own book if status is `pending` OR (`approved` AND not currently borrowed). Editing an approved book reverts it to `pending` and re-notifies librarians. |
| P2-T7-DEL-002 | MUST | Author "deletion" sets status to `pending_deletion` and notifies librarians. Blocked if the book is currently borrowed. |
| P2-T7-DEL-003 | MUST | Librarian approves (hard delete + cascade) or rejects (back to `approved`). |
| P2-T7-DEL-004 | SHOULD | Author bulk delete via `POST /api/books/bulk-delete`. |
| P2-T7-DRAFT-005 | MUST | Auto-save book submission as a draft every 3 s of inactivity; resume from the Drafts tab. |

### T8 · Crash Recovery (`CR`)

| ID | Pri | Requirement |
|---|---|---|
| P2-T8-CR-001 | MUST | Frontend saves a per-user UI snapshot to localStorage every 5s and on `beforeunload`. |
| P2-T8-CR-002 | MUST | After a true crash (or `POST /api/shutdown` from CrashTestButton), the next login restores the snapshot. |
| P2-T8-CR-003 | MUST | Manual close (no flags) → record is cleared on the next fresh open. |
| P2-T8-CR-004 | MUST | Page refresh preserves the record and silently restores. |
| P2-T8-CR-005 | MUST | "Crash (No Recovery)" button wipes the record and shuts down — next login starts fresh. |
| P2-T8-CR-006 | SHOULD | Server-side mirror exists (`crash_recovery` table + `/api/recovery/save|state|clear`) but client primarily reads from localStorage. |

---

## Phase 3 — Advanced (P3)

### T1 · Reviews & Ratings (`REV`)

| ID | Pri | Requirement |
|---|---|---|
| P3-T1-REV-001 | MUST | A user can post one review per (user, book) for any book they have ever borrowed. Rating 1–5, optional text, anonymous flag. |
| P3-T1-REV-002 | MUST | Reviews list with aggregates (avg rating, count, 1–5 distribution); sortable by `recent` / `helpful`. |
| P3-T1-REV-003 | MUST | Author can reply to reviews on their own books. |
| P3-T1-REV-004 | MUST | Author or librarian can flag a review for moderation (`flag_pending=1`). Librarian accepts (`flagged=1`, hidden) or rejects. |
| P3-T1-REV-005 | SHOULD | Sentiment classification (positive/neutral/negative) via LLM, stored on `reviews.sentiment`. Fallback `'neutral'` on error. |
| P3-T1-REV-006 | COULD | Helpful upvote (`POST /api/reviews/:id/helpful`) — current impl is monotonic increment. |

### T2 · Reading History, Insights & Achievements (`HIST` / `INS` / `ACH`)

| ID | Pri | Requirement |
|---|---|---|
| P3-T2-HIST-001 | MUST | Reading history list per user with filters (search, genre, date range, status) and per-row progress %. |
| P3-T2-INS-002 | MUST | Insights dashboard: total borrows, avg duration, by-genre breakdown, by-month line, total seconds read. |
| P3-T2-ACH-003 | SHOULD | 7-badge achievement system (first_borrow, bookworm_5, scholar_10, librarian_25, explorer, critic, reviewer_pro). |
| P3-T2-HIST-004 | SHOULD | Export reading history as CSV or PDF (`?format=csv|pdf`). |
| P3-T2-INS-005 | MUST | `POST /api/history/progress` updates current_page / total_pages / seconds_read with cumulative seconds. |

### T3 · Book Requests + Open Library (`REQ` / `OL`)

| ID | Pri | Requirement |
|---|---|---|
| P3-T3-REQ-001 | MUST | Student/staff can request a new book (title, author, genre, reason). Stored in `book_requests`. |
| P3-T3-REQ-002 | SHOULD | Duplicate detection: warn but don't block when same title+author was already requested. |
| P3-T3-REQ-003 | MUST | Librarian sees all requests, can change priority, reject (with note), or fulfill. |
| P3-T3-OL-004 | SHOULD | Librarian can search Open Library for the requested book + 5–8 similar alternatives. |
| P3-T3-OL-005 | SHOULD | Librarian can download a chosen IA PDF + cover; the new book is auto-published to the catalog; request marked `fulfilled` with `fulfilled_book_id`. |
| P3-T3-OL-006 | COULD | Optional LLM-generated summary used as `description` when downloading. |
| P3-T3-REQ-007 | SHOULD | Librarian can manually upload a file to fulfill a request instead of using OL. |
| P3-T3-REQ-008 | COULD | Similar pending requests (same first word of title or same author) are notified that a similar book was added. |
| P3-T3-REQ-009 | SHOULD | Analytics endpoint: requests by status/genre/author + 30-day timeline. |

### T4 · Author Stats Dashboard (`STAT`)

| ID | Pri | Requirement |
|---|---|---|
| P3-T4-STAT-001 | MUST | Author dashboard shows per-book: status, times_borrowed, avg_rating, review_count, reads, seconds_read. |
| P3-T4-STAT-002 | MUST | Aggregates: total books, published books, total borrows, total reviews, overall rating, sentiment breakdown, 30-day borrow trend. |
| P3-T4-STAT-003 | SHOULD | Export author stats as CSV. |
| P3-T4-STAT-004 | SHOULD | Drafts excluded from stats; chart titled "Author Stats" (label per latest UI tweak). |

### T5 · Librarian Book Management (`MGT`)

| ID | Pri | Requirement |
|---|---|---|
| P3-T5-MGT-001 | MUST | `GET /api/librarian/books` lists every non-draft book with filters (search, status, author, genre). |
| P3-T5-MGT-002 | MUST | Librarian can edit any book (title, author, genre, description, file, cover). Each edit records a row in `book_versions` with JSON `changes`. |
| P3-T5-MGT-003 | MUST | Librarian can add a book directly (skipping author submission), optionally LLM-generated description. |
| P3-T5-MGT-004 | SHOULD | Librarian bulk-delete with full cascade (bookmarks, highlights, reviews, replies, progress, versions, borrow_records, downloaded_books, file on disk). |
| P3-T5-MGT-005 | SHOULD | Version history view per book. |

### T6 · LLM Integration (`LLM`)

| ID | Pri | Requirement |
|---|---|---|
| P3-T6-LLM-001 | MUST | `POST /api/llm/summary` (author or librarian only) returns an AI summary given `{title, author, genre, style, book_id?}`. Styles: `short`, `medium`, `detailed`. |
| P3-T6-LLM-002 | MUST | Sentiment classification used by reviews route; failures default to `'neutral'`. |
| P3-T6-LLM-003 | MUST | Without `DASHSCOPE_API_KEY`, the app continues to function: summary returns 500 with clear message, sentiment defaults to neutral, no crashes elsewhere. |

### T7 · Downloaded Books Stats (`DLS`)

| ID | Pri | Requirement |
|---|---|---|
| P3-T7-DLS-001 | SHOULD | Librarian sees all books added via OL or manual upload with per-book ratings and aggregate borrow counts. |
| P3-T7-DLS-002 | SHOULD | Breakdown by source (`open_library` vs `manual_upload`). |

---

## Cross-Cutting Non-Functional (NFR)

| ID | Pri | Requirement |
|---|---|---|
| NFR-PERF-001 | MUST | First page interactive on a modern laptop within 2 s on a clean dev server. |
| NFR-SEC-001 | MUST | Passwords never returned in any API response. JWT contains only id/username/role/full_name. |
| NFR-SEC-002 | MUST | All `/api/books/*`, `/api/users/*`, `/api/notifications/*` etc. require a valid Bearer JWT except `/api/auth/*`. |
| NFR-SEC-003 | MUST | Role-based authorization enforced server-side; client-side ProtectedRoute is defense-in-depth only. |
| NFR-SEC-004 | MUST | All SQL uses parameterized queries (better-sqlite3 `prepare(...).run(...)`); no string concatenation of user input into SQL. |
| NFR-SEC-005 | MUST | Uploaded files filtered by MIME type and size limits. |
| NFR-UX-001 | SHOULD | Dark academic theme: Cormorant Garamond (display), DM Sans (body), navy + gold + emerald/ruby accents. |
| NFR-UX-002 | SHOULD | Responsive layout works on tablet (≥768 px). |
| NFR-DATA-001 | MUST | SQLite uses WAL mode and `foreign_keys = ON`. |
| NFR-DATA-002 | MUST | All IDs are UUID v4 stored as `TEXT`. |

---

## Out of Scope (WON'T)

| ID | Item |
|---|---|
| WONT-001 | Production deployment, containers, hosted database |
| WONT-002 | OAuth, SSO, MFA |
| WONT-003 | Real email or SMS — only in-app notifications |
| WONT-004 | Payment, e-commerce |
| WONT-005 | Native mobile clients |
| WONT-006 | i18n / RTL languages |
| WONT-007 | Real-time push (WebSocket) — polling/refresh model |
