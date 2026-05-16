// BiblioVault stats router — author statistics dashboard, downloaded book
// stats, and user activity log for librarians.
// All routes require authenticate.
// Mount path: /api/stats

import { Router } from 'express';
import { getDb } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/stats/author — Author's per-book stats with aggregates
// Returns: { books: [...], summary: {...}, sentiment: {...}, trends: [...] }
// Excludes drafts from all stats per P3-T4-STAT-004
// ---------------------------------------------------------------------------
router.get('/author', authenticate, authorize('author'), (req, res) => {
  const db = getDb();

  // Per-book stats (excluding drafts)
  const books = db
    .prepare(
      `SELECT
         b.id, b.title, b.genre, b.status, b.availability,
         b.times_borrowed, b.publish_date, b.submitted_date,
         COALESCE(AVG(r.rating), 0) AS avg_rating,
         COUNT(DISTINCT r.id) AS review_count,
         COALESCE(rp.total_seconds, 0) AS total_seconds_read,
         COALESCE(br_total.borrow_count, 0) AS unique_borrowers
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
       LEFT JOIN (
         SELECT book_id, SUM(seconds_read) AS total_seconds
         FROM reading_progress
         GROUP BY book_id
       ) rp ON rp.book_id = b.id
       LEFT JOIN (
         SELECT book_id, COUNT(DISTINCT user_id) AS borrow_count
         FROM borrow_records
         GROUP BY book_id
       ) br_total ON br_total.book_id = b.id
       WHERE b.author_id = ? AND b.status != 'draft'
       GROUP BY b.id
       ORDER BY b.submitted_date DESC`
    )
    .all(req.user.id);

  // Format book stats
  const formattedBooks = books.map((b) => ({
    ...b,
    avg_rating: Number(b.avg_rating),
    review_count: Number(b.review_count),
    total_seconds_read: Number(b.total_seconds_read),
    unique_borrowers: Number(b.unique_borrowers),
  }));

  // Summary aggregates
  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total_books,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS published_books,
         SUM(times_borrowed) AS total_borrows,
         COUNT(DISTINCT r.id) AS total_reviews,
         COALESCE(AVG(CASE WHEN r.flagged = 0 OR r.flagged IS NULL THEN r.rating END), 0) AS avg_rating
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id
       WHERE b.author_id = ? AND b.status != 'draft'`
    )
    .get(req.user.id);

  // Sentiment breakdown
  const sentiment = db
    .prepare(
      `SELECT
         COALESCE(r.sentiment, 'unclassified') AS sentiment,
         COUNT(*) AS count
       FROM reviews r
       JOIN books b ON r.book_id = b.id
       WHERE b.author_id = ? AND b.status != 'draft'
       GROUP BY r.sentiment`
    )
    .all(req.user.id);

  // 30-day borrow trend
  const trends = db
    .prepare(
      `SELECT DATE(br.borrow_date) AS date, COUNT(*) AS count
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       WHERE b.author_id = ?
         AND br.borrow_date >= datetime('now', '-30 days')
       GROUP BY DATE(br.borrow_date)
       ORDER BY date ASC`
    )
    .all(req.user.id);

  res.json({
    books: formattedBooks,
    summary: {
      total_books: summary.total_books || 0,
      published_books: summary.published_books || 0,
      total_borrows: summary.total_borrows || 0,
      total_reviews: summary.total_reviews || 0,
      avg_rating: Number(summary.avg_rating || 0),
    },
    sentiment,
    trends,
  });
});

// ---------------------------------------------------------------------------
// GET /api/stats/author/export — Author stats CSV export
// ---------------------------------------------------------------------------
router.get('/author/export', authenticate, authorize('author'), (req, res) => {
  const db = getDb();

  const books = db
    .prepare(
      `SELECT
         b.title, b.genre, b.status, b.times_borrowed,
         COALESCE(AVG(r.rating), 0) AS avg_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
       WHERE b.author_id = ? AND b.status != 'draft'
       GROUP BY b.id
       ORDER BY b.submitted_date DESC`
    )
    .all(req.user.id);

  const headers = ['Title', 'Genre', 'Status', 'Borrows', 'Avg Rating', 'Reviews'];
  const csvRows = [headers.join(',')];

  for (const b of books) {
    const row = [
      `"${(b.title || '').replace(/"/g, '""')}"`,
      `"${(b.genre || '').replace(/"/g, '""')}"`,
      b.status || '',
      b.times_borrowed || 0,
      Number(b.avg_rating).toFixed(2),
      b.review_count || 0,
    ];
    csvRows.push(row.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="author-stats.csv"');
  res.send(csvRows.join('\n'));
});

