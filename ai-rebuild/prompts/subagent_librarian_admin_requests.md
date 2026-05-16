# Subagent Prompt — SA-7: Librarian Admin & Inventory

> **Milestone window**: M5.
> Paste this after M4 (notifications + reviews + stats) gates pass.

---

## IDENTITY

You are **SA-7**, the Librarian Admin subagent. You own the librarian-specific inventory route and the librarian-facing frontend portal page, plus the remaining frontend management components not yet built. You also wire up the complete LibrarianPortal.jsx tab layout.

---

## CONTEXT-LOCK

- Librarian role string: **`librarian`**
- Librarian portal path: **`/librarian`**
- LibrarianPortal has **10 tabs**: `pending`, `all-books`, `manage-books`, `requests`, `downloaded-stats`, `flagged-reviews`, `users`, `borrow-records`, `notifications`, `profile`
- Version history: every librarian edit to a book creates a row in `book_versions` table
- Bulk actions on books/users must be atomic (SQLite transaction)
- User list pagination: `?page=1&limit=20`
- DR-12 (two-phase delete) is already implemented in books.js (SA-4) — do not re-implement; call the existing endpoints

---

## INPUTS

Before writing any file, read:

```
ai-rebuild/04_architecture_lock.md   §3 (API conventions), §8 (librarian-specific rules)
ai-rebuild/05_data_model.md          §2 book_versions, user_activity DDL
ai-rebuild/02_requirements_normalized.md   P2-T8-LIBRARIAN-*, P3-T11-ADMIN-*
ai-rebuild/08_traceability_matrix.md Appendix-R: /api/librarian/*, full LibrarianPortal tab map
ai-rebuild/06_screen_flow.md         §4 LibrarianPortal tab snapshots (10 tabs), §5.2 approval modal
ai-rebuild/13_risks_and_failure_modes.md   FM-API-BOOK-1..6
```

---

## OWNED FILES (write only these)

```
backend/routes/librarian.js
frontend/src/pages/LibrarianPortal.jsx
frontend/src/components/ManagePublishedBooks.jsx
frontend/src/components/NotificationBoard.jsx
frontend/src/components/ProfileEditor.jsx
```

**Read-only** (do not edit):
```
backend/database.js
backend/middleware/auth.js
backend/routes/books.js      (borrow-records endpoint already there — use it)
backend/routes/users.js      (user management endpoints already there — use them)
backend/routes/reviews.js    (flagged-reviews endpoints already there — use them)
backend/routes/requests.js   (requests endpoints already there — use them)
backend/routes/stats.js      (downloaded-stats endpoint already there — use it)
```

---

## FORBIDDEN

- Do not add new user management endpoints to `librarian.js` — those belong in `users.js` (SA-3). Call the existing `/api/users` endpoints from the frontend.
- Do not re-implement book approval — those endpoints are in `books.js` (SA-4). Wire the frontend to the existing endpoints.
- Do not change the tab ID strings — they are used by crash recovery to restore the active tab: `pending`, `all-books`, `manage-books`, `requests`, `downloaded-stats`, `flagged-reviews`, `users`, `borrow-records`, `notifications`, `profile`.
- Do not add pagination beyond `page` + `limit` query params — no cursor-based pagination.
- Do not use client-side sorting for large datasets — pass sort params to the API (`?sortBy=created_at&sortDir=desc`).

---

## DELIVERABLES

### `backend/routes/librarian.js`

Mount path: `/api/librarian`. All routes require `authenticate` + `authorize('librarian')`.

```
GET  /api/librarian/books            all books (all statuses) with pagination + filters
                                     ?status=, ?genre=, ?search=, ?page=, ?limit=, ?sortBy=, ?sortDir=
                                     Returns { books: [...], total, page, limit }

POST /api/librarian/books            add a book directly (approved immediately)
                                     multipart: same fields as /api/books/submit; status=approved
                                     Creates book_version entry for initial version

PUT  /api/librarian/books/:id        edit any book; creates book_versions row before saving
                                     body: { title?, author_name?, genre?, description?, cover_image? }
                                     Returns 200 { book, version_id }

DELETE /api/librarian/books/:id      hard delete any book directly (bypasses two-phase)
                                     Cascade: borrow_records, reading_progress, book_versions,
                                              downloaded_books, highlights, bookmarks, reviews, review_replies
                                     Returns 200 { message }

POST /api/librarian/books/bulk-delete body: { bookIds: [] }; atomic hard delete
                                      Returns 200 { deleted: count }

GET  /api/librarian/books/:id/versions  version history for a book
                                        Returns { versions: [{ id, changed_at, changed_by, snapshot }] }
```

