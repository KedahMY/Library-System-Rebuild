import axios from 'axios';
import fs from 'fs';
import path from 'path';

const OL_SEARCH_URL = 'https://openlibrary.org/search.json';
const IA_METADATA_URL = 'https://archive.org/metadata';
const IA_DOWNLOAD_URL = 'https://archive.org/download';
const OL_COVERS_URL = 'https://covers.openlibrary.org/b/id';

/**
 * Search Open Library for books matching a query.
 * @param {string} query - Search text
 * @param {number} limit - Max results (default 10)
 * @returns {Promise<Array>} Array of { ol_key, title, author, year, cover_id, ia_identifier, isbn }
 */
export async function searchBooks(query, limit = 10) {
  try {
    const response = await axios.get(OL_SEARCH_URL, {
      params: { q: query, limit },
      timeout: 10000
    });

    return (response.data.docs || []).map(doc => ({
      ol_key: doc.key,
      title: doc.title,
      author: doc.author_name ? doc.author_name[0] : 'Unknown',
      year: doc.first_publish_year || null,
      cover_id: doc.cover_i || null,
      ia_identifier: doc.ia ? doc.ia[0] : null,
      isbn: doc.isbn ? doc.isbn[0] : null
    }));
  } catch (err) {
    console.error('OpenLibrary search error:', err.message);
    throw new Error(`Open Library search failed: ${err.message}`);
  }
}

/**
 * Find similar books by title and genre.
 * @param {string} title - Book title
 * @param {string} genre - Book genre
 * @param {number} limit - Max results (default 5)
 * @returns {Promise<Array>} Array of book results
 */
export async function findSimilar(title, genre, limit = 5) {
  const query = `${title} ${genre || ''}`.trim();
  try {
    const results = await searchBooks(query, limit + 1);
    // Filter out the exact title match, return remaining
    const filtered = results.filter(r =>
      r.title.toLowerCase() !== title.toLowerCase()
    );
    return filtered.slice(0, limit);
  } catch (err) {
    console.error('findSimilar error:', err.message);
    return [];
  }
}

/**
 * Score a PDF candidate file for download quality.
 * @param {string} filename - File name
 * @param {number} size - File size in bytes
 * @returns {number} Score (higher is better)
 */
export function scorePdfCandidate(filename, size) {
  let score = 0;

  // Prefer files ending in .pdf
  if (filename.toLowerCase().endsWith('.pdf')) {
    score += 50;
  }

  // Penalize files smaller than 10 KB (likely not a real book PDF)
  if (size < 10240) {
    score -= 100;
  }

  // Larger files are more likely to be actual book content
  if (size > 1024 * 1024) {
    score += 30;
  }
  if (size > 10 * 1024 * 1024) {
    score += 20;
  }

  // Penalize files with "texts" or "book" not in name (likely metadata PDFs)
  const lower = filename.toLowerCase();
  if (lower.includes('_texts') || lower.includes('_djvu') || lower.includes('_meta')) {
    score -= 20;
  }

  return score;
}

/**
 * Download a PDF from Internet Archive for a given identifier.
 * Uses scorePdfCandidate to select the best PDF file from the item's file list.
 * @param {string} iaIdentifier - Internet Archive identifier
 * @param {string} destPath - Absolute destination path for the downloaded PDF
 * @returns {Promise<{success: boolean, path: string, size: number}>}
 */
export async function downloadIaPdf(iaIdentifier, destPath) {
  console.log(`Fetching IA metadata for identifier: ${iaIdentifier}`);

  // Get item metadata to find available files
  let metadataResponse;
  try {
    metadataResponse = await axios.get(`${IA_METADATA_URL}/${iaIdentifier}`, {
      timeout: 15000
    });
  } catch (err) {
    console.error('IA metadata fetch error:', err.message);
    throw new Error(`Failed to fetch IA metadata: ${err.message}`);
  }

  const files = metadataResponse.data.files || [];

  if (files.length === 0) {
    throw new Error(`No files found for IA identifier: ${iaIdentifier}`);
  }

  // Score and sort PDF candidates
  const candidates = files
    .filter(f => f.name && f.name.toLowerCase().endsWith('.pdf'))
    .map(f => ({
      name: f.name,
      size: parseInt(f.size) || 0,
      score: scorePdfCandidate(f.name, parseInt(f.size) || 0)
    }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    throw new Error(`No suitable PDF found for identifier: ${iaIdentifier}`);
  }

  const best = candidates[0];
  const pdfUrl = `${IA_DOWNLOAD_URL}/${iaIdentifier}/${best.name}`;

  console.log(`Downloading IA PDF: ${pdfUrl}`);
  console.log(`  Size: ${(best.size / 1024 / 1024).toFixed(1)} MB, Score: ${best.score}`);

  // Download the PDF
  let downloadResponse;
  try {
    downloadResponse = await axios({
      method: 'GET',
      url: pdfUrl,
      responseType: 'stream',
      timeout: 180000,
      maxRedirects: 5
    });
  } catch (err) {
    console.error('IA PDF download error:', err.message);
    throw new Error(`Failed to download PDF: ${err.message}`);
  }

  const writer = fs.createWriteStream(destPath);

  return new Promise((resolve, reject) => {
    let downloadedSize = 0;

    downloadResponse.data.on('data', (chunk) => {
      downloadedSize += chunk.length;
    });

    downloadResponse.data.pipe(writer);

    writer.on('finish', () => {
      console.log(`IA PDF download complete: ${destPath} (${downloadedSize} bytes)`);
      resolve({
        success: true,
        path: destPath,
        size: downloadedSize
      });
    });

    writer.on('error', (err) => {
      console.error('IA PDF write error:', err.message);
      // Clean up partial file
      try { fs.unlinkSync(destPath); } catch (e) { /* ignore */ }
      reject(new Error(`Failed to save PDF: ${err.message}`));
    });

    downloadResponse.data.on('error', (err) => {
      console.error('IA PDF stream error:', err.message);
      writer.destroy();
      try { fs.unlinkSync(destPath); } catch (e) { /* ignore */ }
      reject(new Error(`Failed to download PDF: ${err.message}`));
    });
  });
}

/**
 * Fetch a cover image from Open Library covers API.
 * @param {number|string} coverId - Cover ID from OL search
 * @param {'S'|'M'|'L'} size - Size: S (small), M (medium), L (large)
 * @returns {Promise<Buffer|null>} Image buffer or null on failure
 */
export async function fetchCover(coverId, size = 'M') {
  if (!coverId) return null;

  const url = `${OL_COVERS_URL}/${coverId}-${size}.jpg`;

  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      timeout: 10000
    });

    return Buffer.from(response.data);
  } catch (err) {
    console.error(`fetchCover error for cover ${coverId}:`, err.message);
    return null;
  }
}
