// BiblioVault reviews router — CRUD for reviews, moderation flags,
// author replies, and helpful upvotes.
// All routes require authenticate unless noted.
// Mount path: /api/reviews

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { classifySentiment } from '../services/llm.js';

const router = Router();

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
    ).run(id, lib.id, type, title, message, 'high', 'general', relatedId || null);
  }
}

// ---------------------------------------------------------------------------
// POST /api/reviews — Submit a review
// Requires: user must have a borrow record for the book (any status)
// Body: { book_id, rating (1-5), content?, anonymous? }
// On duplicate (user, book): returns 409 or UPDATE existing review
// After save: async classifySentiment() updates sentiment field
// ---------------------------------------------------------------------------
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  const { book_id, rating, content, anonymous } = req.body;

  // Validation
  if (!book_id) {
    return res.status(400).json({ error: 'book_id is required' });
  }
  if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
  }

  // Check the user has borrowed this book (any status)
  const borrowRecord = db
    .prepare('SELECT id FROM borrow_records WHERE book_id = ? AND user_id = ?')
    .get(book_id, req.user.id);

  if (!borrowRecord) {
    return res.status(403).json({ error: 'You can only review books you have borrowed' });
  }

  // Check for existing review (UNIQUE constraint)
  const existingReview = db
    .prepare('SELECT id FROM reviews WHERE user_id = ? AND book_id = ?')
    .get(req.user.id, book_id);

  let reviewId;

  const run = db.transaction(() => {
    if (existingReview) {
      // UPDATE existing review
      reviewId = existingReview.id;
      db.prepare(
        `UPDATE reviews
         SET rating = ?, content = ?, anonymous = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(rating, content || null, anonymous ? 1 : 0, reviewId);

      return db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
    }

    // INSERT new review
    reviewId = uuidv4();
    db.prepare(
      `INSERT INTO reviews (id, user_id, book_id, rating, content, anonymous)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(reviewId, req.user.id, book_id, rating, content || null, anonymous ? 1 : 0);

    // Notify the book's author about the new review
    const book = db.prepare('SELECT author_id, title FROM books WHERE id = ?').get(book_id);
    if (book && book.author_id !== req.user.id) {
      const notifId = uuidv4();
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
         VALUES (?, ?, 'new_review', ?, ?, 'normal', 'general', ?)`
      ).run(
        notifId,
        book.author_id,
        'New Review',
        `A new review has been posted for "${book.title}".`,
        book_id
      );
    }

    return db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
  });

  try {
    const review = run();

    // Async sentiment classification — fires and forgets, never blocks response
    if (content && content.trim()) {
      classifySentiment(content).then((sentiment) => {
        try {
          db.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').run(sentiment, reviewId);
        } catch (e) {
          console.error('Failed to update sentiment:', e.message);
        }
      }).catch(() => {
        // classifySentiment already returns 'neutral' on error, but catch here for safety
      });
    }

    res.status(201).json(review);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'You have already reviewed this book' });
    }
    console.error('Review create error:', err.message);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reviews/book/:bookId — List reviews for a book (public)
// Returns aggregates: avg_rating, review_count, distribution {1..5}
// Supports sort=recent|helpful
// Flagged reviews are hidden from public
// ---------------------------------------------------------------------------
router.get('/book/:bookId', (req, res) => {
  const db = getDb();
  const { bookId } = req.params;
  const sort = (req.query.sort || 'recent').toLowerCase();

  // Verify book exists
  const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Get all visible (non-flagged) reviews
  const orderClause = sort === 'helpful'
    ? 'ORDER BY r.helpful_count DESC, r.created_at DESC'
    : 'ORDER BY r.created_at DESC';

  const reviews = db
    .prepare(
      `SELECT r.id, r.user_id, r.book_id, r.rating, r.content, r.anonymous,
              r.helpful_count, r.sentiment, r.created_at, r.updated_at,
              u.username, u.full_name,
              rr.id AS reply_id, rr.content AS reply_content, rr.created_at AS reply_created_at,
             (SELECT COUNT(*) FROM review_replies WHERE review_id = r.id) AS reply_count
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN review_replies rr ON rr.review_id = r.id
       WHERE r.book_id = ? AND (r.flagged = 0 OR r.flagged IS NULL)
       ${orderClause}`
    )
    .all(bookId);

  // Compute aggregates
  const agg = db
    .prepare(
      `SELECT
         COUNT(*) AS review_count,
         COALESCE(AVG(rating), 0) AS avg_rating
       FROM reviews
       WHERE book_id = ? AND (flagged = 0 OR flagged IS NULL)`
    )
    .get(bookId);

  // Distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const distRows = db
    .prepare(
      `SELECT rating, COUNT(*) AS cnt
       FROM reviews
       WHERE book_id = ? AND (flagged = 0 OR flagged IS NULL)
       GROUP BY rating`
    )
    .all(bookId);
  for (const row of distRows) {
    distribution[row.rating] = row.cnt;
  }

  // Deduplicate reviews with replies merged
  const reviewMap = new Map();
  for (const r of reviews) {
    if (!reviewMap.has(r.id)) {
      reviewMap.set(r.id, {
        id: r.id,
        user_id: r.user_id,
        book_id: r.book_id,
        rating: r.rating,
        content: r.content,
        anonymous: r.anonymous,
        helpful_count: r.helpful_count,
        sentiment: r.sentiment,
        created_at: r.created_at,
        updated_at: r.updated_at,
        username: r.anonymous ? 'Anonymous' : r.username,
        full_name: r.anonymous ? 'Anonymous' : r.full_name,
        reply: null,
        reply_count: r.reply_count,
      });
    }
    if (r.reply_id) {
      reviewMap.get(r.id).reply = {
        id: r.reply_id,
        content: r.reply_content,
        created_at: r.reply_created_at,
      };
    }
  }

  res.json({
    reviews: Array.from(reviewMap.values()),
    avg_rating: Number(agg.avg_rating),
    review_count: agg.review_count,
    distribution,
  });
});

// ---------------------------------------------------------------------------
// GET /api/reviews/flagged — Librarian only: list flagged reviews
// ---------------------------------------------------------------------------
router.get('/flagged', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const reviews = db
    .prepare(
      `SELECT r.*, u.username, u.full_name,
              b.title AS book_title, b.author_name
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN books b ON r.book_id = b.id
       WHERE r.flag_pending = 1
       ORDER BY r.created_at DESC`
    )
    .all();
  res.json(reviews);
});

// ---------------------------------------------------------------------------
// POST /api/reviews/:id/flag — Author or librarian flags a review
// Sets flag_pending=1 and notifies librarians
// ---------------------------------------------------------------------------
router.post('/:id/flag', authenticate, (req, res) => {
  const db = getDb();
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);

  if (!review) {
    return res.status(404).json({ error: 'Review not found' });
  }

  // Check if user is authorized to flag: must be the book's author OR a librarian
  const book = db.prepare('SELECT author_id, title FROM books WHERE id = ?').get(review.book_id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  if (req.user.role !== 'librarian' && book.author_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: insufficient permissions' });
  }

  db.prepare('UPDATE reviews SET flag_pending = 1 WHERE id = ?').run(req.params.id);

  // Notify librarians
  notifyLibrarians(
    db,
    'review_flag',
    'Review Flagged',
    `A review for "${book.title}" has been flagged for moderation.`,
    req.params.id
  );

  res.json({ message: 'Review flagged for moderation' });
});

// ---------------------------------------------------------------------------
// POST /api/reviews/:id/resolve-flag — Librarian accepts or rejects a flag
// Body: { action: 'accept' | 'reject' }
//   accept: flagged=1, flag_pending=0 (hidden)
//   reject: flagged=0, flag_pending=0 (restored)
// ---------------------------------------------------------------------------
router.post('/:id/resolve-flag', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const { action } = req.body;

  if (!action || !['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be "accept" or "reject"' });
  }

  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Review not found' });
  }

  if (action === 'accept') {
    db.prepare("UPDATE reviews SET flagged = 1, flag_pending = 0 WHERE id = ?").run(req.params.id);
    return res.json({ message: 'Flag accepted — review hidden from public' });
  } else {
    db.prepare("UPDATE reviews SET flagged = 0, flag_pending = 0 WHERE id = ?").run(req.params.id);
    return res.json({ message: 'Flag rejected — review restored' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reviews/bulk-resolve-flags — Librarian bulk resolve
// Body: { review_ids: [], action: 'accept' | 'reject' }
// ---------------------------------------------------------------------------
router.post('/bulk-resolve-flags', authenticate, authorize('librarian'), (req, res) => {
  const db = getDb();
  const { review_ids, action } = req.body;

  if (!review_ids || !Array.isArray(review_ids) || review_ids.length === 0) {
    return res.status(400).json({ error: 'review_ids array is required' });
  }
  if (!action || !['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be "accept" or "reject"' });
  }

  let succeeded = 0;
  let failed = 0;

  const run = db.transaction(() => {
    for (const reviewId of review_ids) {
      const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND flag_pending = 1').get(reviewId);
      if (!review) {
        failed++;
        continue;
      }
      if (action === 'accept') {
        db.prepare("UPDATE reviews SET flagged = 1, flag_pending = 0 WHERE id = ?").run(reviewId);
      } else {
        db.prepare("UPDATE reviews SET flagged = 0, flag_pending = 0 WHERE id = ?").run(reviewId);
      }
      succeeded++;
    }
  });

  try {
    run();
    res.json({ message: `Bulk resolve completed. ${succeeded} succeeded, ${failed} failed.` });
  } catch (err) {
    console.error('Bulk resolve error:', err.message);
    res.status(500).json({ error: 'Bulk resolve failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reviews/:id/reply — Author replies to a review
// Author of the reviewed book only
// Creates review_reply and notifies the reviewer
// ---------------------------------------------------------------------------
router.post('/:id/reply', authenticate, (req, res) => {
  const db = getDb();
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Review not found' });
  }

  // Check the current user is the author of the reviewed book
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(review.book_id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  if (book.author_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the author of this book can reply to reviews' });
  }

  // Check for existing reply (one reply per review)
  const existingReply = db.prepare('SELECT id FROM review_replies WHERE review_id = ?').get(req.params.id);
  if (existingReply) {
    return res.status(400).json({ error: 'A reply already exists for this review' });
  }

  const replyId = uuidv4();

  try {
    db.prepare(
      `INSERT INTO review_replies (id, review_id, author_id, content)
       VALUES (?, ?, ?, ?)`
    ).run(replyId, req.params.id, req.user.id, content.trim());

    // Notify the reviewer
    const notifId = uuidv4();
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
       VALUES (?, ?, 'review_reply', ?, ?, 'normal', 'general', ?)`
    ).run(
      notifId,
      review.user_id,
      'Reply to Your Review',
      `The author replied to your review of "${book.title}".`,
      review.book_id
    );

    const reply = db.prepare('SELECT * FROM review_replies WHERE id = ?').get(replyId);
    res.status(201).json(reply);
  } catch (err) {
    console.error('Reply error:', err.message);
    res.status(500).json({ error: 'Failed to create reply' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reviews/:id/helpful — Increment helpful count (monotonic, no dedup)
// ---------------------------------------------------------------------------
router.post('/:id/helpful', authenticate, (req, res) => {
  const db = getDb();

  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Review not found' });
  }

  try {
    db.prepare(
      'UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?'
    ).run(req.params.id);

    const updated = db.prepare('SELECT helpful_count FROM reviews WHERE id = ?').get(req.params.id);
    res.json({ message: 'Marked as helpful', helpful_count: updated.helpful_count });
  } catch (err) {
    console.error('Helpful error:', err.message);
    res.status(500).json({ error: 'Failed to mark as helpful' });
  }
});

export default router;
