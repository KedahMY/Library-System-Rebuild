# 06 · Screen & Interaction Flow

> One section per portal. Each section lists tabs (must match exact `id` strings), state, key user flows, and modals.
>
> Tab `id` values are used by the crash-recovery snapshot. **Do not rename them** — they are the source of restoration after a crash.

---

## 1. Cross-cutting

### 1.1 Layout

Every portal renders:
- `<Sidebar />` (left) with brand, role pill, nav items, unread-notifications badge, **Logout**, **Crash Test**, optionally **Crash (No Recovery)**.
- A right-hand main area with the current tab's content.

### 1.2 Recovery context

```
App
└── AuthProvider
    └── BrowserRouter
        └── CrashRecoveryWrapper            <RecoveryContext.Provider>
            └── Routes
                ├── /login                 LoginPage
                ├── /register              RegisterPage
                ├── /portal                <PortalRedirect />
                ├── /student               <ProtectedRoute roles=[student,staff]><StudentPortal /></...>
                ├── /author                <ProtectedRoute roles=[author]><AuthorPortal /></...>
                └── /librarian             <ProtectedRoute roles=[librarian]><LibrarianPortal /></...>
```

`useRecovery()` exposes `{ recoveryState, clearRecoveryState }`. Each portal:
1. On first render, reads `recoveryState` and `setX(...)` any present field, then calls `clearRecoveryState()`.
2. Calls `useSessionRecorder(portalName, activeTab, stateSnapshot)` — the snapshot is portal-specific (see below).

---

## 2. LoginPage

- **Path**: `/login`
- **State**: `{ username, password }`, `error`, `loading`.
- **Submit**: `auth.login(username, password)` → on success, navigate to `/student | /author | /librarian` (lookup by `user.role`).
- **Errors**: server returns `{error: "..."}`; show inline alert.
- **Link**: "Create one" → `/register`.

---

## 3. RegisterPage

- **Path**: `/register`
- **Role grid**: 4 buttons (student, staff, author, librarian).
- **Fields**: username, full_name, password, confirmPassword. Conditional: bio (author), employee_id (librarian).
- **Client validation**: passwords match.
- **Submit**: `auth.register(form)` → on success show inline success + redirect to `/login` after 2 s.
- **Server errors**: render per-field via `errors.{username|full_name|password|role}`.

---

## 4. StudentPortal `id='student'`

Tabs (NAV_ITEMS, exact ids):
```
[
  { id: 'browse',          label: 'Browse Books',    icon: '🔍' },
  { id: 'recommendations', label: 'Recommended',     icon: '⭐' },
  { id: 'my-books',        label: 'My Borrows',      icon: '📖' },
  { id: 'history',         label: 'Reading History', icon: '📜' },
  { id: 'requests',        label: 'Book Requests',   icon: '📨' },
  { id: 'notifications',   label: 'Notifications',   icon: '🔔' },
  { id: 'profile',         label: 'My Profile',      icon: '👤' },
]
```

### 4.1 Snapshot fields (saved to localStorage on every change + every 5 s)

```js
useSessionRecorder('student', activeTab, {
  search, filterGenre, filterAvail, filterDate,
  multiBorrowMode, multiBorrowDuration, selectedForBorrow: [...selectedForBorrow],
  selectedBook, readingBook: { book_id, title, author_name, file_name } | null,
  notifFilter: { category, priority, search }, notifShowArchived,
  borrowSearch, borrowFilterGenre, borrowFilterAvail, borrowFilterDate,
})
```

### 4.2 Flows

**Browse → Borrow (single)**
1. `useEffect`: `GET /api/books` → list.
2. Filter client-side on title/author/genre/availability/publish-date.
3. Click card → opens `<BookModal />` showing description + duration slider + Borrow CTA.
4. CTA: `POST /api/books/:id/borrow` with `duration_days`. On 400 show error, on 200 update state and toast due date.

**Browse → Multi-Borrow**
1. Toggle "Select multiple". Each available book card shows a checkbox.
2. Pick books → click "Borrow N selected" → confirmation dialog (due date).
3. `POST /api/books/bulk-borrow { book_ids, duration_days }`.

