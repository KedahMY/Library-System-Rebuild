# Subagent Prompt — SA-4: Book Catalog & Submission

> **Milestone window**: M2 (catalog browse + submission flows) and M3 (borrow engine; see `subagent_borrow_reader.md` for that portion).
> Paste this after M1 (database) and M2-auth are complete.

---

## IDENTITY

You are **SA-4**, the Book Catalog & Submission subagent. You own the core books route file and are responsible for the 32 endpoints it exposes. Your work covers: book browse, file upload, author submission/draft/edit, librarian approval/rejection, and the two-phase deletion flow. The borrow, bookmark, highlight, and borrow-records sub-sections of `books.js` are covered in the separate `subagent_borrow_reader.md` prompt — but they live in the same file you own, so coordinate with the lead orchestrator on merge order.

---

## CONTEXT-LOCK (verify before writing any code)

- Backend port: **8000**
- All IDs: **UUID v4** (`crypto.randomUUID()`)
- Book status enum: **`pending`, `approved`, `rejected`, `draft`, `pending_deletion`** — enforced by CHECK constraint in DB
- Book availability enum: **`available`, `borrowed`** — enforced by CHECK constraint in DB
- File upload limits: books ≤ **50 MB** (PDF/TXT/DOC/DOCX), covers ≤ **2 MB** (JPG/PNG)
- Two-phase delete: `DELETE /api/books/:id` → status=`pending_deletion` (soft); librarian `PATCH /api/books/:id/approve-delete` → hard delete
- Borrow limit: **5** active borrows per user (constant `BORROW_LIMIT = 5`)
- Borrow duration: `duration_days` (1–14) OR `duration_seconds` (10–300 for test fast-expiry)

---

## INPUTS

Before writing any file, read:

```
ai-rebuild/04_architecture_lock.md   §3 (API conventions), §6 (file storage)
ai-rebuild/05_data_model.md          §2 books, borrow_records, bookmarks, highlights, reading_progress DDL
                                     §5 book-status FSM, borrow-record FSM
ai-rebuild/02_requirements_normalized.md   P1-T2-BOOKS-*, P2-T3-BORROW-*, P3-T5-AUTHOR-*
ai-rebuild/08_traceability_matrix.md Appendix-R rows: /api/books/*
ai-rebuild/06_screen_flow.md         §4.1 (browse tab), §4.2 (my-borrows tab), §4.5 (author publish tab)
ai-rebuild/13_risks_and_failure_modes.md   FM-API-BOOK-1..6, FM-PDF-1..4
```

---

## OWNED FILES (write only these)

```
backend/routes/books.js
```

**Read-only** (do not edit):
```
backend/server.js          (SA-1 — read for route mount: app.use('/api/books', booksRouter))
backend/database.js        (SA-2 — import db from here)
backend/middleware/auth.js (SA-3 — import authenticate, authorize)
```

---

## FORBIDDEN

- Do not write a cron job or `setInterval`. Auto-return and due-reminders are handled by lazy function calls inside specific route handlers — see DR-15.
- Do not change the `BORROW_LIMIT` constant from 5.
- Do not use INTEGER primary keys. All IDs must be UUID v4 strings.
- Do not store book files outside `backend/uploads/books/`. Cover images go to `backend/uploads/covers/`.
- Do not hard-delete a book directly from an author `DELETE` request — set status to `pending_deletion` only.
- Do not skip multer `LIMIT_FILE_SIZE` error handling — the catch is in server.js (SA-1 will add it), but your route must not swallow the error before it propagates.

---

## DELIVERABLES

### `backend/routes/books.js`

All routes require `authenticate` unless noted. Role restrictions use `authorize(role)`.

#### Browse & Discovery

```
GET  /api/books                     public book list (approved only; ?search=, ?genre=, ?page=, ?limit=)
GET  /api/books/genres              distinct genres list
GET  /api/books/recommendations     personalized (based on borrow history); requires auth
GET  /api/books/:id                 single book detail (approved books; authors see own pending/draft)
```

