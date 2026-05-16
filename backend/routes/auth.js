import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import db from '../database.js';
import { generateToken, validatePassword } from '../middleware/auth.js';

const router = Router();

// =========================================================================
// POST /api/auth/register
// =========================================================================
router.post('/register', (req, res) => {
  try {
    const { username, password, full_name, role, bio, employee_id } = req.body;

    // -- Validate username
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username must contain only letters, numbers, and underscores' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }

    // -- Validate role
    const validRoles = ['student', 'staff', 'author', 'librarian'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role must be one of: student, staff, author, librarian' });
    }

    // -- Validate full_name
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    // -- Validate password
    const pwResult = validatePassword(password);
    if (!pwResult.valid) {
      return res.status(400).json({ error: pwResult.message });
    }

    // -- Check duplicate username
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // -- Hash password with bcrypt cost 12
    const password_hash = bcrypt.hashSync(password, 12);

    // -- Insert user
    const id = randomUUID();
    db.prepare(`
      INSERT INTO users (id, username, full_name, password_hash, role, bio, employee_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, full_name.trim(), password_hash, role, bio || null, employee_id || null);

    // -- Notify all librarians (P1-T1-REG-006)
    const librarians = db.prepare('SELECT id FROM users WHERE role = ?').all('librarian');
    const insertNotif = db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, priority, category, related_id)
      VALUES (?, ?, 'user_update', 'New User Registered', ?, 'normal', 'users', ?)
    `);
    for (const lib of librarians) {
      insertNotif.run(randomUUID(), lib.id, `New user registered: ${username} (${role})`, id);
    }

    // -- Generate JWT and respond
    const token = generateToken({ id, username, full_name: full_name.trim(), role });

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id, username, role, full_name: full_name.trim() }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// POST /api/auth/login
// =========================================================================
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // -- Lookup user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // -- Check account active status
    if (user.active === 0) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    // -- Verify password
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // -- Stamp last_login
    db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    // -- Generate JWT
    const token = generateToken(user);

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        avatar_url: user.profile_picture || null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
