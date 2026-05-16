// BiblioVault book requests router — student/staff book requests,
// librarian management, Open Library search and download.
// All routes require authenticate.
// Mount path: /api/requests

import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { searchBooks, findSimilar, downloadIaPdf, fetchCover } from '../services/openlibrary.js';
import { generateBookSummary } from '../services/llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const BOOKS_DIR = path.join(UPLOADS_DIR, 'books');
const COVERS_DIR = path.join(UPLOADS_DIR, 'covers');

// Ensure upload dirs exist
[BOOKS_DIR, COVERS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Helper: notify all librarians
// ---------------------------------------------------------------------------
function notifyLibrarians(db, type, title, message, relatedId) {
  const librarians = db
    .prepare("SELECT id FROM users WHERE role = 'librarian'")
    .all();
  for (const lib of librarians) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, lib.id, type, title, message, 'normal', 'submissions', relatedId || null);
  }
}

// ---------------------------------------------------------------------------
// Helper: cover relative path
// ---------------------------------------------------------------------------
function coverRelPath(filename) {
  return `uploads/covers/${filename}`;
}

// ---------------------------------------------------------------------------
// POST /api/requests — Student/staff creates a book request
// Body: { title, author, genre, reason }
// Notifies librarians (type: new_request)
// ---------------------------------------------------------------------------
router.post('/', authenticate, authorize('student', 'staff'), (req, res) => {
  const db = getDb();
  const { title, author, genre, reason } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!author || !author.trim()) {
    return res.status(400).json({ error: 'Author is required' });
  }
  if (!genre || !genre.trim()) {
    return res.status(400).json({ error: 'Genre is required' });
  }

  const id = uuidv4();

  try {
    db.prepare(
      `INSERT INTO book_requests (id, user_id, title, author, genre, reason, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 'normal')`
    ).run(id, req.user.id, title.trim(), author.trim(), genre.trim(), reason || null);

    // Notify librarians
    notifyLibrarians(
      db,
      'new_request',
      'New Book Request',
      `"${title.trim()}" by ${author.trim()} has been requested by ${req.user.full_name}.`,
      id
    );

    const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(id);
    res.status(201).json(request);
  } catch (err) {
    console.error('Request create error:', err.message);
    res.status(500).json({ error: 'Failed to create book request' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/requests/mine — Student sees their own requests
// ---------------------------------------------------------------------------
router.get('/mine', authenticate, authorize('student', 'staff'), (req, res) => {
  const db = getDb();
  const requests = db
    .prepare(
      `SELECT * FROM book_requests WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(req.user.id);
  res.json(requests);
});

// ---------------------------------------------------------------------------
// GET /api/requests — Librarian: all requests (with filters)
// Query: ?status=, ?priority=, ?search=
// ---------------------------------------------------------------------------
router.get('/', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const status = (req.query.status || '').trim();
  const priority = (req.query.priority || '').trim();
  const search = (req.query.search || '').trim();

  let where = 'WHERE 1=1';
  const params = [];

  if (status) {
    where += ' AND br.status = ?';
    params.push(status);
  }
  if (priority) {
    where += ' AND br.priority = ?';
    params.push(priority);
  }
  if (search) {
    where += ' AND (br.title LIKE ? OR br.author LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const requests = db
    .prepare(
      `SELECT br.*, u.username AS requester_username, u.full_name AS requester_name
       FROM book_requests br
       JOIN users u ON br.user_id = u.id
       ${where}
       ORDER BY
         CASE WHEN br.priority = 'urgent' THEN 0 ELSE 1 END,
         br.created_at DESC`
    )
    .all(...params);

  res.json(requests);
});

// ---------------------------------------------------------------------------
// GET /api/requests/check-duplicate — Duplicate detection
// Query: ?title=, ?author=
// Returns { duplicate: bool, status? }
// ---------------------------------------------------------------------------
router.get('/check-duplicate', authenticate, (req, res) => {
  const db = getDb();
  const title = (req.query.title || '').trim().toLowerCase();
  const author = (req.query.author || '').trim().toLowerCase();

  if (!title) {
    return res.status(400).json({ error: 'Title parameter is required' });
  }

  const existing = db
    .prepare(
      `SELECT status FROM book_requests
       WHERE LOWER(title) = ? AND (? = '' OR LOWER(author) = ?)
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(title, author, author);

  if (existing) {
    return res.json({ duplicate: true, status: existing.status });
  }
  return res.json({ duplicate: false });
});

// ---------------------------------------------------------------------------
// GET /api/requests/:id/openlibrary-search — Librarian: search OL
// Returns { exact: [...], alternatives: [...] }
// Graceful: if OL is down, returns 500 with debug field
// ---------------------------------------------------------------------------
router.get('/:id/openlibrary-search', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);

  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  // Search Open Library
  Promise.all([
    searchBooks(`${request.title} ${request.author}`, 5).catch(() => []),
    findSimilar(request.title, request.genre).catch(() => []),
  ])
    .then(([exactResults, altResults]) => {
      // Filter exact results: items whose title/author overlap with the request
      const reqTitleLower = request.title.toLowerCase();
      const reqAuthorLower = request.author.toLowerCase();

      const exact = exactResults.filter(
        (item) =>
          item.title.toLowerCase().includes(reqTitleLower) ||
          reqTitleLower.includes(item.title.toLowerCase())
      );

      // Remove exact matches from alternatives
      const exactKeys = new Set(exact.map((e) => e.ol_key));
      const alternatives = altResults.filter((a) => !exactKeys.has(a.ol_key));

      res.json({ exact, alternatives });
    })
    .catch((err) => {
      console.error('Open Library search error:', err.message);
      res.status(500).json({
        error: 'Open Library search failed',
        debug: err.message,
      });
    });
});

// ---------------------------------------------------------------------------
// POST /api/requests/:id/download — Librarian downloads from IA to fulfill
// Body: { ia_id, ol_title, ol_author, cover_id?, generate_summary? }
// Creates book (approved), fulfills request, inserts downloaded_books row
// ---------------------------------------------------------------------------
router.post('/:id/download', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);

  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.status === 'fulfilled') {
    return res.status(400).json({ error: 'Request has already been fulfilled' });
  }

  const { ia_id, ol_title, ol_author, cover_id, generate_summary } = req.body;

  if (!ia_id) {
    return res.status(400).json({ error: 'ia_id is required' });
  }

  const bookId = uuidv4();
  const bookFileName = `${uuidv4()}.pdf`;
  const destPath = path.join(BOOKS_DIR, bookFileName);

  // Step 1: Download the PDF from IA
  downloadIaPdf(ia_id, destPath)
    .then((downloadResult) => {
      // Step 2: Optionally download cover image
      let coverImage = null;
      return (cover_id
        ? fetchCover(cover_id, 'L').then((coverBuffer) => {
            if (coverBuffer) {
              const coverFileName = `${uuidv4()}.jpg`;
              const coverPath = path.join(COVERS_DIR, coverFileName);
              fs.writeFileSync(coverPath, coverBuffer);
              coverImage = coverRelPath(coverFileName);
            }
            return coverImage;
          })
        : Promise.resolve(null)
      ).then(() => ({ downloadResult, coverImage }));
    })
    .then(async ({ downloadResult, coverImage }) => {
      // Step 3: Optionally generate summary via LLM
      let description = `Book by ${ol_author || request.author} from Internet Archive.`;
      if (generate_summary) {
        try {
          const llmSummary = await generateBookSummary(
            ol_title || request.title,
            request.genre,
            '',
            'medium'
          );
          if (llmSummary) {
            description = llmSummary;
          }
        } catch (llmErr) {
          console.error('LLM summary generation failed (defaulting to IA description):', llmErr.message);
          // Non-critical — use default description
        }
      }

      // Step 4: Create book and fulfill request
      const run = db.transaction(() => {
        // Create book as approved
        db.prepare(
          `INSERT INTO books (id, title, author_id, author_name, genre, description,
             file_path, file_name, status, availability, cover_image, publish_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'available', ?, datetime('now'))`
        ).run(
          bookId,
          (ol_title || request.title).trim(),
          req.user.id, // Librarian as author_id for OL books
          (ol_author || request.author).trim(),
          request.genre,
          description,
          destPath,
          `${bookFileName}`,
          coverImage
        );

        // Insert downloaded_books tracking
        const dlId = uuidv4();
        db.prepare(
          `INSERT INTO downloaded_books (id, book_id, request_id, source, source_url)
           VALUES (?, ?, ?, 'open_library', ?)`
        ).run(dlId, bookId, request.id, `https://archive.org/details/${ia_id}`);

        // Mark request as fulfilled
        db.prepare(
          "UPDATE book_requests SET status = 'fulfilled', fulfilled_book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(bookId, request.id);

        // Notify the requester
        const notifId = uuidv4();
        db.prepare(
          `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
           VALUES (?, ?, 'request_fulfilled', ?, ?, 'normal', 'submissions', ?)`
        ).run(
          notifId,
          request.user_id,
          'Book Request Fulfilled',
          `Your request for "${request.title}" has been fulfilled. The book is now available in the catalog.`,
          bookId
        );

        // Notify similar pending requests
        const similarRequests = db
          .prepare(
            `SELECT DISTINCT user_id FROM book_requests
             WHERE id != ? AND status = 'pending'
             AND (LOWER(title) LIKE ? OR LOWER(author) LIKE ?)`
          )
          .all(
            request.id,
            `%${request.title.toLowerCase().substring(0, 10)}%`,
            `%${request.author.toLowerCase()}%`
          );

        for (const sr of similarRequests) {
          if (sr.user_id !== request.user_id) {
            const sid = uuidv4();
            db.prepare(
              `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
               VALUES (?, ?, 'similar_book_added', ?, ?, 'normal', 'submissions', ?)`
            ).run(
              sid,
              sr.user_id,
              'Similar Book Added',
              `A book similar to your request "${request.title}" by ${request.author} has been added to the catalog.`,
              bookId
            );
          }
        }
      });

      run();

      res.json({
        message: 'Book downloaded and request fulfilled',
        book_id: bookId,
        request_id: request.id,
      });
    })
    .catch((err) => {
      console.error('Download error:', err.message);
      // Clean up partial download
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch (e) { /* ignore */ }
      }
      res.status(500).json({ error: `Failed to download book: ${err.message}` });
    });
});

