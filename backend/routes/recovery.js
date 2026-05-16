// BiblioVault crash recovery route — server-side mirror of client-side session state.
// Supports sendBeacon requests via authenticateWithFallback (accepts _token in body).
// Mounted at /api/recovery.

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database.js';
import { authenticateWithFallback } from '../middleware/auth.js';

const router = Router();

// All routes use authenticateWithFallback for sendBeacon support
router.use(authenticateWithFallback);

/**
 * POST /api/recovery/save
 * Saves or updates the crash-recovery state for the current user.
 * Body: { screen, portal, state_data, _token? }
 * Upserts into crash_recovery table (UNIQUE on user_id).
 * Returns 200 { message: 'State saved' }
 */
router.post('/save', (req, res) => {
  try {
    const { screen, portal, state_data } = req.body;

    if (!screen || !portal) {
      return res.status(400).json({ error: 'Screen and portal are required' });
    }

    const db = getDb();
    const userId = req.user.id;

    // Check if a recovery record already exists for this user
    const existing = db.prepare('SELECT id FROM crash_recovery WHERE user_id = ?').get(userId);

    // Store state_data as a JSON string; if it is already a string, use it directly.
    const stateDataStr = (typeof state_data === 'string') ? state_data : (state_data ? JSON.stringify(state_data) : null);

    if (existing) {
      db.prepare(
        'UPDATE crash_recovery SET screen = ?, portal = ?, state_data = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
      ).run(screen, portal, stateDataStr, userId);
    } else {
      db.prepare(
        'INSERT INTO crash_recovery (id, user_id, screen, portal, state_data) VALUES (?, ?, ?, ?, ?)'
      ).run(uuidv4(), userId, screen, portal, stateDataStr);
    }

    res.json({ message: 'State saved' });
  } catch (err) {
    console.error('Error saving recovery state:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /api/recovery/state
 * Returns the current crash-recovery state for the authenticated user.
 * Response: { has_recovery: bool, screen?, portal?, state_data?, updated_at? }
 */
router.get('/state', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT screen, portal, state_data, updated_at FROM crash_recovery WHERE user_id = ?'
    ).get(req.user.id);

    if (!row) {
      return res.json({ has_recovery: false });
    }

    res.json({
      has_recovery: true,
      screen: row.screen,
      portal: row.portal,
      state_data: row.state_data,
      updated_at: row.updated_at
    });
  } catch (err) {
    console.error('Error getting recovery state:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/recovery/clear
 * Deletes the crash-recovery row for the authenticated user.
 * Returns 200 { message: 'State cleared' }
 */
router.delete('/clear', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM crash_recovery WHERE user_id = ?').run(req.user.id);
    res.json({ message: 'State cleared' });
  } catch (err) {
    console.error('Error clearing recovery state:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
