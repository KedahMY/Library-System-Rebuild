# 05 · Data Model

> **Authoritative schema** for the rebuild. Copy the DDL block verbatim into `backend/database.js`'s `initializeDatabase()` function. Keep the migration functions; they let a stale DB upgrade in place.

---

## 1. Pragmas

```js
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

---

## 2. DDL (paste into `initializeDatabase()`)

```sql
-- USERS -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,                                  -- UUID v4
  username        TEXT UNIQUE NOT NULL,
  full_name       TEXT NOT NULL,
  password_hash   TEXT NOT NULL,                                     -- bcrypt cost=12
  role            TEXT NOT NULL CHECK(role IN ('student','staff','author','librarian')),
  bio             TEXT,                                              -- authors only
  employee_id     TEXT,                                              -- librarians only
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  -- profile_picture, active, last_login added by migrateAddNewColumns
);

-- BOOKS -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  author_name     TEXT NOT NULL,                                     -- denormalized
  genre           TEXT NOT NULL,                                     -- comma-separated tags
  description     TEXT NOT NULL,
  file_path       TEXT,                                              -- absolute, see resolveFilePath
  file_name       TEXT,                                              -- original upload name
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','approved','rejected','draft','pending_deletion')),
  availability    TEXT NOT NULL DEFAULT 'available'
                  CHECK(availability IN ('available','borrowed')),
  publish_date    DATETIME,                                          -- set on approve
  submitted_date  DATETIME DEFAULT CURRENT_TIMESTAMP,
  draft_data      TEXT,                                              -- JSON string for autosave
  times_borrowed  INTEGER DEFAULT 0,
  FOREIGN KEY (author_id) REFERENCES users(id)
  -- cover_image, rejection_reason added by migrateAddNewColumns
);

