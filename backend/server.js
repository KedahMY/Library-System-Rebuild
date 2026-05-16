import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Router } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Static uploads
const uploadsDir = path.join(__dirname, 'uploads');
['books', 'covers', 'avatars'].forEach(d => {
  const p = path.join(uploadsDir, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});
app.use('/uploads', express.static(uploadsDir));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Crash-test endpoint (DR-11) — no auth required
app.post('/api/shutdown', (req, res) => {
  res.json({ message: 'Server shutting down...' });
  setTimeout(() => process.exit(0), 100);
});

// =========================================================================
// Helper: tryImportRouter — gracefully handles missing route files
// Returns the router's default export, or an empty Router() if not found.
// =========================================================================
async function tryImportRouter(routeFile) {
  const fullPath = path.join(__dirname, 'routes', routeFile);
  if (!fs.existsSync(fullPath)) {
    console.warn(`Route file not found: routes/${routeFile} — mounting empty router`);
    return Router();
  }
  try {
    const mod = await import(`./routes/${routeFile}`);
    return mod.default || Router();
  } catch (err) {
    console.error(`Error loading routes/${routeFile}:`, err.message);
    return Router();
  }
}

// =========================================================================
// Initialize database, dynamically load all 11 route files, mount, start
// =========================================================================
(async () => {
  try {
    const { initializeDatabase } = await import('./database.js');
    initializeDatabase();
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    console.log('Starting server without database initialization.');
  }

  // ================================================================
  // Load all 11 routers dynamically (route files may be added later)
  // ================================================================
  const ROUTE_FILES = [
    'auth.js',
    'books.js',
    'users.js',
    'notifications.js',
    'recovery.js',
    'reviews.js',
    'requests.js',
    'history.js',
    'stats.js',
    'librarian.js',
    'llm.js'
  ];

  const MOUNT_PATHS = [
    '/api/auth',
    '/api/books',
    '/api/users',
    '/api/notifications',
    '/api/recovery',
    '/api/reviews',
    '/api/requests',
    '/api/history',
    '/api/stats',
    '/api/librarian',
    '/api/llm'
  ];

  const loadedRouters = await Promise.all(
    ROUTE_FILES.map(file => tryImportRouter(file))
  );

  for (let i = 0; i < MOUNT_PATHS.length; i++) {
    app.use(MOUNT_PATHS[i], loadedRouters[i]);
  }

  console.log(`Mounted ${MOUNT_PATHS.length} router(s)`);

  // ================================================================
  // Error handlers (must be AFTER route mounts)
  // ================================================================

  // Multer LIMIT_FILE_SIZE error handler (before generic error handler)
  app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    next(err);
  });

  // Generic error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });

  // 404 handler (must be last)
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ================================================================
  // Start server
  // ================================================================
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})();
