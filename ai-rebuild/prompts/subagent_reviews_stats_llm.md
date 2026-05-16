# Subagent Prompt — SA-5: Reviews, Stats, LLM & Open Library

> **Milestone window**: M4 (parallel with SA-6 notifications).
> Paste this after M3 (borrow + reader) gates pass.

---

## IDENTITY

You are **SA-5**, the Reviews + Stats + LLM + Open Library subagent. You own the reviews route, requests route (student book requests + Open Library integration), stats route, and all three backend services (LLM, Open Library, PDF extract). You also own the author-facing frontend components for reviews and stats.

---

## CONTEXT-LOCK

- DR-13: A user can only review a book they have borrowed (any borrow status). One review per (user, book) pair via UNIQUE constraint on `(user_id, book_id)`.
- DR-14: If `DASHSCOPE_API_KEY` is missing, `/api/llm/summary` returns `500` with a clear message. Sentiment classification returns `'neutral'` on any error. The app must continue to function.
- LLM model: **`qwen-turbo`** (Alibaba DashScope). Endpoint: `https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
- Open Library search: `https://openlibrary.org/search.json`
- Internet Archive: `https://archive.org/download/<identifier>/<identifier>.pdf`
- All IDs: UUID v4

---

## INPUTS

Before writing any file, read:

```
ai-rebuild/04_architecture_lock.md   §3 (API conventions), §7 (external services)
ai-rebuild/05_data_model.md          §2 reviews, review_replies, book_requests, downloaded_books DDL
                                     §5 review-moderation FSM, book-request FSM
ai-rebuild/02_requirements_normalized.md   P2-T5-REVIEWS-*, P3-T6-STATS-*, P3-T9-LLM-*, P3-T10-OL-*
ai-rebuild/08_traceability_matrix.md Appendix-R: /api/reviews/*, /api/requests/*, /api/stats/*, /api/llm/*
ai-rebuild/06_screen_flow.md         §4.6 (author reviews tab), §4.7 (author stats tab), §4.5 (publish tab - LLM)
ai-rebuild/13_risks_and_failure_modes.md   FM-API-REV-1..3, FM-API-OL-1..3, FM-API-LLM-1..3, FM-EXT-1..3
```

---

## OWNED FILES (write only these)

```
backend/routes/reviews.js
backend/routes/requests.js
backend/routes/stats.js
backend/routes/llm.js
backend/services/llm.js
backend/services/openlibrary.js
backend/services/pdfExtract.js
frontend/src/components/ReviewSection.jsx
frontend/src/components/AuthorReviews.jsx
frontend/src/components/AuthorStats.jsx
frontend/src/components/DownloadedStats.jsx
frontend/src/components/StarRating.jsx
frontend/src/components/BookRequests.jsx
frontend/src/components/ManageRequests.jsx
```

**Read-only**:
```
backend/database.js
backend/middleware/auth.js
backend/routes/books.js
```

---

## FORBIDDEN

- Do not call the LLM API synchronously in a way that blocks the event loop on timeout — use a reasonable timeout (30s) and return a clear error on failure.
- Do not swallow LLM errors silently — log to stderr and return a documented response.
- Do not download Internet Archive files that are not PDFs — use the `scorePdfCandidate` heuristic described below.
- Do not store Open Library search results in the DB — only store the downloaded file and the fulfilled request.
- Do not make sentiment classification block the review submission — call it async after the review is saved.
- Do not expose `DASHSCOPE_API_KEY` in any API response.

---

## DELIVERABLES

### `backend/services/llm.js`

```js
// generateBookSummary(title, genre, description, style='medium')
//   style: 'short' (1 sentence), 'medium' (1 paragraph), 'detailed' (3 paragraphs)
//   If DASHSCOPE_API_KEY missing: throw Error('DASHSCOPE_API_KEY not configured')
//   If API call fails: throw with meaningful message
//   Returns: string (the generated summary)

// classifySentiment(reviewText)
//   Calls DashScope to classify as 'positive'|'negative'|'neutral'
//   On ANY error (missing key, timeout, parse error): return 'neutral' silently
//   Returns: 'positive' | 'negative' | 'neutral'
```

