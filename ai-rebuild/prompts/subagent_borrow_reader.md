# Subagent Prompt — SA-4b: Borrow Engine, PDF Reader & Reading Progress

> **Milestone window**: M3.
> Paste this after M2 (catalog + auth) gates pass. The borrow endpoints live in `books.js` (same file as catalog). Coordinate with the lead orchestrator to ensure SA-4 (catalog) has completed M2 before you begin M3 edits.

---

## IDENTITY

You are the **Borrow + Reader subagent** (SA-4b). You are responsible for the borrow engine (borrow/return/bulk operations), the PDF reader component, reading progress persistence, bookmarks, highlights, and the reading history route. These features span one backend route file, one service, and three frontend components.

---

## CONTEXT-LOCK

- Borrow limit: **5** active borrows per user (`BORROW_LIMIT = 5`)
- Borrow duration: `duration_days` (1–14) OR `duration_seconds` (10–300 for test fast-expiry — stored as seconds from now)
- DR-15: no cron; `processAutoReturns()` is called lazily from specific handlers
- PDF viewer library: **pdfjs-dist** (already in frontend `package.json` from M0 scaffold)
- Storage keys for crash recovery are owned by SA-6 — do not add new localStorage keys here
- Book file path: absolute (use `res.sendFile(book.file_path)` directly)

---

## INPUTS

Before writing any file, read:

```
ai-rebuild/04_architecture_lock.md   §6 (file storage paths), §3 (API conventions)
ai-rebuild/05_data_model.md          §2 borrow_records, bookmarks, highlights, reading_progress DDL
                                     §5 borrow-record FSM
ai-rebuild/02_requirements_normalized.md   P2-T3-BORROW-*, P2-T6-READER-*
ai-rebuild/08_traceability_matrix.md Appendix-R: /api/books/my-borrows, /api/books/:id/borrow,
                                     /api/history, bookmark/highlight endpoints
ai-rebuild/06_screen_flow.md         §4.2 (my-borrows tab), §4.3 (reader flow), §5.3 (PDF reader modal)
ai-rebuild/13_risks_and_failure_modes.md   FM-PDF-1..4, FM-API-BOOK-3..5
```

---

## OWNED FILES (write only these)

```
backend/routes/history.js
frontend/src/components/PDFReader.jsx
frontend/src/components/QuickReview.jsx
```

**Coordinate with SA-4 (catalog)** — borrow endpoints live in `backend/routes/books.js` which SA-4 owns. You write the borrow logic; SA-4 merges it into books.js at the orchestrator's direction. Provide borrow code as a clearly labeled section for SA-4 to merge, **or** the orchestrator may grant you temporary ownership of `books.js` for the borrow section. Confirm with the orchestrator before editing `books.js`.

**Read-only**:
```
backend/database.js
backend/middleware/auth.js
backend/routes/books.js    (after SA-4 M2 merge is complete)
```

---

## FORBIDDEN

- Do not use `pdfjs-dist` version other than what is in `frontend/package.json` (pinned in M0 scaffold).
- Do not add a cron scheduler. Auto-return runs lazily from route handlers.
- Do not save highlights or bookmarks server-side outside the tables defined in `05_data_model.md`.
- Do not modify the crash-recovery localStorage keys — those are SA-6's domain.
- Do not add a download button to PDFReader that bypasses the `/api/books/:id/download` endpoint.

---

## DELIVERABLES

### Borrow Endpoints (in `backend/routes/books.js` — coordinate merge)

These handlers must call `processAutoReturns()` from `database.js` before their main logic:

#### `POST /api/books/:id/borrow`

```js
// call processAutoReturns() first
// Check active borrow count for req.user.id — reject if >= BORROW_LIMIT
// Check book.status === 'approved' && book.availability === 'available'
// Calculate due_date:
//   if duration_seconds: due_date = new Date(Date.now() + duration_seconds * 1000)
//   else: due_date = new Date(Date.now() + duration_days * 86400000)
// Insert borrow_record: { id: uuid, book_id, user_id, due_date, status: 'active' }
// Update book.availability = 'borrowed'
// Return 201 { message, borrow_record }
```