// ---------------------------------------------------------------------------
// POST /api/requests/:id/upload-manual — Librarian manual upload to fulfill
// Multipart: file + cover_image + title + author + genre
// ---------------------------------------------------------------------------
router.post('/:id/upload-manual', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);

  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.status === 'fulfilled') {
    return res.status(400).json({ error: 'Request has already been fulfilled' });
  }

  // Configure multer locally for this route
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

  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    const { title, author, genre } = req.body;
    const bookFile = req.files && req.files.file && req.files.file[0];

    if (!bookFile) {
      return res.status(400).json({ error: 'Book file is required' });
    }

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
          (title || request.title).trim(),
          req.user.id,
          (author || request.author).trim(),
          (genre || request.genre).trim(),
          `Book by ${author || request.author} (manual upload).`,
          bookFile.path,
          bookFile.originalname,
          coverImage
        );

        const dlId = uuidv4();
        db.prepare(
          `INSERT INTO downloaded_books (id, book_id, request_id, source)
           VALUES (?, ?, ?, 'manual_upload')`
        ).run(dlId, bookId, request.id);

        db.prepare(
          "UPDATE book_requests SET status = 'fulfilled', fulfilled_book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(bookId, request.id);

        // Notify requester
        const notifId = uuidv4();
        db.prepare(
          `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
           VALUES (?, ?, 'request_fulfilled', ?, ?, 'normal', 'submissions', ?)`
        ).run(
          notifId,
          request.user_id,
          'Book Request Fulfilled',
          `Your request for "${request.title}" has been fulfilled via manual upload.`,
          bookId
        );
      });

      run();
      res.status(200).json({ message: 'Book uploaded and request fulfilled', book_id: bookId, request_id: request.id });
    } catch (dbErr) {
      console.error('Manual upload error:', dbErr.message);
      if (bookFile && fs.existsSync(bookFile.path)) {
        try { fs.unlinkSync(bookFile.path); } catch (e) { /* ignore */ }
      }
      res.status(500).json({ error: 'Failed to fulfill request via manual upload' });
    }
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/requests/:id/priority — Librarian sets priority
// Body: { priority: 'urgent' | 'normal' }
// ---------------------------------------------------------------------------
router.patch('/:id/priority', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const { priority } = req.body;

  if (!priority || !['urgent', 'normal'].includes(priority)) {
    return res.status(400).json({ error: 'priority must be "urgent" or "normal"' });
  }

  const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  db.prepare(
    "UPDATE book_requests SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(priority, req.params.id);

  res.json({ message: `Priority set to ${priority}` });
});

