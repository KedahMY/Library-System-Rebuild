import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { generateBookSummary } from '../services/llm.js';
import { extractText } from '../services/pdfExtract.js';
import db from '../database.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =========================================================================
// POST /api/llm/summary — author or librarian only
// Generate AI book summary via DashScope
// =========================================================================
router.post('/summary', authorize('author', 'librarian'), async (req, res) => {
  try {
    const { title, genre, style, book_id } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!genre || typeof genre !== 'string' || genre.trim().length === 0) {
      return res.status(400).json({ error: 'Genre is required' });
    }

    const validStyles = ['short', 'medium', 'detailed'];
    const summaryStyle = style && validStyles.includes(style) ? style : 'medium';

    let description = '';

    // If book_id is provided, try to extract text from the book file
    if (book_id) {
      const book = db.prepare('SELECT title, description, file_path, genre FROM books WHERE id = ?').get(book_id);

      if (book) {
        description = book.description || '';

        // Try to extract text from the book file for additional context
        if (book.file_path) {
          const extracted = extractText(book.file_path);
          if (extracted) {
            description += '\n\nExcerpt from book content:\n' + extracted;
          }
        }

        // Use the book's actual title if none provided
        const effectiveTitle = title || book.title;
        const effectiveGenre = genre || book.genre;

        try {
          const summary = await generateBookSummary(effectiveTitle, effectiveGenre, description, summaryStyle);
          return res.json({ summary });
        } catch (llmErr) {
          // Check for missing API key specifically
          if (llmErr.message && llmErr.message.includes('DASHSCOPE_API_KEY not configured')) {
            return res.status(500).json({
              error: 'DASHSCOPE_API_KEY not configured. Please set the DASHSCOPE_API_KEY environment variable to use AI summary generation.'
            });
          }
          throw llmErr;
        }
      } else {
        // Book not found, but still try to generate a summary from the provided info
        try {
          const summary = await generateBookSummary(title, genre, description || `A book in the ${genre} genre.`, summaryStyle);
          return res.json({ summary });
        } catch (llmErr) {
          if (llmErr.message && llmErr.message.includes('DASHSCOPE_API_KEY not configured')) {
            return res.status(500).json({
              error: 'DASHSCOPE_API_KEY not configured. Please set the DASHSCOPE_API_KEY environment variable to use AI summary generation.'
            });
          }
          throw llmErr;
        }
      }
    }

    // Without book_id, use the provided info only
    try {
      const summary = await generateBookSummary(
        title.trim(),
        genre.trim(),
        description || `A book in the ${genre} genre.`,
        summaryStyle
      );
      return res.json({ summary });
    } catch (llmErr) {
      if (llmErr.message && llmErr.message.includes('DASHSCOPE_API_KEY not configured')) {
        return res.status(500).json({
          error: 'DASHSCOPE_API_KEY not configured. Please set the DASHSCOPE_API_KEY environment variable to use AI summary generation.'
        });
      }
      throw llmErr;
    }
  } catch (err) {
    console.error('POST /api/llm/summary error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to generate summary'
    });
  }
});

export default router;
