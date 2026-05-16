import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import db, { processAutoReturns, generateDueReminders } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// =========================================================================
// Constants
// =========================================================================
const BORROW_LIMIT = 5;
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
// Multer configuration
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
    const name = `${randomUUID()}${ext}`;
    cb(null, name);
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
// Helper: resolveFilePath — handles absolute/relative path compatibility
// =========================================================================
function resolveFilePath(filePath) {
  if (!filePath) return null;
  // If the stored path exists as an absolute path, use it directly
  if (fs.existsSync(filePath)) return filePath;
  // Fallback: look up by basename inside the books upload dir
  const basename = path.basename(filePath);
  const fallback = path.join(BOOKS_UPLOAD_DIR, basename);
  if (fs.existsSync(fallback)) return fallback;
  return filePath; // return original even if missing — caller handles 404
}

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
// Helper: notifyAllLibrarians
// =========================================================================
function notifyAllLibrarians(type, title, message, relatedId) {
  const librarians = db.prepare('SELECT id FROM users WHERE role = ?').all('librarian');
  for (const lib of librarians) {
    createNotification(lib.id, type, title, message, 'normal', 'submissions', relatedId);
  }
}

// =========================================================================
// Helper: book list query builder
// =========================================================================
function buildBookListQuery(extraWhere, extraParams, extraOrder) {
  let whereClause = "b.status = 'approved'";
  const params = [];

  if (extraWhere) {
    whereClause += ` AND ${extraWhere}`;
    params.push(...extraParams);
  }

  const orderClause = extraOrder || 'b.publish_date DESC';

  const sql = `
    SELECT
      b.id, b.title, b.author_name, b.genre, b.description,
      b.cover_image, b.status, b.availability,
      COALESCE(AVG(r.rating), 0) AS average_rating,
      COUNT(r.id) AS review_count,
      b.times_borrowed AS borrow_count,
      COALESCE(b.publish_date, b.submitted_date) AS created_at
    FROM books b
    LEFT JOIN reviews r ON r.book_id = b.id AND r.flagged = 0
    WHERE ${whereClause}
    GROUP BY b.id
    ORDER BY ${orderClause}
  `;

  return { sql, params };
}

// =========================================================================
// BROWSE & DISCOVERY
// =========================================================================