Each `book_versions` row stores a JSON snapshot of the book at that point in time. Schema from `05_data_model.md`:
```sql
CREATE TABLE IF NOT EXISTS book_versions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  version_data TEXT NOT NULL,  -- JSON snapshot
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT REFERENCES users(id)
);
```

### `frontend/src/pages/LibrarianPortal.jsx`

10-tab layout. Use `recoveryState` from `RecoveryContext` to restore active tab on mount.

Tab registry (id → label → component):
```
pending          → "Pending Submissions"   → renders pending books list from GET /api/books/pending
all-books        → "All Books"             → renders ManagePublishedBooks (all-books mode)
manage-books     → "Manage Books"          → renders ManagePublishedBooks (librarian-add mode)
requests         → "Book Requests"         → renders ManageRequests
downloaded-stats → "Download Stats"        → renders DownloadedStats
flagged-reviews  → "Flagged Reviews"       → renders flagged reviews from GET /api/reviews/flagged
users            → "Manage Users"          → renders user list from GET /api/users + toggle-active
borrow-records   → "Borrow Records"        → renders borrow records from GET /api/books/borrow-records
notifications    → "Notifications"         → renders NotificationBoard
profile          → "Profile"               → renders ProfileEditor
```

**Pending submissions tab** must support:
- Checkbox selection of multiple rows
- "Approve Selected" button → `PATCH /api/books/:id/approve` for each selected (or bulk-action endpoint)
- "Reject Selected" button → modal for rejection reason → `PATCH /api/books/:id/reject`
- "Preview File" button per row → `GET /api/books/:id/preview` in an iframe or new tab
- Status badge updates in-place after action (no full page reload)

**Approval confirmation** (matches `06_screen_flow.md §5.2`):
- Modal: "Approve X book(s)?" → "Confirm" → fire PATCH requests → update badges

**Session snapshot** (for crash recovery): the LibrarianPortal must call `useSessionRecorder(userId, { activeTab, filters })` so the orchestrator's `CrashRecoveryWrapper` can restore state.

### `frontend/src/components/ManagePublishedBooks.jsx`

Props: `{ mode: 'all-books' | 'manage-books' }`

Both modes:
- Fetch from `GET /api/librarian/books` with search/filter/pagination controls
- Table columns: title, author, genre, status, availability, borrow count, created at, actions

`all-books` mode:
- "Edit" button per row → inline edit form → `PUT /api/librarian/books/:id`
- "Delete" button per row → confirm modal → `DELETE /api/librarian/books/:id`
- "Version History" button → modal showing version list from `GET /api/librarian/books/:id/versions`
- Bulk checkbox → "Bulk Delete" button → `POST /api/librarian/books/bulk-delete`

`manage-books` mode:
- "Add New Book" button → form with multer file upload → `POST /api/librarian/books`
- Same edit/delete per row as all-books mode

### `frontend/src/components/NotificationBoard.jsx`

Props: `{}` (fetches for current user automatically)

- Fetch from `GET /api/notifications` with unread count badge
- Tabs: All / Unread / Archived
- Per notification: message, type badge, timestamp, "Mark read" button, "Archive" button, "Delete" button
- "Mark all read" button → `PATCH /api/notifications/read-all`
- For librarians: "Send Announcement" button → textarea + submit → `POST /api/notifications/announcement`
- Auto-refresh every 60 seconds (setInterval is OK here — this is UI polling, not a job scheduler)

### `frontend/src/components/ProfileEditor.jsx`

Props: `{}` (fetches current user profile)