**My Borrows → Read PDF**
1. `GET /api/books/my-borrows` returns `{borrows[], active_count, borrow_limit}`.
2. Click "Read" → render `<PDFReader book={borrow} />`.
3. PDFReader fetches `/api/books/view/:id` with auth → blob URL → render via pdfjs.
4. Inside reader:
   - Bookmarks panel: GET/POST/DELETE `/api/books/:id/bookmarks`.
   - Highlights panel: GET/POST/DELETE `/api/books/:id/highlights`.
   - Progress save: throttled POST `/api/history/progress { book_id, current_page, total_pages, seconds_increment }`.
5. Quick Review for unborrowed approved books: `<QuickReview book={book} />` calls `/api/books/quick-review/:id`.

**My Borrows → Return**
- Single: `POST /api/books/:id/return`.
- Bulk: `POST /api/books/bulk-return { book_ids }`.

**Reading History**
- `<ReadingHistory />`:
  - `GET /api/history` with filters (search, genre, date range, status).
  - Insights tab: `GET /api/history/insights` → render genre pie, monthly line, total seconds.
  - Achievements tab: `GET /api/history/achievements`.
  - Export buttons: `GET /api/history/export?format=csv|pdf`.

**Book Requests**
- `<BookRequests />` submit form: `POST /api/requests`.
- Duplicate check on input change: `GET /api/requests/check-duplicate?title=...&author=...`.
- "My requests" list: `GET /api/requests/mine`.

**Notifications**
- `<NotificationBoard />`:
  - `GET /api/notifications` with filters (category, priority, search, is_archived).
  - Per-item: read (`PATCH /api/notifications/:id/read`), archive (`PATCH /api/notifications/:id/archive`), delete.
  - "Mark all read" (`PATCH /api/notifications/read-all`).
- Sidebar badge polls `GET /api/notifications/unread-count`.

**Profile**
- `<ProfileEditor />`:
  - `GET /api/users/profile` → form.
  - Edit: `PUT /api/users/profile` (requires current password).
  - Change password: `PUT /api/users/password`.
  - Upload avatar: `POST /api/users/profile-picture` (multipart).

---

## 5. AuthorPortal `id='author'`

Tabs:
```
[
  { id: 'publish',       label: 'Publish New Book', icon: '✍️' },
  { id: 'submissions',   label: 'My Submissions',   icon: '📋' },
  { id: 'drafts',        label: 'Drafts',           icon: '📝' },
  { id: 'stats',         label: 'Stats',            icon: '📊' },
  { id: 'reviews',       label: 'Reviews',          icon: '💬' },
  { id: 'notifications', label: 'Notifications',    icon: '🔔' },
  { id: 'profile',       label: 'My Profile',       icon: '👤' },
]
```

### 5.1 Snapshot fields

```js
useSessionRecorder('author', activeTab, { form, draftId, notifFilter, notifShowArchived })
```
`form` = `{ title, genre: string[], description }`.

### 5.2 Flows

**Publish New Book**
1. Multi-select genre chips (16 GENRES enum).
2. Description: minimum 20 chars. "Generate summary" button → `POST /api/llm/summary { title, author, genre, style }`.
3. File upload: drag-drop or browse. PDF/TXT/DOC/DOCX, ≤50 MB.
4. Optional cover image: JPG/PNG, ≤2 MB.
5. Auto-save: on form-edit, debounced 3 s → `POST /api/books/draft` (multipart). Server returns `draft_id`; client tracks it.
6. Submit: `POST /api/books/submit` (multipart). If `draft_id` was set, server clears it.

**My Submissions**
- `GET /api/books/my-submissions` → list with status badges.
- Per-item actions when allowed:
  - Edit (pending OR (approved AND not borrowed)): opens edit modal → `PUT /api/books/:id/edit` (multipart). If was approved → server reverts to pending and notifies librarians.
  - Delete (not currently borrowed): `DELETE /api/books/:id` → state becomes `pending_deletion`.
  - Bulk select + bulk delete: `POST /api/books/bulk-delete { book_ids }`.
  - View rejection reason if status='rejected'.

**Drafts**
- `GET /api/books/my-drafts` → list of `{id, title, genre, description, draft_data}`.
- "Resume" → populate the publish form, set `draftId`.

**Stats**
- `<AuthorStats />`:
  - `GET /api/stats/author` → render per-book table + summary card + sentiment pie + 30-day borrow chart.
  - Export CSV: `GET /api/stats/author/export`.

