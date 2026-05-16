import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../database.js';
import { authenticate, authorize, validatePassword } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// All routes in this file require authentication
router.use(authenticate);

// =========================================================================
// Avatar upload configuration
// =========================================================================
const AVATARS_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images are allowed'));
    }
  }
});

// =========================================================================
// Helpers
// =========================================================================

/** Map a raw users row to the profile response shape. */
function toProfile(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    avatar_url: user.profile_picture || null,
    bio: user.bio || null,
    employee_id: user.employee_id || null,
    created_at: user.created_at,
    last_login: user.last_login || null
  };
}

// =========================================================================
// GET /api/users/profile
// =========================================================================
router.get('/profile', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json(toProfile(user));
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// PUT /api/users/profile
// =========================================================================
router.put('/profile', (req, res) => {
  try {
    const { full_name, bio, employee_id } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = [];
    const params = [];

    if (full_name !== undefined) {
      if (typeof full_name !== 'string' || full_name.trim().length === 0) {
        return res.status(400).json({ error: 'Full name cannot be empty' });
      }
      updates.push('full_name = ?');
      params.push(full_name.trim());
    }

    if (bio !== undefined) {
      updates.push('bio = ?');
      params.push(bio || null);
    }

    if (employee_id !== undefined) {
      updates.push('employee_id = ?');
      params.push(employee_id || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Notify librarians of name change (P2-T4-PROF-004)
    if (full_name !== undefined && full_name.trim() !== user.full_name) {
      const librarians = db.prepare('SELECT id FROM users WHERE role = ?').all('librarian');
      const insertNotif = db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
        VALUES (?, ?, 'user_update', 'User Name Changed', ?, 'normal', 'users', ?)
      `);
      for (const lib of librarians) {
        insertNotif.run(
          randomUUID(),
          lib.id,
          `User "${user.username}" changed name from "${user.full_name}" to "${full_name.trim()}"`,
          user.id
        );
      }
    }

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return res.status(200).json({ message: 'Profile updated successfully', user: toProfile(updated) });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/users/change-password
// =========================================================================
router.post('/change-password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Validate new password strength
    const pwResult = validatePassword(newPassword);
    if (!pwResult.valid) {
      return res.status(400).json({ error: pwResult.message });
    }

    // Hash and update
    const newHash = bcrypt.hashSync(newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/users/avatar — upload profile picture
// =========================================================================
router.post('/avatar', (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const avatarUrl = `uploads/avatars/${req.file.filename}`;

      // Delete old avatar if exists
      const user = db.prepare('SELECT profile_picture FROM users WHERE id = ?').get(req.user.id);
      if (user && user.profile_picture) {
        const oldPath = path.join(__dirname, '..', user.profile_picture);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Update database
      db.prepare('UPDATE users SET profile_picture = ? WHERE id = ?').run(avatarUrl, req.user.id);

      return res.status(200).json({ avatar_url: avatarUrl });
    } catch (dbErr) {
      console.error('Avatar upload DB error:', dbErr);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// =========================================================================
// LIBRARIAN-ONLY ROUTES
// =========================================================================

// -------------------------------------------------------------------------
// GET /api/users — list all users with pagination and filters
// -------------------------------------------------------------------------
router.get('/', authorize('librarian'), (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { role, search } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (role) {
      where += ' AND role = ?';
      params.push(role);
    }

    if (search) {
      where += ' AND (username LIKE ? OR full_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM users ${where}`).get(...params);
    const total = countRow.total;

    const users = db.prepare(`
      SELECT id, username, full_name, role, bio, employee_id,
             profile_picture, active, created_at, last_login
      FROM users ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return res.status(200).json({ users, total, page, limit });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// -------------------------------------------------------------------------
// GET /api/users/:id — single user detail
// -------------------------------------------------------------------------
router.get('/:id', authorize('librarian'), (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, full_name, role, bio, employee_id,
             profile_picture, active, created_at, last_login
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json(user);
  } catch (err) {
    console.error('Get user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// -------------------------------------------------------------------------
// PUT /api/users/:id/toggle-active — flip active status
// -------------------------------------------------------------------------
router.put('/:id/toggle-active', authorize('librarian'), (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot deactivate self
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    const newActive = user.active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newActive, user.id);

    return res.status(200).json({
      message: `User ${newActive ? 'activated' : 'deactivated'} successfully`,
      is_active: newActive
    });
  } catch (err) {
    console.error('Toggle active error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// -------------------------------------------------------------------------
// POST /api/users/bulk-action — bulk activate/deactivate users
// -------------------------------------------------------------------------
router.post('/bulk-action', authorize('librarian'), (req, res) => {
  try {
    const { action, userIds } = req.body;

    if (!action || !['activate', 'deactivate'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "activate" or "deactivate"' });
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }

    // Cannot deactivate self
    if (action === 'deactivate' && userIds.includes(req.user.id)) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    const newActive = action === 'activate' ? 1 : 0;
    const updateStmt = db.prepare('UPDATE users SET active = ? WHERE id = ?');

    const tx = db.transaction(() => {
      for (const id of userIds) {
        updateStmt.run(newActive, id);
      }
    });
    tx();

    return res.status(200).json({ message: `${userIds.length} user(s) ${action}d successfully` });
  } catch (err) {
    console.error('Bulk action error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// -------------------------------------------------------------------------
// DELETE /api/users/:id — hard delete user (only if no active borrows)
// -------------------------------------------------------------------------
router.delete('/:id', authorize('librarian'), (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot delete self
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Check for active borrows
    const activeBorrows = db.prepare(
      "SELECT COUNT(*) as count FROM borrow_records WHERE user_id = ? AND status = 'active'"
    ).get(user.id);
    if (activeBorrows.count > 0) {
      return res.status(400).json({ error: 'Cannot delete user with active borrows' });
    }

    // Delete avatar file if exists
    if (user.profile_picture) {
      const avatarPath = path.join(__dirname, '..', user.profile_picture);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }

    // Cascade delete related records inside a transaction
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM crash_recovery WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM bookmarks WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM highlights WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM reading_progress WHERE user_id = ?').run(user.id);

      // Delete user's reviews and their replies
      const reviewIds = db.prepare('SELECT id FROM reviews WHERE user_id = ?').all(user.id);
      for (const r of reviewIds) {
        db.prepare('DELETE FROM review_replies WHERE review_id = ?').run(r.id);
      }
      db.prepare('DELETE FROM reviews WHERE user_id = ?').run(user.id);

      db.prepare('DELETE FROM book_requests WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM borrow_records WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM user_activity WHERE user_id = ?').run(user.id);

      // Delete user's book versions (changed_by)
      db.prepare('DELETE FROM book_versions WHERE changed_by = ?').run(user.id);

      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    });
    tx();

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