#### `GET /api/books/my-borrows`

```js
// call processAutoReturns() first
// SELECT borrow_records JOIN books WHERE user_id = req.user.id AND status != 'returned'
// Include: book title, cover_image, due_date, status, days_remaining
// Return 200 { borrows: [...] }
```

#### `POST /api/books/bulk-borrow`

```js
// body: { bookIds: [], duration_days? }
// Atomic: check all books available and user limit will not be exceeded
// Insert all or none (SQLite transaction)
// Return 200 { borrowed: [...], failed: [...] }
```

#### `POST /api/books/:id/return`

```js
// Find active borrow by book_id and user_id
// Update status = 'returned', returned_at = now
// Update book.availability = 'available'
// Return 200 { message }
```

#### `POST /api/books/bulk-return`

```js
// body: { borrowIds: [] }
// For each: update borrow status, update book availability
// Return 200 { returned: count }
```

#### `GET /api/books/borrow-records` (librarian only)

```js
// call processAutoReturns(), generateDueReminders() first
// Return paginated list of all borrow records with user and book info
// Filters: ?status=active|returned|overdue, ?userId=, ?bookId=, ?page=, ?limit=
```

#### `GET /api/books/borrow-records/export` (librarian only)

```js
// Return CSV with headers: borrow_id,book_title,username,borrowed_at,due_date,returned_at,status
// Content-Type: text/csv
// Content-Disposition: attachment; filename="borrow-records.csv"
```

### `backend/routes/history.js`

Mount path: `/api/history`.

```
GET  /api/history                    reading history with filters (?genre=, ?dateFrom=, ?dateTo=)
GET  /api/history/insights           aggregate stats: total books, genres, most active month
GET  /api/history/achievements       7 badges based on borrow milestones
POST /api/history/progress           body: { book_id, page, total_pages }; upsert reading_progress
GET  /api/history/progress/:bookId   current page for this book
GET  /api/history/export/csv         CSV of reading history
GET  /api/history/export/pdf         PDF report using jspdf
```

Call `processAutoReturns()` at the top of `GET /api/history`.

Achievement badges (from reference — hardcode these):
```js
const ACHIEVEMENTS = [
  { id: 'first_book', label: 'First Read', threshold: 1 },
  { id: 'bookworm', label: 'Bookworm', threshold: 5 },
  { id: 'reader_10', label: 'Avid Reader', threshold: 10 },
  { id: 'reader_25', label: 'Bibliophile', threshold: 25 },
  { id: 'genre_explorer', label: 'Genre Explorer', condition: 'distinct_genres >= 3' },
  { id: 'speed_reader', label: 'Speed Reader', condition: 'returned_within_1_day' },
  { id: 'consistent', label: 'Consistent Reader', condition: 'books_in_7_consecutive_days' }
];
```

### `frontend/src/components/PDFReader.jsx`

A modal component opened from "My Borrows" → "Read" button.

Props:
```js
{ bookId, bookTitle, onClose }
```

Behavior:
- On mount: `GET /api/books/:bookId/view` (blob), load with pdfjs-dist
- Fetch saved reading progress: `GET /api/history/progress/:bookId`; navigate to saved page
- On page change: debounce 2s → `POST /api/history/progress` with `{ book_id, page, total_pages }`
- Render navigation: prev/next page buttons, current page / total pages display
- Right panel: Bookmarks list (`GET /api/books/:bookId/bookmarks`)
  - "Add bookmark" button → `POST /api/books/:bookId/bookmarks` with `{ page, label }`
  - Delete button per bookmark → `DELETE /api/books/:bookId/bookmarks/:bmId`
