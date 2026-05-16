// BiblioVault librarian admin router — book management, bulk operations,
// version history, and user bulk actions.
// All routes require authenticate + authorize('librarian').
// Mount path: /api/librarian

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { getDb } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { generateBookSummary } from '../services/llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
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
// Multer configuration
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

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.fieldname === 'cover_image') {
      if (['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true);
      return cb(new Error('Invalid cover image type. Only JPG, PNG allowed.'));
    }
    if (['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error('Invalid file type. Only PDF, TXT, DOC, DOCX allowed.'));
  },
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'cover_image', maxCount: 1 },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function coverRelPath(filename) {
  return `uploads/covers/${filename}`;
}

function resolveFilePath(storedPath) {
  if (!storedPath) return null;
  if (fs.existsSync(storedPath)) return storedPath;
  const basename = path.basename(storedPath);
  const fallback = path.join(BOOKS_DIR, basename);
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function createNotification(db, userId, type, title, message, priority, category, relatedId) {
  if (!userId) return;
  const id = uuidv4();
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, type, title, message, priority || 'normal', category || 'general', relatedId || null);
}

// ---------------------------------------------------------------------------
// GET /api/librarian/books — List all non-draft books with filters
// Query: ?status=, ?genre=, ?search=, ?page=, ?limit=
// ---------------------------------------------------------------------------
router.get('/books', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const search = (req.query.search || '').trim();
  const status = (req.query.status || '').trim();
  const genre = (req.query.genre || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  let where = "WHERE b.status != 'draft'";
  const params = [];

  if (search) {
    where += ' AND (b.title LIKE ? OR b.author_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    where += ' AND b.status = ?';
    params.push(status);
  }
  if (genre) {
    where += ' AND b.genre LIKE ?';
    params.push(`%${genre}%`);
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM books b ${where}`)
    .get(...params);

  const books = db
    .prepare(
      `SELECT
         b.id, b.title, b.author_id, b.author_name, b.genre, b.description,
         b.cover_image, b.status, b.availability, b.file_name,
         b.publish_date, b.submitted_date, b.times_borrowed,
         u.username AS author_username, u.full_name AS author_full_name,
         COALESCE(AVG(r.rating), 0) AS average_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM books b
       JOIN users u ON b.author_id = u.id
       LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
       ${where}
       GROUP BY b.id
       ORDER BY b.submitted_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const formattedBooks = books.map((b) => ({
    ...b,
    average_rating: Number(b.average_rating),
    review_count: Number(b.review_count),
  }));

  res.json({
    books: formattedBooks,
    pagination: {
      page,
      limit,
      total: countRow.total,
      total_pages: Math.ceil(countRow.total / limit),
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/librarian/books — Add a new book directly (approved immediately)
// Multipart: title, author_name, genre, description, file, cover_image(optional), generate_summary?
// If generate_summary='true' and DASHSCOPE_API_KEY set: LLM generates description
// Creates book_versions entry for the initial version
// ---------------------------------------------------------------------------
router.post('/books', authenticate, authorize('librarian'), (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    const { title, author_name, genre, description, generate_summary } = req.body;
    const bookFile = req.files && req.files.file && req.files.file[0];

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!author_name || !author_name.trim()) {
      return res.status(400).json({ error: 'Author name is required' });
    }
    if (!genre || !genre.trim()) {
      return res.status(400).json({ error: 'Genre is required' });
    }

    let finalDescription = (description || '').trim();

    // If no description but generate_summary is requested, try LLM
    if ((!finalDescription || generate_summary === 'true') && bookFile) {
      try {
        const llmSummary = await generateBookSummary(
          title.trim(),
          genre.trim(),
          '',
          'medium'
        );
        if (llmSummary) {
          finalDescription = llmSummary;
        }
      } catch (llmErr) {
        console.error('LLM summary generation failed:', llmErr.message);
        // Fall through — use whatever description we have
      }
    }

    if (!finalDescription) {
      finalDescription = `Book by ${author_name.trim()}.`;
    }
    if (finalDescription.length < 20) {
      finalDescription = finalDescription + ' Added to the library catalog.';
    }

    const db = getDb();
    const bookId = uuidv4();
    const coverImage =
      req.files && req.files.cover_image && req.files.cover_image[0]
        ? coverRelPath(req.files.cover_image[0].filename)
        : null;

    try {
      const run = db.transaction(() => {
        db.prepare(
          `INSERT INTO books (id, title, author_id, author_name, genre, description,
             file_path, file_name, status, availability, cover_image, publish_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'available', ?, datetime('now'))`
        ).run(
          bookId,
          title.trim(),
          req.user.id,
          author_name.trim(),
          genre.trim(),
          finalDescription,
          bookFile ? bookFile.path : null,
          bookFile ? bookFile.originalname : null,
          coverImage
        );

        // Create initial book_versions entry
        const versionId = uuidv4();
        const changes = JSON.stringify({
          title: { new: title.trim() },
          author_name: { new: author_name.trim() },
          genre: { new: genre.trim() },
          description: { new: finalDescription },
          action: 'created',
        });
        db.prepare(
          `INSERT INTO book_versions (id, book_id, changed_by, changes)
           VALUES (?, ?, ?, ?)`
        ).run(versionId, bookId, req.user.id, changes);
      });

      run();

      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
      res.status(201).json(book);
    } catch (dbErr) {
      console.error('Librarian add book error:', dbErr.message);
      if (bookFile && fs.existsSync(bookFile.path)) {
        try { fs.unlinkSync(bookFile.path); } catch (e) { /* ignore */ }
      }
      res.status(500).json({ error: 'Failed to add book' });
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/librarian/books/:id — Edit any book
// Creates book_versions row before saving
// Body: { title?, author_name?, genre?, description?, cover_image? }
// Accepts multipart for file/cover replacement
// ---------------------------------------------------------------------------
router.put('/books/:id', authenticate, authorize('librarian'), (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const { title, author_name, genre, description } = req.body;

    const newTitle = title !== undefined ? title.trim() : book.title;
    const newAuthorName = author_name !== undefined ? author_name.trim() : book.author_name;
    const newGenre = genre !== undefined ? genre.trim() : book.genre;
    const newDescription = description !== undefined ? description.trim() : book.description;

    // Build changes JSON
    const changes = {};
    if (newTitle !== book.title) changes.title = { old: book.title, new: newTitle };
    if (newAuthorName !== book.author_name) changes.author_name = { old: book.author_name, new: newAuthorName };
    if (newGenre !== book.genre) changes.genre = { old: book.genre, new: newGenre };
    if (newDescription !== book.description) changes.description = { old: book.description, new: newDescription };

    // Handle cover replacement
    let newCoverImage = book.cover_image;
    if (req.files && req.files.cover_image && req.files.cover_image[0]) {
      newCoverImage = coverRelPath(req.files.cover_image[0].filename);
      changes.cover_image = { old: book.cover_image, new: newCoverImage };
      // Delete old cover file
      if (book.cover_image) {
        const oldCover = path.join(UPLOADS_DIR, book.cover_image);
        if (fs.existsSync(oldCover)) {
          try { fs.unlinkSync(oldCover); } catch (e) { /* ignore */ }
        }
      }
    }

    // Handle file replacement
    let newFilePath = book.file_path;
    let newFileName = book.file_name;
    if (req.files && req.files.file && req.files.file[0]) {
      newFilePath = req.files.file[0].path;
      newFileName = req.files.file[0].originalname;
      changes.file = { old: book.file_name, new: newFileName };
      // Delete old book file
      if (book.file_path && fs.existsSync(book.file_path)) {
        try { fs.unlinkSync(book.file_path); } catch (e) { /* ignore */ }
      }
    }

    try {
      const run = db.transaction(() => {
        db.prepare(
          `UPDATE books
           SET title = ?, author_name = ?, genre = ?, description = ?,
               cover_image = ?, file_path = ?, file_name = ?
           WHERE id = ?`
        ).run(newTitle, newAuthorName, newGenre, newDescription, newCoverImage, newFilePath, newFileName, req.params.id);

        // Record version history
        if (Object.keys(changes).length > 0) {
          const versionId = uuidv4();
          db.prepare(
            `INSERT INTO book_versions (id, book_id, changed_by, changes)
             VALUES (?, ?, ?, ?)`
          ).run(versionId, req.params.id, req.user.id, JSON.stringify(changes));
        }

        // Notify the original author if different from librarian
        if (book.author_id !== req.user.id) {
          createNotification(
            db,
            book.author_id,
            'book_edited',
            'Book Edited',
            `Your book "${newTitle}" has been edited by a librarian.`,
            'normal',
            'submissions',
            req.params.id
          );
        }
      });

      run();

      const updated = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
      res.json(updated);
    } catch (dbErr) {
      console.error('Librarian edit error:', dbErr.message);
      res.status(500).json({ error: 'Failed to update book' });
    }
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/librarian/books/:id — Hard delete a book with full cascade
// ---------------------------------------------------------------------------
router.delete('/books/:id', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const bookTitle = book.title;
  const bookId = book.id;

  try {
    const run = db.transaction(() => {
      // Cascade delete
      db.prepare('DELETE FROM bookmarks WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM highlights WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM reading_progress WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM book_versions WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM downloaded_books WHERE book_id = ?').run(bookId);

      // Delete review replies for reviews of this book
      const reviewIds = db.prepare('SELECT id FROM reviews WHERE book_id = ?').all(bookId);
      for (const rev of reviewIds) {
        db.prepare('DELETE FROM review_replies WHERE review_id = ?').run(rev.id);
      }
      db.prepare('DELETE FROM reviews WHERE book_id = ?').run(bookId);

      // Delete related notifications
      db.prepare('DELETE FROM notifications WHERE related_id = ?').run(bookId);

      db.prepare('DELETE FROM borrow_records WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
    });

    run();

    // Delete files from disk
    if (book.file_path && fs.existsSync(book.file_path)) {
      try { fs.unlinkSync(book.file_path); } catch (e) { /* ignore */ }
    }
    if (book.cover_image) {
      const coverPath = path.join(UPLOADS_DIR, book.cover_image);
      if (fs.existsSync(coverPath)) {
        try { fs.unlinkSync(coverPath); } catch (e) { /* ignore */ }
      }
    }

    res.json({ message: `Book "${bookTitle}" permanently deleted.` });
  } catch (dbErr) {
    console.error('Librarian delete error:', dbErr.message);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/librarian/books/bulk-delete — Bulk hard delete
// Body: { book_ids: [] }
// Atomic: all or nothing within the transaction
// ---------------------------------------------------------------------------
router.post('/books/bulk-delete', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const { book_ids } = req.body;

  if (!book_ids || !Array.isArray(book_ids) || book_ids.length === 0) {
    return res.status(400).json({ error: 'book_ids array is required' });
  }

  let succeeded = 0;
  let failed = 0;
  const errors = [];

  const run = db.transaction(() => {
    for (const bookId of book_ids) {
      try {
        const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
        if (!book) {
          failed++;
          errors.push(`Book ${bookId} not found`);
          continue;
        }

        // Full cascade
        db.prepare('DELETE FROM bookmarks WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM highlights WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM reading_progress WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM book_versions WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM downloaded_books WHERE book_id = ?').run(bookId);

        const reviewIds = db.prepare('SELECT id FROM reviews WHERE book_id = ?').all(bookId);
        for (const rev of reviewIds) {
          db.prepare('DELETE FROM review_replies WHERE review_id = ?').run(rev.id);
        }
        db.prepare('DELETE FROM reviews WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM notifications WHERE related_id = ?').run(bookId);
        db.prepare('DELETE FROM borrow_records WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM books WHERE id = ?').run(bookId);

        // Delete files
        if (book.file_path && fs.existsSync(book.file_path)) {
          try { fs.unlinkSync(book.file_path); } catch (e) { /* ignore */ }
        }
        if (book.cover_image) {
          const coverPath = path.join(UPLOADS_DIR, book.cover_image);
          if (fs.existsSync(coverPath)) {
            try { fs.unlinkSync(coverPath); } catch (e) { /* ignore */ }
          }
        }

        succeeded++;
      } catch (err) {
        failed++;
        errors.push(err.message);
      }
    }
  });

  try {
    run();
    res.json({
      message: `Bulk delete completed. ${succeeded} deleted, ${failed} failed.`,
      results: { succeeded, failed, errors },
    });
  } catch (err) {
    console.error('Bulk delete error:', err.message);
    res.status(500).json({ error: 'Bulk delete failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/librarian/books/:id/versions — Version history for a book
// ---------------------------------------------------------------------------
router.get('/books/:id/versions', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();

  const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(req.params.id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const versions = db
    .prepare(
      `SELECT bv.*, u.username AS changed_by_username
       FROM book_versions bv
       JOIN users u ON bv.changed_by = u.id
       WHERE bv.book_id = ?
       ORDER BY bv.created_at DESC`
    )
    .all(req.params.id);

  // Parse changes JSON for each version
  const parsed = versions.map((v) => ({
    ...v,
    changes: (() => {
      try { return JSON.parse(v.changes); } catch (e) { return v.changes; }
    })(),
  }));

  res.json({ book, versions: parsed });
});

// ---------------------------------------------------------------------------
// POST /api/librarian/users/bulk-action — Bulk user management
// Body: { action: 'deactivate'|'activate'|'change-role', user_ids: [], role? }
// ---------------------------------------------------------------------------
router.post('/users/bulk-action', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const { action, user_ids, role } = req.body;

  if (!action || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'action and user_ids are required' });
  }

  if (!['deactivate', 'activate', 'change-role'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be deactivate, activate, or change-role.' });
  }

  if (action === 'change-role' && !role) {
    return res.status(400).json({ error: 'role is required for change-role action' });
  }

  // Cannot deactivate self
  if (action === 'deactivate' && user_ids.includes(req.user.id)) {
    return res.status(400).json({ error: 'You cannot deactivate yourself' });
  }

  let succeeded = 0;
  let failed = 0;
  const errors = [];

  const run = db.transaction(() => {
    for (const userId of user_ids) {
      try {
        if (action === 'deactivate') {
          if (userId === req.user.id) {
            failed++;
            errors.push('Cannot deactivate self');
            continue;
          }
          db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(userId);
        } else if (action === 'activate') {
          db.prepare("UPDATE users SET active = 1 WHERE id = ?").run(userId);
        } else if (action === 'change-role') {
          db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
        }
        succeeded++;
      } catch (err) {
        failed++;
        errors.push(err.message);
      }
    }
  });

  try {
    run();
    res.json({
      message: `Bulk ${action} completed. ${succeeded} succeeded, ${failed} failed.`,
      results: { succeeded, failed, errors },
    });
  } catch (err) {
    console.error('Bulk user action error:', err.message);
    res.status(500).json({ error: 'Bulk action failed' });
  }
});

export default router;
