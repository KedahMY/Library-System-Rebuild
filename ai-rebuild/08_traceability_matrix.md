# 08 · Traceability Matrix

> Maps every **requirement ID** to: backend route(s), DB entities, frontend component(s)/screen, and the **exact verification step** (smoke script line, Playwright test, or one-line manual procedure).
>
> File paths are relative to the rebuilt repo's project root (which mirrors the reference layout).
>
> **Verification key**:
> - `Axx`/`Bxx`/`Cxx`/`Dxx`/`Nxx` = row in [`07_test_strategy.md §3`](07_test_strategy.md) smoke matrix
> - `auth.spec / student-flow.spec / author-flow.spec / librarian-flow.spec / crash-recovery.spec` = Playwright spec in [`07_test_strategy.md §4`](07_test_strategy.md)
> - `MANUAL[...]` = one-line procedure the TA executes in browser/DB
> Every requirement has at least one automated check OR a precise manual procedure — no row is left as a vague "manual".

| Req ID | API endpoint(s) | DB entities | Frontend (page → component) | Test IDs |
|---|---|---|---|---|
| P1-T1-REG-001 | `POST /api/auth/register` | `users` | `pages/RegisterPage.jsx` | A1 · auth.spec T1 |
| P1-T1-REG-002 | (server validation) | `users.username UNIQUE` | RegisterPage | A3 |
| P1-T1-REG-003 | (server validation) | — | RegisterPage | A2 |
| P1-T1-REG-004 | `POST /api/auth/register` | `users.bio`, `users.employee_id` | RegisterPage (conditional fields) | MANUAL[register as author with bio + librarian with employee_id, then `sqlite3 library.db "SELECT role,bio,employee_id FROM users WHERE username IN ('a','l');"`] |
| P1-T1-REG-005 | (bcryptjs) | `users.password_hash` | — | MANUAL[`sqlite3 library.db "SELECT password_hash FROM users LIMIT 1;"` → must start with `$2a$12$` or `$2b$12$`] |
| P1-T1-REG-006 | (post-register fan-out) | `notifications` (type=user_update) | — | MANUAL[register a new user, then login as librarian_demo → unread badge increments; OR `sqlite3 library.db "SELECT COUNT(*) FROM notifications WHERE type='user_update';"`] |
| P1-T1-LOG-007 | `POST /api/auth/login` | `users` | `pages/LoginPage.jsx`, `context/AuthContext.jsx` | A4 · auth.spec T1 |
| P1-T1-LOG-008 | `POST /api/auth/login` | `users.active` | LoginPage | auth.spec T3 |
| P1-T1-LOG-009 | `POST /api/auth/login` | `users.last_login` | — | MANUAL[login as student_demo, then `sqlite3 library.db "SELECT last_login FROM users WHERE username='student_demo';"` → non-null and recent] |
| P1-T1-LOG-010 | — | — | `App.jsx::PortalRedirect`, LoginPage | auth.spec T1 |
| P1-T1-LOG-011 | — | — | `App.jsx::ProtectedRoute` | MANUAL[login as student then navigate to `/librarian` → redirect to `/portal` then `/student`] |
| P1-T1-LOG-012 | — | — | `utils/api.js` interceptor | MANUAL[in DevTools `localStorage.removeItem('token')` then click any tab → redirected to /login] |
| P1-T2-BOOK-001 | `GET /api/books` | `books` | `pages/StudentPortal.jsx` | B2 |
| P1-T2-BOOK-002 | (client-side filter) | — | StudentPortal | MANUAL[type into search box → list filters in <100ms; pick a genre filter → only matching rows visible] |
| P1-T2-BOOK-003 | `GET /api/books` | `books` | `components/BookModal.jsx` | student-flow.spec T1 |
| P1-T2-BORROW-004 | `POST /api/books/:id/borrow` | `borrow_records`, `books.availability`, `books.times_borrowed` | StudentPortal, BookModal | B3 · student-flow.spec T1 |
| P1-T2-BORROW-005 | `POST /api/books/:id/borrow` | `borrow_records` (count by status=active) | StudentPortal | B5 |
| P1-T2-BORROW-006 | `POST /api/books/:id/borrow` | `borrow_records` | StudentPortal | B4 |
| P1-T2-BORROW-007 | `POST /api/books/:id/return` | `borrow_records`, `books.availability`, `notifications` (archive) | StudentPortal | B6 |
| P1-T3-SUB-001 | `POST /api/books/submit` | `books`, `notifications` | `pages/AuthorPortal.jsx` | C9 · author-flow.spec T1 |
| P1-T3-SUB-002 | `POST /api/books/submit` (cover_image) | `books.cover_image` | AuthorPortal | MANUAL[submit with a 1MB JPG cover → list row shows thumbnail at `/uploads/covers/<uuid>.jpg`] |
| P1-T3-SUB-003 | `POST /api/books/submit` | `notifications` (type=new_submission) | — | MANUAL[submit a book then login as librarian_demo → notification "New Book Submission" appears] |
| P1-T3-SUB-004 | `GET /api/books/my-submissions` | `books` | AuthorPortal | author-flow.spec T1 |
| P1-T4-APP-001 | `GET /api/books/pending` | `books` | `pages/LibrarianPortal.jsx` | librarian-flow.spec T1 |
| P1-T4-APP-002 | `PATCH /api/books/:id/approve` | `books.status`, `books.publish_date`, `notifications` | LibrarianPortal | C10 · librarian-flow.spec T1 |
| P1-T4-APP-003 | `PATCH /api/books/:id/reject` | `books.rejection_reason`, `notifications` | LibrarianPortal | C11 |
| P1-T4-APP-004 | `GET /api/books/preview/:id` | `books.file_path` | LibrarianPortal::BookPreviewModal | MANUAL[librarian opens any pending book → preview modal renders PDF in iframe within 3s] |
| P1-T4-APP-005 | `POST /api/books/bulk-action` | `books` | LibrarianPortal | MANUAL[select 2 pending → bulk approve → both transition to 'approved' in one network call] |
| P2-T1-READ-001 | `GET /api/books/view/:id` | `books.file_path` | `components/PDFReader.jsx` | student-flow.spec T2 |
| P2-T1-READ-002 | `POST /api/history/progress` · `GET /api/history/progress/:bookId` | `reading_progress` | PDFReader | MANUAL[read page 3 → close → reopen → reader resumes at page 3; `sqlite3 library.db "SELECT current_page FROM reading_progress WHERE user_id=?;"`] |
| P2-T1-BM-003 | `GET/POST/DELETE /api/books/:id/bookmarks(/:id)` | `bookmarks` | PDFReader · panel | C4-C6 · student-flow.spec T2 |
| P2-T1-HL-004 | `GET/POST/DELETE /api/books/:id/highlights(/:id)` | `highlights` | PDFReader · panel | C7 |
| P2-T1-READ-005 | `GET /api/books/quick-review/:id` | `books` | `components/QuickReview.jsx` | MANUAL[on Browse, click "Quick Review" on an unborrowed approved book → first N pages render] |
| P2-T2-MULTI-001 | `POST /api/books/bulk-borrow` | `borrow_records`, `books` | StudentPortal (multi mode) | C1-C2 |
| P2-T2-MULTI-002 | — | — | StudentPortal confirm dialog | MANUAL[start bulk borrow → confirm dialog shows due date string before commit] |
| P2-T2-REC-003 | `GET /api/books/recommendations` | `books` | StudentPortal | C3 |
| P2-T2-AR-004 | (lazy in many routes) | `borrow_records`, `books`, `notifications` (auto_return) | invisible | B7 |
| P2-T2-AR-005 | (lazy in my-borrows + notifications) | `notifications` (due_reminder) | — | MANUAL[borrow with `duration_seconds:90000` (≈25h) so it's "due within 24h"; hit `/api/notifications` → due_reminder appears once, not duplicated on re-hit within 24h] |
| P2-T3-NOTIF-001 | `GET /api/notifications` | `notifications` | `components/NotificationBoard.jsx` (each portal) | MANUAL[every portal's Notifications tab renders ≥0 rows and a "no notifications" empty state] |
| P2-T3-NOTIF-002 | `GET /api/notifications` (filters) | — | NotificationBoard | MANUAL[apply category=borrow → only borrow notifs shown; toggle "show archived" → archived rows appear] |
| P2-T3-NOTIF-003 | `PATCH /api/notifications/:id/read` · `.../archive` · `DELETE /api/notifications/:id` · `PATCH .../read-all` | `notifications` | NotificationBoard | MANUAL[per-row mark-read, archive, delete each succeed visibly; "Mark all read" zeros the unread badge] |
| P2-T3-NOTIF-004 | `GET /api/notifications/unread-count` | `notifications` | `components/Sidebar.jsx` | MANUAL[Sidebar shows a numeric badge that matches the response of the unread-count endpoint] |
| P2-T3-NOTIF-005 | `POST /api/notifications/announcement` | `notifications` | LibrarianPortal | MANUAL[librarian sends announcement to role=student → student_demo's notifications include the new row] |
| P2-T3-NOTIF-006 | (multiple endpoints insert various types) | `notifications.type` | NotificationBoard rendering | MANUAL[trigger each type in §05 Appendix-N; NotificationBoard renders the row without an "Unknown type" fallback] |
| P2-T4-PROF-001 | `PUT /api/users/profile` | `users.full_name`, `users.bio`, `users.employee_id` | `components/ProfileEditor.jsx` | MANUAL[edit full_name without current_password → 400; with correct current_password → 200 and refresh shows new name] |
| P2-T4-PROF-002 | `PUT /api/users/password` | `users.password_hash` | ProfileEditor | MANUAL[change password → logout → login with new password succeeds; old password 401s] |
| P2-T4-PROF-003 | `POST /api/users/profile-picture` | `users.profile_picture` | ProfileEditor | MANUAL[upload 1MB JPG → avatar at `/uploads/avatars/<uuid>.jpg` loads; upload 6MB → 400] |
| P2-T4-PROF-004 | `PUT /api/users/profile` (notify) | `notifications` | — | MANUAL[change full_name → other librarians get a `user_update` notification] |
| P2-T5-USR-001 | `GET /api/users` | `users` | LibrarianPortal "Manage Users" | librarian-flow.spec T1 |
| P2-T5-USR-002 | `POST /api/users` | `users`, `notifications` | LibrarianPortal | librarian-flow.spec T1 |
| P2-T5-USR-003 | `PUT /api/users/:id` | `users` | LibrarianPortal | MANUAL[edit a student's full_name → row in `sqlite3 library.db "SELECT full_name FROM users WHERE id=?"` matches] |
| P2-T5-USR-004 | `PATCH /api/users/:id/deactivate` | `users.active` | LibrarianPortal | A8 |
| P2-T5-USR-005 | `POST /api/librarian/users/bulk-action` | `users` | LibrarianPortal | MANUAL[select 2 students → bulk deactivate → both rows show `active=0`] |
| P2-T6-REC-001 | `GET /api/books/borrow-records` | `borrow_records ∪ books ∪ users` | LibrarianPortal "Borrow Records" | MANUAL[after C1, list contains the 3 borrowed books with status=active and matching user/book names] |
| P2-T6-REC-002 | `GET /api/books/borrow-records/export` | — | LibrarianPortal | D18 |
| P2-T7-EDIT-001 | `PUT /api/books/:id/edit` | `books` | AuthorPortal edit modal | MANUAL[edit an approved (not-borrowed) book → status reverts to 'pending'; librarian gets `new_submission`] |
| P2-T7-DEL-002 | `DELETE /api/books/:id` | `books.status=pending_deletion`, `notifications` | AuthorPortal | C12 |
| P2-T7-DEL-003 | `PATCH /api/books/:id/approve-delete` · `.../reject-delete` | many tables (cascade) | LibrarianPortal | C13 |
| P2-T7-DEL-004 | `POST /api/books/bulk-delete` | `books` | AuthorPortal | MANUAL[select 2 own books → bulk delete → both rows transition to pending_deletion] |
| P2-T7-DRAFT-005 | `POST /api/books/draft` · `GET /api/books/my-drafts` | `books.status=draft`, `books.draft_data` | AuthorPortal | C8 · author-flow.spec T1 |
| P2-T8-CR-001 | (frontend localStorage) | `crash_recovery` (server mirror, optional) | `components/CrashRecovery.jsx::useSessionRecorder` | crash-recovery.spec T1 |
| P2-T8-CR-002 | `POST /api/shutdown` (server) | — | `App.jsx::CrashRecoveryWrapper` | crash-recovery.spec T1 |
| P2-T8-CR-003 | — | — | `App.jsx`, `CrashRecovery.jsx::beforeunload` | MANUAL[set bv_should_clear (via close), re-open browser → no toast, default tab] |
| P2-T8-CR-004 | — | — | `App.jsx`, `REFRESH_FLAG` | crash-recovery.spec T2 |
| P2-T8-CR-005 | `POST /api/shutdown` | — | `CrashRecovery.jsx::CrashUnrecoverableButton` | crash-recovery.spec T3 |
| P2-T8-CR-006 | `POST /api/recovery/save` · `GET /api/recovery/state` · `DELETE /api/recovery/clear` | `crash_recovery` | — | MANUAL[curl POST /api/recovery/save with `{screen,portal,state_data}` and TOKEN → 200; then GET /api/recovery/state → has_recovery:true] |
| P3-T1-REV-001 | `POST /api/reviews` | `reviews UNIQUE(user_id,book_id)` | `components/ReviewSection.jsx` | D1-D3 |
| P3-T1-REV-002 | `GET /api/reviews/book/:bookId` · `GET /api/reviews/aggregate` | `reviews`, `review_replies` | ReviewSection | D4 |
| P3-T1-REV-003 | `POST /api/reviews/:id/reply` | `review_replies`, `notifications` | `components/AuthorReviews.jsx` | MANUAL[author posts a reply on a review of own book → reviewer notification `review_reply` appears] |
| P3-T1-REV-004 | `POST /api/reviews/:id/flag` · `GET /api/reviews/flagged` · `POST /api/reviews/:id/resolve-flag` · `POST /api/reviews/bulk-resolve-flags` | `reviews.flagged`, `reviews.flag_pending` | LibrarianPortal "Flagged Reviews", AuthorReviews | D5-D7 |
| P3-T1-REV-005 | `services/llm.js::classifySentiment` | `reviews.sentiment` | invisible | D2 (sentiment field present) |
| P3-T1-REV-006 | `POST /api/reviews/:id/helpful` | `reviews.helpful_count` | ReviewSection | MANUAL[click "helpful" twice → count increments by 2 (documented dedup-by-design; see HI-10)] |
| P3-T2-HIST-001 | `GET /api/history` | `borrow_records ∪ books ∪ reading_progress ∪ bookmarks` | `components/ReadingHistory.jsx` | D13 |
| P3-T2-INS-002 | `GET /api/history/insights` | many | ReadingHistory insights tab | D14 |
| P3-T2-ACH-003 | `GET /api/history/achievements` | `borrow_records`, `reviews` | ReadingHistory achievements tab | D15 |
| P3-T2-HIST-004 | `GET /api/history/export?format=csv|pdf` | — | ReadingHistory | MANUAL[GET `/api/history/export?format=csv` → CSV downloads with header "Title,Author,…"; `?format=pdf` returns application/pdf] |
| P3-T2-INS-005 | `POST /api/history/progress` | `reading_progress` | PDFReader | MANUAL[POST `{book_id, current_page:5, total_pages:50, seconds_increment:30}` twice → row has seconds_read=60] |
| P3-T3-REQ-001 | `POST /api/requests` | `book_requests`, `notifications` | `components/BookRequests.jsx` | D8 |
| P3-T3-REQ-002 | `GET /api/requests/check-duplicate` | `book_requests` | BookRequests | MANUAL[create request "Foo" by "Bar"; GET `/api/requests/check-duplicate?title=foo&author=bar` → `{duplicate:true,status:'pending'}`] |
| P3-T3-REQ-003 | `GET /api/requests` · `PATCH /api/requests/:id/priority` · `PATCH /api/requests/:id/reject` | `book_requests`, `notifications` | `components/ManageRequests.jsx` | D9-D10 |
| P3-T3-OL-004 | `GET /api/requests/:id/openlibrary-search` | (none — external) | ManageRequests | D11 |
| P3-T3-OL-005 | `POST /api/requests/:id/download` | `books`, `downloaded_books`, `book_requests`, `notifications` | ManageRequests | MANUAL[OFFLINE-SKIP-OK; ONLINE: pick a result with ia_id → POST download → new book in catalog; `book_requests.status='fulfilled'`; `downloaded_books.source='open_library'`] |
| P3-T3-OL-006 | `services/llm.js::generateBookSummary` | `books.description` | ManageRequests checkbox | MANUAL[when DASHSCOPE_API_KEY set: download with generate_summary=true → new book's description differs from default "by … from Internet Archive"] |
| P3-T3-REQ-007 | `POST /api/requests/:id/upload-manual` | `books`, `downloaded_books` | ManageRequests | MANUAL[librarian uploads PDF via manual form → new book row; downloaded_books.source='manual_upload'] |
| P3-T3-REQ-008 | (server fan-out inside download/upload-manual) | `notifications.type=similar_book_added` | — | MANUAL[two users request "Foo by Bar" and "Foo by Baz"; fulfill the first → second user gets `similar_book_added`] |
| P3-T3-REQ-009 | `GET /api/requests/analytics` | `book_requests` | ManageRequests | MANUAL[GET endpoint → response has `byStatus`, `byGenre`, `byAuthor`, `overTime` arrays] |
| P3-T4-STAT-001 | `GET /api/stats/author` | many | `components/AuthorStats.jsx` | D16 |
| P3-T4-STAT-002 | same | same | AuthorStats | D16 |
| P3-T4-STAT-003 | `GET /api/stats/author/export` | — | AuthorStats | MANUAL[GET endpoint → CSV with header "Title,Genre,Status,Borrows,Avg Rating,Reviews"] |
| P3-T4-STAT-004 | `GET /api/stats/author` (status!='draft') | `books` | AuthorStats | MANUAL[author with 1 draft + 1 approved → endpoint returns 1 book in `books[]`] |
| P3-T5-MGT-001 | `GET /api/librarian/books` | `books` | `components/ManagePublishedBooks.jsx` | MANUAL[librarian visits Manage Books → table lists ALL non-draft books across all authors, all statuses] |
| P3-T5-MGT-002 | `PUT /api/librarian/books/:id` | `books`, `book_versions` | ManagePublishedBooks edit modal | MANUAL[librarian edits a book title → `book_versions` row appended with `changes` JSON showing from/to] |
| P3-T5-MGT-003 | `POST /api/librarian/books` | `books` | ManagePublishedBooks add modal | MANUAL[librarian adds a new book directly with title/author/genre + file → book appears in `/api/books` immediately approved] |
| P3-T5-MGT-004 | `POST /api/librarian/books/bulk-delete` | cascade across 9 tables | ManagePublishedBooks | MANUAL[select 2 books with reviews + bookmarks → bulk delete → `sqlite3` shows zero rows in any related table for those book_ids] |
| P3-T5-MGT-005 | `GET /api/librarian/books/:id/versions` | `book_versions` | ManagePublishedBooks history drawer | MANUAL[after 2 edits, endpoint returns 2 versions newest-first with parsed `changes` object] |
| P3-T6-LLM-001 | `POST /api/llm/summary` | optional `services/pdfExtract` | AuthorPortal "Generate Summary" button | D12 |
| P3-T6-LLM-002 | `services/llm.js::classifySentiment` (used by reviews route) | `reviews.sentiment` | — | D2 |
| P3-T6-LLM-003 | (graceful failure across LLM call sites) | — | — | D12 (without key) |
| P3-T7-DLS-001 | `GET /api/stats/downloaded` | `downloaded_books ∪ books ∪ reviews` | `components/DownloadedStats.jsx` | D17 |
| P3-T7-DLS-002 | same (by_source) | `downloaded_books.source` | DownloadedStats | D17 |
| NFR-PERF-001 | — | — | (Vite bundle) | MANUAL[in DevTools, Network panel → DOMContentLoaded < 2000ms on a clean reload] |
| NFR-SEC-001 | (response shaping in routes) | — | — | MANUAL[`grep -r "password_hash" backend/routes` → no `res.json` line includes it] |
| NFR-SEC-002 | `authenticate` on every router except `auth` | — | — | N3, N4 |
| NFR-SEC-003 | `authorize(...)` factory | — | — | N1, N2 |
| NFR-SEC-004 | (`db.prepare` everywhere) | — | — | MANUAL[`grep -nE "db\\.exec.*\\$\\{|db\\.exec.*\\+" backend` → only DDL constants, never user input] |
| NFR-SEC-005 | (multer config) | — | — | N5, N6, N7 |
| NFR-UX-001 | — | — | `styles/global.css` | MANUAL[visual: Cormorant Garamond display headings + DM Sans body; navy/gold/emerald/ruby visible on at least 3 screens] |
| NFR-UX-002 | — | — | every page | MANUAL[resize window to 768px → sidebar collapses gracefully, no horizontal scrollbar on any tab] |
| NFR-DATA-001 | `database.js` pragmas | — | — | MANUAL[`sqlite3 backend/data/library.db "PRAGMA journal_mode; PRAGMA foreign_keys;"` → `wal` and `1`] |
| NFR-DATA-002 | `uuidv4()` calls | — | — | MANUAL[`sqlite3 backend/data/library.db "SELECT id FROM users LIMIT 1;"` → 36-char UUID format] |

---

## Appendix-R · Route → Code map

For agents implementing each route, here is the source-of-truth path inside the **reference** repo. The rebuilt repo will mirror these paths.

| Endpoint | File:lines (reference) |
|---|---|
| `POST /api/auth/register` | `backend/routes/auth.js:51-115` |
| `POST /api/auth/login` | `backend/routes/auth.js:121-164` |
| `GET /api/books` | `backend/routes/books.js:86-96` |
| `GET /api/books/recommendations` | `backend/routes/books.js:99-113` |
| `POST /api/books/:id/borrow` | `backend/routes/books.js:119-198` |
| `POST /api/books/bulk-borrow` | `backend/routes/books.js:202-262` |
| `GET /api/books/my-borrows` | `backend/routes/books.js:268-287` |
| `POST /api/books/bulk-return` | `backend/routes/books.js:293-324` |
| `POST /api/books/:id/return` | `backend/routes/books.js:330-372` |
| `POST /api/books/submit` | `backend/routes/books.js:382-440` |
| `POST /api/books/draft` | `backend/routes/books.js:446-495` |
| `GET /api/books/my-submissions` | `backend/routes/books.js:501-510` |
| `GET /api/books/my-drafts` | `backend/routes/books.js:516-525` |
| `GET /api/books/pending` | `backend/routes/books.js:535-560` |
| `PATCH /api/books/:id/approve` | `backend/routes/books.js:566-591` |
| `PATCH /api/books/:id/reject` | `backend/routes/books.js:597-620` |
| `PATCH /api/books/:id/approve-delete` | `backend/routes/books.js:626-686` |
| `PATCH /api/books/:id/reject-delete` | `backend/routes/books.js:692-709` |
| `POST /api/books/bulk-action` | `backend/routes/books.js:715-745` |
| `GET /api/books/download/:id` | `backend/routes/books.js:751-760` |
| `GET /api/books/view/:id` | `backend/routes/books.js:766-785` |
| `GET /api/books/quick-review/:id` | `backend/routes/books.js:792-810` |
| `PUT /api/books/:id/edit` | `backend/routes/books.js:820-890` |
| `DELETE /api/books/:id` | `backend/routes/books.js:896-924` |
| `POST /api/books/bulk-delete` | `backend/routes/books.js:930-964` |
| Bookmarks/Highlights CRUD | `backend/routes/books.js:975-1051` |
| `GET /api/books/borrow-records` | `backend/routes/books.js:1061-1098` |
| `GET /api/books/borrow-records/export` | `backend/routes/books.js:1104-1126` |
| `GET /api/books/preview/:id` | `backend/routes/books.js:1136-1155` |
| `GET /api/users/profile` ··· `POST /api/users/profile-picture` | `backend/routes/users.js:49-171` |
| `GET /api/users` (librarian) ··· `PATCH /api/users/:id/deactivate` | `backend/routes/users.js:181-315` |
| Notifications | `backend/routes/notifications.js:14-129` |
| Recovery | `backend/routes/recovery.js:42-93` |
| Reviews (all) | `backend/routes/reviews.js:16-307` |
| Requests (all) | `backend/routes/requests.js:21-363` |
| History (all) | `backend/routes/history.js:14-230` |
| Stats (all) | `backend/routes/stats.js:13-192` |
| Librarian (all) | `backend/routes/librarian.js:34-232` |
| LLM summary | `backend/routes/llm.js:18-37` |
| `GET /api/health` · `POST /api/shutdown` | `backend/server.js:38-46` |
