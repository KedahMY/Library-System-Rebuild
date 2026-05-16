// BiblioVault LLM router — AI-powered book summary generation.
// Requires authenticate + authorize('author','librarian').
// Mount path: /api/llm

import { Router } from 'express';
import { getDb } from '../database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { generateBookSummary } from '../services/llm.js';
import { extractText } from '../services/pdfExtract.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/llm/summary — Generate an AI book summary
// Body: { title, author, genre, style? ('short'|'medium'|'detailed'), book_id? }
// If book_id provided, tries to extract text from the book file for context.
// On DASHSCOPE_API_KEY missing: 500 with clear message (not a crash)
// On other API errors: 500 with error message
// ---------------------------------------------------------------------------
router.post('/summary', authenticate, authorize('author', 'librarian'), async (req, res) => {
  const { title, author, genre, style, book_id } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!genre || !genre.trim()) {
    return res.status(400).json({ error: 'Genre is required' });
  }

  const validStyles = ['short', 'medium', 'detailed'];
  const summaryStyle = style && validStyles.includes(style) ? style : 'medium';

  let description = '';

  // If book_id provided, try to extract text from the book file
  if (book_id) {
    try {
      const db = getDb();
      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(book_id);
      if (book && book.file_path) {
        const extracted = extractText(book.file_path);
        if (extracted) {
          description = extracted;
        }
      }
    } catch (err) {
      console.error(`Failed to extract text for book ${book_id}:`, err.message);
      // Non-critical — fall back to title/genre only
    }
  }

  try {
    const summary = await generateBookSummary(
      title.trim(),
      genre.trim(),
      description,
      summaryStyle
    );

    res.json({ summary });
  } catch (err) {
    console.error('LLM summary error:', err.message);

    // Check if it's the "no API key" case
    if (err.message.includes('DASHSCOPE_API_KEY')) {
      return res.status(500).json({
        error: 'DASHSCOPE_API_KEY is not set. Please configure it in backend/.env.',
      });
    }

    res.status(500).json({ error: err.message || 'Failed to generate summary' });
  }
});

export default router;