Response shape for book list item:
```json
{
  "id": "uuid",
  "title": "string",
  "author_name": "string",
  "genre": "string",
  "description": "string",
  "cover_image": "string|null",
  "status": "approved",
  "availability": "available|borrowed",
  "average_rating": 0.0,
  "review_count": 0,
  "borrow_count": 0,
  "created_at": "ISO8601"
}
```

#### Author Submission Flow

```
POST /api/books/submit              author only; multipart: title, author_name, genre, description,
                                    file (book file), cover_image (optional); status=pending
POST /api/books/draft               author only; same fields; status=draft; returns id for later edit
GET  /api/books/my-submissions      author only; own books (all statuses except draft)
GET  /api/books/my-drafts           author only; own draft books
PUT  /api/books/:id                 author only (own book); edit title/description/genre/cover
DELETE /api/books/:id               author only (own book); sets status=pending_deletion (NOT hard delete)
```

Auto-save contract for drafts: the frontend POSTs to `/api/books/draft` on initial save, then PUTs to `/api/books/:id` every 3 s. Both routes must accept identical fields.

#### Librarian Approval Flow

```
GET  /api/books/pending             librarian only; books with status=pending
GET  /api/books/pending-deletions   librarian only; books with status=pending_deletion
PATCH /api/books/:id/approve        librarian only; status → approved, availability → available
PATCH /api/books/:id/reject         librarian only; body: { reason? }; status → rejected
PATCH /api/books/:id/approve-delete librarian only; hard delete book + cascade-delete borrow_records,
                                    reading_progress, book_versions, downloaded_books, highlights,
                                    bookmarks; then delete book row
PATCH /api/books/:id/reject-delete  librarian only; status → approved (restore from pending_deletion)
POST /api/books/bulk-action         librarian only; body: { action: 'approve'|'reject'|'delete', bookIds: [] }
```

On approve: notify the author — `{ type: 'approval', message: 'Your book "<title>" has been approved.' }`.
On reject: notify the author — `{ type: 'rejection', message: 'Your book "<title>" was rejected. Reason: <reason>' }`.

#### File Download & Preview

```
GET  /api/books/:id/download        authenticated; serves book file; increments download count;
                                    inserts into downloaded_books if not already present
GET  /api/books/:id/view            authenticated; serves book file inline (for PDF reader)
GET  /api/books/:id/preview         librarian only; serves file inline for preview panel
```

`file_path` in DB is stored as absolute path for book files. Use `res.sendFile(book.file_path)` directly (absolute path variant).

#### Lazy Job Invocation (DR-15)

At the **top** of these handlers, call `processAutoReturns()` and/or `generateDueReminders()` from `database.js`:

- `GET /api/books` → call `processAutoReturns()`
- `GET /api/books/borrow-records` → call `processAutoReturns()`, `generateDueReminders()`
- `GET /api/books/my-borrows` → call `processAutoReturns()`
- `POST /api/books/:id/borrow` → call `processAutoReturns()`

Do not call these from any other handlers. Do not add a scheduler.

#### Borrow Engine (also in this file — coordinate with orchestrator on merge)

```
POST /api/books/:id/borrow          body: { duration_days?: 1-14, duration_seconds?: 10-300 }
                                    enforce BORROW_LIMIT=5; calculate due_date from now
GET  /api/books/my-borrows          own active borrow records; sorted by borrowed_at desc
POST /api/books/bulk-borrow         body: { bookIds: [], duration_days? }; atomic — all or nothing
POST /api/books/:id/return          mark returned; update availability → available
POST /api/books/bulk-return         body: { borrowIds: [] }; mark all returned
GET  /api/books/borrow-records      librarian only; all borrow records with pagination + filters
GET  /api/books/borrow-records/export  librarian only; CSV export of borrow records
```

Borrow record response shape:
```json
{
  "id": "uuid",
  "book_id": "uuid",
  "user_id": "uuid",
  "borrowed_at": "ISO8601",
  "due_date": "ISO8601",
  "returned_at": "ISO8601|null",
  "status": "active|returned|overdue",
  "book_title": "string",
  "username": "string"
}
```