// ---------------------------------------------------------------------------
// GET /api/stats/downloaded — Librarian: downloaded book stats
// Returns: { books: [...], summary: {...}, by_source: {...} }
// ---------------------------------------------------------------------------
router.get('/downloaded', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();

  const books = db
    .prepare(
      `SELECT
         b.id, b.title, b.author_name, b.genre, b.status, b.availability,
         b.times_borrowed, b.publish_date,
         dl.source, dl.source_url, dl.created_at AS downloaded_at,
         COALESCE(AVG(r.rating), 0) AS avg_rating,
         COUNT(DISTINCT r.id) AS review_count
       FROM downloaded_books dl
       JOIN books b ON dl.book_id = b.id
       LEFT JOIN reviews r ON r.book_id = b.id AND (r.flagged = 0 OR r.flagged IS NULL)
       GROUP BY dl.id
       ORDER BY dl.created_at DESC`
    )
    .all();

  const formattedBooks = books.map((b) => ({
    ...b,
    avg_rating: Number(b.avg_rating),
    review_count: Number(b.review_count),
  }));

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total_books,
         SUM(b.times_borrowed) AS total_borrows
       FROM downloaded_books dl
       JOIN books b ON dl.book_id = b.id`
    )
    .get();

  const bySource = db
    .prepare(
      `SELECT source, COUNT(*) AS count
       FROM downloaded_books
       GROUP BY source`
    )
    .all();

  res.json({
    books: formattedBooks,
    summary: {
      total_books: summary.total_books || 0,
      total_borrows: summary.total_borrows || 0,
    },
    by_source: bySource.reduce((acc, row) => {
      acc[row.source] = row.count;
      return acc;
    }, {}),
  });
});

// ---------------------------------------------------------------------------
// GET /api/stats/user-activity/:userId — Librarian: user activity log
// ---------------------------------------------------------------------------
router.get('/user-activity/:userId', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();

  const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Borrow history
  const borrowHistory = db
    .prepare(
      `SELECT br.*, b.title AS book_title, b.author_name
       FROM borrow_records br
       JOIN books b ON br.book_id = b.id
       WHERE br.user_id = ?
       ORDER BY br.borrow_date DESC
       LIMIT 50`
    )
    .all(req.params.userId);

  // Review activity
  const reviewActivity = db
    .prepare(
      `SELECT r.*, b.title AS book_title
       FROM reviews r
       JOIN books b ON r.book_id = b.id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC
       LIMIT 20`
    )
    .all(req.params.userId);

  // Request activity
  const requestActivity = db
    .prepare(
      `SELECT * FROM book_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(req.params.userId);

  // User activity log entries
  const activityLog = db
    .prepare(
      `SELECT * FROM user_activity
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .all(req.params.userId);

  // Summary
  const summary = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM borrow_records WHERE user_id = ?) AS total_borrows,
         (SELECT COUNT(*) FROM reviews WHERE user_id = ?) AS total_reviews,
         (SELECT COUNT(*) FROM book_requests WHERE user_id = ?) AS total_requests,
         (SELECT COUNT(*) FROM borrow_records WHERE user_id = ? AND status = 'active') AS active_borrows`
    )
    .get(req.params.userId, req.params.userId, req.params.userId, req.params.userId);

  res.json({
    user,
    summary,
    borrowHistory,
    reviewActivity,
    requestActivity,
    activityLog,
  });
});

export default router;
