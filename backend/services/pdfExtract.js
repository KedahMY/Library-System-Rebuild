import fs from 'fs';
import path from 'path';

/**
 * Extract text content from files for LLM summarization.
 * .pdf and .doc/.docx return null (no extraction support).
 * .txt returns first 6000 characters of file content.
 * @param {string} filePath - Absolute path to the file
 * @returns {string|null} Extracted text or null if unsupported/missing
 */
export function extractText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();

  // Only .txt files are supported for text extraction
  if (ext === '.txt') {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.substring(0, 6000);
    } catch (err) {
      console.error('extractText read error:', err.message);
      return null;
    }
  }

  // .pdf and .doc/.docx are not supported — return null
  return null;
}
