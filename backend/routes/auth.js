// BiblioVault auth routes — register and login endpoints
// Mounted at /api/auth
// Handles all four roles: student, staff, author, librarian

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb } from '../database.js';
import { generateToken, validatePassword } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/register
 * Creates a new user account with role-based optional fields.
 * Body: { username, password, full_name, role, bio?, employee_id? }
 * Returns 201 with JWT token and user object on success.
 * Returns 400 on validation errors or duplicate username.
 */
router.post('/register', (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;

    // --- Server-side validation ---
    const errors = {};

    if (!username || typeof username !== 'string') {
      errors.username = 'Username is required';
    } else if (username.length < 3) {
      errors.username = 'Username must be at least 3 characters long';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.username = 'Username can only contain letters, numbers, and underscores';
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

    // Check for duplicate username
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password with bcrypt cost factor 12
    const id = crypto.randomUUID();
    const password_hash = bcrypt.hashSync(password, 12);

    // Build dynamic insert for optional fields
    const insertFields = ['id', 'username', 'full_name', 'password_hash', 'role'];
    const insertValues = [id, username, full_name.trim(), password_hash, role];

    if (role === 'author' && req.body.bio) {
      insertFields.push('bio');
      insertValues.push(req.body.bio);
    }
    if (role === 'librarian' && req.body.employee_id) {
      insertFields.push('employee_id');
      insertValues.push(req.body.employee_id);
    }

    const placeholders = insertFields.map(() => '?').join(', ');
    db.prepare(`INSERT INTO users (${insertFields.join(', ')}) VALUES (${placeholders})`).run(...insertValues);

    // Notify all librarians about the new user registration
    const librarians = db.prepare("SELECT id FROM users WHERE role = 'librarian'").all();
    const notifInsert = db.prepare(
      'INSERT INTO notifications (id, user_id, type, title, message, priority, category) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (const lib of librarians) {
      notifInsert.run(
        crypto.randomUUID(),
        lib.id,
        'user_update',
        'New User Registered',
        `New user registered: ${username} (${role})`,
        'normal',
        'users'
      );
    }

    // Generate JWT and respond
    const token = generateToken({ id, username, role, full_name: full_name.trim() });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id, username, role, full_name: full_name.trim() }
    });
  } catch (err) {
    console.error('Register error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user by username and password.
 * Body: { username, password }
 * Returns 200 with JWT token and user object on success.
 * Returns 401 for invalid credentials.
 * Returns 403 for deactivated accounts.
 */
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Deactivated accounts cannot log in
    if (user.active === 0) {
      return res.status(403).json({ error: 'Account deactivated. Contact librarian.' });
    }

    // Verify password
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Stamp last_login timestamp
    db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    // Generate JWT
    const token = generateToken({ id: user.id, username: user.username, role: user.role, full_name: user.full_name });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        bio: user.bio,
        employee_id: user.employee_id,
        profile_picture: user.profile_picture,
        active: user.active,
        last_login: user.last_login
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