// ---------------------------------------------------------------------------
// PATCH /api/requests/:id/reject — Librarian rejects a request
// Body: { note? }
// ---------------------------------------------------------------------------
router.patch('/:id/reject', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const { note } = req.body;

  const request = db.prepare('SELECT * FROM book_requests WHERE id = ?').get(req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request is ${request.status}, cannot reject` });
  }

  try {
    db.prepare(
      "UPDATE book_requests SET status = 'rejected', librarian_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(note || null, req.params.id);

    // Notify requester
    const notifId = uuidv4();
    const message = note
      ? `Your request for "${request.title}" was rejected. Note: ${note}`
      : `Your request for "${request.title}" was rejected.`;

    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
       VALUES (?, ?, 'request_rejected', ?, ?, 'urgent', 'submissions', ?)`
    ).run(notifId, request.user_id, 'Book Request Rejected', message, request.id);

    res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error('Reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/requests/analytics — Librarian: request analytics
// Returns byStatus, byGenre, byAuthor, overTime
// ---------------------------------------------------------------------------
router.get('/analytics', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();

  // byStatus
  const byStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM book_requests GROUP BY status`
    )
    .all();

  // byGenre
  const byGenre = db
    .prepare(
      `SELECT genre, COUNT(*) AS count FROM book_requests GROUP BY genre ORDER BY count DESC`
    )
    .all();

  // byAuthor
  const byAuthor = db
    .prepare(
      `SELECT author, COUNT(*) AS count FROM book_requests GROUP BY author ORDER BY count DESC LIMIT 20`
    )
    .all();

  // overTime (30-day timeline)
  const overTime = db
    .prepare(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM book_requests
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    )
    .all();

  res.json({ byStatus, byGenre, byAuthor, overTime });
});

export default router;