-- BORROW RECORDS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS borrow_records (
  id              TEXT PRIMARY KEY,
  book_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  borrow_date     DATETIME DEFAULT CURRENT_TIMESTAMP,
  due_date        DATETIME NOT NULL,
  return_date     DATETIME,                                          -- NULL until returned/auto-returned
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK(status IN ('active','returned','overdue')),  -- 'overdue' reserved; current code uses 'active' + due_date < now
  FOREIGN KEY (book_id) REFERENCES books(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- BOOKMARKS -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookmarks (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  book_id         TEXT NOT NULL,
  page_number     INTEGER NOT NULL,
  label           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (book_id) REFERENCES books(id)
);

-- HIGHLIGHTS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS highlights (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  book_id         TEXT NOT NULL,
  page_number     INTEGER NOT NULL,
  text_content    TEXT NOT NULL,
  color           TEXT DEFAULT '#c9a84c',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (book_id) REFERENCES books(id)
);

-- NOTIFICATIONS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,                                     -- the recipient
  type            TEXT NOT NULL,                                     -- see Appendix-N for the enum
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  priority        TEXT DEFAULT 'normal',                             -- 'normal' | 'urgent' | 'high'
  category        TEXT DEFAULT 'general',                            -- 'general' | 'borrow' | 'submissions' | 'users' | 'announcement'
  is_read         INTEGER DEFAULT 0,
  is_archived     INTEGER DEFAULT 0,
  related_id      TEXT,                                              -- book id / user id / request id
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- CRASH RECOVERY (server-side mirror) -----------------------------------
CREATE TABLE IF NOT EXISTS crash_recovery (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE,
  screen          TEXT NOT NULL,
  portal          TEXT NOT NULL,
  state_data      TEXT,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- REVIEWS ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  book_id         TEXT NOT NULL,
  rating          INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  content         TEXT,
  anonymous       INTEGER DEFAULT 0,
  helpful_count   INTEGER DEFAULT 0,
  flagged         INTEGER DEFAULT 0,                                 -- 1 → hidden from public
  sentiment       TEXT,                                              -- 'positive' | 'neutral' | 'negative'
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (book_id) REFERENCES books(id)
  -- flag_pending added by migrateAddNewColumns
);

-- REVIEW REPLIES --------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_replies (
  id              TEXT PRIMARY KEY,
  review_id       TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- BOOK REQUESTS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_requests (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  title              TEXT NOT NULL,
  author             TEXT NOT NULL,
  genre              TEXT NOT NULL,
  reason             TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK(status IN ('pending','approved','rejected','fulfilled')),
  priority           TEXT DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
  librarian_note     TEXT,
  fulfilled_book_id  TEXT,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (fulfilled_book_id) REFERENCES books(id)
);

-- READING PROGRESS ------------------------------------------------------
CREATE TABLE IF NOT EXISTS reading_progress (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  book_id         TEXT NOT NULL,
  current_page    INTEGER DEFAULT 1,
  total_pages     INTEGER,
  seconds_read    INTEGER DEFAULT 0,
  last_read_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (book_id) REFERENCES books(id)
);

-- BOOK VERSIONS (librarian edits) ---------------------------------------
CREATE TABLE IF NOT EXISTS book_versions (
  id              TEXT PRIMARY KEY,
  book_id         TEXT NOT NULL,
  changed_by      TEXT NOT NULL,
  changes         TEXT NOT NULL,                                     -- JSON diff
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(id),
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- USER ACTIVITY ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_activity (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  activity_type   TEXT NOT NULL,
  details         TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- DOWNLOADED BOOKS (from OL or manual upload) ---------------------------
CREATE TABLE IF NOT EXISTS downloaded_books (
  id              TEXT PRIMARY KEY,
  book_id         TEXT NOT NULL,
  request_id      TEXT,
  source          TEXT,                                              -- 'open_library' | 'manual_upload'
  source_url      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(id),
  FOREIGN KEY (request_id) REFERENCES book_requests(id)
);
```

---

## 3. Required Migrations

Run on every boot **after** the `CREATE TABLE IF NOT EXISTS` block.

### 3.1 `migrateAddDraftStatus()`
Rebuilds `books` if its CHECK constraint lacks `'draft'`. See reference `database.js:233-277`.

### 3.2 `migrateAddPendingDeletion()`
Rebuilds `books` if its CHECK constraint lacks `'pending_deletion'`. Adds `cover_image` and `rejection_reason` columns at the same time (idempotent). See reference `database.js:283-339`.

### 3.3 `migrateAddNewColumns()`
For each: check `PRAGMA table_info(<table>)`, ALTER TABLE ADD COLUMN if missing.

| Table | Column | Type | Default |
|---|---|---|---|
| `users` | `profile_picture` | TEXT | NULL |
| `users` | `active` | INTEGER | 1 |
| `users` | `last_login` | DATETIME | NULL |
| `books` | `cover_image` | TEXT | NULL |
| `books` | `rejection_reason` | TEXT | NULL |
| `reviews` | `flag_pending` | INTEGER | 0 |

---

## 4. Indexes (recommended, optional)

The reference does not create indexes — SQLite is fast enough for the scale tested. If you add them, document in `decisions.md`. Useful candidates:

```sql
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author_id);
CREATE INDEX IF NOT EXISTS idx_borrow_user_status ON borrow_records(user_id, status);
CREATE INDEX IF NOT EXISTS idx_borrow_book_status ON borrow_records(book_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, is_archived);
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id, flagged);
```

---

## 5. Entity-Relationship Summary

```
users 1 ─── n books              (author_id)
users 1 ─── n borrow_records      (user_id)
books 1 ─── n borrow_records      (book_id)
users 1 ─── n bookmarks           (user_id)
books 1 ─── n bookmarks           (book_id)
users 1 ─── n highlights
books 1 ─── n highlights
users 1 ─── n notifications       (recipient)
users 1 ─── 0..1 crash_recovery   (UNIQUE user_id)
users 1 ─── n reviews             (UNIQUE(user_id,book_id))
books 1 ─── n reviews
reviews 1 ─── n review_replies
users 1 ─── n book_requests
books 1 ─── 0..1 book_requests    (fulfilled_book_id reverse)
users 1 ─── 0..1 reading_progress per book (UNIQUE)
books 1 ─── n book_versions
users 1 ─── n book_versions       (changed_by)
users 1 ─── n user_activity
books 1 ─── 0..1 downloaded_books
book_requests 1 ─── 0..1 downloaded_books (request_id)
```

---

## 6. Lifecycle Rules

### 6.1 Book status FSM

```
draft  ──submit──▶ pending  ──approve──▶ approved  ──borrow──▶ availability=borrowed
                       │                      │  ──return──▶ availability=available
                       │                      │  ──author-edit──▶ pending  (revert)
                       │                      │  ──author-delete──▶ pending_deletion
                       │                      │
                       └──reject──▶ rejected
                                                       pending_deletion ──approve-delete──▶ ✕ (hard delete)
                                                                          ──reject-delete──▶ approved
```

### 6.2 Borrow record FSM

```
created                  ─── active   (due_date in future)
returned by user         ─── returned
auto-returned (overdue)  ─── returned (return_date stamped at sweep time)
```

`status='overdue'` is reserved by the CHECK constraint but the current code uses `status='active' AND due_date < now()` and converts to `returned` on the next sweep. Do not change this behavior.

### 6.3 Review moderation FSM

```
created                       ─── flag_pending=0, flagged=0   (visible)
flagged by author/librarian   ─── flag_pending=1, flagged=0   (still visible)
librarian accepts flag        ─── flag_pending=0, flagged=1   (hidden from public list)
librarian rejects flag        ─── flag_pending=0, flagged=0   (restored)
```

### 6.4 Book request FSM

```
created   ─── pending
          ─── priority normal/urgent (mutable)
librarian rejects   ─── rejected (+ note)
librarian fulfills via OL/manual upload   ─── fulfilled (+ fulfilled_book_id)
```

---

## 7. Seed Data (demo)

Provide `backend/seed_dummy_users.js` (run via `node seed_dummy_users.js`):

| Username | Password | Role | Notes |
|---|---|---|---|
| `student_demo` | `Student@123` | student | |
| `staff_demo` | `Staff@1234` | staff | |
| `author_demo` | `Author@1234` | author | `bio` = "Demo author account for testing." |
| `librarian_demo` | `Librarian@1` | librarian | `employee_id` = "EMP-DEMO-001" |

Insert with `INSERT OR IGNORE` so re-running is safe.

---

## Appendix-N — Notification type / category / priority catalog

The frontend renders all known types with distinct styling. Use these exact strings:

| `type` | Typical `category` | Typical `priority` | Triggered by |
|---|---|---|---|
| `new_submission` | submissions | normal | author submits OR author edits an approved book |
| `approval` | submissions | normal | librarian approves book or approves a delete request |
| `rejection` | submissions | urgent | librarian rejects book or rejects a delete request |
| `delete_request` | submissions | normal | author requests deletion |
| `book_deleted` | general / submissions | normal/urgent | book hard-deleted (notifies borrowers and author) |
| `book_edited` | submissions | normal | librarian edits a book (notifies original author) |
| `auto_return` | borrow | urgent | overdue book auto-returned |
| `due_reminder` | borrow | urgent | book due within 24h |
| `announcement` | announcement | normal/urgent | librarian announcement |
| `user_update` | users | normal | new user registers / librarian creates user / user changes name |
| `new_request` | submissions | normal | student submits a book request |
| `request_rejected` | submissions | urgent | librarian rejects a book request |
| `request_fulfilled` | submissions | normal | librarian fulfills a request (OL or manual) |
| `similar_book_added` | submissions | normal | a similar book to a pending request is added |
| `new_review` | general | normal | a new review is posted (notifies author) |
| `review_reply` | general | normal | author replies to a review (notifies reviewer) |
| `review_flag` | general | high | review is flagged for moderation (notifies librarians) |

Valid `category` values: `general`, `borrow`, `submissions`, `users`, `announcement`.
Valid `priority` values: `normal`, `urgent`, `high`.
