// BiblioVault backend — Express server entry point
// Mounts middleware, static file serving, health/shutdown endpoints,
// and all 11 router files. Routers that do not yet exist are loaded
// via dynamic import so the server boots without them.

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Database initialization (wrapped in try/catch — database.js created by SA-2)
try {
  const { initializeDatabase } = await import('./database.js');
  initializeDatabase();
} catch (err) {
  console.warn('Database not yet initialized (database.js will be created by SA-2):', err.message);
}

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === ROUTER MOUNTS ===
// Helper: dynamically import a route file and mount it.
// If the file does not exist, logs a warning and skips.
async function mountRoute(pathPattern, mountPath) {
  try {
    const { default: router } = await import(pathPattern);
    app.use(mountPath, router);
    console.log(`Mounted ${mountPath}`);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      console.warn(`Route ${pathPattern} not found — ${mountPath} will be mounted by a later subagent.`);
    } else {
      console.error(`Error mounting ${mountPath}:`, err.message);
    }
  }
}

// Mount all 11 routers
await mountRoute('./routes/auth.js', '/api/auth');
await mountRoute('./routes/users.js', '/api/users');
await mountRoute('./routes/books.js', '/api/books');
await mountRoute('./routes/notifications.js', '/api/notifications');
await mountRoute('./routes/recovery.js', '/api/recovery');
await mountRoute('./routes/reviews.js', '/api/reviews');
await mountRoute('./routes/requests.js', '/api/requests');
await mountRoute('./routes/history.js', '/api/history');
await mountRoute('./routes/stats.js', '/api/stats');
await mountRoute('./routes/librarian.js', '/api/librarian');
await mountRoute('./routes/llm.js', '/api/llm');

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Shutdown endpoint (crash-test) — no auth required
app.post('/api/shutdown', (req, res) => {
  res.json({ message: 'Server shutting down...' });
  setTimeout(() => process.exit(0), 100);
});

// Multer file-size error handler (LIMIT_FILE_SIZE)
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: `Unexpected file field: ${err.field}` });
  }
  next(err);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Generic 500 error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`BiblioVault backend running on port ${PORT}`);
});
