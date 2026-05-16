import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { classifySentiment } from '../services/llm.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

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
// GET /api/reviews/book/:bookId — list reviews for a book with aggregates
// =========================================================================
router.get('/book/:bookId', (req, res) => {
  try {
    const { bookId } = req.params;

    // Check book exists
    const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const { sort, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    // Get reviews (non-flagged only for public, flagged visible only to author/librarian)
    const orderClause = sort === 'helpful'
      ? 'r.helpful_count DESC, r.created_at DESC'
      : 'r.created_at DESC';

    const reviews = db.prepare(`
      SELECT r.id, r.user_id, r.book_id, r.rating, r.content, r.anonymous,
             r.helpful_count, r.sentiment, r.created_at, r.updated_at,
             u.username, u.full_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = ?
        AND (r.flagged = 0 OR r.flagged IS NULL)
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `).all(bookId, limitNum, offset);

    // Anonymize if needed
    const processedReviews = reviews.map(r => ({
      ...r,
      username: r.anonymous ? 'Anonymous' : r.username,
      full_name: r.anonymous ? 'Anonymous' : r.full_name
    }));

    // Aggregates
    const agg = db.prepare(`
      SELECT
        COUNT(*) AS count,
        COALESCE(AVG(rating), 0) AS avg_rating,
        COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0) AS r1,
        COALESCE(SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END), 0) AS r2,
        COALESCE(SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END), 0) AS r3,
        COALESCE(SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END), 0) AS r4,
        COALESCE(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END), 0) AS r5
      FROM reviews
      WHERE book_id = ? AND (flagged = 0 OR flagged IS NULL)
    `).get(bookId);

    const totalReviews = agg.count;

    return res.json({
      reviews: processedReviews,
      total: totalReviews,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(totalReviews / limitNum),
      aggregate: {
        avg_rating: Math.round(agg.avg_rating * 100) / 100,
        count: totalReviews,
        distribution: { 1: agg.r1, 2: agg.r2, 3: agg.r3, 4: agg.r4, 5: agg.r5 }
      }
    });
  } catch (err) {
    console.error('GET /api/reviews/book/:bookId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/reviews — submit a review
// DR-13: Must have a borrow record for this book (any status)
// UNIQUE(user_id, book_id) — upsert on duplicate (PATCH the existing)
// =========================================================================
router.post('/', (req, res) => {
  try {
    const { book_id, rating, content, anonymous } = req.body;

    // Validate rating
    if (!book_id) {
      return res.status(400).json({ error: 'book_id is required' });
    }
    const ratingNum = parseInt(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // DR-13: Check user has a borrow record for this book (any status)
    const borrow = db.prepare(
      'SELECT id FROM borrow_records WHERE user_id = ? AND book_id = ?'
    ).get(req.user.id, book_id);

    if (!borrow) {
      return res.status(403).json({ error: 'You can only review books you have borrowed' });
    }

    // Check if review already exists (UNIQUE constraint)
    const existing = db.prepare(
      'SELECT id, content, rating FROM reviews WHERE user_id = ? AND book_id = ?'
    ).get(req.user.id, book_id);

    let review;
    let isUpdate = false;

    if (existing) {
      // Upsert: update existing review
      isUpdate = true;
      db.prepare(`
        UPDATE reviews SET rating = ?, content = ?, anonymous = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(ratingNum, content || null, anonymous ? 1 : 0, existing.id);
      review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(existing.id);
    } else {
      // Insert new review
      const id = randomUUID();
      db.prepare(`
        INSERT INTO reviews (id, user_id, book_id, rating, content, anonymous)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, req.user.id, book_id, ratingNum, content || null, anonymous ? 1 : 0);
      review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    }

    // Run sentiment classification async (do not block response)
    if (content && content.trim().length > 0) {
      classifySentiment(content).then(sentiment => {
        if (sentiment) {
          db.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').run(sentiment, review.id);
        }
      }).catch(err => {
        console.error('Sentiment classification error:', err.message);
        // Fallback already handled in classifySentiment
      });
    }

    // Notify book author about the new review
    const book = db.prepare('SELECT author_id, title FROM books WHERE id = ?').get(book_id);
    if (book) {
      createNotification(book.author_id, 'new_review', 'New Review',
        `A new review has been posted for your book "${book.title}".`,
        'normal', 'general', review.id);
    }

    return res.status(isUpdate ? 200 : 201).json({ review });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'You have already reviewed this book' });
    }
    console.error('POST /api/reviews error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/reviews/:id/helpful — increment helpful_count
// =========================================================================
router.post('/:id/helpful', (req, res) => {
  try {
    const result = db.prepare(
      'UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?'
    ).run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const review = db.prepare('SELECT id, helpful_count FROM reviews WHERE id = ?').get(req.params.id);
    return res.json({ message: 'Marked as helpful', helpful_count: review.helpful_count });
  } catch (err) {
    console.error('POST /api/reviews/:id/helpful error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/reviews/:id/flag — author or librarian flag a review
// =========================================================================
router.post('/:id/flag', (req, res) => {
  try {
    const review = db.prepare(`
      SELECT r.*, b.author_id AS book_author_id
      FROM reviews r
      JOIN books b ON r.book_id = b.id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Only author of the book or librarian can flag
    const isBookAuthor = review.book_author_id === req.user.id;
    const isLibrarian = req.user.role === 'librarian';

    if (!isBookAuthor && !isLibrarian) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }

    // Set flag_pending = 1
    db.prepare('UPDATE reviews SET flag_pending = 1 WHERE id = ?').run(req.params.id);

    // Notify librarians
    const librarians = db.prepare('SELECT id FROM users WHERE role = ?').all('librarian');
    for (const lib of librarians) {
      createNotification(lib.id, 'review_flag', 'Review Flagged',
        `A review has been flagged for moderation.`, 'high', 'general', req.params.id);
    }

    return res.json({ message: 'Review flagged for moderation' });
  } catch (err) {
    console.error('POST /api/reviews/:id/flag error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/reviews/flagged — librarian only; flagged reviews list
// =========================================================================
router.get('/flagged', authorize('librarian'), (req, res) => {
  try {
    const reviews = db.prepare(`
      SELECT r.id, r.user_id, r.book_id, r.rating, r.content, r.anonymous,
             r.helpful_count, r.flagged, r.flag_pending, r.sentiment, r.created_at,
             u.username AS reviewer_username,
             b.title AS book_title, b.author_name AS book_author
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN books b ON r.book_id = b.id
      WHERE r.flag_pending = 1 OR r.flagged = 1
      ORDER BY r.updated_at DESC
    `).all();

    return res.json(reviews);
  } catch (err) {
    console.error('GET /api/reviews/flagged error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/reviews/:id/resolve-flag — librarian only
// accept: flagged=1, flag_pending=0 (hidden)
// reject: flag_pending=0, flagged=0 (restored)
// =========================================================================
router.post('/:id/resolve-flag', authorize('librarian'), (req, res) => {
  try {
    const { action } = req.body;

    if (!action || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "accept" or "reject"' });
    }

    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (action === 'accept') {
      db.prepare("UPDATE reviews SET flagged = 1, flag_pending = 0 WHERE id = ?").run(req.params.id);
    } else {
      db.prepare("UPDATE reviews SET flag_pending = 0, flagged = 0 WHERE id = ?").run(req.params.id);
    }

    const updated = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    return res.json({ message: `Flag ${action === 'accept' ? 'accepted' : 'rejected'}`, review: updated });
  } catch (err) {
    console.error('POST /api/reviews/:id/resolve-flag error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/reviews/bulk-resolve-flags — librarian only
// =========================================================================
router.post('/bulk-resolve-flags', authorize('librarian'), (req, res) => {
  try {
    const { review_ids, action } = req.body;

    if (!review_ids || !Array.isArray(review_ids) || review_ids.length === 0) {
      return res.status(400).json({ error: 'review_ids array is required' });
    }
    if (!action || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "accept" or "reject"' });
    }

    const placeholders = review_ids.map(() => '?').join(',');

    if (action === 'accept') {
      db.prepare(`
        UPDATE reviews SET flagged = 1, flag_pending = 0
        WHERE id IN (${placeholders}) AND flag_pending = 1
      `).run(...review_ids);
    } else {
      db.prepare(`
        UPDATE reviews SET flag_pending = 0, flagged = 0
        WHERE id IN (${placeholders}) AND flag_pending = 1
      `).run(...review_ids);
    }

    return res.json({ message: `${review_ids.length} review(s) resolved` });
  } catch (err) {
    console.error('POST /api/reviews/bulk-resolve-flags error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/reviews/:id/reply — author only (must be author of the book)
// =========================================================================
router.post('/:id/reply', (req, res) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Get review with book info
    const review = db.prepare(`
      SELECT r.*, b.author_id AS book_author_id, b.title AS book_title, r.user_id AS reviewer_id
      FROM reviews r
      JOIN books b ON r.book_id = b.id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Only the author of the book can reply
    if (review.book_author_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the book author can reply to reviews' });
    }

    const replyId = randomUUID();
    db.prepare(`
      INSERT INTO review_replies (id, review_id, author_id, content)
      VALUES (?, ?, ?, ?)
    `).run(replyId, req.params.id, req.user.id, content.trim());

    const reply = db.prepare('SELECT * FROM review_replies WHERE id = ?').get(replyId);

    // Notify the reviewer
    createNotification(review.reviewer_id, 'review_reply', 'Review Reply',
      `The author replied to your review of "${review.book_title}".`,
      'normal', 'general', req.params.id);

    return res.status(201).json({ reply });
  } catch (err) {
    console.error('POST /api/reviews/:id/reply error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/reviews/book/:bookId/with-replies — reviews + author replies
// =========================================================================
router.get('/book/:bookId/with-replies', (req, res) => {
  try {
    const { bookId } = req.params;

    const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Get reviews with replies
    const reviews = db.prepare(`
      SELECT r.id, r.user_id, r.book_id, r.rating, r.content, r.anonymous,
             r.helpful_count, r.sentiment, r.created_at,
             u.username, u.full_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = ? AND (r.flagged = 0 OR r.flagged IS NULL)
      ORDER BY r.created_at DESC
    `).all(bookId);

    // For each review, get replies
    const result = reviews.map(r => {
      const replies = db.prepare(`
        SELECT rr.id, rr.review_id, rr.author_id, rr.content, rr.created_at,
               u.username, u.full_name
        FROM review_replies rr
        JOIN users u ON rr.author_id = u.id
        WHERE rr.review_id = ?
        ORDER BY rr.created_at ASC
      `).all(r.id);

      return {
        ...r,
        username: r.anonymous ? 'Anonymous' : r.username,
        full_name: r.anonymous ? 'Anonymous' : r.full_name,
        replies
      };
    });

    // Aggregates
    const agg = db.prepare(`
      SELECT
        COUNT(*) AS count,
        COALESCE(AVG(rating), 0) AS avg_rating,
        COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0) AS r1,
        COALESCE(SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END), 0) AS r2,
        COALESCE(SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END), 0) AS r3,
        COALESCE(SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END), 0) AS r4,
        COALESCE(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END), 0) AS r5
      FROM reviews
      WHERE book_id = ? AND (flagged = 0 OR flagged IS NULL)
    `).get(bookId);

    return res.json({
      reviews: result,
      aggregate: {
        avg_rating: Math.round(agg.avg_rating * 100) / 100,
        count: agg.count,
        distribution: { 1: agg.r1, 2: agg.r2, 3: agg.r3, 4: agg.r4, 5: agg.r5 }
      }
    });
  } catch (err) {
    console.error('GET /api/reviews/book/:bookId/with-replies error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