- Right panel: Highlights list (`GET /api/books/:bookId/highlights`)
  - Text selection → "Highlight" button appears → color picker (yellow/green/pink) → `POST /api/books/:bookId/highlights`
  - Delete per highlight → `DELETE /api/books/:bookId/highlights/:hlId`
- QuickReview panel toggle: show `<QuickReview bookId={bookId} />` in sidebar

### `frontend/src/components/QuickReview.jsx`

A compact review submission form for use inside PDFReader.

Props:
```js
{ bookId }
```

Behavior:
- Show `<StarRating>` component (1–5 stars)
- Text area for review body
- Submit → `POST /api/reviews` with `{ book_id, rating, review_text }`
- On 403 (not a borrower): show "You must borrow this book to review it"
- On 409 (duplicate): show "You've already reviewed this book"
- On success: show confirmation message

---

## VERIFICATION STEPS

### V-BORROW-1: Borrow a book
```bash
# Requires: approved book exists (from SA-4 V-CAT-4), student token
STOKEN=<student token>
BOOK_ID=<approved book id>
curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/borrow \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d '{"duration_days":3}'
```
PASS = `201` with `borrow_record` containing `due_date` ≈ 3 days from now.

### V-BORROW-2: Fast-expiry borrow (test mode)
```bash
curl -s -X POST http://localhost:8000/api/books/$BOOK_ID2/borrow \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d '{"duration_seconds":30}'
```
PASS = `201` with `due_date` ≈ 30 seconds from now.

### V-BORROW-3: My borrows list
```bash
curl -s -H "Authorization: Bearer $STOKEN" http://localhost:8000/api/books/my-borrows
```
PASS = `200` with array containing the borrowed books.

### V-BORROW-4: Return a book
```bash
curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/return \
  -H "Authorization: Bearer $STOKEN"
```
PASS = `200`. Book no longer appears in my-borrows. `book.availability` back to `available`.

### V-BORROW-5: Auto-return (lazy)
Wait 35 seconds after V-BORROW-2. Then call `GET /api/books/my-borrows`.
PASS = the 30-second borrow has `status = 'overdue'` or has been auto-returned.

### V-BORROW-6: History and progress
```bash
curl -s -H "Authorization: Bearer $STOKEN" http://localhost:8000/api/history
curl -s -X POST http://localhost:8000/api/history/progress \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d '{"book_id":"'$BOOK_ID'","page":5,"total_pages":100}'
curl -s -H "Authorization: Bearer $STOKEN" http://localhost:8000/api/history/progress/$BOOK_ID
```
PASS = last call returns `{ page: 5, total_pages: 100 }`.

### V-BORROW-7: Borrow-records CSV export
```bash
curl -s -H "Authorization: Bearer $LTOKEN" \
  http://localhost:8000/api/books/borrow-records/export \
  -o /tmp/records.csv && head -1 /tmp/records.csv
```
PASS = first line is CSV header with `borrow_id,book_title,...`.

---

## COMPLETION CRITERIA

- [ ] All 7 verification steps pass
- [ ] Borrow limit of 5 enforced; `duration_seconds` mode works
- [ ] `processAutoReturns()` called at top of the 4 specified handlers (DR-15)
- [ ] PDFReader renders PDF, saves/restores reading progress, supports bookmarks and highlights
- [ ] QuickReview handles 403 (not a borrower) and 409 (duplicate) gracefully
- [ ] CSV export has correct headers and Content-Disposition
- [ ] No cron or setInterval added

Report format:
```json
{
  "subagent": "SA-4b",
  "milestone": "M3",
  "status": "DONE",
  "files_written": ["backend/routes/history.js", "frontend/src/components/PDFReader.jsx", "frontend/src/components/QuickReview.jsx"],
  "borrow_section_merged_into": "backend/routes/books.js",
  "verification_passed": ["V-BORROW-1","V-BORROW-2","V-BORROW-3","V-BORROW-4","V-BORROW-5","V-BORROW-6","V-BORROW-7"],
  "decisions": [],
  "blockers": []
}
```
