// BiblioVault notifications route — in-app notification CRUD, announcement fan-out,
// and lazy invocation of processAutoReturns + generateDueReminders (DR-15).
// Mounted at /api/notifications. All endpoints require authentication.

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, processAutoReturns, generateDueReminders } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/notifications
 * Lists notifications for the authenticated user.
 * Query params: type, is_read, category, priority, search, is_archived, page, limit
 * Calls processAutoReturns() + generateDueReminders() first (DR-15).
 * Returns { notifications: [...], unread_count, total }
 */
router.get('/', (req, res) => {
  try {
    // Lazy job invocation (DR-15)
    processAutoReturns();
    generateDueReminders();

    const db = getDb();
    const userId = req.user.id;

    const {
      type, is_read, category, priority, search, is_archived,
      page = '1', limit = '50'
    } = req.query;

    const conditions = ['n.user_id = ?'];
    const params = [userId];

    if (type) {
      conditions.push('n.type = ?');
      params.push(type);
    }

    if (is_read !== undefined) {
      conditions.push('n.is_read = ?');
      params.push(is_read === '1' || is_read === 'true' ? 1 : 0);
    }

    if (category) {
      conditions.push('n.category = ?');
      params.push(category);
    }

    if (priority) {
      conditions.push('n.priority = ?');
      params.push(priority);
    }

    if (search) {
      conditions.push('(n.title LIKE ? OR n.message LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    if (is_archived === undefined || (is_archived !== '1' && is_archived !== 'true')) {
      conditions.push('n.is_archived = 0');
    } else {
      conditions.push('n.is_archived = 1');
    }

    const whereClause = conditions.join(' AND ');
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Get total count
    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM notifications n WHERE ${whereClause}`
    ).get(...params);
    const total = countRow.total;

    // Get notifications
    const notifications = db.prepare(
      `SELECT n.* FROM notifications n WHERE ${whereClause} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limitNum, offset);

    // Get unread count (unfiltered for the badge)
    const unreadRow = db.prepare(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0 AND is_archived = 0`
    ).get(userId);
    const unreadCount = unreadRow.count;

    res.json({ notifications, unread_count: unreadCount, total });
  } catch (err) {
    console.error('Error listing notifications:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Returns the unread notification count for the current user.
 * Response: { count: N }
 */
router.get('/unread-count', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0 AND is_archived = 0'
    ).get(req.user.id);
    res.json({ count: row.count });
  } catch (err) {
    console.error('Error getting unread count:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 */
router.patch('/:id/read', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Marks all notifications for the current user as read.
 */
router.patch('/read-all', (req, res) => {
  try {
    const db = getDb();
    db.prepare(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
    ).run(req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Error marking all as read:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * PATCH /api/notifications/:id/archive
 * Archives a single notification.
 */
router.patch('/:id/archive', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare(
      'UPDATE notifications SET is_archived = 1 WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification archived' });
  } catch (err) {
    console.error('Error archiving notification:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Deletes a single notification.
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/notifications/announcement
 * Librarian-only. Broadcasts an announcement to all users or a specific role.
 * Body: { title, message, target_role?, priority? }
 * Fan-out: inserts one row per target user.
 * Returns 201 on success.
 */
router.post('/announcement', authorize('librarian'), (req, res) => {
  try {
    const { title, message, target_role, priority = 'normal' } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const db = getDb();

    // Determine target users
    let users;
    if (target_role && ['student', 'staff', 'author', 'librarian'].includes(target_role)) {
      users = db.prepare('SELECT id FROM users WHERE role = ? AND active = 1').all(target_role);
    } else {
      // All active users, or all non-librarian if that's the design intent
      // Spec says: "all non-librarian if target_role not specified" but to stay safe,
      // we send to all active users. Let's check the spec again:
      // "fan-out: insert one row for target_role users (or all non-librarian if target_role not specified)"
      users = db.prepare("SELECT id FROM users WHERE role != 'librarian' AND active = 1").all();
    }

    if (users.length === 0) {
      return res.status(200).json({ message: 'No users match the target', count: 0 });
    }

    const insertNotif = db.prepare(
      'INSERT INTO notifications (id, user_id, type, title, message, priority, category) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const run = db.transaction(() => {
      for (const user of users) {
        insertNotif.run(
          uuidv4(),
          user.id,
          'announcement',
          title,
          message,
          priority,
          'announcement'
        );
      }
    });

    run();

    res.status(201).json({ message: 'Announcement sent', count: users.length });
  } catch (err) {
    console.error('Error sending announcement:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
