import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import db from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// All routes require authentication + librarian role
router.use(authenticate);
router.use(authorize('librarian'));

// =========================================================================
// Constants
// =========================================================================
const BOOKS_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'books');
const COVERS_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'covers');
const BOOK_MAX_SIZE = 50 * 1024 * 1024;         // 50 MB
const COVER_MAX_SIZE = 2 * 1024 * 1024;           // 2 MB
const ALLOWED_BOOK_MIMES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const ALLOWED_COVER_MIMES = ['image/jpeg', 'image/png'];

// =========================================================================
// Multer configuration (for POST add book — multipart)
// =========================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'cover_image') {
      cb(null, COVERS_UPLOAD_DIR);
    } else {
      cb(null, BOOKS_UPLOAD_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: BOOK_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const isBook = ALLOWED_BOOK_MIMES.includes(file.mimetype);
    const isCover = ALLOWED_COVER_MIMES.includes(file.mimetype);
    if (isBook || isCover) return cb(null, true);
    cb(new Error('Invalid file type. Books: PDF/TXT/DOC/DOCX. Covers: JPG/PNG.'));
  }
});

const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'cover_image', maxCount: 1 }
]);

// =========================================================================
// Helper: createNotification
// =========================================================================
function createNotification(userId, type, title, message, priority, category, relatedId) {
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, type, title, message, priority || 'normal', category || 'general', relatedId || null);
}

// =========================================================================
// HELPER: Build previous-state snapshot for book_versions
// =========================================================================
function buildBookSnapshot(book) {
  return {
    title: book.title,
    author_name: book.author_name,
    genre: book.genre,
    description: book.description,
    cover_image: book.cover_image
  };
}