**Reviews**
- `<AuthorReviews />`:
  - For each of the author's books, list reviews. Reply per review (`POST /api/reviews/:id/reply`).
  - Flag a review (`POST /api/reviews/:id/flag`).

**Notifications, Profile** — same as student.

---

## 6. LibrarianPortal `id='librarian'`

Tabs:
```
[
  { id: 'pending',           label: 'Pending Submissions', icon: '⏳' },
  { id: 'all',               label: 'All Submissions',     icon: '📋' },
  { id: 'manage-books',      label: 'Manage Books',        icon: '📚' },
  { id: 'requests',          label: 'Book Requests',       icon: '📨' },
  { id: 'downloaded-stats',  label: 'Downloaded Stats',    icon: '📊' },
  { id: 'flagged-reviews',   label: 'Flagged Reviews',     icon: '🚩' },
  { id: 'users',             label: 'Manage Users',        icon: '👥' },
  { id: 'borrow-records',    label: 'Borrow Records',      icon: '📒' },
  { id: 'notifications',     label: 'Notifications',       icon: '🔔' },
  { id: 'profile',           label: 'My Profile',          icon: '👤' },
]
```

### 6.1 Snapshot fields

```js
useSessionRecorder('librarian', activeTab, {
  filters,            // title/author/genre/status/date_from/date_to
  userFilters,        // role/search
  borrowFilters,      // search/status/date_from/date_to
  notifFilter, notifShowArchived,
  ... // any modal state worth preserving
})
```

### 6.2 Flows

**Pending Submissions / All Submissions**
- `GET /api/books/pending?title=&author=&genre=&status=&date_from=&date_to=` (note: "pending" route returns all non-draft when status filter empty).
- Bulk select + Approve / Reject (`POST /api/books/bulk-action`).
- Preview book file: `<BookPreviewModal>` calls `GET /api/books/preview/:id` and renders in `<iframe>` for PDFs.
- Approve: `PATCH /api/books/:id/approve`. Reject (with optional reason): `PATCH /api/books/:id/reject`.
- For status `pending_deletion`: row shows "Approve Delete" / "Reject Delete" → `PATCH /api/books/:id/approve-delete` or `.../reject-delete`.

**Manage Books** (`<ManagePublishedBooks />`)
- `GET /api/librarian/books` with filters.
- Add new book directly: `POST /api/librarian/books` (multipart; supports `generate_summary='true'`).
- Edit any book: `PUT /api/librarian/books/:id` (multipart).
- View version history: `GET /api/librarian/books/:id/versions`.
- Bulk delete: `POST /api/librarian/books/bulk-delete`.

**Book Requests** (`<ManageRequests />`)
- `GET /api/requests` with filters (`status`, `priority`, `search`).
- Change priority: `PATCH /api/requests/:id/priority { priority }`.
- Reject: `PATCH /api/requests/:id/reject { note }`.
- Fulfill via Open Library:
  1. `GET /api/requests/:id/openlibrary-search` → renders `exact` and `alternatives`.
  2. Pick a result with `ia_id` → `POST /api/requests/:id/download { ia_id, ol_title, ol_author, cover_id, generate_summary }`.
- Fulfill via manual upload: `POST /api/requests/:id/upload-manual` (multipart book + cover).
- Analytics view: `GET /api/requests/analytics`.

**Downloaded Stats** (`<DownloadedStats />`)
- `GET /api/stats/downloaded` → renders source breakdown + per-book table.

**Flagged Reviews**
- `GET /api/reviews/flagged` → list rows with reviewer, book, content preview.
- Per row: Accept (`POST /api/reviews/:id/resolve-flag { action: 'accept' }`) hides; Reject (`{action:'reject'}`) restores.
- Bulk: `POST /api/reviews/bulk-resolve-flags { review_ids, action }`.

**Manage Users**
- `GET /api/users?role=&search=`.
- Create user: `POST /api/users` (form with role, username, full_name, password, optional bio/employee_id).
- Edit user: `PUT /api/users/:id`.
- Toggle active: `PATCH /api/users/:id/deactivate`.
- Bulk action: `POST /api/librarian/users/bulk-action { user_ids, action, role? }`.
- View activity (drawer): `GET /api/stats/user-activity/:userId`.

