import { Router } from 'express';
import { randomUUID } from 'crypto';
import db, { processAutoReturns } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =========================================================================
// GET /api/history — reading history for current user
// DR-15: calls processAutoReturns() first
// =========================================================================
router.get('/', (req, res) => {
  try {
    processAutoReturns();

    const { search, genre, date_from, date_to, status, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = ['br.user_id = ?'];
    const params = [req.user.id];

    if (search) {
      whereClauses.push('(b.title LIKE ? OR b.author_name LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }
    if (genre) {
      whereClauses.push('b.genre LIKE ?');
      params.push(`%${genre}%`);
    }
    if (date_from) {
      whereClauses.push('br.borrow_date >= ?');
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push('br.borrow_date <= ?');
      params.push(date_to);
    }
    if (status) {
      whereClauses.push('br.status = ?');
      params.push(status);
    }

    const whereSQL = whereClauses.join(' AND ');

    const countRow = db.prepare(`
      SELECT COUNT(*) AS total
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      WHERE ${whereSQL}
    `).get(...params);

    const records = db.prepare(`
      SELECT
        br.id AS borrow_id, br.book_id, br.user_id,
        br.borrow_date, br.due_date, br.return_date, br.status,
        b.id AS book_id, b.title, b.author_name, b.genre, b.cover_image,
        b.times_borrowed,
        COALESCE(rp.current_page, 1) AS current_page,
        rp.total_pages,
        COALESCE(rp.seconds_read, 0) AS seconds_read,
        rp.last_read_at,
        bt.count AS bookmark_count,
        CASE WHEN br.due_date < datetime('now') AND br.status = 'active'
          THEN 1 ELSE 0 END AS is_overdue
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      LEFT JOIN reading_progress rp ON rp.user_id = br.user_id AND rp.book_id = br.book_id
      LEFT JOIN (
        SELECT book_id, COUNT(*) AS count FROM bookmarks WHERE user_id = ? GROUP BY book_id
      ) bt ON bt.book_id = br.book_id
      WHERE ${whereSQL}
      ORDER BY br.borrow_date DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, ...params, limitNum, offset);

    // Compute enriched fields
    const enriched = records.map(r => {
      const borrowDate = new Date(r.borrow_date);
      const returnDate = r.return_date ? new Date(r.return_date) : new Date();
      const durationMs = returnDate - borrowDate;
      const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

      return {
        ...r,
        cover_image: r.cover_image ? `/${r.cover_image}` : null,
        progress_percent: r.total_pages
          ? Math.min(100, Math.round((r.current_page / r.total_pages) * 100))
          : 0,
        duration_days: durationDays
      };
    });

    return res.json({
      records: enriched,
      total: countRow.total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(countRow.total / limitNum)
    });
  } catch (err) {
    console.error('GET /api/history error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/history/insights — totals and breakdowns
// =========================================================================
router.get('/insights', (req, res) => {
  try {
    const userId = req.user.id;

    // Total borrows
    const { total_borrows } = db.prepare(`
      SELECT COUNT(*) AS total_borrows FROM borrow_records WHERE user_id = ?
    `).get(userId);

    // Average duration (in days)
    const avgRow = db.prepare(`
      SELECT AVG(
        CAST(julianday(COALESCE(return_date, datetime('now'))) - julianday(borrow_date) AS REAL)
      ) AS avg_duration
      FROM borrow_records
      WHERE user_id = ? AND status = 'returned'
    `).get(userId);

    const avg_duration = avgRow.avg_duration ? Math.round(avgRow.avg_duration * 10) / 10 : 0;

    // By genre
    const byGenre = db.prepare(`
      SELECT b.genre, COUNT(*) AS count
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      WHERE br.user_id = ?
      GROUP BY b.genre
      ORDER BY count DESC
    `).all(userId);

    // By month (last 12 months)
    const byMonth = db.prepare(`
      SELECT strftime('%Y-%m', br.borrow_date) AS month, COUNT(*) AS count
      FROM borrow_records br
      WHERE br.user_id = ? AND br.borrow_date >= datetime('now', '-12 months')
      GROUP BY strftime('%Y-%m', br.borrow_date)
      ORDER BY month ASC
    `).all(userId);

    // Total seconds read
    const secRow = db.prepare(`
      SELECT COALESCE(SUM(seconds_read), 0) AS total_seconds_read
      FROM reading_progress WHERE user_id = ?
    `).get(userId);

    return res.json({
      total_borrows,
      avg_duration,
      by_genre: byGenre,
      by_month: byMonth,
      total_seconds_read: secRow.total_seconds_read
    });
  } catch (err) {
    console.error('GET /api/history/insights error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/history/achievements — badge system
// 7 badges: first_borrow, bookworm_5, scholar_10, librarian_25, explorer, critic, reviewer_pro
// =========================================================================
router.get('/achievements', (req, res) => {
  try {
    const userId = req.user.id;

    // Count borrows
    const { borrow_count } = db.prepare(`
      SELECT COUNT(*) AS borrow_count FROM borrow_records WHERE user_id = ?
    `).get(userId);

    // Count distinct genres borrowed
    const { genre_count } = db.prepare(`
      SELECT COUNT(DISTINCT b.genre) AS genre_count
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      WHERE br.user_id = ?
    `).get(userId);

    // Count reviews written
    const { review_count } = db.prepare(`
      SELECT COUNT(*) AS review_count FROM reviews WHERE user_id = ?
    `).get(userId);

    // Define badges
    const badges = [
      {
        id: 'first_borrow',
        name: 'First Borrow',
        description: 'Borrow your first book',
        icon: '📚',
        earned: borrow_count >= 1
      },
      {
        id: 'bookworm_5',
        name: 'Bookworm',
        description: 'Borrow 5 books',
        icon: '🐛',
        earned: borrow_count >= 5
      },
      {
        id: 'scholar_10',
        name: 'Scholar',
        description: 'Borrow 10 books',
        icon: '🎓',
        earned: borrow_count >= 10
      },
      {
        id: 'librarian_25',
        name: 'Master Reader',
        description: 'Borrow 25 books',
        icon: '👑',
        earned: borrow_count >= 25
      },
      {
        id: 'explorer',
        name: 'Explorer',
        description: 'Explore books across different genres',
        icon: '🧭',
        earned: genre_count >= 3
      },
      {
        id: 'critic',
        name: 'Critic',
        description: 'Write your first review',
        icon: '✍️',
        earned: review_count >= 1
      },
      {
        id: 'reviewer_pro',
        name: 'Review Pro',
        description: 'Write 5 reviews',
        icon: '⭐',
        earned: review_count >= 5
      }
    ];

    return res.json({
      badges,
      earned_count: badges.filter(b => b.earned).length,
      total_count: badges.length
    });
  } catch (err) {
    console.error('GET /api/history/achievements error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/history/progress — upsert reading progress
// Cumulative seconds_read
// =========================================================================
router.post('/progress', (req, res) => {
  try {
    const { book_id, current_page, total_pages, seconds_increment } = req.body;

    if (!book_id) {
      return res.status(400).json({ error: 'book_id is required' });
    }

    // Verify the user has a borrow for this book
    const borrow = db.prepare(
      'SELECT id FROM borrow_records WHERE user_id = ? AND book_id = ?'
    ).get(req.user.id, book_id);

    if (!borrow) {
      return res.status(403).json({ error: 'You have not borrowed this book' });
    }

    // Upsert reading progress
    const existing = db.prepare(
      'SELECT id FROM reading_progress WHERE user_id = ? AND book_id = ?'
    ).get(req.user.id, book_id);

    if (existing) {
      const updates = [];
      const params = [];

      if (current_page && typeof current_page === 'number') {
        updates.push('current_page = ?');
        params.push(current_page);
      }
      if (total_pages && typeof total_pages === 'number') {
        updates.push('total_pages = ?');
        params.push(total_pages);
      }
      if (seconds_increment && typeof seconds_increment === 'number') {
        updates.push('seconds_read = seconds_read + ?');
        params.push(seconds_increment);
      }

      updates.push('last_read_at = CURRENT_TIMESTAMP');
      params.push(existing.id);

      if (updates.length > 1) {
        db.prepare(`UPDATE reading_progress SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
    } else {
      db.prepare(`
        INSERT INTO reading_progress (id, user_id, book_id, current_page, total_pages, seconds_read)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        req.user.id,
        book_id,
        current_page || 1,
        total_pages || null,
        seconds_increment || 0
      );
    }

    const progress = db.prepare(
      'SELECT * FROM reading_progress WHERE user_id = ? AND book_id = ?'
    ).get(req.user.id, book_id);

    return res.json({ progress });
  } catch (err) {
    console.error('POST /api/history/progress error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/history/progress/:bookId — get reading progress for a book
// =========================================================================
router.get('/progress/:bookId', (req, res) => {
  try {
    const progress = db.prepare(
      'SELECT * FROM reading_progress WHERE user_id = ? AND book_id = ?'
    ).get(req.user.id, req.params.bookId);

    if (!progress) {
      return res.status(404).json({ error: 'No reading progress found for this book' });
    }

    return res.json({ progress });
  } catch (err) {
    console.error('GET /api/history/progress/:bookId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/history/export — export reading history as CSV or PDF
// =========================================================================
router.get('/export', async (req, res) => {
  try {
    const { format } = req.query;

    // Get reading history data
    const records = db.prepare(`
      SELECT
        b.title, b.author_name, b.genre,
        br.borrow_date, br.due_date, br.return_date, br.status,
        COALESCE(rp.current_page, 1) AS current_page,
        COALESCE(rp.seconds_read, 0) AS seconds_read
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      LEFT JOIN reading_progress rp ON rp.user_id = br.user_id AND rp.book_id = br.book_id
      WHERE br.user_id = ?
      ORDER BY br.borrow_date DESC
    `).all(req.user.id);

    if (format === 'pdf') {
      // Generate PDF using pdfkit
      try {
        const PDFDocument = (await import('pdfkit')).default;
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="reading-history.pdf"');
        doc.pipe(res);

        doc.fontSize(20).text('Reading History', { align: 'center' });
        doc.moveDown();

        for (const r of records) {
          doc.fontSize(12).text(`${r.title} by ${r.author_name}`);
          doc.fontSize(10).text(`Genre: ${r.genre} | Status: ${r.status}`);
          doc.text(`Borrowed: ${r.borrow_date} | ${r.return_date ? 'Returned: ' + r.return_date : ''}`);
          doc.text(`Progress: page ${r.current_page} | ${r.seconds_read}s read`);
          doc.moveDown(0.5);
        }

        doc.end();
        return;
      } catch (pdfErr) {
        console.error('PDF generation error:', pdfErr.message);
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }
    }

    // CSV export (default)
    const header = 'Title,Author,Genre,Borrow Date,Due Date,Return Date,Status,Current Page,Seconds Read\n';
    const rows = records.map(r => {
      const escape = (v) => {
        const s = String(v || '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      return [escape(r.title), escape(r.author_name), escape(r.genre),
              r.borrow_date, r.due_date, r.return_date || '', r.status,
              r.current_page, r.seconds_read].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reading-history.csv"');
    return res.send(header + rows);
  } catch (err) {
    console.error('GET /api/history/export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