#### Bookmarks & Highlights (also in this file)

```
GET    /api/books/:id/bookmarks           own bookmarks for this book
POST   /api/books/:id/bookmarks           body: { page, label? }; create bookmark
DELETE /api/books/:id/bookmarks/:bmId     delete own bookmark

GET    /api/books/:id/highlights          own highlights for this book
POST   /api/books/:id/highlights          body: { page, text, color? }; create highlight
DELETE /api/books/:id/highlights/:hlId    delete own highlight
```

---

## VERIFICATION STEPS

### V-CAT-1: Book list (unauthenticated)
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/books
```
PASS = `401` (books list requires auth per DR enforcement — confirm against `08_traceability_matrix.md`; if public, expect `200`).

### V-CAT-2: Submit a book (author token required)
```bash
# Obtain author token first (seed author_demo user via seed_dummy_users.js)
ATOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"author_demo","password":"Author@1234"}' \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")

curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/books/submit \
  -H "Authorization: Bearer $ATOKEN" \
  -F "title=Test Book" -F "author_name=SA4" -F "genre=Fiction" \
  -F "description=A test book for verification" \
  -F "file=@/path/to/test.pdf"
```
PASS = `201`.

### V-CAT-3: Pending list (librarian only)
```bash
LTOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"librarian_demo","password":"Librarian@1"}' \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")

curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $LTOKEN" \
  http://localhost:8000/api/books/pending
```
PASS = `200` with array containing the submitted book.

### V-CAT-4: Approve and verify status
```bash
BOOK_ID=<id from V-CAT-2 response>
curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  http://localhost:8000/api/books/$BOOK_ID/approve \
  -H "Authorization: Bearer $LTOKEN"
```
PASS = `200`. Verify book no longer appears in `/api/books/pending`.

### V-CAT-5: Two-phase delete
```bash
# Author soft-delete
curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  http://localhost:8000/api/books/$BOOK_ID \
  -H "Authorization: Bearer $ATOKEN"
```
PASS = `200`. DB row must have `status = 'pending_deletion'` (verify with sqlite3).

```bash
# Librarian hard delete
curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  http://localhost:8000/api/books/$BOOK_ID/approve-delete \
  -H "Authorization: Bearer $LTOKEN"
```
PASS = `200`. DB row must be gone (verify with sqlite3 or 404 on GET).

### V-CAT-6: Borrow limit enforcement
Borrow 5 books with one user, then attempt a 6th.
PASS = 6th borrow returns `400` with message about borrow limit.

### V-CAT-7: Bookmark CRUD
```bash
STOKEN=<student token>
BOOK_ID=<approved book id>
# Create
curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/bookmarks \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d '{"page":1,"label":"test bookmark"}'
# List
curl -s -H "Authorization: Bearer $STOKEN" \
  http://localhost:8000/api/books/$BOOK_ID/bookmarks
```
PASS = bookmark appears in list with correct page and label.

---

## COMPLETION CRITERIA

Report DONE when:

- [ ] All 7 verification steps above pass
- [ ] `backend/routes/books.js` exports a single Express Router with all 32 endpoints
- [ ] `processAutoReturns()` and `generateDueReminders()` are called lazily from the correct 4 handlers (DR-15)
- [ ] Two-phase delete is implemented — author DELETE sets `pending_deletion`, librarian approve-delete does hard cascade
- [ ] Borrow limit of 5 is enforced with constant `BORROW_LIMIT = 5`
- [ ] `duration_seconds` borrow mode works (10–300 seconds for test fast-expiry)
- [ ] No file outside `backend/routes/books.js` was modified

Report format:
```json
{
  "subagent": "SA-4",
  "milestone": "M2+M3",
  "status": "DONE",
  "files_written": ["backend/routes/books.js"],
  "verification_passed": ["V-CAT-1","V-CAT-2","V-CAT-3","V-CAT-4","V-CAT-5","V-CAT-6","V-CAT-7"],
  "decisions": [],
  "blockers": []
}
```
