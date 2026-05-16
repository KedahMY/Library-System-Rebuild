// BiblioVault history router — reading history, insights, achievements, progress tracking,
// and export (CSV/PDF). Mounted at /api/history.
// All routes require authentication.

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, processAutoReturns } from '../database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// Achievement badges — hardcoded per specification
// ---------------------------------------------------------------------------
const ACHIEVEMENTS = [
  { id: 'first_borrow', label: 'First Read', description: 'Borrowed your first book', threshold: 1 },
  { id: 'bookworm_5', label: 'Bookworm', description: 'Borrowed 5 books', threshold: 5 },
  { id: 'scholar_10', label: 'Avid Reader', description: 'Borrowed 10 books', threshold: 10 },
  { id: 'librarian_25', label: 'Bibliophile', description: 'Borrowed 25 books', threshold: 25 },
  {
    id: 'explorer',
    label: 'Genre Explorer',
    description: 'Read books from 3+ genres',
    condition: 'distinct_genres >= 3',
  },
  { id: 'critic', label: 'Critic', description: 'Reviewed 3+ books', condition: 'reviews >= 3' },
  {
    id: 'reviewer_pro',
    label: 'Reviewer Pro',
    description: 'Reviewed 10+ books',
    condition: 'reviews >= 10',
  },
];

