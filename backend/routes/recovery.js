import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import db from '../database.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'library-system-secret-key-2024';

// =========================================================================
// authenticateWithFallback — tries Authorization header first,
// then falls back to req.body._token (for sendBeacon support).
// Sets req.user on success, returns 401 on failure.
// =========================================================================
function authenticateWithFallback(req, res, next) {
  let token;

  // Try Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Fall back to body _token
  if (!token && req.body && req.body._token) {
    token = req.body._token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      full_name: decoded.full_name
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// =========================================================================
// POST /api/recovery/save — upsert crash_recovery record
// Accepts _token in body for sendBeacon requests
// =========================================================================
router.post('/save', (req, res) => {
  authenticateWithFallback(req, res, () => {
    try {
      const { screen, portal, state_data } = req.body;

      if (!screen || !portal) {
        return res.status(400).json({ error: 'screen and portal are required' });
      }

      // state_data can be an object or string; store as JSON string
      const stateDataStr = state_data
        ? (typeof state_data === 'string' ? state_data : JSON.stringify(state_data))
        : null;

      const existing = db.prepare(
        'SELECT id FROM crash_recovery WHERE user_id = ?'
      ).get(req.user.id);

      if (existing) {
        db.prepare(`
          UPDATE crash_recovery
          SET screen = ?, portal = ?, state_data = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(screen, portal, stateDataStr, req.user.id);
      } else {
        db.prepare(`
          INSERT INTO crash_recovery (id, user_id, screen, portal, state_data)
          VALUES (?, ?, ?, ?, ?)
        `).run(randomUUID(), req.user.id, screen, portal, stateDataStr);
      }

      return res.json({ message: 'Recovery state saved' });
    } catch (err) {
      console.error('POST /api/recovery/save error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// =========================================================================
// GET /api/recovery/state — get recovery state
// =========================================================================
router.get('/state', (req, res) => {
  authenticateWithFallback(req, res, () => {
    try {
      const record = db.prepare(
        'SELECT screen, portal, state_data, updated_at FROM crash_recovery WHERE user_id = ?'
      ).get(req.user.id);

      if (!record) {
        return res.json({ has_recovery: false });
      }

      let stateData = null;
      if (record.state_data) {
        try {
          stateData = JSON.parse(record.state_data);
        } catch {
          stateData = record.state_data;
        }
      }

      return res.json({
        has_recovery: true,
        screen: record.screen,
        portal: record.portal,
        state_data: stateData,
        updated_at: record.updated_at
      });
    } catch (err) {
      console.error('GET /api/recovery/state error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// =========================================================================
// DELETE /api/recovery/clear — delete crash_recovery record
// =========================================================================
router.delete('/clear', (req, res) => {
  authenticateWithFallback(req, res, () => {
    try {
      db.prepare('DELETE FROM crash_recovery WHERE user_id = ?').run(req.user.id);
      return res.json({ message: 'Recovery state cleared' });
    } catch (err) {
      console.error('DELETE /api/recovery/clear error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

export default router;