DashScope request shape:
```json
{
  "model": "qwen-turbo",
  "input": { "messages": [{ "role": "user", "content": "<prompt>" }] },
  "parameters": { "result_format": "message" }
}
```

Header: `Authorization: Bearer <DASHSCOPE_API_KEY>`

### `backend/services/openlibrary.js`

```js
// searchBooks(query, limit=10)
//   GET https://openlibrary.org/search.json?q=<query>&limit=<limit>
//   Returns array of { ol_key, title, author, year, cover_id, ia_identifier }

// findSimilar(title, genre)
//   Search by title+genre; return top 5 matches

// downloadIaPdf(iaIdentifier, destPath)
//   Attempt to download PDF from Internet Archive
//   Use scorePdfCandidate() to pick best PDF file from the item's file list
//   Stream to destPath; return { success, path, size } or throw on failure

// scorePdfCandidate(filename, size)
//   Heuristic: prefer files ending in .pdf, larger files (books not covers),
//   penalize files < 10KB (likely thumbnails)
//   Returns numeric score

// fetchCover(coverId, size='M')
//   URL: https://covers.openlibrary.org/b/id/<coverId>-<size>.jpg
//   Returns buffer or null on failure
```

### `backend/services/pdfExtract.js`

```js
// extractText(filePath)
//   .pdf or .doc/.docx: return null (binary — can't extract meaningfully)
//   .txt: return first 6000 characters of file content
//   Returns: string | null
```

### `backend/routes/reviews.js`

Mount path: `/api/reviews`. All routes require `authenticate`.

```
GET  /api/reviews/:bookId            list reviews for a book (public — no auth check in practice)
POST /api/reviews                    body: { book_id, rating (1-5), review_text }
                                     Check: user has a borrow record for book_id (any status) → else 403
                                     UNIQUE(user_id, book_id) → 409 on duplicate
                                     After save: call classifySentiment(review_text) async; update sentiment
                                     Returns 201 { review }

GET  /api/reviews/aggregates/:bookId average_rating, review_count, sentiment_breakdown
PUT  /api/reviews/:id                own review only; update rating + text
DELETE /api/reviews/:id              own review or librarian

POST /api/reviews/:id/helpful        toggle helpful vote (UNIQUE per user per review)
GET  /api/reviews/:id/helpful-count  returns { count }

POST /api/reviews/:id/flag           body: { reason }; mark is_flagged=1
GET  /api/reviews/flagged            librarian only; flagged reviews list
PATCH /api/reviews/:id/resolve       librarian only; is_flagged=0, is_resolved=1
POST /api/reviews/bulk-resolve       librarian only; body: { reviewIds: [] }

POST /api/reviews/:id/reply          author only; body: { reply_text }; one reply per review
                                     Check: req.user is the author of the book being reviewed
GET  /api/reviews/:bookId/with-replies  reviews + author replies + helpful counts
```

### `backend/routes/requests.js`

Mount path: `/api/requests`. All routes require `authenticate`.

```
POST /api/requests                    student/staff only; body: { title, author?, notes? }
                                      Insert book_request; notify librarians
GET  /api/requests                    student: own requests; librarian: all requests
GET  /api/requests/:id                single request detail
PUT  /api/requests/:id                student: update own pending request
DELETE /api/requests/:id              student: cancel own pending request

GET  /api/requests/:id/openlibrary-search   librarian only; search OL for request.title
                                            Returns array of OL results
POST /api/requests/:id/download       librarian only; body: { ia_identifier }
                                      Download PDF from IA, save to uploads/books/,
                                      create book record (status=approved), fulfill request
POST /api/requests/:id/manual-upload  librarian only; multipart: file + book metadata
                                      Save file, create book, fulfill request
PATCH /api/requests/:id/status        librarian only; body: { status: 'fulfilled'|'rejected', notes? }

GET  /api/requests/analytics          librarian only; request counts by status + genre
```