// =========================================================================
// GET /api/librarian/books — all books (all statuses) with pagination
// Filters: ?status=, ?genre=, ?search=, ?page=, ?limit=, ?sortBy=, ?sortDir=
// =========================================================================
router.get('/books', (req, res) => {
  try {
    const { status, genre, search, page, limit, sortBy, sortDir } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = [];
    const params = [];

    if (status) {
      whereClauses.push('b.status = ?');
      params.push(status);
    }
    if (genre) {
      whereClauses.push('b.genre LIKE ?');
      params.push(`%${genre}%`);
    }
    if (search) {
      whereClauses.push('(b.title LIKE ? OR b.author_name LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count
    const countRow = db.prepare(`SELECT COUNT(*) AS total FROM books b ${whereSQL}`).get(...params);

    // Sort — whitelist to prevent SQL injection
    const allowedSorts = ['title', 'author_name', 'genre', 'status', 'publish_date', 'submitted_date', 'times_borrowed'];
    const sortColumn = allowedSorts.includes(sortBy) ? sortBy : 'submitted_date';
    const sortDirection = sortDir === 'ASC' ? 'ASC' : 'DESC';

    const books = db.prepare(`
      SELECT b.*, u.username AS author_username
      FROM books b
      JOIN users u ON b.author_id = u.id
      ${whereSQL}
      ORDER BY b.${sortColumn} ${sortDirection}
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    const result = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null
    }));

    return res.json({
      books: result,
      total: countRow.total,
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    console.error('GET /api/librarian/books error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/librarian/books — add a book directly (approved immediately)
// Multipart: title, author_name, genre, description, file (book), cover_image (optional)
// =========================================================================
router.post('/books', (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const { title, author_name, genre, description } = req.body;

      // Validate required fields
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title is required' });
      }
      if (!genre || typeof genre !== 'string' || genre.trim().length === 0) {
        return res.status(400).json({ error: 'Genre is required' });
      }
      if (!description || typeof description !== 'string' || description.trim().length < 20) {
        return res.status(400).json({ error: 'Description must be at least 20 characters' });
      }
      if (!req.files || !req.files.file || req.files.file.length === 0) {
        return res.status(400).json({ error: 'Book file is required' });
      }

      // Validate cover file size if provided
      if (req.files.cover_image && req.files.cover_image.length > 0) {
        const coverFile = req.files.cover_image[0];
        if (coverFile.size > COVER_MAX_SIZE) {
          fs.unlinkSync(coverFile.path);
          return res.status(400).json({ error: 'Cover image too large. Maximum size is 2MB.' });
        }
      }

      const bookFile = req.files.file[0];
      const id = randomUUID();
      const filePath = bookFile.path;
      const fileName = bookFile.originalname;
      const coverImage = req.files.cover_image && req.files.cover_image.length > 0
        ? `uploads/covers/${req.files.cover_image[0].filename}`
        : null;

      const authorName = (author_name || req.user.full_name || '').trim();

      let versionId;

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO books (id, title, author_id, author_name, genre, description,
                             file_path, file_name, status, availability, cover_image, publish_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'available', ?, datetime('now'))
        `).run(id, title.trim(), req.user.id, authorName,
               genre.trim(), description.trim(), filePath, fileName, coverImage);

        // Create initial book_version entry
        versionId = randomUUID();
        const changes = JSON.stringify({
          previous: {},
          current: {
            title: title.trim(),
            author_name: authorName,
            genre: genre.trim(),
            description: description.trim()
          }
        });
        db.prepare(`
          INSERT INTO book_versions (id, book_id, changed_by, changes)
          VALUES (?, ?, ?, ?)
        `).run(versionId, id, req.user.id, changes);
      });

      tx();

      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);

      // Notification: librarian created the book directly — skip author notification
      // (the librarian is the author_id; no external "original author" to notify)

      return res.status(201).json({
        message: 'Book added successfully',
        book: {
          id: book.id,
          title: book.title,
          status: book.status,
          cover_image: book.cover_image ? `/${book.cover_image}` : null
        },
        version_id: versionId
      });
    } catch (err) {
      console.error('POST /api/librarian/books error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// =========================================================================
// PUT /api/librarian/books/:id — edit any book; creates book_versions row
// Body: { title?, author_name?, genre?, description?, cover_image? }
// =========================================================================
router.put('/books/:id', (req, res) => {
  try {
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const { title, author_name, genre, description, cover_image } = req.body;

    // Build update fields
    const updates = [];
    const params = [];
    const snapshot = buildBookSnapshot(book);

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      updates.push('title = ?');
      params.push(title.trim());
    }
    if (author_name !== undefined) {
      updates.push('author_name = ?');
      params.push(author_name.trim());
    }
    if (genre !== undefined) {
      if (typeof genre !== 'string' || genre.trim().length === 0) {
        return res.status(400).json({ error: 'Genre cannot be empty' });
      }
      updates.push('genre = ?');
      params.push(genre.trim());
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length < 20) {
        return res.status(400).json({ error: 'Description must be at least 20 characters' });
      }
      updates.push('description = ?');
      params.push(description.trim());
    }
    if (cover_image !== undefined) {
      updates.push('cover_image = ?');
      params.push(cover_image || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Build current snapshot before applying update
    const currentSnapshot = { ...snapshot };
    if (title !== undefined) currentSnapshot.title = title.trim();
    if (author_name !== undefined) currentSnapshot.author_name = author_name.trim();
    if (genre !== undefined) currentSnapshot.genre = genre.trim();
    if (description !== undefined) currentSnapshot.description = description.trim();
    if (cover_image !== undefined) currentSnapshot.cover_image = cover_image || null;

    let versionId;

    const tx = db.transaction(() => {
      params.push(book.id);
      db.prepare(`UPDATE books SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      // Create book_versions entry
      versionId = randomUUID();
      const changes = JSON.stringify({
        previous: snapshot,
        current: currentSnapshot
      });
      db.prepare(`
        INSERT INTO book_versions (id, book_id, changed_by, changes)
        VALUES (?, ?, ?, ?)
      `).run(versionId, book.id, req.user.id, changes);
    });

    tx();

    const updated = db.prepare('SELECT * FROM books WHERE id = ?').get(book.id);

    // Notify the book's author about the edit
    if (book.author_id !== req.user.id) {
      createNotification(book.author_id, 'book_edited', 'Book Edited',
        `Your book "${book.title}" has been edited by a librarian.`,
        'normal', 'general', book.id);
    }

    return res.json({
      message: 'Book updated successfully',
      book: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        cover_image: updated.cover_image ? `/${updated.cover_image}` : null
      },
      version_id: versionId
    });
  } catch (err) {
    console.error('PUT /api/librarian/books/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// DELETE /api/librarian/books/:id — hard delete any book (bypasses two-phase)
// Cascade order per architecture spec §7
// =========================================================================
router.delete('/books/:id', (req, res) => {
  try {
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const bookId = book.id;

    const tx = db.transaction(() => {
      // 1. Bookmarks
      db.prepare('DELETE FROM bookmarks WHERE book_id = ?').run(bookId);
      // 2. Highlights
      db.prepare('DELETE FROM highlights WHERE book_id = ?').run(bookId);
      // 3. Reading progress
      db.prepare('DELETE FROM reading_progress WHERE book_id = ?').run(bookId);
      // 4. Book versions
      db.prepare('DELETE FROM book_versions WHERE book_id = ?').run(bookId);
      // 5. Downloaded books
      db.prepare('DELETE FROM downloaded_books WHERE book_id = ?').run(bookId);
      // 6. Review replies + reviews
      const reviewIds = db.prepare('SELECT id FROM reviews WHERE book_id = ?').all(bookId).map(r => r.id);
      if (reviewIds.length > 0) {
        const rPlaceholders = reviewIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM review_replies WHERE review_id IN (${rPlaceholders})`).run(...reviewIds);
        db.prepare(`DELETE FROM reviews WHERE book_id = ?`).run(bookId);
      }
      // 7. Notifications related to this book
      db.prepare('DELETE FROM notifications WHERE related_id = ?').run(bookId);
      // 8. Borrow records
      db.prepare('DELETE FROM borrow_records WHERE book_id = ?').run(bookId);
      // 9. Delete book row
      db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
    });

    tx();

    // Delete files from disk (outside transaction)
    try {
      if (book.file_path && fs.existsSync(book.file_path)) {
        fs.unlinkSync(book.file_path);
      }
      if (book.cover_image) {
        const coverPath = path.join(__dirname, '..', book.cover_image);
        if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
      }
    } catch (fileErr) {
      console.error('Error deleting book files:', fileErr);
    }

    // Notify author
    if (book.author_id !== req.user.id) {
      createNotification(book.author_id, 'book_deleted', 'Book Deleted',
        `Your book "${book.title}" has been permanently deleted by a librarian.`,
        'normal', 'general', bookId);
    }

    // Notify all active borrowers
    const activeBorrowers = db.prepare(
      "SELECT user_id FROM borrow_records WHERE book_id = ? AND status = 'active'"
    ).all(bookId);
    for (const borrower of activeBorrowers) {
      createNotification(borrower.user_id, 'book_deleted', 'Book Deleted',
        `The book "${book.title}" you borrowed has been permanently deleted.`,
        'urgent', 'general', bookId);
    }

    return res.json({ message: 'Book permanently deleted' });
  } catch (err) {
    console.error('DELETE /api/librarian/books/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/librarian/books/bulk-delete — atomic hard delete for multiple books
// Body: { bookIds: [] }
// =========================================================================
router.post('/books/bulk-delete', (req, res) => {
  try {
    const { bookIds } = req.body;

    if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: 'bookIds array is required' });
    }

    // Prevent SQL injection by building placeholders
    const placeholders = bookIds.map(() => '?').join(',');

    // Gather books first for notifications and file cleanup
    const books = db.prepare(`
      SELECT id, title, author_id, file_path, cover_image FROM books WHERE id IN (${placeholders})
    `).all(...bookIds);

    if (books.length === 0) {
      return res.status(404).json({ error: 'No books found for the given IDs' });
    }

    const actualIds = books.map(b => b.id);

    const tx = db.transaction(() => {
      // 1. Bookmarks
      db.prepare(`DELETE FROM bookmarks WHERE book_id IN (${placeholders})`).run(...actualIds);
      // 2. Highlights
      db.prepare(`DELETE FROM highlights WHERE book_id IN (${placeholders})`).run(...actualIds);
      // 3. Reading progress
      db.prepare(`DELETE FROM reading_progress WHERE book_id IN (${placeholders})`).run(...actualIds);
      // 4. Book versions
      db.prepare(`DELETE FROM book_versions WHERE book_id IN (${placeholders})`).run(...actualIds);
      // 5. Downloaded books
      db.prepare(`DELETE FROM downloaded_books WHERE book_id IN (${placeholders})`).run(...actualIds);
      // 6. Review replies + reviews
      for (const bid of actualIds) {
        const reviewIds = db.prepare('SELECT id FROM reviews WHERE book_id = ?').all(bid).map(r => r.id);
        if (reviewIds.length > 0) {
          const rp = reviewIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM review_replies WHERE review_id IN (${rp})`).run(...reviewIds);
          db.prepare('DELETE FROM reviews WHERE book_id = ?').run(bid);
        }
      }
      // 7. Notifications related to these books
      db.prepare(`DELETE FROM notifications WHERE related_id IN (${placeholders})`).run(...actualIds);
      // 8. Borrow records
      db.prepare(`DELETE FROM borrow_records WHERE book_id IN (${placeholders})`).run(...actualIds);
      // 9. Delete book rows
      db.prepare(`DELETE FROM books WHERE id IN (${placeholders})`).run(...actualIds);
    });

    tx();

    // Delete files from disk (outside transaction)
    for (const book of books) {
      try {
        if (book.file_path && fs.existsSync(book.file_path)) {
          fs.unlinkSync(book.file_path);
        }
        if (book.cover_image) {
          const coverPath = path.join(__dirname, '..', book.cover_image);
          if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
        }
      } catch (fileErr) {
        console.error('Error deleting file for book', book.id, fileErr);
      }

      // Notify author
      if (book.author_id !== req.user.id) {
        createNotification(book.author_id, 'book_deleted', 'Book Deleted',
          `Your book "${book.title}" has been permanently deleted by a librarian.`,
          'normal', 'general', book.id);
      }

      // Notify active borrowers
      const activeBorrowers = db.prepare(
        "SELECT user_id FROM borrow_records WHERE book_id = ? AND status = 'active'"
      ).all(book.id);
      for (const borrower of activeBorrowers) {
        createNotification(borrower.user_id, 'book_deleted', 'Book Deleted',
          `The book "${book.title}" you borrowed has been permanently deleted.`,
          'urgent', 'general', book.id);
      }
    }

    return res.json({ message: 'Books permanently deleted', deleted: books.length });
  } catch (err) {
    console.error('POST /api/librarian/books/bulk-delete error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/librarian/books/:id/versions — version history for a book
// =========================================================================
router.get('/books/:id/versions', (req, res) => {
  try {
    const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const versions = db.prepare(`
      SELECT bv.id, bv.book_id, bv.changed_by, bv.changes, bv.created_at,
             u.username AS changed_by_username
      FROM book_versions bv
      JOIN users u ON bv.changed_by = u.id
      WHERE bv.book_id = ?
      ORDER BY bv.created_at DESC
    `).all(req.params.id);

    // Parse JSON changes for each version
    const parsedVersions = versions.map(v => ({
      ...v,
      changes: JSON.parse(v.changes)
    }));

    return res.json({ versions: parsedVersions });
  } catch (err) {
    console.error('GET /api/librarian/books/:id/versions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/librarian/users — list all users with pagination + filters
// ?role=, ?search=, ?page=, ?limit=
// =========================================================================
router.get('/users', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { role, search } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (role) {
      where += ' AND role = ?';
      params.push(role);
    }

    if (search) {
      where += ' AND (username LIKE ? OR full_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countRow = db.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get(...params);

    const users = db.prepare(`
      SELECT id, username, full_name, role, bio, employee_id,
             profile_picture, active, created_at, last_login
      FROM users ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return res.json({ users, total: countRow.total, page, limit });
  } catch (err) {
    console.error('GET /api/librarian/users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/librarian/users/bulk-action
// Body: { action: 'activate'|'deactivate'|'change-role', user_ids: [], role? }
// =========================================================================
router.post('/users/bulk-action', (req, res) => {
  try {
    const { action, user_ids, role: newRole } = req.body;

    if (!action || !['activate', 'deactivate', 'change-role'].includes(action)) {
      return res.status(400).json({ error: 'Action must be one of: activate, deactivate, change-role' });
    }

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids must be a non-empty array' });
    }

    // Prevent self-deactivation or self-role-change
    if (action === 'deactivate' && user_ids.includes(req.user.id)) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }
    if (action === 'change-role' && user_ids.includes(req.user.id)) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    if (action === 'change-role') {
      if (!newRole || !['student', 'staff', 'author', 'librarian'].includes(newRole)) {
        return res.status(400).json({ error: 'Valid role is required for change-role action' });
      }

      const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
      const tx = db.transaction(() => {
        for (const uid of user_ids) {
          stmt.run(newRole, uid);
        }
      });
      tx();

      return res.json({
        message: `${user_ids.length} user(s) role changed to ${newRole}`,
        affected: user_ids.length
      });
    }

    // activate or deactivate
    const newActive = action === 'activate' ? 1 : 0;
    const stmt = db.prepare('UPDATE users SET active = ? WHERE id = ?');
    const tx = db.transaction(() => {
      for (const uid of user_ids) {
        stmt.run(newActive, uid);
      }
    });
    tx();

    return res.json({
      message: `${user_ids.length} user(s) ${action}d successfully`,
      affected: user_ids.length
    });
  } catch (err) {
    console.error('POST /api/librarian/users/bulk-action error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
