// BiblioVault Open Library service — search, metadata lookup, and
// Internet Archive PDF download utilities.
// Exports: searchBooks, findSimilar, downloadIaPdf, scorePdfCandidate, fetchCover

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const OL_SEARCH_URL = 'https://openlibrary.org/search.json';
const IA_METADATA_URL = 'https://archive.org/metadata';
const IA_DOWNLOAD_URL = 'https://archive.org/download';
const OL_COVERS_URL = 'https://covers.openlibrary.org/b/id';
const TIMEOUT_MS = 15000;

/**
 * Searches Open Library for books matching the given query.
 * @param {string} query - Search query
 * @param {number} limit - Maximum results (default 10)
 * @returns {Promise<Array>} Array of { ol_key, title, author, year, cover_id, ia_identifier }
 */
export async function searchBooks(query, limit = 10) {
  if (!query || !query.trim()) {
    throw new Error('Search query is required');
  }

  const url = `${OL_SEARCH_URL}?q=${encodeURIComponent(query.trim())}&limit=${limit}`;

  try {
    const response = await axios.get(url, { timeout: TIMEOUT_MS });

    if (!response.data || !response.data.docs) {
      return [];
    }

    return response.data.docs.map((doc) => ({
      ol_key: doc.key || null,
      title: doc.title || 'Unknown Title',
      author: doc.author_name ? doc.author_name[0] : 'Unknown Author',
      year: doc.first_publish_year || null,
      cover_id: doc.cover_i || null,
      ia_identifier: doc.ia ? doc.ia[0] : null,
    })).filter((item) => item.title !== 'Unknown Title');
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new Error('Open Library search request timed out');
    }
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      throw new Error('Cannot reach Open Library — network is unavailable');
    }
    throw new Error(`Open Library search failed: ${err.message}`);
  }
}

/**
 * Finds similar books by searching title + genre.
 * @param {string} title - Book title
 * @param {string} genre - Book genre
 * @returns {Promise<Array>} Top 5 matches
 */
export async function findSimilar(title, genre) {
  const query = `${title} ${genre || ''}`.trim();
  const results = await searchBooks(query, 8);
  return results.slice(0, 5);
}

/**
 * Heuristic scoring for Internet Archive PDF candidates.
 * Prefers files ending in .pdf, larger files (books not covers),
 * penalizes files < 10 KB (likely thumbnails).
 * @param {string} filename - The file name
 * @param {number} size - File size in bytes
 * @returns {number} Numeric score (higher = better candidate)
 */
export function scorePdfCandidate(filename, size) {
  let score = 0;

  const lower = (filename || '').toLowerCase();

  // Prefer .pdf files
  if (lower.endsWith('.pdf')) {
    score += 100;
  } else {
    score -= 50; // non-PDF files are less desirable
  }

  // Penalize very small files (likely thumbnails or text files, not books)
  if (size < 10240) {
    score -= 80;
  } else if (size < 102400) {
    score -= 20; // Slightly penalize small files (100KB-10KB)
  }

  // Reward larger files (books are typically > 1 MB)
  if (size > 1048576) {
    score += 50;
  } else if (size > 524288) {
    score += 20;
  }

  // Penalize known non-book patterns
  if (lower.includes('__ia_thumb') || lower.includes('thumb') || lower.includes('cover')) {
    score -= 60;
  }

  // Reward files with "pdf" in name without "text" (text PDFs are usually OCR versions)
  if (lower.includes('pdf') && !lower.includes('_text')) {
    score += 10;
  }

  return score;
}

/**
 * Downloads a PDF from Internet Archive given an IA identifier.
 * Uses scorePdfCandidate heuristic to pick the best PDF file.
 * Streams the file to destPath.
 * @param {string} iaIdentifier - Internet Archive identifier
 * @param {string} destPath - Absolute path where the file should be saved
 * @returns {Promise<{ success: boolean, path: string, size: number }>}
 */
export async function downloadIaPdf(iaIdentifier, destPath) {
  if (!iaIdentifier || !iaIdentifier.trim()) {
    throw new Error('Internet Archive identifier is required');
  }

  // Step 1: Fetch the item metadata to find available files
  let metadata;
  try {
    const metaUrl = `${IA_METADATA_URL}/${encodeURIComponent(iaIdentifier.trim())}`;
    const metaResponse = await axios.get(metaUrl, { timeout: TIMEOUT_MS });
    metadata = metaResponse.data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      throw new Error(`Internet Archive item "${iaIdentifier}" not found`);
    }
    throw new Error(`Failed to fetch Internet Archive metadata: ${err.message}`);
  }

  // Step 2: Find PDF files in the item's file list
  const files = metadata.files || [];
  const candidates = files
    .filter((f) => f.name && f.name.toLowerCase().endsWith('.pdf'))
    .map((f) => ({
      name: f.name,
      size: f.size || 0,
      score: scorePdfCandidate(f.name, f.size || 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    throw new Error(`No PDF files found for Internet Archive item "${iaIdentifier}"`);
  }

  // Step 3: Try candidates from highest to lowest score
  let lastError = null;
  for (const candidate of candidates) {
    const url = `${IA_DOWNLOAD_URL}/${encodeURIComponent(iaIdentifier.trim())}/${encodeURIComponent(candidate.name)}`;

    try {
      const writer = fs.createWriteStream(destPath);
      const response = await axios({
        method: 'get',
        url,
        responseType: 'stream',
        timeout: TIMEOUT_MS * 2,
      });

      await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const stats = fs.statSync(destPath);
      if (stats.size === 0) {
        fs.unlinkSync(destPath);
        lastError = new Error('Downloaded file is empty (0 bytes)');
        continue;
      }

      console.log(`Downloaded "${candidate.name}" from IA (${stats.size} bytes)`);

      return {
        success: true,
        path: destPath,
        size: stats.size,
      };
    } catch (err) {
      lastError = err;
      console.log(`Failed to download candidate "${candidate.name}": ${err.message}`);
      // Clean up partial download if it exists
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch (e) { /* ignore */ }
      }
      continue;
    }
  }

  throw lastError || new Error(`Failed to download any PDF from Internet Archive item "${iaIdentifier}"`);
}

/**
 * Fetches a cover image from Open Library by cover ID.
 * @param {number} coverId - Open Library cover ID
 * @param {'S'|'M'|'L'} size - Size: S (small), M (medium), L (large)
 * @returns {Promise<Buffer|null>} Image buffer, or null on failure
 */
export async function fetchCover(coverId, size = 'M') {
  if (!coverId) return null;

  const validSizes = ['S', 'M', 'L'];
  const imgSize = validSizes.includes(size) ? size : 'M';

  const url = `${OL_COVERS_URL}/${coverId}-${imgSize}.jpg`;

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: TIMEOUT_MS,
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.error(`Failed to fetch cover ${coverId}: ${err.message}`);
    return null;
  }
}
