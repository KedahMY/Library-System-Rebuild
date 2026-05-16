// BiblioVault database module — schema, migrations, and lazy job functions
// Uses better-sqlite3 with WAL mode and foreign_keys enabled.
// The database file is stored at backend/data/library.db.
// Exports: initializeDatabase, getDb, processAutoReturns, generateDueReminders

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

/**
 * Returns the singleton better-sqlite3 database instance.
 * Creates the instance on first call if it does not yet exist.
 * The data directory is auto-created if missing.
 */
export function getDb() {
  if (!db) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new Database(path.join(dataDir, 'library.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * Initializes the database: creates all 14 tables if they do not exist,
 * then runs the three migration functions to upgrade any stale schema.
 */
export function initializeDatabase() {
  const database = getDb();

  // ──────────────────────────────────────────────────────
  //  DDL — All 14 tables (CREATE TABLE IF NOT EXISTS)
  //  Copied verbatim from 05_data_model.md section 2.
  // ──────────────────────────────────────────────────────

  database.exec(`
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
      flagged         INTEGER DEFAULT 0,                                 -- 1 => hidden from public
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
  `);

  // ──────────────────────────────────────────────────────
  //  Migrations — run in order, idempotent
  // ──────────────────────────────────────────────────────
  migrateAddDraftStatus(database);
  migrateAddPendingDeletion(database);
  migrateAddNewColumns(database);

  console.log('Database initialized successfully.');
}

// ──────────────────────────────────────────────────────
//  Migration 1 — migrateAddDraftStatus
//  Rebuilds books table to include 'draft' in the status
//  CHECK constraint if it is not already present.
// ──────────────────────────────────────────────────────
function migrateAddDraftStatus(database) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='books'").get();
  if (row && row.sql && !row.sql.includes("'draft'")) {
    database.exec(`
      CREATE TABLE books_new (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL,
        author_id       TEXT NOT NULL,
        author_name     TEXT NOT NULL,
        genre           TEXT NOT NULL,
        description     TEXT NOT NULL,
        file_path       TEXT,
        file_name       TEXT,
        status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','approved','rejected','draft')),
        availability    TEXT NOT NULL DEFAULT 'available'
                        CHECK(availability IN ('available','borrowed')),
        publish_date    DATETIME,
        submitted_date  DATETIME DEFAULT CURRENT_TIMESTAMP,
        draft_data      TEXT,
        times_borrowed  INTEGER DEFAULT 0,
        FOREIGN KEY (author_id) REFERENCES users(id)
      );
      INSERT INTO books_new (
        id, title, author_id, author_name, genre, description,
        file_path, file_name, status, availability,
        publish_date, submitted_date, draft_data, times_borrowed
      )
      SELECT
        id, title, author_id, author_name, genre, description,
        file_path, file_name, status, availability,
        publish_date, submitted_date, draft_data, times_borrowed
      FROM books;
      DROP TABLE books;
      ALTER TABLE books_new RENAME TO books;
    `);
    console.log('Migration migrateAddDraftStatus applied.');
  }
}

// ──────────────────────────────────────────────────────
//  Migration 2 — migrateAddPendingDeletion
//  Rebuilds books table to include 'pending_deletion' in
//  the status CHECK constraint and adds cover_image and
//  rejection_reason columns if they do not exist.
// ──────────────────────────────────────────────────────
function migrateAddPendingDeletion(database) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='books'").get();
  if (row && row.sql && !row.sql.includes("'pending_deletion'")) {
    database.exec(`
      CREATE TABLE books_new (
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
        cover_image     TEXT,
        rejection_reason TEXT,
        FOREIGN KEY (author_id) REFERENCES users(id)
      );
      INSERT INTO books_new (
        id, title, author_id, author_name, genre, description,
        file_path, file_name, status, availability,
        publish_date, submitted_date, draft_data, times_borrowed
      )
      SELECT
        id, title, author_id, author_name, genre, description,
        file_path, file_name, status, availability,
        publish_date, submitted_date, draft_data, times_borrowed
      FROM books;
      DROP TABLE books;
      ALTER TABLE books_new RENAME TO books;
    `);
    console.log('Migration migrateAddPendingDeletion applied.');
  }
}

// ──────────────────────────────────────────────────────
//  Migration 3 — migrateAddNewColumns
//  Adds columns that may be missing from an older schema.
//  Checks PRAGMA table_info for each target column and
//  runs ALTER TABLE ADD COLUMN when the column is absent.
// ──────────────────────────────────────────────────────
function migrateAddNewColumns(database) {
  const columns = [
    { table: 'users',      column: 'profile_picture',  type: 'TEXT' },
    { table: 'users',      column: 'active',            type: 'INTEGER', default: '1' },
    { table: 'users',      column: 'last_login',        type: 'DATETIME' },
    { table: 'books',      column: 'cover_image',       type: 'TEXT' },
    { table: 'books',      column: 'rejection_reason',  type: 'TEXT' },
    { table: 'reviews',    column: 'flag_pending',      type: 'INTEGER', default: '0' },
  ];

  let applied = false;
  for (const col of columns) {
    const tableInfo = database.prepare(`PRAGMA table_info(${col.table})`).all();
    const hasColumn = tableInfo.some(c => c.name === col.column);
    if (!hasColumn) {
      let sql = `ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}`;
      if (col.default !== undefined) {
        sql += ` DEFAULT ${col.default}`;
      }
      database.exec(sql);
      applied = true;
    }
  }
  if (applied) {
    console.log('Migration migrateAddNewColumns applied.');
  }
}

// ──────────────────────────────────────────────────────
//  processAutoReturns — Lazy job function
//  Finds all active borrows where due_date is in the past,
//  marks them as returned, restores book availability, and
//  generates an auto_return notification for each.
//  Safe to call on every relevant route hit.
// ──────────────────────────────────────────────────────
export function processAutoReturns() {
  const database = getDb();

  const overdueBorrows = database.prepare(`
    SELECT
      br.id AS borrow_id,
      br.user_id,
      br.book_id,
      b.title,
      b.author_name
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.status = 'active'
      AND replace(br.due_date, 'T', ' ') < datetime('now')
  `).all();

  if (overdueBorrows.length === 0) return 0;

  const updateBorrow = database.prepare(`
    UPDATE borrow_records
    SET status = 'returned', return_date = datetime('now')
    WHERE id = ?
  `);

  const updateBook = database.prepare(`
    UPDATE books
    SET availability = 'available'
    WHERE id = ?
  `);

  const insertNotif = database.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
    VALUES (?, ?, 'auto_return', ?, ?, 'urgent', 'borrow', ?)
  `);

  const run = database.transaction(() => {
    for (const br of overdueBorrows) {
      updateBorrow.run(br.borrow_id);
      updateBook.run(br.book_id);
      insertNotif.run(
        uuidv4(),
        br.user_id,
        'Book Auto-Returned',
        `"${br.title}" by ${br.author_name} has been auto-returned because the borrowing period expired.`,
        br.book_id
      );
    }
  });

  run();
  console.log(`Auto-returned ${overdueBorrows.length} overdue book(s).`);
  return overdueBorrows.length;
}

// ──────────────────────────────────────────────────────
//  generateDueReminders — Lazy job function
//  Finds active borrows due within the next 24 hours that
//  do not already have a due_reminder notification created
//  in the past 24 hours, and generates one per borrow.
//  Safe to call on every relevant route hit.
// ──────────────────────────────────────────────────────
export function generateDueReminders() {
  const database = getDb();

  const dueBorrows = database.prepare(`
    SELECT
      br.id AS borrow_id,
      br.user_id,
      br.book_id,
      br.due_date,
      b.title,
      b.author_name
    FROM borrow_records br
    JOIN books b ON br.book_id = b.id
    WHERE br.status = 'active'
      AND br.due_date BETWEEN datetime('now') AND datetime('now', '+1 day')
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = br.user_id
          AND n.type = 'due_reminder'
          AND n.related_id = br.book_id
          AND n.created_at > datetime('now', '-1 day')
      )
  `).all();

  if (dueBorrows.length === 0) return 0;

  const insertNotif = database.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
    VALUES (?, ?, 'due_reminder', ?, ?, 'urgent', 'borrow', ?)
  `);

  const run = database.transaction(() => {
    for (const br of dueBorrows) {
      const dueDate = new Date(br.due_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      insertNotif.run(
        uuidv4(),
        br.user_id,
        'Book Due Reminder',
        `"${br.title}" by ${br.author_name} is due on ${dueDate}. Please return it before the due date.`,
        br.book_id
      );
    }
  });

  run();
  console.log(`Generated ${dueBorrows.length} due reminder(s).`);
  return dueBorrows.length;
}
