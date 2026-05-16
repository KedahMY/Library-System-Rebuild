// BiblioVault books router — Catalog browse, author submission/draft/edit,
// librarian approval/rejection, two-phase deletion, file download/preview,
// and quick review. Borrow, bookmark, highlight, and borrow-records endpoints
// are added by SA-4b (see placeholder comments below).
//
// All routes require authenticate unless noted.
// Role restrictions use the authorize() factory.

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { getDb, processAutoReturns, generateDueReminders } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BORROW_LIMIT = 5;
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const BOOKS_DIR = path.join(UPLOADS_DIR, 'books');
const COVERS_DIR = path.join(UPLOADS_DIR, 'covers');

// Ensure upload directories exist
[BOOKS_DIR, COVERS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Multer storage configuration
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, file.fieldname === 'cover_image' ? COVERS_DIR : BOOKS_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

// File filter for book uploads (field 'file')
function bookFileFilter(req, file, cb) {
  if (file.fieldname !== 'file') return cb(null, true);
  const allowed = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  return cb(
    new Error('Invalid file type. Only PDF, TXT, DOC, DOCX allowed for book files.')
  );
}

// File filter for cover image uploads (field 'cover_image')
function coverFileFilter(req, file, cb) {
  if (file.fieldname !== 'cover_image') return cb(null, true);
  const allowed = ['image/jpeg', 'image/png'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  return cb(
    new Error('Invalid file type. Only JPG, PNG allowed for cover images.')
  );
}

// Two multer instances as required by spec
const uploadBook = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: bookFileFilter,
});
const uploadCover = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: coverFileFilter,
});

/**
 * Combined multer middleware for multi-field forms (submit, draft, edit).
 * Processes book file first, then cover image. Each field is optional.
 */
