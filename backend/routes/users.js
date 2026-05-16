// BiblioVault user management routes — profile CRUD, avatar upload,
// password change, and librarian-only user administration.
// Mounted at /api/users — all routes require authentication.

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getDb } from '../database.js';
import { authenticate, authorize, validatePassword } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// All user routes require a valid JWT
router.use(authenticate);

// ---------------------------------------------------------------------------
// Multer configuration for avatar upload
// ---------------------------------------------------------------------------
const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(AVATAR_DIR)) {
      fs.mkdirSync(AVATAR_DIR, { recursive: true });
    }
    cb(null, AVATAR_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  }
}).single('avatar');

// ---------------------------------------------------------------------------
// Profile endpoints (self)
// ---------------------------------------------------------------------------

/**
 * GET /api/users/profile
 * Returns the authenticated user's profile data (excluding password_hash).
 */
router.get('/profile', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, full_name, role, bio, employee_id, profile_picture, active, last_login, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Profile get error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/users/profile
 * Updates profile fields (full_name, bio, employee_id).
 * Requires current_password for re-authentication.
 * Name changes notify librarians.
 */
router.put('/profile', (req, res) => {
  try {
    const { full_name, bio, employee_id, current_password } = req.body;
    const db = getDb();

    // Require current password for re-authentication
    if (!current_password) {
      return res.status(400).json({ error: 'Current password is required to update profile' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const updates = {};
    if (full_name !== undefined && full_name.trim().length > 0) {
      updates.full_name = full_name.trim();
    }
    if (bio !== undefined && user.role === 'author') {
      updates.bio = bio;
    }
    if (employee_id !== undefined && user.role === 'librarian') {
      updates.employee_id = employee_id;
    }

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(user.id);
      db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);
    }

    // Notify librarians on name change
    if (updates.full_name) {
      const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian'").all();
      const notifInsert = db.prepare(
        'INSERT INTO notifications (id, user_id, type, title, message, priority, category) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const lib of librarians) {
        notifInsert.run(
          crypto.randomUUID(),
          lib.id,
          'user_update',
          'Profile Updated',
          `User ${user.username} updated their profile name.`,
          'normal',
          'users'
        );
      }
    }

    const updated = db.prepare(
      'SELECT id, username, full_name, role, bio, employee_id, profile_picture, active, last_login FROM users WHERE id = ?'
    ).get(user.id);

    res.json({ message: 'Profile updated', user: updated });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/users/password
 * Changes the user's password.
 * Body: { current_password, new_password }
 * Validates current password, then enforces strength rules on new password.
 */
router.put('/password', (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const db = getDb();

    if (!current_password) {
      return res.status(400).json({ errors: { current_password: 'Current password is required' } });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ errors: { current_password: 'Current password is incorrect' } });
    }

    const pwCheck = validatePassword(new_password || '');
    if (!pwCheck.valid) {
      return res.status(400).json({ errors: { new_password: pwCheck.message } });
    }

    const newHash = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

    res.json({ message: 'Password changed' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/users/profile-picture
 * Uploads a profile picture (avatar). Accepts JPEG/PNG, max 5 MB.
 * Multipart field name: 'avatar'
 * Saves to uploads/avatars/<uuid>.<ext> and stores relative path in DB.
 * Deletes the old avatar file from disk if it exists.
 */
router.post('/profile-picture', (req, res) => {
  uploadAvatar(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const db = getDb();
      const oldUser = db.prepare('SELECT profile_picture FROM users WHERE id = ?').get(req.user.id);

      // Delete old avatar file if it exists
      if (oldUser && oldUser.profile_picture) {
        const oldPath = path.join(__dirname, '..', oldUser.profile_picture);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const relativePath = `uploads/avatars/${req.file.filename}`;
      db.prepare('UPDATE users SET profile_picture = ? WHERE id = ?').run(relativePath, req.user.id);

      res.json({ profile_picture: relativePath });
    } catch (dbErr) {
      console.error('Profile picture DB error:', dbErr);
      res.status(500).json({ error: dbErr.message });
    }
  });
});

// ---------------------------------------------------------------------------
// Librarian-only user management routes
// ---------------------------------------------------------------------------

/**
 * GET /api/users
 * Lists all users with optional role/search/pagination filters.
 * Librarian only.
 */
router.get('/', authorize('librarian'), (req, res) => {
  try {
    const db = getDb();
    const { role: roleFilter, search, page = 1, limit = 50 } = req.query;

    let whereClauses = [];
    const params = [];

    if (roleFilter) {
      whereClauses.push('role = ?');
      params.push(roleFilter);
    }

    if (search) {
      whereClauses.push('(username LIKE ? OR full_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Total count for pagination
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM users ${whereSQL}`).get(...params);

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const users = db.prepare(
      `SELECT id, username, full_name, role, bio, employee_id, profile_picture, active, last_login, created_at FROM users ${whereSQL} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit, 10), offset);

    res.json({ users, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/users/:id
 * Returns a single user's details (with borrow count).
 * Librarian only.
 */
router.get('/:id', authorize('librarian'), (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, full_name, role, bio, employee_id, profile_picture, active, last_login, created_at FROM users WHERE id = ?'
    ).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { count: total_borrows } = db.prepare(
      'SELECT COUNT(*) as count FROM borrow_records WHERE user_id = ?'
    ).get(req.params.id);

    res.json({ ...user, total_borrows });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/users/:id
 * Edits a user's profile fields (full_name, role, bio, employee_id).
 * Librarian only.
 */
router.put('/:id', authorize('librarian'), (req, res) => {
  try {
    const { full_name, role, bio, employee_id } = req.body;
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = {};
    if (full_name !== undefined && full_name.trim().length > 0) {
      updates.full_name = full_name.trim();
    }
    if (role !== undefined) {
      if (!['student', 'staff', 'author', 'librarian'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.role = role;
    }
    if (bio !== undefined) {
      updates.bio = bio;
    }
    if (employee_id !== undefined) {
      updates.employee_id = employee_id;
    }

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(req.params.id);
      db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare(
      'SELECT id, username, full_name, role, bio, employee_id, profile_picture, active, last_login FROM users WHERE id = ?'
    ).get(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error('Edit user error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/users/:id/deactivate
 * Toggles the user's active status.
 * Cannot deactivate the calling librarian's own account.
 * Librarian only.
 */
router.patch('/:id/deactivate', authorize('librarian'), (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newActive = user.active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newActive, req.params.id);

    res.json({
      message: `User ${newActive === 1 ? 'activated' : 'deactivated'}`,
      active: newActive
    });
  } catch (err) {
    console.error('Toggle active error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/users
 * Librarian creates a new user in any role.
 * Body: { username, password, full_name, role, bio?, employee_id? }
 * Validates all fields the same way self-registration does.
 * Librarian only.
 */
router.post('/', authorize('librarian'), (req, res) => {
  try {
    const { username, password, full_name, role, bio, employee_id } = req.body;

    const errors = {};

    if (!username || typeof username !== 'string' || username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.username = 'Username must be at least 3 characters, letters, numbers, and underscores only';
    }
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
      errors.full_name = 'Full name is required';
    }
    if (!role || !['student', 'staff', 'author', 'librarian'].includes(role)) {
      errors.role = 'Invalid role. Must be one of: student, staff, author, librarian';
    }
    const pwCheck = validatePassword(password || '');
    if (!pwCheck.valid) {
      errors.password = pwCheck.message;
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const id = crypto.randomUUID();
    const password_hash = bcrypt.hashSync(password, 12);

    const insertFields = ['id', 'username', 'full_name', 'password_hash', 'role'];
    const insertValues = [id, username, full_name.trim(), password_hash, role];

    if (bio) { insertFields.push('bio'); insertValues.push(bio); }
    if (employee_id) { insertFields.push('employee_id'); insertValues.push(employee_id); }

    const placeholders = insertFields.map(() => '?').join(', ');
    db.prepare(`INSERT INTO users (${insertFields.join(', ')}) VALUES (${placeholders})`).run(...insertValues);

    res.status(201).json({
      message: 'User created successfully',
      user: { id, username, full_name: full_name.trim(), role, bio: bio || null, employee_id: employee_id || null }
    });
  } catch (err) {
    console.error('Create user error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/users/bulk-action
 * Performs bulk operations on user accounts: activate, deactivate, or change-role.
 * Body: { action: 'activate'|'deactivate'|'change-role', userIds: [...], role?: string }
 * Skips the calling user's own ID to prevent self-deactivation.
 * Librarian only.
 */
router.post('/bulk-action', authorize('librarian'), (req, res) => {
  try {
    const { action, userIds, role } = req.body;
    const db = getDb();

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }

    if (!['activate', 'deactivate', 'change-role'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be one of: activate, deactivate, change-role' });
    }

    if (action === 'change-role' && (!role || !['student', 'staff', 'author', 'librarian'].includes(role))) {
      return res.status(400).json({ error: 'Valid target role is required for change-role action' });
    }

    const process = db.transaction(() => {
      for (const userId of userIds) {
        if (userId === req.user.id) continue; // skip self

        if (action === 'activate') {
          db.prepare('UPDATE users SET active = 1 WHERE id = ?').run(userId);
        } else if (action === 'deactivate') {
          db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(userId);
        } else if (action === 'change-role') {
          db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
        }
      }
    });

    process();

    res.json({ message: `Bulk action '${action}' completed for ${userIds.length} user(s)` });
  } catch (err) {
    console.error('Bulk action error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
