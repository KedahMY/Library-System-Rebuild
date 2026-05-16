import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import db, { processAutoReturns } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { searchBooks, downloadIaPdf, fetchCover, findSimilar } from '../services/openlibrary.js';
import { generateBookSummary } from '../services/llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// All routes require authentication
router.use(authenticate);

// =========================================================================
// Constants
// =========================================================================
const BOOKS_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'books');
const COVERS_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'covers');

// =========================================================================
// Multer config for manual upload
// =========================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'cover') {
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
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedBookMimes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const allowedCoverMimes = ['image/jpeg', 'image/png'];
    if (file.fieldname === 'cover' && allowedCoverMimes.includes(file.mimetype)) {
      return cb(null, true);
    }
    if (file.fieldname === 'file' && allowedBookMimes.includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type'));
  }
});

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
// Helper: notify similar requesters
// =========================================================================
function notifySimilarRequesters(title, author, fulfilledBookId) {
  // Find similar pending requests (same first word of title or same author)
  const firstWord = title.split(' ')[0];
  const similar = db.prepare(`
    SELECT DISTINCT user_id FROM book_requests
    WHERE status = 'pending'
      AND (title LIKE ? OR author LIKE ?)
  `).all(`${firstWord}%`, `%${author}%`);

  for (const s of similar) {
    createNotification(s.user_id, 'similar_book_added', 'Similar Book Added',
      `A book similar to your request — "${title}" — has been added to the catalog.`,
      'normal', 'submissions', fulfilledBookId);
  }
}