function multiUpload(req, res, next) {
  uploadBook.fields([
    { name: 'file', maxCount: 1 },
    { name: 'cover_image', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}

// ---------------------------------------------------------------------------
// Helper: resolveFilePath
// Accepts a stored file path (may be absolute from a different layout) and
// falls back to path.basename lookup inside uploads/books/.
// ---------------------------------------------------------------------------
function resolveFilePath(storedPath) {
  if (!storedPath) return null;
  if (fs.existsSync(storedPath)) return storedPath;
  const basename = path.basename(storedPath);
  const fallback = path.join(BOOKS_DIR, basename);
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

// ---------------------------------------------------------------------------
// Helper: notification creation
// ---------------------------------------------------------------------------
function createNotification(db, userId, type, title, message, priority, category, relatedId) {
  if (!userId) return;
  const id = uuidv4();
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, type, title, message, priority || 'normal', category || 'general', relatedId || null);
  return id;
}

// ---------------------------------------------------------------------------
// Helper: notify all librarians
// ---------------------------------------------------------------------------
function notifyLibrarians(db, type, title, message, relatedId) {
  const librarians = db
    .prepare("SELECT id FROM users WHERE role = 'librarian'")
    .all();
  for (const lib of librarians) {
    createNotification(
      db,
      lib.id,
      type,
      title,
      message,
      'normal',
      'submissions',
      relatedId
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: cascade-delete a book (for approve-delete)
// Order: bookmarks -> highlights -> reading_progress -> book_versions ->
//        downloaded_books -> review_replies -> reviews -> notifications ->
//        borrow_records -> books
// ---------------------------------------------------------------------------
function cascadeDeleteBook(db, bookId) {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM bookmarks WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM highlights WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM reading_progress WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM book_versions WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM downloaded_books WHERE book_id = ?').run(bookId);

    // Delete review replies for reviews of this book
    const reviewIds = db
      .prepare('SELECT id FROM reviews WHERE book_id = ?')
      .all(bookId);
    for (const rev of reviewIds) {
      db.prepare('DELETE FROM review_replies WHERE review_id = ?').run(rev.id);
    }
    db.prepare('DELETE FROM reviews WHERE book_id = ?').run(bookId);

    // Delete related notifications (all types referencing this book)
    db.prepare('DELETE FROM notifications WHERE related_id = ?').run(bookId);

    db.prepare('DELETE FROM borrow_records WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
  });
  run();
}

// ---------------------------------------------------------------------------
// Helper: delete book files from disk
// ---------------------------------------------------------------------------
function deleteBookFiles(book) {
  if (book.file_path && fs.existsSync(book.file_path)) {
    try { fs.unlinkSync(book.file_path); } catch (e) { /* ignore */ }
  }
  if (book.cover_image) {
    const coverPath = path.join(UPLOADS_DIR, book.cover_image);
    if (fs.existsSync(coverPath)) {
      try { fs.unlinkSync(coverPath); } catch (e) { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: compute relative cover path for storage
// ---------------------------------------------------------------------------
function coverRelPath(filename) {
  return `uploads/covers/${filename}`;
}

// ---------------------------------------------------------------------------
// HELPERS END ---------------------------------------------------------------
// ===========================================================================
// ROUTES BEGIN
// ===========================================================================
//
// IMPORTANT: All static-path routes (no :id parameter) must be registered
// BEFORE parameterized /:id routes, to prevent Express from capturing
// literal path segments (e.g. "pending", "genres") as the :id parameter.
// ===========================================================================

// ---------------------------------------------------------------------------
// BROWSE & DISCOVERY — static paths only
// ---------------------------------------------------------------------------

/**
 * GET /api/books
 * Public book list (approved only). Supports search, genre filter, pagination.
 * Calls processAutoReturns() lazily per DR-15.
 */
router.get('/', authenticate, (req, res) => {
  try { processAutoReturns(); } catch (e) { /* non-critical */ }

  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const genre = (req.query.genre || '').trim();

  const books = db
    .prepare(
      `SELECT
         b.id, b.title, b.author_name, b.genre, b.description,
         b.cover_image, b.status, b.availability, b.publish_date,
         b.submitted_date, b.times_borrowed,
         COALESCE(AVG(r.rating), 0) AS average_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
       WHERE b.status = 'approved'
         AND (? = '' OR b.title LIKE '%' || ? || '%' OR b.author_name LIKE '%' || ? || '%')
         AND (? = '' OR b.genre LIKE '%' || ? || '%')
       GROUP BY b.id
       ORDER BY b.publish_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(search, search, search, genre, genre, limit, offset);

  // Convert average_rating to number
  const result = books.map((b) => ({
    ...b,
    average_rating: Number(b.average_rating),
    review_count: Number(b.review_count),
  }));

  res.json(result);
});

/**
 * GET /api/books/genres
 * Returns distinct genre values from approved books.
 */
router.get('/genres', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT genre FROM books WHERE status = 'approved' ORDER BY genre")
    .all();
  const genreSet = new Set();
  for (const row of rows) {
    for (const g of row.genre.split(',')) {
      const trimmed = g.trim();
      if (trimmed) genreSet.add(trimmed);
    }
  }
  res.json(Array.from(genreSet).sort());
});

/**
 * GET /api/books/recommendations
 * Returns top 3 books by times_borrowed (popularity-based).
 * Requires auth.
 */
router.get('/recommendations', authenticate, (req, res) => {
  const db = getDb();
  const books = db
    .prepare(
      `SELECT
         b.id, b.title, b.author_name, b.genre, b.description,
         b.cover_image, b.availability, b.times_borrowed, b.publish_date,
         COALESCE(AVG(r.rating), 0) AS average_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
       WHERE b.status = 'approved'
       GROUP BY b.id
       ORDER BY b.times_borrowed DESC
       LIMIT 3`
    )
    .all();

  res.json(
    books.map((b) => ({
      ...b,
      average_rating: Number(b.average_rating),
      review_count: Number(b.review_count),
    }))
  );
});

// ---------------------------------------------------------------------------
// AUTHOR SUBMISSION FLOW — static paths
// ---------------------------------------------------------------------------

/**
 * POST /api/books/submit
 * Author only. Submits a new book with status='pending'.
 * Multipart: file (required), cover_image (optional), and form fields.
 */
router.post('/submit', authenticate, authorize('author'), multiUpload, (req, res) => {
  const db = getDb();

  const { title, author_name, genre, description } = req.body;
  const bookFile = req.files && req.files.file && req.files.file[0];

  // --- Validation ---
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!author_name || !author_name.trim()) {
    return res.status(400).json({ error: 'Author name is required' });
  }
  if (!genre || !genre.trim()) {
    return res.status(400).json({ error: 'Genre is required' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  if (description.trim().length < 20) {
    return res.status(400).json({ error: 'Description must be at least 20 characters' });
  }
  if (!bookFile) {
    return res.status(400).json({ error: 'Book file is required' });
  }

  const id = uuidv4();
  const coverImage =
    req.files && req.files.cover_image && req.files.cover_image[0]
      ? coverRelPath(req.files.cover_image[0].filename)
      : null;

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO books (id, title, author_id, author_name, genre, description,
         file_path, file_name, status, cover_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(
      id,
      title.trim(),
      req.user.id,
      author_name.trim(),
      genre.trim(),
      description.trim(),
      bookFile.path,
      bookFile.originalname,
      coverImage
    );

    // Notify librarians about new submission
    notifyLibrarians(
      db,
      'new_submission',
      'New Book Submission',
      `"${title.trim()}" by ${author_name.trim()} has been submitted for approval.`,
      id
    );
  });

  try {
    run();
    res.status(201).json({
      message: 'Book submitted successfully',
      id,
      status: 'pending',
    });
  } catch (err) {
    // Clean up uploaded files on failure
    if (bookFile && fs.existsSync(bookFile.path)) {
      try { fs.unlinkSync(bookFile.path); } catch (e) { /* ignore */ }
    }
    if (coverImage) {
      const cp = path.join(UPLOADS_DIR, coverImage);
      if (fs.existsSync(cp)) {
        try { fs.unlinkSync(cp); } catch (e) { /* ignore */ }
      }
    }
    console.error('Submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit book' });
  }
});

/**
 * POST /api/books/draft
 * Author only. Saves a draft with status='draft'. Returns id for later edit.
 */
router.post('/draft', authenticate, authorize('author'), multiUpload, (req, res) => {
  const db = getDb();

  const { title, author_name, genre, description, draft_data } = req.body;
  const bookFile = req.files && req.files.file && req.files.file[0];

  if (!title && !genre && !description && !bookFile) {
    return res.status(400).json({ error: 'At least one field is required for a draft' });
  }

  const id = uuidv4();
  const coverImage =
    req.files && req.files.cover_image && req.files.cover_image[0]
      ? coverRelPath(req.files.cover_image[0].filename)
      : null;

  try {
    db.prepare(
      `INSERT INTO books (id, title, author_id, author_name, genre, description,
         file_path, file_name, status, cover_image, draft_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).run(
      id,
      (title || '').trim(),
      req.user.id,
      (author_name || '').trim(),
      (genre || '').trim(),
      (description || '').trim(),
      bookFile ? bookFile.path : null,
      bookFile ? bookFile.originalname : null,
      coverImage,
      draft_data || null
    );

    res.status(201).json({
      message: 'Draft saved',
      id,
      status: 'draft',
    });
  } catch (err) {
    console.error('Draft error:', err.message);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

/**
 * GET /api/books/my-submissions
 * Author only. Returns own books in all statuses except draft.
 */
router.get('/my-submissions', authenticate, authorize('author'), (req, res) => {
  const db = getDb();
  const books = db
    .prepare(
      `SELECT
         b.id, b.title, b.author_name, b.genre, b.description,
         b.cover_image, b.status, b.availability, b.rejection_reason,
         b.publish_date, b.submitted_date, b.times_borrowed,
         COALESCE(AVG(r.rating), 0) AS average_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
       WHERE b.author_id = ? AND b.status != 'draft'
       GROUP BY b.id
       ORDER BY b.submitted_date DESC`
    )
    .all(req.user.id);

  res.json(
    books.map((b) => ({
      ...b,
      average_rating: Number(b.average_rating),
      review_count: Number(b.review_count),
    }))
  );
});

/**
 * GET /api/books/my-drafts
 * Author only. Returns own draft books.
 */
router.get('/my-drafts', authenticate, authorize('author'), (req, res) => {
  const db = getDb();
  const books = db
    .prepare(
      `SELECT id, title, author_name, genre, description, cover_image,
              status, draft_data, submitted_date
       FROM books
       WHERE author_id = ? AND status = 'draft'
       ORDER BY submitted_date DESC`
    )
    .all(req.user.id);
  res.json(books);
});

// ---------------------------------------------------------------------------
// LIBRARIAN APPROVAL FLOW — static paths
// ---------------------------------------------------------------------------

/**
 * GET /api/books/pending
 * Librarian only. Returns books with status='pending'.
 */
router.get('/pending', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const search = (req.query.search || '').trim();
  const genre = (req.query.genre || '').trim();

  const books = db
    .prepare(
      `SELECT
         b.id, b.title, b.author_name, b.genre, b.description,
         b.cover_image, b.status, b.availability, b.file_name,
         b.publish_date, b.submitted_date, b.times_borrowed,
         u.username AS author_username,
         u.full_name AS author_full_name
       FROM books b
       JOIN users u ON b.author_id = u.id
       WHERE b.status = 'pending'
         AND (? = '' OR b.title LIKE '%' || ? || '%' OR b.author_name LIKE '%' || ? || '%')
         AND (? = '' OR b.genre LIKE '%' || ? || '%')
       ORDER BY b.submitted_date DESC`
    )
    .all(search, search, search, genre, genre);

  res.json(books);
});

/**
 * GET /api/books/pending-deletions
 * Librarian only. Returns books with status='pending_deletion'.
 */
router.get('/pending-deletions', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const books = db
    .prepare(
      `SELECT
         b.id, b.title, b.author_name, b.genre, b.description,
         b.cover_image, b.file_name, b.submitted_date,
         u.username AS author_username,
         u.full_name AS author_full_name
       FROM books b
       JOIN users u ON b.author_id = u.id
       WHERE b.status = 'pending_deletion'
       ORDER BY b.submitted_date DESC`
    )
    .all();
  res.json(books);
});

/**
 * POST /api/books/bulk-action
 * Librarian only. Performs action ('approve', 'reject', 'delete') on multiple
 * book IDs.
 */
router.post('/bulk-action', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const { action, bookIds } = req.body;

  if (!action || !bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
    return res.status(400).json({ error: 'action and bookIds are required' });
  }

  if (!['approve', 'reject', 'delete'].includes(action)) {
    return res
      .status(400)
      .json({ error: 'Invalid action. Must be approve, reject, or delete.' });
  }

  const results = { succeeded: 0, failed: 0, errors: [] };

  const run = db.transaction(() => {
    for (const bookId of bookIds) {
      try {
        const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);

        if (!book) {
          results.failed++;
          results.errors.push(`Book ${bookId} not found`);
          continue;
        }

        if (action === 'approve') {
          if (book.status !== 'pending') {
            results.failed++;
            results.errors.push(`Book ${bookId} is not pending (status: ${book.status})`);
            continue;
          }
          db.prepare(
            `UPDATE books
             SET status = 'approved', availability = 'available', publish_date = datetime('now')
             WHERE id = ?`
          ).run(bookId);
          createNotification(
            db,
            book.author_id,
            'approval',
            'Book Approved',
            `Your book "${book.title}" has been approved.`,
            'normal',
            'submissions',
            bookId
          );
        } else if (action === 'reject') {
          if (book.status !== 'pending') {
            results.failed++;
            results.errors.push(`Book ${bookId} is not pending (status: ${book.status})`);
            continue;
          }
          db.prepare("UPDATE books SET status = 'rejected' WHERE id = ?").run(bookId);
          createNotification(
            db,
            book.author_id,
            'rejection',
            'Book Rejected',
            `Your book "${book.title}" was rejected.`,
            'urgent',
            'submissions',
            bookId
          );
        } else if (action === 'delete') {
          if (book.status !== 'pending_deletion') {
            results.failed++;
            results.errors.push(
              `Book ${bookId} is not pending deletion (status: ${book.status})`
            );
            continue;
          }
          cascadeDeleteBook(db, bookId);
          deleteBookFiles(book);
        }

        results.succeeded++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
      }
    }
  });

  try {
    run();
    res.json({
      message: `Bulk ${action} completed. ${results.succeeded} succeeded, ${results.failed} failed.`,
      results,
    });
  } catch (err) {
    console.error('Bulk action error:', err.message);
    res.status(500).json({ error: 'Bulk action failed' });
  }
});

// ---------------------------------------------------------------------------
// STATIC-PREFIX ROUTES (static prefix + :id)
// ---------------------------------------------------------------------------

/**
 * GET /api/books/quick-review/:id
 * Serves the book file for quick preview. Authenticated users only.
 * Accessible without borrowing.
 */
router.get('/quick-review/:id', authenticate, (req, res) => {
  const db = getDb();
  const book = db
    .prepare("SELECT * FROM books WHERE id = ? AND status = 'approved'")
    .get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const filePath = resolveFilePath(book.file_path);
  if (!filePath) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});

// ---------------------------------------------------------------------------
// BORROW ENGINE — Static routes (must come before parameterized /:id routes)
// ---------------------------------------------------------------------------

/**
 * GET /api/books/my-borrows
 * Student/staff. Returns active borrows for the current user.
 * Calls processAutoReturns() and generateDueReminders() lazily.
 */
router.get('/my-borrows', authenticate, authorize('student', 'staff'), (req, res) => {
  try { processAutoReturns(); } catch (e) { /* non-critical */ }
  try { generateDueReminders(); } catch (e) { /* non-critical */ }

  const db = getDb();
  const borrows = db
    .prepare(
      `SELECT br.id, br.book_id, br.borrow_date, br.due_date, br.return_date, br.status,
              b.title, b.cover_image, b.file_name, b.author_name
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       WHERE br.user_id = ? AND br.status = 'active'
       ORDER BY br.due_date ASC`
    )
    .all(req.user.id);

  res.json(borrows);
});

/**
 * POST /api/books/bulk-borrow
 * Student/staff. Borrow multiple books atomically (respects 5-book limit).
 */
router.post('/bulk-borrow', authenticate, authorize('student', 'staff'), (req, res) => {
  try { processAutoReturns(); } catch (e) { /* non-critical */ }

  const db = getDb();
  const { book_ids, duration_days } = req.body;

  if (!book_ids || !Array.isArray(book_ids) || book_ids.length === 0) {
    return res.status(400).json({ error: 'book_ids array is required' });
  }

  const days = Math.min(14, Math.max(1, parseInt(duration_days, 10) || 7));

  // Check active borrow count
  const activeCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM borrow_records WHERE user_id = ? AND status = 'active'")
    .get(req.user.id).cnt;

  if (activeCount + book_ids.length > BORROW_LIMIT) {
    return res.status(400).json({
      error: `Borrow limit exceeded. You have ${activeCount} active borrow(s) and can borrow at most ${BORROW_LIMIT - activeCount} more.`,
    });
  }

  const borrowed = [];
  const failed = [];

  const run = db.transaction(() => {
    for (const bookId of book_ids) {
      try {
        const book = db
          .prepare(
            "SELECT * FROM books WHERE id = ? AND status = 'approved' AND availability = 'available'"
          )
          .get(bookId);

        if (!book) {
          failed.push({ book_id: bookId, error: 'Book not available' });
          continue;
        }

        // Check duplicate active borrow
        const existing = db
          .prepare(
            "SELECT id FROM borrow_records WHERE book_id = ? AND user_id = ? AND status = 'active'"
          )
          .get(bookId, req.user.id);

        if (existing) {
          failed.push({ book_id: bookId, error: 'Already borrowed' });
          continue;
        }

        const id = uuidv4();
        const dueDate = new Date(Date.now() + days * 86400000).toISOString().replace('T', ' ').replace('Z', '');

        db.prepare(
          `INSERT INTO borrow_records (id, book_id, user_id, due_date, status)
           VALUES (?, ?, ?, ?, 'active')`
        ).run(id, bookId, req.user.id, dueDate);

        db.prepare(
          "UPDATE books SET availability = 'borrowed', times_borrowed = times_borrowed + 1 WHERE id = ?"
        ).run(bookId);

        borrowed.push({ id, book_id: bookId, due_date: dueDate });
      } catch (err) {
        failed.push({ book_id: bookId, error: err.message });
      }
    }
  });

  try {
    run();
    res.status(201).json({ borrowed, failed });
  } catch (err) {
    console.error('Bulk borrow error:', err.message);
    res.status(500).json({ error: 'Bulk borrow failed' });
  }
});

/**
 * POST /api/books/bulk-return
 * Student/staff. Return multiple borrowed books atomically.
 */
router.post('/bulk-return', authenticate, authorize('student', 'staff'), (req, res) => {
  const db = getDb();
  const { book_ids } = req.body;

  if (!book_ids || !Array.isArray(book_ids) || book_ids.length === 0) {
    return res.status(400).json({ error: 'book_ids array is required' });
  }

  let returned = 0;

  const run = db.transaction(() => {
    for (const bookId of book_ids) {
      const borrow = db
        .prepare(
          "SELECT id FROM borrow_records WHERE book_id = ? AND user_id = ? AND status = 'active'"
        )
        .get(bookId, req.user.id);

      if (borrow) {
        db.prepare(
          "UPDATE borrow_records SET status = 'returned', return_date = datetime('now') WHERE id = ?"
        ).run(borrow.id);
        db.prepare("UPDATE books SET availability = 'available' WHERE id = ?").run(bookId);
        // Archive related notifications
        db.prepare(
          "UPDATE notifications SET is_archived = 1 WHERE related_id = ? AND type IN ('due_reminder', 'auto_return')"
        ).run(bookId);
        returned++;
      }
    }
  });

  try {
    run();
    res.json({ message: `${returned} book(s) returned successfully`, returned });
  } catch (err) {
    console.error('Bulk return error:', err.message);
    res.status(500).json({ error: 'Bulk return failed' });
  }
});

/**
 * GET /api/books/borrow-records
 * Librarian only. Returns paginated borrow records with search/filter.
 */
router.get('/borrow-records', authenticate, authorize('librarian'), (req, res) => {
  try { processAutoReturns(); } catch (e) { /* non-critical */ }
  try { generateDueReminders(); } catch (e) { /* non-critical */ }

  const db = getDb();
  const search = (req.query.search || '').trim();
  const status = (req.query.status || '').trim();
  const dateFrom = (req.query.date_from || '').trim();
  const dateTo = (req.query.date_to || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    where += ' AND (b.title LIKE ? OR u.username LIKE ? OR u.full_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    if (status === 'overdue') {
      where += " AND br.status = 'active' AND br.due_date < datetime('now')";
    } else {
      where += ' AND br.status = ?';
      params.push(status);
    }
  }
  if (dateFrom) {
    where += ' AND br.borrow_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    where += ' AND br.borrow_date <= ?';
    params.push(dateTo);
  }

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       JOIN users u ON br.user_id = u.id ${where}`
    )
    .get(...params);

  const records = db
    .prepare(
      `SELECT br.id, br.book_id, br.borrow_date, br.due_date, br.return_date, br.status,
              b.title AS book_title, b.author_name,
              u.username AS borrower_username, u.full_name AS borrower_name
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       JOIN users u ON br.user_id = u.id
       ${where}
       ORDER BY br.borrow_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const now = new Date().toISOString();
  const enriched = records.map((r) => ({
    ...r,
    display_status: r.status === 'active' && r.due_date < now ? 'overdue' : r.status,
  }));

  res.json({
    records: enriched,
    pagination: {
      page,
      limit,
      total: countRow.total,
      total_pages: Math.ceil(countRow.total / limit),
    },
  });
});

/**
 * GET /api/books/borrow-records/export
 * Librarian only. Exports all borrow records as CSV.
 */
router.get('/borrow-records/export', authenticate, authorize('librarian'), (req, res) => {
  try { processAutoReturns(); } catch (e) { /* non-critical */ }

  const db = getDb();

  const records = db
    .prepare(
      `SELECT b.title AS book_title, u.username AS borrower_username,
              u.full_name AS borrower_name,
              br.borrow_date, br.due_date, br.return_date, br.status
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       JOIN users u ON br.user_id = u.id
       ORDER BY br.borrow_date DESC`
    )
    .all();

  // Build CSV manually
  const headers = [
    'Book Title',
    'Borrower Username',
    'Borrower Name',
    'Borrow Date',
    'Due Date',
    'Return Date',
    'Status',
  ];
  const csvRows = [headers.join(',')];

  for (const r of records) {
    const row = [
      `"${(r.book_title || '').replace(/"/g, '""')}"`,
      `"${(r.borrower_username || '').replace(/"/g, '""')}"`,
      `"${(r.borrower_name || '').replace(/"/g, '""')}"`,
      r.borrow_date || '',
      r.due_date || '',
      r.return_date || '',
      r.status || '',
    ];
    csvRows.push(row.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="borrow-records.csv"');
  res.send(csvRows.join('\n'));
});

// ===========================================================================
// PARAMETERIZED ROUTES (with :id) — ALL STATIC ROUTES MUST COME BEFORE HERE
// ===========================================================================

// ---------------------------------------------------------------------------
// BROWSE & DISCOVERY — single book
// ---------------------------------------------------------------------------

/**
 * GET /api/books/:id
 * Single book detail. Approved books visible to all authenticated users.
 * Authors can see their own books regardless of status.
 */
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();

  const book = db
    .prepare(
      `SELECT
         b.*,
         COALESCE(AVG(r.rating), 0) AS average_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
       WHERE b.id = ?
       GROUP BY b.id`
    )
    .get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Non-authors can only see approved books
  if (book.status !== 'approved' && book.author_id !== req.user.id) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Remove sensitive/internal fields from response
  delete book.file_path;
  delete book.file_name;
  delete book.draft_data;
  delete book.author_id;
  book.average_rating = Number(book.average_rating);
  book.review_count = Number(book.review_count);

  res.json(book);
});

// ---------------------------------------------------------------------------
// AUTHOR SUBMISSION FLOW — parameterized
// ---------------------------------------------------------------------------

/**
 * PUT /api/books/:id
 * Author only (own book). Edits title, description, genre, cover.
 * If the book was approved and not currently borrowed, reverts to pending
 * and notifies librarians. Editing is blocked if the book is currently borrowed.
 */
router.put('/:id', authenticate, authorize('author'), multiUpload, (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  if (book.author_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own books' });
  }

  // Block edit if book is approved AND currently borrowed
  if (book.status === 'approved') {
    const activeBorrow = db
      .prepare("SELECT id FROM borrow_records WHERE book_id = ? AND status = 'active'")
      .get(req.params.id);
    if (activeBorrow) {
      return res
        .status(400)
        .json({ error: 'Cannot edit a book that is currently borrowed' });
    }
  }

  const { title, author_name, genre, description } = req.body;

  const newTitle = title !== undefined ? title.trim() : book.title;
  const newAuthorName =
    author_name !== undefined ? author_name.trim() : book.author_name;
  const newGenre = genre !== undefined ? genre.trim() : book.genre;
  const newDescription =
    description !== undefined ? description.trim() : book.description;

  // Editing an approved book reverts to pending
  const wasApproved = book.status === 'approved';
  const newStatus = wasApproved ? 'pending' : book.status;

  // Update cover if provided
  let newCoverImage = book.cover_image;
  if (req.files && req.files.cover_image && req.files.cover_image[0]) {
    newCoverImage = coverRelPath(req.files.cover_image[0].filename);
    // Delete old cover file
    if (book.cover_image) {
      const oldCover = path.join(UPLOADS_DIR, book.cover_image);
      if (fs.existsSync(oldCover)) {
        try { fs.unlinkSync(oldCover); } catch (e) { /* ignore */ }
      }
    }
  }

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE books
       SET title = ?, author_name = ?, genre = ?, description = ?,
           cover_image = ?, status = ?, draft_data = NULL
       WHERE id = ?`
    ).run(newTitle, newAuthorName, newGenre, newDescription, newCoverImage, newStatus, req.params.id);

    if (wasApproved) {
      notifyLibrarians(
        db,
        'new_submission',
        'Book Edited',
        `"${newTitle}" has been edited and requires re-approval.`,
        req.params.id
      );
    }
  });

  try {
    run();
    res.json({
      message: wasApproved
        ? 'Book updated and requires re-approval'
        : 'Book updated successfully',
      status: newStatus,
    });
  } catch (err) {
    console.error('Edit error:', err.message);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

/**
 * DELETE /api/books/:id
 * Author only (own book). Sets status='pending_deletion' (two-phase soft delete).
 * Blocked if the book is currently borrowed.
 */
router.delete('/:id', authenticate, authorize('author'), (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  if (book.author_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Block if currently borrowed
  const activeBorrow = db
    .prepare("SELECT id FROM borrow_records WHERE book_id = ? AND status = 'active'")
    .get(req.params.id);
  if (activeBorrow) {
    return res
      .status(400)
      .json({ error: 'Cannot delete a book that is currently borrowed' });
  }

  db.prepare("UPDATE books SET status = 'pending_deletion' WHERE id = ?").run(
    req.params.id
  );

  // Notify librarians about the delete request
  notifyLibrarians(
    db,
    'delete_request',
    'Delete Request',
    `Author requested deletion of "${book.title}".`,
    req.params.id
  );

  res.json({ message: 'Delete request submitted. Awaiting librarian approval.' });
});

// ---------------------------------------------------------------------------
// LIBRARIAN APPROVAL FLOW — parameterized
// ---------------------------------------------------------------------------

/**
 * PATCH /api/books/:id/approve
 * Librarian only. Sets status='approved', availability='available',
 * publish_date=now(). Notifies the author.
 */
router.patch('/:id/approve', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  if (book.status !== 'pending' && book.status !== 'draft') {
    return res
      .status(400)
      .json({ error: `Book status is '${book.status}', not pending or draft` });
  }

  db.prepare(
    `UPDATE books
     SET status = 'approved', availability = 'available', publish_date = datetime('now')
     WHERE id = ?`
  ).run(req.params.id);

  createNotification(
    db,
    book.author_id,
    'approval',
    'Book Approved',
    `Your book "${book.title}" has been approved.`,
    'normal',
    'submissions',
    req.params.id
  );

  res.json({ message: 'Book approved successfully' });
});

/**
 * PATCH /api/books/:id/reject
 * Librarian only. Sets status='rejected', stores optional rejection_reason.
 * Notifies the author.
 */
router.patch('/:id/reject', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  if (book.status !== 'pending') {
    return res
      .status(400)
      .json({ error: `Book status is '${book.status}', not pending` });
  }

  const reason = req.body.reason || null;

  db.prepare(
    "UPDATE books SET status = 'rejected', rejection_reason = ? WHERE id = ?"
  ).run(reason, req.params.id);

  const message = reason
    ? `Your book "${book.title}" was rejected. Reason: ${reason}`
    : `Your book "${book.title}" was rejected.`;

  createNotification(
    db,
    book.author_id,
    'rejection',
    'Book Rejected',
    message,
    'urgent',
    'submissions',
    req.params.id
  );

  res.json({ message: 'Book rejected', rejection_reason: reason });
});

/**
 * PATCH /api/books/:id/approve-delete
 * Librarian only. Hard-deletes the book with full cascade.
 * Notifies the author and all past borrowers.
 */
router.patch(
  '/:id/approve-delete',
  authenticate,
  authorize('librarian'),
  (req, res) => {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    if (book.status !== 'pending_deletion') {
      return res
        .status(400)
        .json({ error: 'Book is not pending deletion' });
    }

    const bookTitle = book.title;
    const bookId = book.id;

    // Notify author about deletion
    createNotification(
      db,
      book.author_id,
      'book_deleted',
      'Book Deleted',
      `Your book "${bookTitle}" has been permanently deleted.`,
      'urgent',
      'submissions',
      bookId
    );

    // Notify all users who have borrowed this book
    const borrowers = db
      .prepare('SELECT DISTINCT user_id FROM borrow_records WHERE book_id = ?')
      .all(bookId);
    for (const borrower of borrowers) {
      if (borrower.user_id !== book.author_id) {
        createNotification(
          db,
          borrower.user_id,
          'book_deleted',
          'Book Removed',
          `"${bookTitle}" has been removed from the library.`,
          'urgent',
          'borrow',
          bookId
        );
      }
    }

    // Cascade delete from all related tables
    cascadeDeleteBook(db, bookId);

    // Delete files from disk
    deleteBookFiles(book);

    res.json({ message: 'Book permanently deleted.' });
  }
);

/**
 * PATCH /api/books/:id/reject-delete
 * Librarian only. Restores book from pending_deletion back to approved.
 * Notifies the author.
 */
router.patch(
  '/:id/reject-delete',
  authenticate,
  authorize('librarian'),
  (req, res) => {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    if (book.status !== 'pending_deletion') {
      return res
        .status(400)
        .json({ error: 'Book is not pending deletion' });
    }

    db.prepare("UPDATE books SET status = 'approved' WHERE id = ?").run(
      req.params.id
    );

    createNotification(
      db,
      book.author_id,
      'approval',
      'Delete Request Rejected',
      `Your request to delete "${book.title}" has been rejected. The book remains in the catalog.`,
      'normal',
      'submissions',
      req.params.id
    );

    res.json({ message: 'Delete request rejected. Book restored.' });
  }
);

// ---------------------------------------------------------------------------
// FILE DOWNLOAD & PREVIEW
// ---------------------------------------------------------------------------

/**
 * GET /api/books/:id/download
 * Authenticated. Serves the book file as download.
 * Records the download in downloaded_books if not already present.
 */
router.get('/:id/download', authenticate, (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Only approved books are downloadable (authors can download their own)
  if (book.status !== 'approved' && book.author_id !== req.user.id) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const filePath = resolveFilePath(book.file_path);
  if (!filePath) {
    return res.status(404).json({ error: 'File not found on server' });
  }

  // Track download in downloaded_books if not already present
  const existing = db
    .prepare('SELECT id FROM downloaded_books WHERE book_id = ?')
    .get(book.id);

  if (!existing) {
    db.prepare(
      'INSERT INTO downloaded_books (id, book_id, source) VALUES (?, ?, ?)'
    ).run(uuidv4(), book.id, 'manual_upload');
  }

  const fileName = book.file_name || path.basename(filePath);
  res.download(filePath, fileName);
});

/**
 * GET /api/books/:id/view
 * Authenticated. Serves the book file inline (for PDF reader).
 */
router.get('/:id/view', authenticate, (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Allow viewing if approved, or if user is the author
  if (book.status !== 'approved' && book.author_id !== req.user.id) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const filePath = resolveFilePath(book.file_path);
  if (!filePath) {
    return res.status(404).json({ error: 'File not found on server' });
  }

  res.sendFile(filePath);
});

/**
 * GET /api/books/:id/preview
 * Librarian only. Serves the book file inline for preview panel.
 */
router.get('/:id/preview', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const filePath = resolveFilePath(book.file_path);
  if (!filePath) {
    return res.status(404).json({ error: 'File not found on server' });
  }

  res.sendFile(filePath);
});

// ==========================================================================
// SA-4b: BORROW ENGINE — Parameterized routes
// ==========================================================================

/**
 * POST /api/books/:id/borrow
 * Student/staff. Borrow a single book. Accepts duration_days (1-14) or
 * duration_seconds (10-300 for fast-expiry test mode).
 */
router.post('/:id/borrow', authenticate, authorize('student', 'staff'), (req, res) => {
  try { processAutoReturns(); } catch (e) { /* non-critical */ }

  const db = getDb();
  const bookId = req.params.id;

  // Check active borrow limit
  const activeCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM borrow_records WHERE user_id = ? AND status = 'active'")
    .get(req.user.id).cnt;

  if (activeCount >= BORROW_LIMIT) {
    return res
      .status(400)
      .json({ error: `Borrow limit reached. You can have at most ${BORROW_LIMIT} active borrows.` });
  }

  // Check book availability
  const book = db
    .prepare("SELECT * FROM books WHERE id = ? AND status = 'approved' AND availability = 'available'")
    .get(bookId);

  if (!book) {
    return res.status(400).json({ error: 'Book is currently not available' });
  }

  // Check for existing active borrow of this book by same user
  const existing = db
    .prepare("SELECT id FROM borrow_records WHERE book_id = ? AND user_id = ? AND status = 'active'")
    .get(bookId, req.user.id);

  if (existing) {
    return res.status(400).json({ error: 'You have already borrowed this book' });
  }

  // Calculate due date (SQLite datetime format: YYYY-MM-DD HH:MM:SS)
  const { duration_days, duration_seconds } = req.body;
  let dueDate;
  if (duration_seconds) {
    const secs = Math.min(300, Math.max(10, parseInt(duration_seconds, 10) || 30));
    dueDate = new Date(Date.now() + secs * 1000).toISOString().replace('T', ' ').replace('Z', '');
  } else {
    const days = Math.min(14, Math.max(1, parseInt(duration_days, 10) || 7));
    dueDate = new Date(Date.now() + days * 86400000).toISOString().replace('T', ' ').replace('Z', '');
  }

  const id = uuidv4();

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO borrow_records (id, book_id, user_id, due_date, status)
       VALUES (?, ?, ?, ?, 'active')`
    ).run(id, bookId, req.user.id, dueDate);

    db.prepare(
      "UPDATE books SET availability = 'borrowed', times_borrowed = times_borrowed + 1 WHERE id = ?"
    ).run(bookId);
  });

  try {
    run();
    res.status(201).json({
      message: 'Book borrowed successfully',
      borrow: {
        id,
        book_id: bookId,
        user_id: req.user.id,
        borrow_date: new Date().toISOString(),
        due_date: dueDate,
        status: 'active',
      },
    });
  } catch (err) {
    console.error('Borrow error:', err.message);
    res.status(500).json({ error: 'Failed to borrow book' });
  }
});

/**
 * POST /api/books/:id/return
 * Student/staff. Return a borrowed book.
 */
router.post('/:id/return', authenticate, authorize('student', 'staff'), (req, res) => {
  const db = getDb();
  const bookId = req.params.id;

  const borrow = db
    .prepare("SELECT * FROM borrow_records WHERE book_id = ? AND user_id = ? AND status = 'active'")
    .get(bookId, req.user.id);

  if (!borrow) {
    return res.status(400).json({ error: 'No active borrow found for this book' });
  }

  const run = db.transaction(() => {
    db.prepare(
      "UPDATE borrow_records SET status = 'returned', return_date = datetime('now') WHERE id = ?"
    ).run(borrow.id);

    db.prepare("UPDATE books SET availability = 'available' WHERE id = ?").run(bookId);

    // Archive related due_reminder and auto_return notifications
    db.prepare(
      "UPDATE notifications SET is_archived = 1 WHERE related_id = ? AND type IN ('due_reminder', 'auto_return')"
    ).run(bookId);
  });

  try {
    run();
    res.json({ message: 'Book returned successfully' });
  } catch (err) {
    console.error('Return error:', err.message);
    res.status(500).json({ error: 'Failed to return book' });
  }
});

// ==========================================================================
// SA-4b: BOOKMARKS
// ==========================================================================

/**
 * GET /api/books/:id/bookmarks
 * Returns the current user's bookmarks for a given book.
 */
router.get('/:id/bookmarks', authenticate, (req, res) => {
  const db = getDb();
  const bookmarks = db
    .prepare(
      `SELECT id, page_number, label, created_at
       FROM bookmarks
       WHERE book_id = ? AND user_id = ?
       ORDER BY page_number ASC`
    )
    .all(req.params.id, req.user.id);
  res.json(bookmarks);
});

/**
 * POST /api/books/:id/bookmarks
 * Create a bookmark for the current user on this book.
 * Body: { page_number, label? }
 */
router.post('/:id/bookmarks', authenticate, (req, res) => {
  const db = getDb();
  const { page_number, label } = req.body;

  if (!page_number || parseInt(page_number, 10) < 1) {
    return res.status(400).json({ error: 'Valid page_number is required' });
  }

  const id = uuidv4();
  const page = parseInt(page_number, 10);

  try {
    db.prepare(
      `INSERT INTO bookmarks (id, user_id, book_id, page_number, label)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, req.user.id, req.params.id, page, label || null);
    res.status(201).json({
      id,
      page_number: page,
      label: label || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Bookmark error:', err.message);
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

/**
 * DELETE /api/books/bookmarks/:bookmarkId
 * Delete the current user's bookmark.
 */
router.delete('/bookmarks/:bookmarkId', authenticate, (req, res) => {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?')
    .run(req.params.bookmarkId, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Bookmark not found' });
  }
  res.json({ message: 'Bookmark deleted' });
});

// ==========================================================================
// SA-4b: HIGHLIGHTS
// ==========================================================================

/**
 * GET /api/books/:id/highlights
 * Returns the current user's highlights for a given book.
 */
router.get('/:id/highlights', authenticate, (req, res) => {
  const db = getDb();
  const highlights = db
    .prepare(
      `SELECT id, page_number, text_content, color, created_at
       FROM highlights
       WHERE book_id = ? AND user_id = ?
       ORDER BY page_number ASC`
    )
    .all(req.params.id, req.user.id);
  res.json(highlights);
});

/**
 * POST /api/books/:id/highlights
 * Create a highlight for the current user on this book.
 * Body: { page_number, text_content, color? }
 * Default color: #c9a84c
 */
router.post('/:id/highlights', authenticate, (req, res) => {
  const db = getDb();
  const { page_number, text_content, color } = req.body;

  if (!page_number || parseInt(page_number, 10) < 1) {
    return res.status(400).json({ error: 'Valid page_number is required' });
  }
  if (!text_content || !text_content.trim()) {
    return res.status(400).json({ error: 'text_content is required' });
  }

  const id = uuidv4();
  const page = parseInt(page_number, 10);

  try {
    db.prepare(
      `INSERT INTO highlights (id, user_id, book_id, page_number, text_content, color)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, req.user.id, req.params.id, page, text_content.trim(), color || '#c9a84c');
    res.status(201).json({
      id,
      page_number: page,
      text_content: text_content.trim(),
      color: color || '#c9a84c',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Highlight error:', err.message);
    res.status(500).json({ error: 'Failed to create highlight' });
  }
});

/**
 * DELETE /api/books/highlights/:highlightId
 * Delete the current user's highlight.
 */
router.delete('/highlights/:highlightId', authenticate, (req, res) => {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM highlights WHERE id = ? AND user_id = ?')
    .run(req.params.highlightId, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Highlight not found' });
  }
  res.json({ message: 'Highlight deleted' });
});

// === END OF SA-4b ROUTES ===

export default router;