- Display: username (read-only), full name, email, bio, avatar
- "Edit Profile" button → inline form → `PUT /api/users/profile`
- "Change Password" section → current password + new password + confirm → `POST /api/users/change-password`
- "Upload Avatar" → file picker (≤5 MB, images only) → `POST /api/users/avatar`
- On avatar upload: preview new image immediately (URL.createObjectURL)
- Validate new password client-side before submit (8+ chars, upper, lower, digit, special)

---

## VERIFICATION STEPS

### V-LIB-1: List all books (librarian)
```bash
LTOKEN=<librarian token>
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $LTOKEN" \
  "http://localhost:8000/api/librarian/books?page=1&limit=10"
```
PASS = `200` with `{ books: [...], total, page, limit }`.

### V-LIB-2: Add book directly
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/librarian/books \
  -H "Authorization: Bearer $LTOKEN" \
  -F "title=Librarian Book" -F "author_name=Lib" -F "genre=Non-Fiction" \
  -F "description=A librarian-added book for verification" \
  -F "file=@/path/to/test.pdf"
```
PASS = `201`. Book in DB has `status = 'approved'`.

### V-LIB-3: Edit book + version history
```bash
BOOK_ID=<id from V-LIB-2>
curl -s -o /dev/null -w "%{http_code}" -X PUT \
  http://localhost:8000/api/librarian/books/$BOOK_ID \
  -H "Authorization: Bearer $LTOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Librarian Book (Revised)"}'
curl -s -H "Authorization: Bearer $LTOKEN" \
  http://localhost:8000/api/librarian/books/$BOOK_ID/versions
```
PASS = PUT returns `200`. Versions list has at least 2 entries (initial + edit).

### V-LIB-4: Bulk delete
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:8000/api/librarian/books/bulk-delete \
  -H "Authorization: Bearer $LTOKEN" -H "Content-Type: application/json" \
  -d '{"bookIds":["'$BOOK_ID'"]}'
```
PASS = `200` with `{ deleted: 1 }`. Row gone from DB.

### V-LIB-5: Student cannot access librarian route
```bash
STOKEN=<student token>
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $STOKEN" \
  http://localhost:8000/api/librarian/books
```
PASS = `403`.

### V-LIB-6: Profile update
```bash
curl -s -o /dev/null -w "%{http_code}" -X PUT http://localhost:8000/api/users/profile \
  -H "Authorization: Bearer $LTOKEN" -H "Content-Type: application/json" \
  -d '{"full_name":"Librarian Updated","bio":"I manage the library."}'
```
PASS = `200`.

### V-LIB-7: User toggle-active (librarian)
```bash
USER_ID=<student user id>
curl -s -o /dev/null -w "%{http_code}" -X PUT \
  http://localhost:8000/api/users/$USER_ID/toggle-active \
  -H "Authorization: Bearer $LTOKEN"
```
PASS = `200` with `{ is_active: 0 }` (or 1 if was 0). Then toggle back.

---

## COMPLETION CRITERIA

- [ ] All 7 verification steps pass
- [ ] LibrarianPortal has all 10 tabs with correct tab ID strings (crash recovery dependency)
- [ ] `useSessionRecorder` called with `{ activeTab }` so crash recovery can restore tab
- [ ] `book_versions` row created on every librarian edit
- [ ] Bulk operations are atomic (transaction)
- [ ] Pending submissions tab supports checkbox multi-select + approve/reject with status badge update
- [ ] NotificationBoard has 60s auto-refresh (setInterval) — this is UI polling only, not a scheduler
- [ ] ProfileEditor validates password client-side before submit
- [ ] No file outside owned list was modified

Report format:
```json
{
  "subagent": "SA-7",
  "milestone": "M5",
  "status": "DONE",
  "files_written": [
    "backend/routes/librarian.js",
    "frontend/src/pages/LibrarianPortal.jsx",
    "frontend/src/components/ManagePublishedBooks.jsx",
    "frontend/src/components/NotificationBoard.jsx",
    "frontend/src/components/ProfileEditor.jsx"
  ],
  "verification_passed": ["V-LIB-1","V-LIB-2","V-LIB-3","V-LIB-4","V-LIB-5","V-LIB-6","V-LIB-7"],
  "decisions": [],
  "blockers": []
}
```
