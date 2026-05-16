import { Router } from 'express';
import { randomUUID } from 'crypto';
import db, { processAutoReturns, generateDueReminders } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =========================================================================
// GET /api/notifications — list notifications for current user
// DR-15: calls processAutoReturns() + generateDueReminders() first
// =========================================================================
router.get('/', (req, res) => {
  try {
    processAutoReturns();
    generateDueReminders();

    const { type, category, priority, search, is_archived, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = ['n.user_id = ?'];
    const params = [req.user.id];

    if (type) {
      whereClauses.push('n.type = ?');
      params.push(type);
    }
    if (category) {
      whereClauses.push('n.category = ?');
      params.push(category);
    }
    if (priority) {
      whereClauses.push('n.priority = ?');
      params.push(priority);
    }
    if (search) {
      whereClauses.push('(n.title LIKE ? OR n.message LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }
    if (is_archived === 'true' || is_archived === '1') {
      whereClauses.push('n.is_archived = 1');
    } else if (is_archived === 'false' || is_archived === '0' || !is_archived) {
      whereClauses.push('n.is_archived = 0');
    }

    const whereSQL = whereClauses.join(' AND ');

    const countRow = db.prepare(
      `SELECT COUNT(*) AS total FROM notifications n WHERE ${whereSQL}`
    ).get(...params);
    const total = countRow.total;

    const notifications = db.prepare(`
      SELECT n.id, n.user_id, n.type, n.title, n.message, n.priority,
             n.category, n.is_read, n.is_archived, n.related_id, n.created_at
      FROM notifications n
      WHERE ${whereSQL}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    return res.json({
      notifications,
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// GET /api/notifications/unread-count
// =========================================================================
router.get('/unread-count', (req, res) => {
  try {
    const { count } = db.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0 AND is_archived = 0"
    ).get(req.user.id);
    return res.json({ count });
  } catch (err) {
    console.error('GET /api/notifications/unread-count error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// PATCH /api/notifications/read-all — mark all as read
// =========================================================================
router.patch('/read-all', (req, res) => {
  try {
    db.prepare(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0"
    ).run(req.user.id);
    return res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('PATCH /api/notifications/read-all error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// PATCH /api/notifications/:id/read — mark one as read
// =========================================================================
router.patch('/:id/read', (req, res) => {
  try {
    const result = db.prepare(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('PATCH /api/notifications/:id/read error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// PATCH /api/notifications/:id/archive — archive one
// =========================================================================
router.patch('/:id/archive', (req, res) => {
  try {
    const result = db.prepare(
      "UPDATE notifications SET is_archived = 1 WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ message: 'Notification archived' });
  } catch (err) {
    console.error('PATCH /api/notifications/:id/archive error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// DELETE /api/notifications/:id — delete one
// =========================================================================
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare(
      "DELETE FROM notifications WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('DELETE /api/notifications/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/notifications/announcement — librarian only
// Fan-out: insert one row per targeted user
// =========================================================================
router.post('/announcement', authorize('librarian'), (req, res) => {
  try {
    const { title, message, target_role, priority } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build target user list
    let targetUsers;
    if (target_role) {
      targetUsers = db.prepare('SELECT id FROM users WHERE role = ? AND active = 1').all(target_role);
    } else {
      targetUsers = db.prepare('SELECT id FROM users WHERE active = 1').all();
    }

    if (targetUsers.length === 0) {
      return res.status(400).json({ error: 'No active users found for the target role' });
    }

    const insertNotif = db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, priority, category)
      VALUES (?, ?, 'announcement', ?, ?, ?, 'announcement')
    `);

    const tx = db.transaction(() => {
      for (const user of targetUsers) {
        insertNotif.run(
          randomUUID(),
          user.id,
          title.trim(),
          message.trim(),
          priority || 'normal'
        );
      }
    });
    tx();

    return res.json({
      message: 'Announcement sent',
      recipient_count: targetUsers.length
    });
  } catch (err) {
    console.error('POST /api/notifications/announcement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