Call `processAutoReturns()` at top of `GET /api/requests` (lazy job, DR-15).

### `backend/routes/stats.js`

Mount path: `/api/stats`. All routes require `authenticate`.

```
GET  /api/stats/author                author only; borrow counts per own book, with sentiment breakdown
GET  /api/stats/downloaded            own downloaded books list + counts
GET  /api/stats/user-activity         librarian only; recent user activity log
GET  /api/stats/user-activity/export  librarian only; CSV export
```

### `backend/routes/llm.js`

Mount path: `/api/llm`. All routes require `authenticate` + `authorize('author','librarian')`.

```
POST /api/llm/summary    body: { title, genre, description, style?, book_id? }
                         If book_id: extract text via pdfExtract.js and include in prompt
                         Call generateBookSummary()
                         On success: return 200 { summary }
                         On DASHSCOPE_API_KEY missing: return 500 { error: 'LLM not configured...' }
                         On other API error: return 500 { error: message }
```

### Frontend Components

#### `frontend/src/components/StarRating.jsx`

Props: `{ value, onChange, readOnly? }`
- Renders 5 clickable stars (or static if readOnly)
- `onChange(rating)` called on star click

#### `frontend/src/components/ReviewSection.jsx`

Props: `{ bookId, currentUserId }`
- Fetches reviews from `GET /api/reviews/:bookId/with-replies`
- Renders each review: star rating, text, sentiment badge (positive/negative/neutral), helpful count + vote button, author reply if present
- If current user hasn't reviewed: show inline review form (StarRating + textarea + submit)
- On submit: `POST /api/reviews`; handle 403 (not a borrower) and 409 (duplicate) with user-facing messages

#### `frontend/src/components/AuthorReviews.jsx`

Props: `{ authorId }` (used in AuthorPortal reviews tab)
- Fetches all reviews on author's books
- Groups by book
- Shows: reviewer name, rating, sentiment badge, text, helpful count
- For each review without a reply: show "Reply" text area + submit button → `POST /api/reviews/:id/reply`
- For each review with a reply: show the reply

#### `frontend/src/components/AuthorStats.jsx`

Props: `{ authorId }`
- Fetches `GET /api/stats/author`
- Renders recharts BarChart: x-axis = book title, y-axis = borrow count
- Renders sentiment breakdown pie chart (recharts PieChart): positive/negative/neutral slices
- Shows total borrows, most borrowed book, most positive book

#### `frontend/src/components/DownloadedStats.jsx`

Props: `{ userId }`
- Fetches `GET /api/stats/downloaded`
- Renders a table of downloaded books with download date and file size

#### `frontend/src/components/BookRequests.jsx`

Props: `{}` (used in StudentPortal requests tab)
- Shows own requests list
- "New Request" form: title, author (optional), notes (optional) → `POST /api/requests`
- Status badges per request: pending / fulfilled / rejected
- Cancel button on pending requests → `DELETE /api/requests/:id`

#### `frontend/src/components/ManageRequests.jsx`

Props: `{}` (used in LibrarianPortal requests tab)
- Shows all requests list with filters (status)
- On row click: expand detail panel
  - "Search Open Library" button → `GET /api/requests/:id/openlibrary-search` → show results list
  - On OL result click: "Download from Archive" → `POST /api/requests/:id/download`
  - "Manual Upload" button → file picker → `POST /api/requests/:id/manual-upload`
  - "Reject" button → `PATCH /api/requests/:id/status` with `{ status: 'rejected' }`

---

## VERIFICATION STEPS

### V-REVIEW-1: Submit a review
```bash
# Student must have borrowed the book first (use borrow from V-BORROW-1)
STOKEN=<student token>
BOOK_ID=<borrowed book id>
curl -s -X POST http://localhost:8000/api/reviews \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d '{"book_id":"'$BOOK_ID'","rating":4,"review_text":"Great book, very informative."}'
```
PASS = `201` with review object including `id`.

