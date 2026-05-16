import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'library.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema DDL — 14 tables (verbarim from spec)
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
-- USERS
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  full_name       TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('student','staff','author','librarian')),
  bio             TEXT,
  employee_id     TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- BOOKS
CREATE TABLE IF NOT EXISTS books (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  author_name     TEXT NOT NULL,
  genre           TEXT NOT NULL,
  description     TEXT NOT NULL,
  file_path       TEXT,
  file_name       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','approved','rejected','draft','pending_deletion')),
  availability    TEXT NOT NULL DEFAULT 'available'
                  CHECK(availability IN ('available','borrowed')),
  publish_date    DATETIME,
  submitted_date  DATETIME DEFAULT CURRENT_TIMESTAMP,
  draft_data      TEXT,
  times_borrowed  INTEGER DEFAULT 0,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- BORROW RECORDS
CREATE TABLE IF NOT EXISTS borrow_records (
  id              TEXT PRIMARY KEY,
  book_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  borrow_date     DATETIME DEFAULT CURRENT_TIMESTAMP,
  due_date        DATETIME NOT NULL,
  return_date     DATETIME,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK(status IN ('active','returned','overdue')),
  FOREIGN KEY (book_id) REFERENCES books(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- BOOKMARKS
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

-- HIGHLIGHTS
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

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  priority        TEXT DEFAULT 'normal',
  category        TEXT DEFAULT 'general',
  is_read         INTEGER DEFAULT 0,
  is_archived     INTEGER DEFAULT 0,
  related_id      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- CRASH RECOVERY
CREATE TABLE IF NOT EXISTS crash_recovery (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE,
  screen          TEXT NOT NULL,
  portal          TEXT NOT NULL,
  state_data      TEXT,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  book_id         TEXT NOT NULL,
  rating          INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  content         TEXT,
  anonymous       INTEGER DEFAULT 0,
  helpful_count   INTEGER DEFAULT 0,
  flagged         INTEGER DEFAULT 0,
  sentiment       TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (book_id) REFERENCES books(id)
);

-- REVIEW REPLIES
CREATE TABLE IF NOT EXISTS review_replies (
  id              TEXT PRIMARY KEY,
  review_id       TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- BOOK REQUESTS
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

-- READING PROGRESS
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

-- BOOK VERSIONS
CREATE TABLE IF NOT EXISTS book_versions (
  id              TEXT PRIMARY KEY,
  book_id         TEXT NOT NULL,
  changed_by      TEXT NOT NULL,
  changes         TEXT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(id),
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- USER ACTIVITY
CREATE TABLE IF NOT EXISTS user_activity (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  activity_type   TEXT NOT NULL,
  details         TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- DOWNLOADED BOOKS
CREATE TABLE IF NOT EXISTS downloaded_books (
  id              TEXT PRIMARY KEY,
  book_id         TEXT NOT NULL,
  request_id      TEXT,
  source          TEXT,
  source_url      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(id),
  FOREIGN KEY (request_id) REFERENCES book_requests(id)
);
`;

// ===========================================================================
// initializeDatabase
// ===========================================================================
export function initializeDatabase() {
  db.exec(SCHEMA_SQL);
  migrateAddDraftStatus();
  migrateAddPendingDeletion();
  migrateAddNewColumns();
}

// ===========================================================================
// Migration 1 — add 'draft' to books.status CHECK
// ===========================================================================
function migrateAddDraftStatus() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='books'").get();
  if (row && !row.sql.includes("'draft'")) {
    db.exec("ALTER TABLE books RENAME TO books_old");
    db.exec(SCHEMA_SQL);
    const oldCols = db.pragma('table_info(books_old)').map(c => c.name);
    const colList = oldCols.join(', ');
    db.exec(`INSERT INTO books (${colList}) SELECT ${colList} FROM books_old`);
    db.exec("DROP TABLE books_old");
  }
}

// ===========================================================================
// Migration 2 — add 'pending_deletion' to books.status CHECK; add columns
// ===========================================================================
function migrateAddPendingDeletion() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='books'").get();
  if (row && !row.sql.includes("'pending_deletion'")) {
    db.exec("ALTER TABLE books RENAME TO books_old");
    db.exec(SCHEMA_SQL);
    const oldCols = db.pragma('table_info(books_old)').map(c => c.name);
    const colList = oldCols.join(', ');
    db.exec(`INSERT INTO books (${colList}) SELECT ${colList} FROM books_old`);
    db.exec("DROP TABLE books_old");
  }

  // Ensure cover_image and rejection_reason columns exist
  const columns = db.pragma('table_info(books)').map(c => c.name);
  if (!columns.includes('cover_image')) {
    db.exec("ALTER TABLE books ADD COLUMN cover_image TEXT");
  }
  if (!columns.includes('rejection_reason')) {
    db.exec("ALTER TABLE books ADD COLUMN rejection_reason TEXT");
  }
}

// ===========================================================================
// Migration 3 — add columns to users, books, reviews
// ===========================================================================
function migrateAddNewColumns() {
  // users: profile_picture, active, last_login
  let columns = db.pragma('table_info(users)').map(c => c.name);
  if (!columns.includes('profile_picture')) {
    db.exec("ALTER TABLE users ADD COLUMN profile_picture TEXT");
  }
  if (!columns.includes('active')) {
    db.exec("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1");
  }
  if (!columns.includes('last_login')) {
    db.exec("ALTER TABLE users ADD COLUMN last_login DATETIME");
  }

  // books: cover_image, rejection_reason
  columns = db.pragma('table_info(books)').map(c => c.name);
  if (!columns.includes('cover_image')) {
    db.exec("ALTER TABLE books ADD COLUMN cover_image TEXT");
  }
  if (!columns.includes('rejection_reason')) {
    db.exec("ALTER TABLE books ADD COLUMN rejection_reason TEXT");
  }

  // reviews: flag_pending
  columns = db.pragma('table_info(reviews)').map(c => c.name);
  if (!columns.includes('flag_pending')) {
    db.exec("ALTER TABLE reviews ADD COLUMN flag_pending INTEGER DEFAULT 0");
  }
}

// ===========================================================================
// processAutoReturns — marks overdue borrows as returned
// ===========================================================================
export function processAutoReturns() {
  const records = db.prepare(`
    SELECT br.*, b.title AS book_title
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.status = 'active' AND br.due_date < datetime('now')
  `).all();

  if (records.length === 0) return;

  const updateBorrow = db.prepare(
    "UPDATE borrow_records SET status = 'returned', return_date = datetime('now') WHERE id = ?"
  );
  const updateBook = db.prepare(
    "UPDATE books SET availability = 'available' WHERE id = ?"
  );
  const insertNotification = db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
    VALUES (?, ?, 'auto_return', 'Book Auto-Returned', ?, 'urgent', 'borrow', ?)
  `);

  const tx = db.transaction(() => {
    for (const r of records) {
      updateBorrow.run(r.id);
      updateBook.run(r.book_id);
      insertNotification.run(
        randomUUID(),
        r.user_id,
        `Your borrow of "${r.book_title}" has been auto-returned as it was overdue.`,
        r.book_id
      );
    }
  });

  tx();
}

// ===========================================================================
// generateDueReminders — creates due_reminder notifications for borrows due
// within the next 24 hours (one per user/book per day)
// ===========================================================================
export function generateDueReminders() {
  const records = db.prepare(`
    SELECT br.*, b.title AS book_title
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.status = 'active'
      AND br.due_date BETWEEN datetime('now') AND datetime('now', '+1 day')
  `).all();

  if (records.length === 0) return;

  const checkExisting = db.prepare(`
    SELECT id FROM notifications
    WHERE type = 'due_reminder'
      AND user_id = ?
      AND related_id = ?
      AND date(created_at) = date('now')
  `);
  const insertNotification = db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
    VALUES (?, ?, 'due_reminder', 'Book Due Reminder', ?, 'urgent', 'borrow', ?)
  `);

  const tx = db.transaction(() => {
    for (const r of records) {
      const existing = checkExisting.get(r.user_id, r.book_id);
      if (!existing) {
        insertNotification.run(
          randomUUID(),
          r.user_id,
          `Your borrowed book "${r.book_title}" is due soon. Please return it by ${r.due_date}.`,
          r.book_id
        );
      }
    }
  });

  tx();
}

export { db };
export default db;
