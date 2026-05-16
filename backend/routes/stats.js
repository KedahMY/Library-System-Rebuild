import { Router } from 'express';
import db from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =========================================================================
// GET /api/stats/author — author only
// Per-book stats + aggregates + sentiment + 30-day trend
// =========================================================================
router.get('/author', authorize('author'), (req, res) => {
  try {
    const userId = req.user.id;

    // Per-book stats (exclude drafts)
    const books = db.prepare(`
      SELECT
        b.id, b.title, b.genre, b.status, b.times_borrowed,
        b.publish_date, b.cover_image,
        COALESCE(AVG(r.rating), 0) AS avg_rating,
        COUNT(r.id) AS review_count,
        COALESCE(rp_sum.read_count, 0) AS read_count,
        COALESCE(rp_sum.total_seconds, 0) AS total_seconds_read
      FROM books b
      LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
      LEFT JOIN (
        SELECT book_id,
               COUNT(DISTINCT user_id) AS read_count,
               SUM(seconds_read) AS total_seconds
        FROM reading_progress
        GROUP BY book_id
      ) rp_sum ON rp_sum.book_id = b.id
      WHERE b.author_id = ? AND b.status != 'draft'
      GROUP BY b.id
      ORDER BY b.publish_date DESC
    `).all(userId);

    const processedBooks = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null,
      avg_rating: Math.round(b.avg_rating * 100) / 100
    }));

    // Aggregates
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total_books,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS published_books,
        SUM(times_borrowed) AS total_borrows,
        COALESCE(SUM(r.review_count), 0) AS total_reviews
      FROM books b
      LEFT JOIN (
        SELECT book_id, COUNT(*) AS review_count
        FROM reviews
        WHERE flagged = 0 OR flagged IS NULL
        GROUP BY book_id
      ) r ON r.book_id = b.id
      WHERE b.author_id = ? AND b.status != 'draft'
    `).get(userId);

    // Overall average rating
    const ratingRow = db.prepare(`
      SELECT COALESCE(AVG(r.rating), 0) AS overall_rating
      FROM reviews r
      JOIN books b ON r.book_id = b.id
      WHERE b.author_id = ? AND (r.flagged = 0 OR r.flagged IS NULL)
    `).get(userId);

    // Sentiment breakdown for reviews on this author's books
    const sentimentBreakdown = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN r.sentiment = 'positive' THEN 1 ELSE 0 END), 0) AS positive,
        COALESCE(SUM(CASE WHEN r.sentiment = 'negative' THEN 1 ELSE 0 END), 0) AS negative,
        COALESCE(SUM(CASE WHEN r.sentiment = 'neutral' OR r.sentiment IS NULL THEN 1 ELSE 0 END), 0) AS neutral
      FROM reviews r
      JOIN books b ON r.book_id = b.id
      WHERE b.author_id = ?
    `).get(userId);

    // 30-day borrow trend
    const thirtyDayTrend = db.prepare(`
      SELECT DATE(br.borrow_date) AS date, COUNT(*) AS count
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      WHERE b.author_id = ? AND br.borrow_date >= datetime('now', '-30 days')
      GROUP BY DATE(br.borrow_date)
      ORDER BY date ASC
    `).all(userId);

    return res.json({
      books: processedBooks,
      summary: {
        total_books: summary.total_books,
        published_books: summary.published_books,
        total_borrows: summary.total_borrows || 0,
        total_reviews: summary.total_reviews,
        overall_rating: Math.round(ratingRow.overall_rating * 100) / 100
      },
      sentiment: sentimentBreakdown,
      thirty_day_trend: thirtyDayTrend
    });
  } catch (err) {
    console.error('GET /api/stats/author error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/stats/author/export — author only; CSV export
// =========================================================================
router.get('/author/export', authorize('author'), (req, res) => {
  try {
    const books = db.prepare(`
      SELECT
        b.title, b.genre, b.status, b.times_borrowed,
        COALESCE(AVG(r.rating), 0) AS avg_rating,
        COUNT(r.id) AS review_count
      FROM books b
      LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
      WHERE b.author_id = ? AND b.status != 'draft'
      GROUP BY b.id
      ORDER BY b.publish_date DESC
    `).all(req.user.id);

    const header = 'Title,Genre,Status,Borrows,Avg Rating,Reviews\n';
    const rows = books.map(b => {
      const escape = (v) => {
        const s = String(v || '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      return [
        escape(b.title), escape(b.genre), b.status,
        b.times_borrowed, (Math.round(b.avg_rating * 100) / 100).toFixed(2),
        b.review_count
      ].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="author-stats.csv"');
    return res.send(header + rows);
  } catch (err) {
    console.error('GET /api/stats/author/export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/stats/downloaded — librarian only
// Downloaded books with source breakdown
// =========================================================================
router.get('/downloaded', authorize('librarian'), (req, res) => {
  try {
    const books = db.prepare(`
      SELECT
        b.id, b.title, b.author_name, b.genre, b.status, b.availability,
        b.times_borrowed, b.publish_date, b.cover_image,
        COALESCE(AVG(r.rating), 0) AS avg_rating,
        COUNT(r.id) AS review_count,
        d.source, d.source_url, d.created_at AS downloaded_at,
        brq.title AS request_title, brq.author AS request_author
      FROM downloaded_books d
      JOIN books b ON d.book_id = b.id
      LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
      LEFT JOIN book_requests brq ON d.request_id = brq.id
      GROUP BY b.id
      ORDER BY d.created_at DESC
    `).all();

    const processedBooks = books.map(b => ({
      ...b,
      cover_image: b.cover_image ? `/${b.cover_image}` : null,
      avg_rating: Math.round(b.avg_rating * 100) / 100
    }));

    // Source breakdown
    const bySource = db.prepare(`
      SELECT source, COUNT(*) AS count
      FROM downloaded_books
      GROUP BY source
    `).all();

    // Aggregate borrow counts for downloaded books
    const aggregate = db.prepare(`
      SELECT
        COUNT(*) AS total_downloaded,
        COALESCE(SUM(b.times_borrowed), 0) AS total_borrows
      FROM downloaded_books d
      JOIN books b ON d.book_id = b.id
    `).get();

    return res.json({
      books: processedBooks,
      by_source: bySource,
      aggregate: {
        total_downloaded: aggregate.total_downloaded,
        total_borrows: aggregate.total_borrows
      }
    });
  } catch (err) {
    console.error('GET /api/stats/downloaded error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/stats/user-activity/:userId — librarian only
// =========================================================================
router.get('/user-activity/:userId', authorize('librarian'), (req, res) => {
  try {
    const { userId } = req.params;
    const { page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    // Get user activity log
    const countRow = db.prepare(
      'SELECT COUNT(*) AS total FROM user_activity WHERE user_id = ?'
    ).get(userId);

    const activities = db.prepare(`
      SELECT id, user_id, activity_type, details, created_at
      FROM user_activity
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limitNum, offset);

    // Also include borrow history for this user
    const borrows = db.prepare(`
      SELECT br.*, b.title AS book_title
      FROM borrow_records br
      JOIN books b ON br.book_id = b.id
      WHERE br.user_id = ?
      ORDER BY br.borrow_date DESC
      LIMIT 50
    `).all(userId);

    // Reviews by this user
    const reviews = db.prepare(`
      SELECT r.*, b.title AS book_title
      FROM reviews r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      LIMIT 20
    `).all(userId);

    return res.json({
      activities,
      borrows,
      reviews,
      total: countRow.total,
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    console.error('GET /api/stats/user-activity/:userId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