### V-REVIEW-2: Duplicate review rejected
Repeat V-REVIEW-1 with same book_id.
PASS = `409`.

### V-REVIEW-3: Review without borrow
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/reviews \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d '{"book_id":"<unborrowed-book-id>","rating":5,"review_text":"Trying to review unread."}'
```
PASS = `403`.

### V-REVIEW-4: Author reply
```bash
ATOKEN=<author token>
REVIEW_ID=<review id from V-REVIEW-1>
curl -s -X POST http://localhost:8000/api/reviews/$REVIEW_ID/reply \
  -H "Authorization: Bearer $ATOKEN" -H "Content-Type: application/json" \
  -d '{"reply_text":"Thank you for the kind words!"}'
```
PASS = `201`.

### V-LLM-1: LLM graceful degrade (no key)
```bash
# Ensure DASHSCOPE_API_KEY is not set in .env for this test
ATOKEN=<author token>
curl -s -X POST http://localhost:8000/api/llm/summary \
  -H "Authorization: Bearer $ATOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Test","genre":"Fiction","description":"A test book"}'
```
PASS = `500` with `{ error: "..." }` — not a crash, not a 502.

### V-STATS-1: Author stats
```bash
curl -s -H "Authorization: Bearer $ATOKEN" http://localhost:8000/api/stats/author
```
PASS = `200` with array of book stat objects.

### V-REQUEST-1: Student book request
```bash
curl -s -X POST http://localhost:8000/api/requests \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d '{"title":"The Pragmatic Programmer","notes":"Required for coursework"}'
```
PASS = `201` with request object.

### V-REQUEST-2: OL search (librarian)
```bash
REQUEST_ID=<id from V-REQUEST-1>
curl -s -H "Authorization: Bearer $LTOKEN" \
  http://localhost:8000/api/requests/$REQUEST_ID/openlibrary-search
```
PASS = `200` with array (may be empty if OL unavailable — not a failure; just no results).

### V-SENTIMENT-1: Sentiment defaults to neutral on missing key
After V-REVIEW-1 (with no DASHSCOPE_API_KEY set), check the review's sentiment in the DB:
```bash
sqlite3 backend/data/library.db "SELECT sentiment FROM reviews WHERE id='<review-id>'"
```
PASS = `neutral`.

---

## COMPLETION CRITERIA

- [ ] All 9 verification steps pass
- [ ] `classifySentiment` returns `'neutral'` on any error without throwing
- [ ] `generateBookSummary` returns `500` (not crash) when key is missing
- [ ] Review submission enforces borrow check (403) and UNIQUE constraint (409)
- [ ] Author reply blocked if reviewer's book is not owned by author
- [ ] OL search failure (network down) returns 200 with empty array or 503, not an unhandled exception
- [ ] No new DB tables or columns added beyond `05_data_model.md`

Report format:
```json
{
  "subagent": "SA-5",
  "milestone": "M4",
  "status": "DONE",
  "files_written": [
    "backend/routes/reviews.js", "backend/routes/requests.js",
    "backend/routes/stats.js", "backend/routes/llm.js",
    "backend/services/llm.js", "backend/services/openlibrary.js",
    "backend/services/pdfExtract.js",
    "frontend/src/components/ReviewSection.jsx",
    "frontend/src/components/AuthorReviews.jsx",
    "frontend/src/components/AuthorStats.jsx",
    "frontend/src/components/DownloadedStats.jsx",
    "frontend/src/components/StarRating.jsx",
    "frontend/src/components/BookRequests.jsx",
    "frontend/src/components/ManageRequests.jsx"
  ],
  "verification_passed": ["V-REVIEW-1","V-REVIEW-2","V-REVIEW-3","V-REVIEW-4","V-LLM-1","V-STATS-1","V-REQUEST-1","V-REQUEST-2","V-SENTIMENT-1"],
  "decisions": [],
  "blockers": []
}
```