**Borrow Records**
- `GET /api/books/borrow-records?search=&status=&date_from=&date_to=`.
- Export: `GET /api/books/borrow-records/export` (CSV).

**Announcements** (inside Notifications tab or separate panel)
- `POST /api/notifications/announcement { title, message, target_role?, priority? }`.

**Profile** — same as student.

---

## 7. Crash Recovery — End-to-End Flow

This is **the** behavior the rebuild must reproduce verbatim.

### 7.1 Save loop (frontend)

`useSessionRecorder(portal, activeTab, stateSnapshot)`:
- Every render, refresh `latestRef`.
- When stringified `{portal, activeTab, stateSnapshot}` changes, write `localStorage.bv_session_<userId> = JSON.stringify({userId, portal, activeTab, stateSnapshot, updatedAt})`.
- `setInterval(save, 5000)` for periodic safety.
- `beforeunload`:
  - If `localStorage.bv_crash_no_recovery` present → wipe record, clear key, return.
  - Else save record. If `localStorage.bv_crash_test` is NOT present → set `bv_should_clear` (with userId) and `sessionStorage.bv_is_refresh='true'`.

### 7.2 Restore on mount (App → CrashRecoveryWrapper)

Reads `sessionStorage.bv_is_refresh` **synchronously at component creation** (before any effect), keeps in a ref. After auth resolves:

| Sequence | Action |
|---|---|
| 1. Logout transition (user → null) | Delete `bv_session_<userId>` and `bv_should_clear` |
| 2. Fresh login, `bv_is_refresh=true` | Clear `bv_should_clear`; restore record (silent) |
| 3. Fresh login, `bv_crash_test` set | Remove `bv_crash_test` and `bv_should_clear`; restore record (toast "recovered after crash test") |
| 4. Fresh login, neither flag | Real-crash path: clear `bv_should_clear`; restore record (error-styled toast); if no record → fresh start |

### 7.3 Buttons

- `<CrashTestButton />` — POSTs to `/api/shutdown` (URL hard-coded to `http://localhost:8000/api/shutdown`). Beforehand: nothing — relies on `beforeunload` setting `bv_crash_test` only if it was already set. **In the reference, this button does NOT set `bv_crash_test` itself**; the reference flow depends on the actual close to trigger `beforeunload` while the `bv_should_clear` flag is being set, and the wrapper then treats absence-of-flag as a real crash. (Verify in the reference: it's actually a "real crash" simulation. Keep it that way.)
- `<CrashUnrecoverableButton />` — sets `bv_crash_no_recovery`, removes the record immediately, then POSTs `/api/shutdown`.

### 7.4 Server-side mirror (rarely used by frontend)

- `POST /api/recovery/save { screen, portal, state_data }` — upsert into `crash_recovery` (UNIQUE user_id).
- `GET /api/recovery/state` → `{has_recovery, screen, portal, state_data, updated_at}`.
- `DELETE /api/recovery/clear`.

This server path is wired for `navigator.sendBeacon` (which can't set headers) via the `authenticateWithFallback` middleware that also accepts `_token` in body. The current frontend does not actively call these — keep the endpoints for completeness.

---

## 8. Modal Inventory

| Modal | Where | Purpose |
|---|---|---|
| Book details | `<BookModal />` | Student-side: shows description, cover, borrow CTA with duration slider |
| Book preview | `<BookPreviewModal />` inside LibrarianPortal | Librarian-side: fetch /preview/:id as blob, render PDF in iframe |
| Edit book (author) | inline in AuthorPortal | Form to PUT /books/:id/edit |
| Edit book (librarian) | inline in ManagePublishedBooks | Form to PUT /librarian/books/:id |
| Confirm return | inline in StudentPortal | Confirm before POST /books/:id/return |
| Confirm bulk action | inline | Approve/reject/delete with feedback textarea |
| Open Library search | inside `<ManageRequests />` | Renders `exact` + `alternatives`, per-row Download CTA |
| Profile editor | `<ProfileEditor />` | Tabs: profile, password, avatar |

---

## 9. Empty & Error States

Each list view shows an explicit empty state ("No books match these filters" / "No notifications yet"). On 4xx/5xx, show the server's `error` string in an inline alert; never silent-fail.
