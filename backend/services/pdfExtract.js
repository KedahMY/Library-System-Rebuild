// BiblioVault PDF/text extraction service — extracts readable text from
// uploaded book files for LLM summarization context.
// Exports: extractText

import fs from 'fs';
import path from 'path';

/**
 * Extracts text content from a book file.
 * - .txt files: returns first 6000 characters
 * - .pdf / .doc / .docx files: returns null (binary format, cannot extract meaningfully
 *   without heavy dependencies — LLM will work from title/genre/description instead)
 * - Other files: returns null
 * @param {string} filePath - Absolute path to the file
 * @returns {string|null} Extracted text (first 6000 chars) or null
 */
export function extractText(filePath) {
  if (!filePath) return null;

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found for extraction: ${filePath}`);
      return null;
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt') {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Return first 6000 characters
      return content.substring(0, 6000);
    }

    if (ext === '.pdf' || ext === '.doc' || ext === '.docx') {
      // Binary formats — cannot extract meaningfully without heavy dependencies
      return null;
    }

    // Unknown format
    return null;
  } catch (err) {
    console.error(`Text extraction failed for ${filePath}: ${err.message}`);
    return null;
  }
}