// ---------------------------------------------------------------------------
// Helper: generate CSV string from rows
// ---------------------------------------------------------------------------
function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    const vals = headers.map((h) => {
      const v = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/history
 * Returns reading history for the current user with optional filters.
 * Filters: ?genre=, ?dateFrom=, ?dateTo=, ?search=
 * Calls processAutoReturns() lazily per DR-15.
 */
router.get('/', authenticate, (req, res) => {
  try {
    processAutoReturns();
  } catch (e) {
    /* non-critical */
  }

  const db = getDb();
  const search = (req.query.search || '').trim();
  const genre = (req.query.genre || '').trim();
  const dateFrom = (req.query.dateFrom || '').trim();
  const dateTo = (req.query.dateTo || '').trim();

  let where = 'WHERE br.user_id = ?';
  const params = [req.user.id];

  if (search) {
    where += ' AND (b.title LIKE ? OR b.author_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (genre) {
    where += ' AND b.genre LIKE ?';
    params.push(`%${genre}%`);
  }
  if (dateFrom) {
    where += ' AND br.borrow_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    where += ' AND br.borrow_date <= ?';
    params.push(dateTo);
  }

  const history = db
    .prepare(
      `SELECT br.id, br.book_id, br.borrow_date, br.due_date, br.return_date, br.status,
              b.title, b.author_name, b.genre, b.cover_image,
              COALESCE(rp.current_page, 0) AS current_page,
              COALESCE(rp.total_pages, 0) AS total_pages,
              COALESCE(rp.seconds_read, 0) AS seconds_read,
              CASE WHEN COALESCE(rp.total_pages, 0) > 0
                THEN ROUND(CAST(COALESCE(rp.current_page, 0) AS REAL) / CAST(rp.total_pages AS REAL) * 100, 1)
                ELSE 0
              END AS progress_pct
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       LEFT JOIN reading_progress rp ON rp.book_id = br.book_id AND rp.user_id = br.user_id
       ${where}
       ORDER BY br.borrow_date DESC`
    )
    .all(...params);

  res.json(history);
});

/**
 * GET /api/history/insights
 * Returns aggregate reading stats for the current user:
 * total_borrows, total_seconds, by_genre breakdown, by_month timeline.
 */
router.get('/insights', authenticate, (req, res) => {
  const db = getDb();

  const totalBorrows = db
    .prepare("SELECT COUNT(*) AS cnt FROM borrow_records WHERE user_id = ? AND status != 'active'")
    .get(req.user.id).cnt;

  const totalSeconds = db
    .prepare("SELECT COALESCE(SUM(seconds_read), 0) AS total FROM reading_progress WHERE user_id = ?")
    .get(req.user.id).total;

  const byGenre = db
    .prepare(
      `SELECT b.genre, COUNT(*) AS count
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       WHERE br.user_id = ?
       GROUP BY b.genre
       ORDER BY count DESC`
    )
    .all(req.user.id);

  const byMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', br.borrow_date) AS month, COUNT(*) AS count
       FROM borrow_records br
       WHERE br.user_id = ? AND br.borrow_date >= date('now', '-12 months')
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(req.user.id);

  res.json({
    total_borrows: totalBorrows,
    total_seconds: totalSeconds,
    by_genre: byGenre,
    by_month: byMonth,
  });
});

/**
 * GET /api/history/achievements
 * Returns 7 achievement badges with earned/unlocked status.
 */
router.get('/achievements', authenticate, (req, res) => {
  const db = getDb();

  const totalBorrows = db
    .prepare("SELECT COUNT(*) AS cnt FROM borrow_records WHERE user_id = ?")
    .get(req.user.id).cnt;

  const genreRow = db
    .prepare(
      `SELECT COUNT(DISTINCT b.genre) AS cnt
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       WHERE br.user_id = ?`
    )
    .get(req.user.id);
  const distinctGenres = genreRow ? genreRow.cnt : 0;

  const reviewCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM reviews WHERE user_id = ?")
    .get(req.user.id).cnt;

  const unlocked = ACHIEVEMENTS.map((a) => {
    let earned = false;
    if (a.threshold !== undefined) {
      earned = totalBorrows >= a.threshold;
    } else if (a.condition) {
      if (a.condition.startsWith('distinct_genres')) {
        earned = distinctGenres >= 3;
      } else if (a.condition.startsWith('reviews >= 10')) {
        earned = reviewCount >= 10;
      } else if (a.condition.startsWith('reviews >= 3')) {
        earned = reviewCount >= 3;
      }
    }
    return {
      ...a,
      earned,
      progress: a.threshold
        ? Math.min(100, Math.round((totalBorrows / a.threshold) * 100))
        : earned
          ? 100
          : 0,
    };
  });

  res.json({
    achievements: unlocked,
    total_borrows: totalBorrows,
    distinct_genres: distinctGenres,
    review_count: reviewCount,
  });
});

/**
 * POST /api/history/progress
 * Upserts reading progress for a book.
 * Body: { book_id, current_page, total_pages?, seconds_increment? }
 * seconds_increment is ADDED to existing seconds_read (cumulative).
 */
router.post('/progress', authenticate, (req, res) => {
  const db = getDb();
  const { book_id, current_page, total_pages, seconds_increment } = req.body;

  if (!book_id) {
    return res.status(400).json({ error: 'book_id is required' });
  }

  const page = parseInt(current_page, 10) || 1;
  const total = total_pages !== undefined ? parseInt(total_pages, 10) : null;
  const secs = parseInt(seconds_increment, 10) || 0;

  const existing = db
    .prepare('SELECT id, seconds_read FROM reading_progress WHERE user_id = ? AND book_id = ?')
    .get(req.user.id, book_id);

  try {
    if (existing) {
      db.prepare(
        `UPDATE reading_progress
         SET current_page = ?,
             total_pages = CASE WHEN ? IS NOT NULL THEN ? ELSE total_pages END,
             seconds_read = seconds_read + ?,
             last_read_at = datetime('now')
         WHERE id = ?`
      ).run(page, total, total, secs, existing.id);
    } else {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO reading_progress (id, user_id, book_id, current_page, total_pages, seconds_read, last_read_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(id, req.user.id, book_id, page, total, secs);
    }
    res.json({ message: 'Progress saved' });
  } catch (err) {
    console.error('Progress save error:', err.message);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

/**
 * GET /api/history/progress/:bookId
 * Returns reading progress for a specific book.
 * Returns defaults (current_page=1) if no progress row exists.
 */
router.get('/progress/:bookId', authenticate, (req, res) => {
  const db = getDb();
  const progress = db
    .prepare(
      'SELECT current_page, total_pages, seconds_read, last_read_at FROM reading_progress WHERE user_id = ? AND book_id = ?'
    )
    .get(req.user.id, req.params.bookId);

  if (!progress) {
    return res.json({ current_page: 1, total_pages: null, seconds_read: 0, last_read_at: null });
  }

  res.json(progress);
});

/**
 * GET /api/history/export
 * Exports reading history as CSV or PDF.
 * ?format=csv (default) | pdf
 */
router.get('/export', authenticate, async (req, res) => {
  const db = getDb();
  const format = req.query.format || 'csv';

  const history = db
    .prepare(
      `SELECT b.title, b.author_name, b.genre,
              br.borrow_date, br.due_date, br.return_date, br.status,
              COALESCE(rp.seconds_read, 0) AS seconds_read
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       LEFT JOIN reading_progress rp ON rp.book_id = br.book_id AND rp.user_id = br.user_id
       WHERE br.user_id = ?
       ORDER BY br.borrow_date DESC`
    )
    .all(req.user.id);

  if (format === 'pdf') {
    try {
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="reading-history.pdf"');
      doc.pipe(res);

      doc.fontSize(18).text('Reading History', { align: 'center' });
      doc.moveDown(1);

      for (const h of history) {
        doc.fontSize(12).text(`${h.title}`);
        doc
          .fontSize(10)
          .fillColor('#555')
          .text(`by ${h.author_name}  |  Genre: ${h.genre}  |  Status: ${h.status}`);
        doc
          .fontSize(9)
          .fillColor('#888')
          .text(
            `Borrowed: ${h.borrow_date || '--'}  |  Due: ${h.due_date || '--'}  |  Returned: ${h.return_date || '--'}  |  Read: ${h.seconds_read}s`
          );
        doc.moveDown(0.8);
      }

      doc.end();
    } catch (e) {
      // pdfkit not available — fall back to CSV
      sendCsvExport(history, res);
    }
  } else {
    sendCsvExport(history, res);
  }
});

/**
 * Sends reading history as CSV attachment.
 */
function sendCsvExport(history, res) {
  const headers = [
    'Title',
    'Author',
    'Genre',
    'Borrow Date',
    'Due Date',
    'Return Date',
    'Status',
    'Seconds Read',
  ];
  const rows = history.map((h) => ({
    Title: h.title,
    Author: h.author_name,
    Genre: h.genre,
    'Borrow Date': h.borrow_date || '',
    'Due Date': h.due_date || '',
    'Return Date': h.return_date || '',
    Status: h.status || '',
    'Seconds Read': h.seconds_read || 0,
  }));

  const csv = toCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reading-history.csv"');
  res.send(csv);
}

export default router;