// GET /api/books — public book list (approved only)
router.get('/', authenticate, (req, res) => {
  try {
    processAutoReturns();

    const { search, genre, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let whereExtra = '';
    const params = [];

    if (search) {
      whereExtra += '(b.title LIKE ? OR b.author_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term);
    }

    if (genre) {
      if (whereExtra) whereExtra += ' AND ';
      whereExtra += 'b.genre LIKE ?';
      params.push(`%${genre}%`);
    }

    // Count query
    let countSql = "SELECT COUNT(*) AS total FROM books b WHERE b.status = 'approved'";
    const countParams = [];
    if (search) {
      countSql += ' AND (b.title LIKE ? OR b.author_name LIKE ?)';
      const term = `%${search}%`;
      countParams.push(term, term);
    }
    if (genre) {
      countSql += ' AND b.genre LIKE ?';
      countParams.push(`%${genre}%`);
    }
    const { total } = db.prepare(countSql).get(...countParams);

    const { sql } = buildBookListQuery(whereExtra || null, params);
    const paginatedSql = `${sql} LIMIT ? OFFSET ?`;
    const books = db.prepare(paginatedSql).all(...params, limitNum, offset);

    // Process cover_image paths
    const result = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null,
      average_rating: Math.round(b.average_rating * 100) / 100
    }));

    return res.json({
      books: result,
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error('GET /api/books error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/genres — distinct genres list
router.get('/genres', authenticate, (req, res) => {
  try {
    const genres = db.prepare(`
      SELECT DISTINCT genre FROM books WHERE status = 'approved' ORDER BY genre
    `).all();
    // Genres can be comma-separated; split and collect unique
    const allGenres = [...new Set(genres.flatMap(g => g.genre.split(',').map(s => s.trim()).filter(Boolean)))];
    return res.json(allGenres);
  } catch (err) {
    console.error('GET /api/books/genres error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/recommendations — top 3 by times_borrowed (requires auth)
router.get('/recommendations', authenticate, (req, res) => {
  try {
    const books = db.prepare(`
      SELECT
        b.id, b.title, b.author_name, b.genre, b.description,
        b.cover_image, b.status, b.availability,
        COALESCE(AVG(r.rating), 0) AS average_rating,
        COUNT(r.id) AS review_count,
        b.times_borrowed AS borrow_count,
        COALESCE(b.publish_date, b.submitted_date) AS created_at
      FROM books b
      LEFT JOIN reviews r ON r.book_id = b.id AND r.flagged = 0
      WHERE b.status = 'approved'
      GROUP BY b.id
      ORDER BY b.times_borrowed DESC
      LIMIT 3
    `).all();

    const result = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null,
      average_rating: Math.round(b.average_rating * 100) / 100
    }));

    return res.json(result);
  } catch (err) {
    console.error('GET /api/books/recommendations error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/my-submissions — author only; own books (all except draft)
router.get('/my-submissions', authenticate, authorize('author'), (req, res) => {
  try {
    const books = db.prepare(`
      SELECT
        b.*,
        COALESCE(AVG(r.rating), 0) AS average_rating,
        COUNT(r.id) AS review_count
      FROM books b
      LEFT JOIN reviews r ON r.book_id = b.id AND r.flagged = 0
      WHERE b.author_id = ? AND b.status != 'draft'
      GROUP BY b.id
      ORDER BY b.submitted_date DESC
    `).all(req.user.id);

    const result = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null,
      average_rating: Math.round(b.average_rating * 100) / 100
    }));

    return res.json(result);
  } catch (err) {
    console.error('GET /api/books/my-submissions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/my-drafts — author only; own draft books
router.get('/my-drafts', authenticate, authorize('author'), (req, res) => {
  try {
    const books = db.prepare(`
      SELECT id, title, author_name, genre, description, cover_image, draft_data,
             submitted_date, created_at
      FROM books
      WHERE author_id = ? AND status = 'draft'
      ORDER BY submitted_date DESC
    `).all(req.user.id);

    const result = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null,
      created_at: b.submitted_date
    }));

    return res.json(result);
  } catch (err) {
    console.error('GET /api/books/my-drafts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/pending — librarian only; books with status=pending
router.get('/pending', authenticate, authorize('librarian'), (req, res) => {
  try {
    const { title, author, genre, status, date_from, date_to, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    const params = [];

    // Base: show everything except draft unless filtering by status
    if (status) {
      whereClauses.push('b.status = ?');
      params.push(status);
    } else {
      whereClauses.push("b.status != 'draft'");
    }

    if (title) {
      whereClauses.push('b.title LIKE ?');
      params.push(`%${title}%`);
    }
    if (author) {
      whereClauses.push('b.author_name LIKE ?');
      params.push(`%${author}%`);
    }
    if (genre) {
      whereClauses.push('b.genre LIKE ?');
      params.push(`%${genre}%`);
    }
    if (date_from) {
      whereClauses.push('b.submitted_date >= ?');
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push('b.submitted_date <= ?');
      params.push(date_to);
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) AS total FROM books b ${whereSQL}`).get(...params);
    const total = countRow.total;

    const books = db.prepare(`
      SELECT b.*, u.username AS author_username
      FROM books b
      JOIN users u ON b.author_id = u.id
      ${whereSQL}
      ORDER BY b.submitted_date DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    const result = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null
    }));

    return res.json({
      books: result,
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error('GET /api/books/pending error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/pending-deletions — librarian only
router.get('/pending-deletions', authenticate, authorize('librarian'), (req, res) => {
  try {
    const books = db.prepare(`
      SELECT b.*, u.username AS author_username
      FROM books b
      JOIN users u ON b.author_id = u.id
      WHERE b.status = 'pending_deletion'
      ORDER BY b.submitted_date DESC
    `).all();

    const result = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null
    }));

    return res.json(result);
  } catch (err) {
    console.error('GET /api/books/pending-deletions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// BORROW RECORDS — librarian (must be before /:id)
// =========================================================================

// GET /api/books/borrow-records/export — CSV export
router.get('/borrow-records/export', authenticate, authorize('librarian'), (req, res) => {
  try {
    processAutoReturns();

    const records = db.prepare(`
      SELECT
        br.id, br.book_id, br.user_id, br.borrow_date, br.due_date,
        br.return_date, br.status,
        b.title AS book_title, u.username
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      JOIN users u ON br.user_id = u.id
      ORDER BY br.borrow_date DESC
    `).all();

    // Generate CSV
    const header = 'id,book_id,user_id,borrow_date,due_date,return_date,status,book_title,username\n';
    const rows = records.map(r => {
      const escape = (v) => {
        const s = String(v || '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      return [r.id, r.book_id, r.user_id, r.borrow_date, r.due_date,
              r.return_date || '', r.status, escape(r.book_title), escape(r.username)].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="borrow-records.csv"');
    return res.send(header + rows);
  } catch (err) {
    console.error('GET /api/books/borrow-records/export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/borrow-records — librarian only; all borrow records
router.get('/borrow-records', authenticate, authorize('librarian'), (req, res) => {
  try {
    processAutoReturns();
    generateDueReminders();

    const { search, status, date_from, date_to, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    const params = [];

    if (search) {
      whereClauses.push('(b.title LIKE ? OR u.username LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }
    if (status) {
      whereClauses.push('br.status = ?');
      params.push(status);
    }
    if (date_from) {
      whereClauses.push('br.borrow_date >= ?');
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push('br.borrow_date <= ?');
      params.push(date_to);
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = db.prepare(`
      SELECT COUNT(*) AS total FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      JOIN users u ON br.user_id = u.id
      ${whereSQL}
    `).get(...params);

    const records = db.prepare(`
      SELECT
        br.id, br.book_id, br.user_id, br.borrow_date AS borrowed_at,
        br.due_date, br.return_date AS returned_at, br.status,
        b.title AS book_title, u.username
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      JOIN users u ON br.user_id = u.id
      ${whereSQL}
      ORDER BY br.borrow_date DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    return res.json({
      records,
      total: countRow.total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(countRow.total / limitNum)
    });
  } catch (err) {
    console.error('GET /api/books/borrow-records error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/my-borrows — own active borrow records
router.get('/my-borrows', authenticate, (req, res) => {
  try {
    processAutoReturns();

    const records = db.prepare(`
      SELECT
        br.id, br.book_id, br.user_id, br.borrow_date AS borrowed_at,
        br.due_date, br.return_date AS returned_at, br.status,
        b.title AS book_title, b.author_name, b.cover_image, b.file_name
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      WHERE br.user_id = ?
      ORDER BY br.borrow_date DESC
    `).all(req.user.id);

    const activeCount = records.filter(r => r.status === 'active').length;

    const result = records.map(r => ({
      ...r,
      cover_image: r.cover_image ? `/${r.cover_image}` : null
    }));

    return res.json({
      borrows: result,
      active_count: activeCount,
      borrow_limit: BORROW_LIMIT
    });
  } catch (err) {
    console.error('GET /api/books/my-borrows error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// AUTHOR SUBMISSION FLOW
// =========================================================================

// POST /api/books/submit — author only; multipart
router.post('/submit', authenticate, authorize('author'), (req, res, next) => {
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
          // Remove the uploaded cover file
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

      db.prepare(`
        INSERT INTO books (id, title, author_id, author_name, genre, description,
                           file_path, file_name, status, cover_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(id, title.trim(), req.user.id, (author_name || req.user.full_name || '').trim(),
             genre.trim(), description.trim(), filePath, fileName, coverImage);

      // Notify librarians
      notifyAllLibrarians('new_submission', 'New Book Submission',
        `A new book "${title}" has been submitted by ${req.user.username}.`, id);

      // If this book was a draft, clean up any existing draft_data
      if (req.body.draft_id) {
        // Draft already submitted, no extra action needed
      }

      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);

      return res.status(201).json({
        message: 'Book submitted successfully',
        book: {
          id: book.id,
          title: book.title,
          status: book.status,
          cover_image: book.cover_image ? `/${book.cover_image}` : null
        }
      });
    } catch (err) {
      console.error('POST /api/books/submit error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// POST /api/books/draft — author only; multipart; status=draft
router.post('/draft', authenticate, authorize('author'), (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const { title, author_name, genre, description, draft_data } = req.body;

      // For drafts, validate only what's provided
      if (!title && !genre && !description && !req.files) {
        return res.status(400).json({ error: 'At least one field is required for a draft' });
      }

      const id = randomUUID();
      let filePath = null;
      let fileName = null;
      let coverImage = null;

      if (req.files && req.files.file && req.files.file.length > 0) {
        const bookFile = req.files.file[0];
        filePath = bookFile.path;
        fileName = bookFile.originalname;
      }

      if (req.files && req.files.cover_image && req.files.cover_image.length > 0) {
        const coverFile = req.files.cover_image[0];
        if (coverFile.size > COVER_MAX_SIZE) {
          fs.unlinkSync(coverFile.path);
          return res.status(400).json({ error: 'Cover image too large. Maximum size is 2MB.' });
        }
        coverImage = `uploads/covers/${coverFile.filename}`;
      }

      const draftDataJson = draft_data ? JSON.stringify(draft_data) : null;

      db.prepare(`
        INSERT INTO books (id, title, author_id, author_name, genre, description,
                           file_path, file_name, status, cover_image, draft_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
      `).run(
        id,
        (title || '').trim(),
        req.user.id,
        (author_name || req.user.full_name || '').trim(),
        (genre || '').trim(),
        (description || '').trim(),
        filePath,
        fileName,
        coverImage,
        draftDataJson
      );

      const book = db.prepare('SELECT id, title, status, cover_image FROM books WHERE id = ?').get(id);

      return res.status(201).json({
        message: 'Draft saved',
        book: {
          id: book.id,
          title: book.title,
          status: book.status,
          cover_image: book.cover_image ? `/${book.cover_image}` : null
        }
      });
    } catch (err) {
      console.error('POST /api/books/draft error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// =========================================================================
// BULK OPERATIONS (must be before /:id routes)
// =========================================================================

// POST /api/books/bulk-borrow — bulk borrow; atomic
router.post('/bulk-borrow', authenticate, authorize('student', 'staff'), (req, res) => {
  try {
    processAutoReturns();

    const { bookIds, duration_days, duration_seconds } = req.body;

    if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: 'bookIds array is required' });
    }

    // Validate duration
    if (duration_days && (duration_days < 1 || duration_days > 14)) {
      return res.status(400).json({ error: 'duration_days must be between 1 and 14' });
    }
    if (duration_seconds && (duration_seconds < 10 || duration_seconds > 300)) {
      return res.status(400).json({ error: 'duration_seconds must be between 10 and 300' });
    }
    if (!duration_days && !duration_seconds) {
      return res.status(400).json({ error: 'Either duration_days or duration_seconds is required' });
    }

    // Calculate due date
    let dueDate;
    if (duration_seconds) {
      dueDate = new Date(Date.now() + duration_seconds * 1000).toISOString().replace('T', ' ').split('.')[0];
    } else {
      dueDate = new Date(Date.now() + duration_days * 86400000).toISOString().replace('T', ' ').split('.')[0];
    }

    // Check active borrow count
    const activeCount = db.prepare(
      "SELECT COUNT(*) AS count FROM borrow_records WHERE user_id = ? AND status = 'active'"
    ).get(req.user.id).count;

    if (activeCount + bookIds.length > BORROW_LIMIT) {
      return res.status(400).json({
        error: `Borrow limit exceeded. You have ${activeCount} active borrow(s) and can borrow at most ${BORROW_LIMIT}.`
      });
    }

    // Check for duplicates
    const alreadyBorrowed = db.prepare(`
      SELECT book_id FROM borrow_records
      WHERE user_id = ? AND book_id IN (${bookIds.map(() => '?').join(',')}) AND status = 'active'
    `).all(req.user.id, ...bookIds);

    if (alreadyBorrowed.length > 0) {
      return res.status(400).json({
        error: 'You have already borrowed one or more of these books.'
      });
    }

    // Verify books exist and are available
    const books = db.prepare(`
      SELECT id, title, status, availability FROM books
      WHERE id IN (${bookIds.map(() => '?').join(',')})
    `).all(...bookIds);

    const unavailable = books.filter(b => b.status !== 'approved' || b.availability !== 'available');
    if (unavailable.length > 0) {
      return res.status(400).json({
        error: `Some books are not available for borrowing: ${unavailable.map(b => b.title).join(', ')}`
      });
    }

    // All checks passed — execute atomic transaction
    const insertBorrow = db.prepare(`
      INSERT INTO borrow_records (id, book_id, user_id, due_date, status)
      VALUES (?, ?, ?, ?, 'active')
    `);
    const updateBook = db.prepare(
      "UPDATE books SET availability = 'borrowed', times_borrowed = times_borrowed + 1 WHERE id = ?"
    );

    const tx = db.transaction(() => {
      for (const bookId of bookIds) {
        const borrowId = randomUUID();
        insertBorrow.run(borrowId, bookId, req.user.id, dueDate);
        updateBook.run(bookId);
      }
    });

    tx();

    return res.json({
      message: `${bookIds.length} book(s) borrowed successfully`,
      due_date: dueDate,
      borrowed_count: bookIds.length
    });
  } catch (err) {
    console.error('POST /api/books/bulk-borrow error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/books/bulk-return — bulk return
router.post('/bulk-return', authenticate, authorize('student', 'staff'), (req, res) => {
  try {
    const { borrowIds } = req.body;

    if (!borrowIds || !Array.isArray(borrowIds) || borrowIds.length === 0) {
      return res.status(400).json({ error: 'borrowIds array is required' });
    }

    const placeholders = borrowIds.map(() => '?').join(',');

    // Verify all borrows belong to this user and are active
    const borrows = db.prepare(`
      SELECT id, book_id FROM borrow_records
      WHERE id IN (${placeholders}) AND user_id = ? AND status = 'active'
    `).all(...borrowIds, req.user.id);

    if (borrows.length === 0) {
      return res.status(400).json({ error: 'No active borrow records found for the given IDs' });
    }

    const updateBorrow = db.prepare(
      "UPDATE borrow_records SET status = 'returned', return_date = datetime('now') WHERE id = ?"
    );
    const updateBook = db.prepare(
      "UPDATE books SET availability = 'available' WHERE id = ?"
    );

    // Archive related notifications
    const archiveNotifs = db.prepare(`
      UPDATE notifications SET is_archived = 1
      WHERE user_id = ? AND related_id IN (${borrows.map(() => '?').join(',')})
      AND type IN ('due_reminder', 'auto_return')
    `);

    const bookIds = borrows.map(b => b.bookId || b.book_id);

    const tx = db.transaction(() => {
      for (const borrow of borrows) {
        updateBorrow.run(borrow.id);
        updateBook.run(borrow.book_id);
      }
      archiveNotifs.run(req.user.id, ...borrows.map(b => b.book_id));
    });

    tx();

    return res.json({ message: `${borrows.length} book(s) returned successfully` });
  } catch (err) {
    console.error('POST /api/books/bulk-return error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/books/bulk-action — librarian only
router.post('/bulk-action', authenticate, authorize('librarian'), (req, res) => {
  try {
    const { action, bookIds } = req.body;

    if (!action || !['approve', 'reject', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Action must be one of: approve, reject, delete' });
    }
    if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: 'bookIds array is required' });
    }

    const placeholders = bookIds.map(() => '?').join(',');

    if (action === 'approve') {
      const approveTx = db.transaction(() => {
        const books = db.prepare(`
          SELECT id, title, author_id FROM books WHERE id IN (${placeholders}) AND status = 'pending'
        `).all(...bookIds);

        db.prepare(`
          UPDATE books SET status = 'approved', availability = 'available', publish_date = datetime('now')
          WHERE id IN (${placeholders}) AND status = 'pending'
        `).run(...bookIds);

        for (const book of books) {
          createNotification(book.author_id, 'approval', 'Book Approved',
            `Your book "${book.title}" has been approved.`, 'normal', 'submissions', book.id);
        }
      });
      approveTx();
      return res.json({ message: `${bookIds.length} book(s) approved` });
    }

    if (action === 'reject') {
      const { reason } = req.body;
      const rejectTx = db.transaction(() => {
        const books = db.prepare(`
          SELECT id, title, author_id FROM books WHERE id IN (${placeholders}) AND status = 'pending'
        `).all(...bookIds);

        db.prepare(`
          UPDATE books SET status = 'rejected', rejection_reason = ?
          WHERE id IN (${placeholders}) AND status = 'pending'
        `).run(reason || null, ...bookIds);

        for (const book of books) {
          const msg = reason
            ? `Your book "${book.title}" was rejected. Reason: ${reason}`
            : `Your book "${book.title}" was rejected.`;
          createNotification(book.author_id, 'rejection', 'Book Rejected',
            msg, 'urgent', 'submissions', book.id);
        }
      });
      rejectTx();
      return res.json({ message: `${bookIds.length} book(s) rejected` });
    }

    if (action === 'delete') {
      const deleteTx = db.transaction(() => {
        const books = db.prepare(`
          SELECT id, title, author_id FROM books WHERE id IN (${placeholders})
        `).all(...bookIds);

        db.prepare(`
          DELETE FROM bookmarks WHERE book_id IN (${placeholders})
        `).run(...bookIds);
        db.prepare(`
          DELETE FROM highlights WHERE book_id IN (${placeholders})
        `).run(...bookIds);
        db.prepare(`
          DELETE FROM reading_progress WHERE book_id IN (${placeholders})
        `).run(...bookIds);
        db.prepare(`
          DELETE FROM book_versions WHERE book_id IN (${placeholders})
        `).run(...bookIds);
        db.prepare(`
          DELETE FROM downloaded_books WHERE book_id IN (${placeholders})
        `).run(...bookIds);

        // Delete reviews and their replies
        for (const bookId of bookIds) {
          const reviewIds = db.prepare('SELECT id FROM reviews WHERE book_id = ?').all(bookId).map(r => r.id);
          if (reviewIds.length > 0) {
            const rPlaceholders = reviewIds.map(() => '?').join(',');
            db.prepare(`DELETE FROM review_replies WHERE review_id IN (${rPlaceholders})`).run(...reviewIds);
            db.prepare(`DELETE FROM reviews WHERE id IN (${rPlaceholders})`).run(...reviewIds);
          }
        }

        db.prepare(`
          DELETE FROM notifications WHERE related_id IN (${placeholders})
        `).run(...bookIds);
        db.prepare(`
          DELETE FROM borrow_records WHERE book_id IN (${placeholders})
        `).run(...bookIds);

        // Delete files from disk
        for (const book of books) {
          if (book.file_path && fs.existsSync(book.file_path)) {
            fs.unlinkSync(book.file_path);
          }
          // Also cover images
          const bookRow = db.prepare('SELECT cover_image FROM books WHERE id = ?').get(book.id);
          if (bookRow && bookRow.cover_image) {
            const coverPath = path.join(__dirname, '..', bookRow.cover_image);
            if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
          }
        }

        db.prepare(`
          DELETE FROM books WHERE id IN (${placeholders})
        `).run(...bookIds);
      });
      deleteTx();
      return res.json({ message: `${bookIds.length} book(s) permanently deleted` });
    }
  } catch (err) {
    console.error('POST /api/books/bulk-action error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// SINGLE BOOK OPERATIONS (param-based)
// =========================================================================

// GET /api/books/:id — single book detail
router.get('/:id', authenticate, (req, res) => {
  try {
    const book = db.prepare(`
      SELECT b.*,
        COALESCE(AVG(r.rating), 0) AS average_rating,
        COUNT(r.id) AS review_count
      FROM books b
      LEFT JOIN reviews r ON r.book_id = b.id AND r.flagged = 0
      WHERE b.id = ?
      GROUP BY b.id
    `).get(req.params.id);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Authorization: approved books visible to all; authors see own pending/draft
    const isAuthor = book.author_id === req.user.id;
    const isApproved = book.status === 'approved';

    if (!isApproved && !isAuthor && req.user.role !== 'librarian') {
      return res.status(404).json({ error: 'Book not found' });
    }

    return res.json({
      ...book,
      cover_image: book.cover_image ? `/${book.cover_image}` : null,
      average_rating: Math.round(book.average_rating * 100) / 100
    });
  } catch (err) {
    console.error('GET /api/books/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/books/:id — edit book (author only, own book)
router.put('/:id', authenticate, authorize('author'), (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const book = db.prepare('SELECT * FROM books WHERE id = ? AND author_id = ?').get(req.params.id, req.user.id);
      if (!book) {
        return res.status(404).json({ error: 'Book not found or not owned by you' });
      }

      // Check if book can be edited
      if (book.status === 'pending_deletion') {
        return res.status(400).json({ error: 'Cannot edit a book that is pending deletion' });
      }

      // If approved, check if currently borrowed
      if (book.status === 'approved') {
        const activeBorrow = db.prepare(
          "SELECT id FROM borrow_records WHERE book_id = ? AND status = 'active' LIMIT 1"
        ).get(book.id);
        if (activeBorrow) {
          return res.status(400).json({ error: 'Cannot edit a book that is currently borrowed' });
        }
      }

      const { title, author_name, genre, description, draft_data } = req.body;

      // Build update fields
      const updates = [];
      const params = [];

      if (title) { updates.push('title = ?'); params.push(title.trim()); }
      if (author_name) { updates.push('author_name = ?'); params.push(author_name.trim()); }
      if (genre) { updates.push('genre = ?'); params.push(genre.trim()); }
      if (description) { updates.push('description = ?'); params.push(description.trim()); }
      if (draft_data) { updates.push('draft_data = ?'); params.push(JSON.stringify(draft_data)); }

      // Handle file replacement
      if (req.files && req.files.file && req.files.file.length > 0) {
        const newFile = req.files.file[0];
        updates.push('file_path = ?');
        params.push(newFile.path);
        updates.push('file_name = ?');
        params.push(newFile.originalname);
        // Delete old file
        if (book.file_path && fs.existsSync(book.file_path)) {
          fs.unlinkSync(book.file_path);
        }
      }

      // Handle cover image replacement
      if (req.files && req.files.cover_image && req.files.cover_image.length > 0) {
        const coverFile = req.files.cover_image[0];
        if (coverFile.size > COVER_MAX_SIZE) {
          fs.unlinkSync(coverFile.path);
          return res.status(400).json({ error: 'Cover image too large. Maximum size is 2MB.' });
        }
        updates.push('cover_image = ?');
        const coverPath = `uploads/covers/${coverFile.filename}`;
        params.push(coverPath);
        // Delete old cover
        if (book.cover_image) {
          const oldCoverPath = path.join(__dirname, '..', book.cover_image);
          if (fs.existsSync(oldCoverPath)) fs.unlinkSync(oldCoverPath);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // If book was approved and is being edited, revert to pending and notify librarians
      let needsLibrarianNotif = false;
      if (book.status === 'approved') {
        updates.push("status = 'pending'");
        needsLibrarianNotif = true;
      }

      params.push(book.id);
      db.prepare(`UPDATE books SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      if (needsLibrarianNotif) {
        notifyAllLibrarians('new_submission', 'Book Edited',
          `Book "${title || book.title}" was edited by ${req.user.username} and needs re-approval.`, book.id);
      }

      const updated = db.prepare('SELECT * FROM books WHERE id = ?').get(book.id);

      return res.json({
        message: 'Book updated successfully',
        book: {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          cover_image: updated.cover_image ? `/${updated.cover_image}` : null
        }
      });
    } catch (err) {
      console.error('PUT /api/books/:id error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// DELETE /api/books/:id — author only (own book); soft delete → pending_deletion
router.delete('/:id', authenticate, authorize('author'), (req, res) => {
  try {
    const book = db.prepare('SELECT * FROM books WHERE id = ? AND author_id = ?').get(req.params.id, req.user.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found or not owned by you' });
    }

    if (book.status === 'pending_deletion') {
      return res.status(400).json({ error: 'Book is already pending deletion' });
    }

    // Block if currently borrowed
    const activeBorrow = db.prepare(
      "SELECT id FROM borrow_records WHERE book_id = ? AND status = 'active' LIMIT 1"
    ).get(book.id);
    if (activeBorrow) {
      return res.status(400).json({ error: 'Cannot delete a book that is currently borrowed' });
    }

    // Soft delete: set status to pending_deletion
    db.prepare("UPDATE books SET status = 'pending_deletion' WHERE id = ?").run(book.id);

    // Notify librarians
    notifyAllLibrarians('delete_request', 'Book Deletion Requested',
      `Author "${req.user.username}" has requested deletion of "${book.title}".`, book.id);

    return res.json({ message: 'Deletion request submitted. Pending librarian approval.' });
  } catch (err) {
    console.error('DELETE /api/books/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/books/:id/borrow — borrow a book
router.post('/:id/borrow', authenticate, authorize('student', 'staff'), (req, res) => {
  try {
    processAutoReturns();

    const { duration_days, duration_seconds } = req.body;

    // Validate duration
    if (!duration_days && !duration_seconds) {
      return res.status(400).json({ error: 'Either duration_days or duration_seconds is required' });
    }
    if (duration_days && (duration_days < 1 || duration_days > 14)) {
      return res.status(400).json({ error: 'duration_days must be between 1 and 14' });
    }
    if (duration_seconds && (duration_seconds < 10 || duration_seconds > 300)) {
      return res.status(400).json({ error: 'duration_seconds must be between 10 and 300' });
    }

    // Check book exists and is available
    const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'approved'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found or not available' });
    }
    if (book.availability !== 'available') {
      return res.status(400).json({ error: 'Book is currently not available' });
    }

    // Check if user already has an active borrow for this book
    const existingBorrow = db.prepare(
      "SELECT id FROM borrow_records WHERE book_id = ? AND user_id = ? AND status = 'active' LIMIT 1"
    ).get(req.params.id, req.user.id);
    if (existingBorrow) {
      return res.status(400).json({ error: 'You have already borrowed this book' });
    }

    // Check borrow limit
    const activeCount = db.prepare(
      "SELECT COUNT(*) AS count FROM borrow_records WHERE user_id = ? AND status = 'active'"
    ).get(req.user.id).count;
    if (activeCount >= BORROW_LIMIT) {
      return res.status(400).json({
        error: `Borrow limit reached. You have ${activeCount} active borrow(s). Maximum is ${BORROW_LIMIT}.`
      });
    }

    // Calculate due date
    let dueDate;
    if (duration_seconds) {
      dueDate = new Date(Date.now() + duration_seconds * 1000).toISOString().replace('T', ' ').split('.')[0];
    } else {
      dueDate = new Date(Date.now() + duration_days * 86400000).toISOString().replace('T', ' ').split('.')[0];
    }

    // Create borrow record and update book atomically
    const borrowId = randomUUID();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO borrow_records (id, book_id, user_id, due_date, status)
        VALUES (?, ?, ?, ?, 'active')
      `).run(borrowId, req.params.id, req.user.id, dueDate);

      db.prepare(`
        UPDATE books SET availability = 'borrowed', times_borrowed = times_borrowed + 1 WHERE id = ?
      `).run(req.params.id);
    });

    tx();

    return res.status(201).json({
      message: 'Book borrowed successfully',
      borrow: {
        id: borrowId,
        book_id: req.params.id,
        due_date: dueDate,
        status: 'active'
      }
    });
  } catch (err) {
    console.error('POST /api/books/:id/borrow error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/books/:id/return — return a book
router.post('/:id/return', authenticate, authorize('student', 'staff'), (req, res) => {
  try {
    const bookId = req.params.id;

    const borrow = db.prepare(`
      SELECT id FROM borrow_records
      WHERE book_id = ? AND user_id = ? AND status = 'active'
      LIMIT 1
    `).get(bookId, req.user.id);

    if (!borrow) {
      return res.status(400).json({ error: 'No active borrow record found for this book' });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE borrow_records SET status = 'returned', return_date = datetime('now') WHERE id = ?
      `).run(borrow.id);

      db.prepare(`
        UPDATE books SET availability = 'available' WHERE id = ?
      `).run(bookId);

      // Archive related notifications
      db.prepare(`
        UPDATE notifications SET is_archived = 1
        WHERE user_id = ? AND related_id = ? AND type IN ('due_reminder', 'auto_return')
      `).run(req.user.id, bookId);
    });

    tx();

    return res.json({ message: 'Book returned successfully' });
  } catch (err) {
    console.error('POST /api/books/:id/return error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/books/:id/approve — librarian only
router.patch('/:id/approve', authenticate, authorize('librarian'), (req, res) => {
  try {
    const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'pending'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Pending book not found' });
    }

    db.prepare(`
      UPDATE books SET status = 'approved', availability = 'available', publish_date = datetime('now')
      WHERE id = ?
    `).run(book.id);

    createNotification(book.author_id, 'approval', 'Book Approved',
      `Your book "${book.title}" has been approved.`, 'normal', 'submissions', book.id);

    return res.json({ message: 'Book approved successfully' });
  } catch (err) {
    console.error('PATCH /api/books/:id/approve error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/books/:id/reject — librarian only
router.patch('/:id/reject', authenticate, authorize('librarian'), (req, res) => {
  try {
    const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'pending'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Pending book not found' });
    }

    const { reason } = req.body;

    db.prepare("UPDATE books SET status = 'rejected', rejection_reason = ? WHERE id = ?").run(
      reason || null, book.id
    );

    const msg = reason
      ? `Your book "${book.title}" was rejected. Reason: ${reason}`
      : `Your book "${book.title}" was rejected.`;
    createNotification(book.author_id, 'rejection', 'Book Rejected', msg, 'urgent', 'submissions', book.id);

    return res.json({ message: 'Book rejected' });
  } catch (err) {
    console.error('PATCH /api/books/:id/reject error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/books/:id/approve-delete — librarian only; hard cascade delete
router.patch('/:id/approve-delete', authenticate, authorize('librarian'), (req, res) => {
  try {
    const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'pending_deletion'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book pending deletion not found' });
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
      // 7. Notifications
      db.prepare("DELETE FROM notifications WHERE related_id = ? AND type = 'delete_request'").run(bookId);
      db.prepare("DELETE FROM notifications WHERE related_id = ? AND type IN ('approval', 'rejection', 'new_submission', 'book_deleted')").run(bookId);
      // 8. Borrow records
      db.prepare('DELETE FROM borrow_records WHERE book_id = ?').run(bookId);
      // 9. Notify author
      createNotification(book.author_id, 'book_deleted', 'Book Deleted',
        `Your book "${book.title}" has been permanently deleted.`, 'normal', 'general', bookId);
      // 10. Delete book row
      db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
    });

    tx();

    // 11. Delete files from disk (outside transaction — file ops)
    try {
      if (book.file_path && fs.existsSync(book.file_path)) {
        fs.unlinkSync(book.file_path);
      }
      if (book.cover_image) {
        const coverPath = path.join(__dirname, '..', book.cover_image);
        if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
      }
    } catch (fileErr) {
      console.error('Error deleting files:', fileErr);
      // Non-fatal: record is already deleted
    }

    return res.json({ message: 'Book permanently deleted' });
  } catch (err) {
    console.error('PATCH /api/books/:id/approve-delete error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/books/:id/reject-delete — librarian only; restore to approved
router.patch('/:id/reject-delete', authenticate, authorize('librarian'), (req, res) => {
  try {
    const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'pending_deletion'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book pending deletion not found' });
    }

    db.prepare("UPDATE books SET status = 'approved' WHERE id = ?").run(book.id);

    createNotification(book.author_id, 'approval', 'Deletion Request Rejected',
      `The deletion request for your book "${book.title}" has been rejected. The book is restored.`,
      'normal', 'submissions', book.id);

    return res.json({ message: 'Deletion request rejected. Book restored to approved.' });
  } catch (err) {
    console.error('PATCH /api/books/:id/reject-delete error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/:id/download — authenticated; serves book file
router.get('/:id/download', authenticate, (req, res) => {
  try {
    const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'approved'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    if (!book.file_path) {
      return res.status(404).json({ error: 'Book file not available' });
    }

    const resolvedPath = resolveFilePath(book.file_path);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Book file not found on server' });
    }

    // Inserts into downloaded_books if not already present
    const existing = db.prepare('SELECT id FROM downloaded_books WHERE book_id = ?').get(book.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO downloaded_books (id, book_id, source) VALUES (?, ?, 'manual_upload')
      `).run(randomUUID(), book.id);
    }

    return res.download(resolvedPath, book.file_name || path.basename(resolvedPath));
  } catch (err) {
    console.error('GET /api/books/:id/download error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/:id/view — authenticated; serves book file inline (for PDF reader)
router.get('/:id/view', authenticate, (req, res) => {
  try {
    const book = db.prepare("SELECT * FROM books WHERE id = ? AND status = 'approved'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    if (!book.file_path) {
      return res.status(404).json({ error: 'Book file not available' });
    }

    const resolvedPath = resolveFilePath(book.file_path);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Book file not found on server' });
    }

    return res.sendFile(resolvedPath);
  } catch (err) {
    console.error('GET /api/books/:id/view error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/:id/preview — librarian only; serves file inline
router.get('/:id/preview', authenticate, authorize('librarian'), (req, res) => {
  try {
    const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    if (!book.file_path) {
      return res.status(404).json({ error: 'Book file not available' });
    }

    const resolvedPath = resolveFilePath(book.file_path);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Book file not found on server' });
    }

    return res.sendFile(resolvedPath);
  } catch (err) {
    console.error('GET /api/books/:id/preview error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// BOOKMARKS
// =========================================================================

// GET /api/books/:id/bookmarks — own bookmarks for this book
router.get('/:id/bookmarks', authenticate, (req, res) => {
  try {
    const bookmarks = db.prepare(`
      SELECT id, user_id, book_id, page_number, label, created_at
      FROM bookmarks
      WHERE user_id = ? AND book_id = ?
      ORDER BY page_number ASC
    `).all(req.user.id, req.params.id);

    return res.json(bookmarks);
  } catch (err) {
    console.error('GET /api/books/:id/bookmarks error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/books/:id/bookmarks — create bookmark
router.post('/:id/bookmarks', authenticate, (req, res) => {
  try {
    const { page, label } = req.body;

    if (!page || typeof page !== 'number' || page < 1) {
      return res.status(400).json({ error: 'Valid page number is required' });
    }

    const book = db.prepare("SELECT id FROM books WHERE id = ? AND status = 'approved'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO bookmarks (id, user_id, book_id, page_number, label)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, req.user.id, req.params.id, page, label || null);

    const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id);

    return res.status(201).json(bookmark);
  } catch (err) {
    console.error('POST /api/books/:id/bookmarks error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/books/:id/bookmarks/:bmId — delete own bookmark
router.delete('/:id/bookmarks/:bmId', authenticate, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM bookmarks WHERE id = ? AND user_id = ? AND book_id = ?'
    ).run(req.params.bmId, req.user.id, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    return res.json({ message: 'Bookmark deleted' });
  } catch (err) {
    console.error('DELETE /api/books/:id/bookmarks/:bmId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// HIGHLIGHTS
// =========================================================================

// GET /api/books/:id/highlights — own highlights for this book
router.get('/:id/highlights', authenticate, (req, res) => {
  try {
    const highlights = db.prepare(`
      SELECT id, user_id, book_id, page_number, text_content, color, created_at
      FROM highlights
      WHERE user_id = ? AND book_id = ?
      ORDER BY page_number ASC, created_at ASC
    `).all(req.user.id, req.params.id);

    return res.json(highlights);
  } catch (err) {
    console.error('GET /api/books/:id/highlights error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/books/:id/highlights — create highlight
router.post('/:id/highlights', authenticate, (req, res) => {
  try {
    const { page, text, color } = req.body;

    if (!page || typeof page !== 'number' || page < 1) {
      return res.status(400).json({ error: 'Valid page number is required' });
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Highlight text is required' });
    }

    const book = db.prepare("SELECT id FROM books WHERE id = ? AND status = 'approved'").get(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO highlights (id, user_id, book_id, page_number, text_content, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, req.params.id, page, text.trim(), color || '#c9a84c');

    const highlight = db.prepare('SELECT * FROM highlights WHERE id = ?').get(id);

    return res.status(201).json(highlight);
  } catch (err) {
    console.error('POST /api/books/:id/highlights error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/books/:id/highlights/:hlId — delete own highlight
router.delete('/:id/highlights/:hlId', authenticate, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM highlights WHERE id = ? AND user_id = ? AND book_id = ?'
    ).run(req.params.hlId, req.user.id, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Highlight not found' });
    }

    return res.json({ message: 'Highlight deleted' });
  } catch (err) {
    console.error('DELETE /api/books/:id/highlights/:hlId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