// =========================================================================
// POST /api/requests — student/staff only; create a book request
// =========================================================================
router.post('/', authorize('student', 'staff'), (req, res) => {
  try {
    const { title, author, genre, reason } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!author || typeof author !== 'string' || author.trim().length === 0) {
      return res.status(400).json({ error: 'Author is required' });
    }
    if (!genre || typeof genre !== 'string' || genre.trim().length === 0) {
      return res.status(400).json({ error: 'Genre is required' });
    }

    // Check for duplicate (warn but don't block)
    const existing = db.prepare(`
      SELECT id, status FROM book_requests
      WHERE LOWER(title) = LOWER(?) AND LOWER(author) = LOWER(?) AND user_id = ?
    `).get(title.trim(), author.trim(), req.user.id);

    if (existing) {
      console.log(`Duplicate request detected: ${title} by ${author} (status: ${existing.status})`);
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO book_requests (id, user_id, title, author, genre, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, title.trim(), author.trim(), genre.trim(), reason || null);

    const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(id);

    // Notify librarians
    notifyAllLibrarians('new_request', 'New Book Request',
      `${req.user.username} requested "${title}" by ${author}.`, id);

    return res.status(201).json({ request });
  } catch (err) {
    console.error('POST /api/requests error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/requests — list requests
// Student: own requests; Librarian: all requests with filters
// Calls processAutoReturns() first (DR-15)
// =========================================================================
router.get('/', (req, res) => {
  try {
    processAutoReturns();

    const { status: filterStatus, priority, search, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    const params = [];

    if (req.user.role === 'librarian') {
      // Librarian: see all requests
      if (filterStatus) {
        whereClauses.push('r.status = ?');
        params.push(filterStatus);
      }
      if (priority) {
        whereClauses.push('r.priority = ?');
        params.push(priority);
      }
      if (search) {
        whereClauses.push('(r.title LIKE ? OR r.author LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term);
      }
    } else {
      // Student/staff: own requests only
      whereClauses.push('r.user_id = ?');
      params.push(req.user.id);
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = db.prepare(`
      SELECT COUNT(*) AS total FROM book_requests r ${whereSQL}
    `).get(...params);

    const requests = db.prepare(`
      SELECT r.*, u.username, u.full_name
      FROM book_requests r
      JOIN users u ON r.user_id = u.id
      ${whereSQL}
      ORDER BY r.priority = 'urgent' DESC, r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    return res.json({
      requests,
      total: countRow.total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(countRow.total / limitNum)
    });
  } catch (err) {
    console.error('GET /api/requests error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/requests/check-duplicate — check for existing request
// =========================================================================
router.get('/check-duplicate', (req, res) => {
  try {
    const { title, author } = req.query;

    if (!title || !author) {
      return res.status(400).json({ error: 'title and author are required' });
    }

    const existing = db.prepare(`
      SELECT status FROM book_requests
      WHERE LOWER(title) = LOWER(?) AND LOWER(author) = LOWER(?) AND user_id = ?
      LIMIT 1
    `).get(title.trim(), author.trim(), req.user.id);

    return res.json({
      duplicate: !!existing,
      status: existing ? existing.status : null
    });
  } catch (err) {
    console.error('GET /api/requests/check-duplicate error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// PATCH /api/requests/:id/priority — librarian only
// =========================================================================
router.patch('/:id/priority', authorize('librarian'), (req, res) => {
  try {
    const { priority } = req.body;

    if (!priority || !['normal', 'urgent'].includes(priority)) {
      return res.status(400).json({ error: 'Priority must be "normal" or "urgent"' });
    }

    const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    db.prepare("UPDATE book_requests SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(priority, req.params.id);

    return res.json({ message: 'Priority updated', priority });
  } catch (err) {
    console.error('PATCH /api/requests/:id/priority error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// PATCH /api/requests/:id/reject — librarian only
// =========================================================================
router.patch('/:id/reject', authorize('librarian'), (req, res) => {
  try {
    const { note } = req.body;

    const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Can only reject pending requests' });
    }

    db.prepare(`
      UPDATE book_requests SET status = 'rejected', librarian_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(note || null, req.params.id);

    // Notify requester
    createNotification(request.user_id, 'request_rejected', 'Book Request Rejected',
      `Your request for "${request.title}" was rejected.${note ? ` Reason: ${note}` : ''}`,
      'urgent', 'submissions', req.params.id);

    return res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error('PATCH /api/requests/:id/reject error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/requests/:id/openlibrary-search — librarian only
// Searches OL for request title, returns exact + alternatives
// =========================================================================
router.get('/:id/openlibrary-search', authorize('librarian'), async (req, res) => {
  try {
    const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Search Open Library for the request title
    let exact = [];
    let alternatives = [];

    try {
      const results = await searchBooks(request.title, 10);
      // Find exact matches
      exact = results.filter(r =>
        r.title.toLowerCase() === request.title.toLowerCase()
      );
      // The rest are alternatives
      alternatives = results.filter(r =>
        r.title.toLowerCase() !== request.title.toLowerCase()
      );
    } catch (olErr) {
      console.error('OL search error:', olErr.message);
      // Return empty arrays but not an error — the UI handles it
    }

    // Also try finding similar books
    if (alternatives.length < 5) {
      const similarTitles = request.title.split(' ').filter(w => w.length > 3);
      for (const word of similarTitles) {
        if (alternatives.length >= 5) break;
        try {
          const more = await searchBooks(`${word} ${request.genre}`, 3);
          for (const m of more) {
            if (!exact.find(e => e.ol_key === m.ol_key) &&
                !alternatives.find(a => a.ol_key === m.ol_key)) {
              alternatives.push(m);
            }
          }
        } catch (e) {
          // continue
        }
      }
    }

    return res.json({ exact: exact.slice(0, 3), alternatives: alternatives.slice(0, 8) });
  } catch (err) {
    console.error('GET /api/requests/:id/openlibrary-search error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/requests/:id/download — librarian only
// Download PDF from IA, create book, fulfill request
// =========================================================================
router.post('/:id/download', authorize('librarian'), async (req, res) => {
  try {
    const { ia_id, ol_title, ol_author, cover_id, generate_summary } = req.body;

    if (!ia_id) {
      return res.status(400).json({ error: 'ia_id is required' });
    }

    const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status === 'fulfilled') {
      return res.status(400).json({ error: 'Request is already fulfilled' });
    }

    // Download the PDF from Internet Archive
    const bookId = randomUUID();
    const ext = '.pdf';
    const fileName = `${bookId}${ext}`;
    const destPath = path.join(BOOKS_UPLOAD_DIR, fileName);

    console.log(`Starting IA download for request ${req.params.id}: ${ia_id} -> ${destPath}`);

    let downloadResult;
    try {
      downloadResult = await downloadIaPdf(ia_id, destPath);
    } catch (dlErr) {
      console.error('IA download failed:', dlErr.message);
      return res.status(502).json({ error: `Failed to download from Internet Archive: ${dlErr.message}` });
    }

    // Generate summary if requested and LLM key is configured
    let description = `Downloaded from Internet Archive (${ia_id}).`;
    if (generate_summary && process.env.DASHSCOPE_API_KEY) {
      try {
        const summary = await generateBookSummary(
          ol_title || request.title,
          request.genre,
          description,
          'medium'
        );
        if (summary) description = summary;
      } catch (llmErr) {
        console.error('LLM summary generation failed:', llmErr.message);
        // Fall back to default description
      }
    }

    // Download cover if available
    let coverPath = null;
    if (cover_id) {
      try {
        const coverBuffer = await fetchCover(cover_id, 'L');
        if (coverBuffer) {
          const coverExt = '.jpg';
          const coverFileName = `${randomUUID()}${coverExt}`;
          coverPath = `uploads/covers/${coverFileName}`;
          fs.writeFileSync(path.join(COVERS_UPLOAD_DIR, coverFileName), coverBuffer);
        }
      } catch (coverErr) {
        console.error('Cover download error:', coverErr.message);
      }
    }

    // Get a librarian user as the author for OL books
    const authorName = ol_author || request.author;

    // Create the book and fulfill the request in a transaction
    const tx = db.transaction(() => {
      // Insert book
      db.prepare(`
        INSERT INTO books (id, title, author_id, author_name, genre, description,
                           file_path, file_name, status, availability, cover_image, publish_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'available', ?, datetime('now'))
      `).run(
        bookId,
        (ol_title || request.title).trim(),
        req.user.id,
        authorName.trim(),
        request.genre.trim(),
        description,
        destPath,
        fileName,
        coverPath
      );

      // Insert downloaded_books record
      db.prepare(`
        INSERT INTO downloaded_books (id, book_id, request_id, source, source_url)
        VALUES (?, ?, ?, 'open_library', ?)
      `).run(randomUUID(), bookId, request.id, `${ia_id}`);

      // Update request status
      db.prepare(`
        UPDATE book_requests SET status = 'fulfilled', fulfilled_book_id = ?,
                librarian_note = 'Fulfilled via Open Library download', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bookId, request.id);
    });
    tx();

    // Notify requester
    createNotification(request.user_id, 'request_fulfilled', 'Book Request Fulfilled',
      `Your request for "${request.title}" has been fulfilled. "${ol_title || request.title}" is now available in the catalog.`,
      'normal', 'submissions', bookId);

    // Notify similar requesters
    notifySimilarRequesters(request.title, request.author, bookId);

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);

    return res.json({
      message: 'Book downloaded and request fulfilled',
      book: {
        id: book.id,
        title: book.title,
        status: book.status,
        cover_image: book.cover_image ? `/${book.cover_image}` : null
      }
    });
  } catch (err) {
    console.error('POST /api/requests/:id/download error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/requests/:id/upload-manual — librarian only; multipart
// Save file, create book, fulfill request
// =========================================================================
router.post('/:id/upload-manual', authorize('librarian'), (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const { title, author, genre, description } = req.body;

      const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      if (request.status === 'fulfilled') {
        return res.status(400).json({ error: 'Request is already fulfilled' });
      }

      if (!req.files || !req.files.file || req.files.file.length === 0) {
        return res.status(400).json({ error: 'Book file is required' });
      }

      const bookFile = req.files.file[0];
      const bookId = randomUUID();
      const filePath = bookFile.path;
      const fileName = bookFile.originalname;

      let coverPath = null;
      if (req.files.cover && req.files.cover.length > 0) {
        coverPath = `uploads/covers/${req.files.cover[0].filename}`;
      }

      const bookTitle = (title || request.title).trim();
      const bookAuthor = (author || request.author).trim();
      const bookGenre = (genre || request.genre).trim();
      const bookDescription = (description || `Uploaded to fulfill request for "${request.title}".`).trim();

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO books (id, title, author_id, author_name, genre, description,
                             file_path, file_name, status, availability, cover_image, publish_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'available', ?, datetime('now'))
        `).run(bookId, bookTitle, req.user.id, bookAuthor, bookGenre, bookDescription,
               filePath, fileName, coverPath);

        db.prepare(`
          INSERT INTO downloaded_books (id, book_id, request_id, source)
          VALUES (?, ?, ?, 'manual_upload')
        `).run(randomUUID(), bookId, request.id);

        db.prepare(`
          UPDATE book_requests SET status = 'fulfilled', fulfilled_book_id = ?,
                  librarian_note = 'Fulfilled via manual upload', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(bookId, request.id);
      });
      tx();

      // Notify requester
      createNotification(request.user_id, 'request_fulfilled', 'Book Request Fulfilled',
        `Your request for "${request.title}" has been fulfilled. "${bookTitle}" is now available in the catalog.`,
        'normal', 'submissions', bookId);

      // Notify similar requesters
      notifySimilarRequesters(request.title, request.author, bookId);

      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);

      return res.json({
        message: 'Manual upload completed and request fulfilled',
        book: {
          id: book.id,
          title: book.title,
          status: book.status,
          cover_image: book.cover_image ? `/${book.cover_image}` : null
        }
      });
    } catch (err) {
      console.error('POST /api/requests/:id/upload-manual error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// =========================================================================
// GET /api/requests/analytics — librarian only
// byStatus, byGenre, byAuthor, overTime
// =========================================================================
router.get('/analytics', authorize('librarian'), (req, res) => {
  try {
    // byStatus
    const byStatus = db.prepare(`
      SELECT status, COUNT(*) AS count FROM book_requests GROUP BY status
    `).all();

    // byGenre
    const byGenre = db.prepare(`
      SELECT genre, COUNT(*) AS count FROM book_requests GROUP BY genre ORDER BY count DESC LIMIT 10
    `).all();

    // byAuthor (most requested authors)
    const byAuthor = db.prepare(`
      SELECT author, COUNT(*) AS count FROM book_requests GROUP BY author ORDER BY count DESC LIMIT 10
    `).all();

    // overTime — last 30 days, grouped by day
    const overTime = db.prepare(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM book_requests
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();

    return res.json({ byStatus, byGenre, byAuthor, overTime });
  } catch (err) {
    console.error('GET /api/requests/analytics error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
