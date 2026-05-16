// BiblioVault PDF Reader — in-browser PDF viewer using pdfjs-dist.
// Renders as a full-screen modal over the portal content.
// Props: { bookId, bookTitle, onClose }
// Features: page navigation, jump-to-page, reading progress auto-save,
//           bookmarks (create/list/delete), highlights (create/list/delete),
//           QuickReview toggle.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// ── Auth header helper ──────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Debounce hook ───────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── StarRating (inline) ─────────────────────────────────────────────────
function StarRating({ value, onChange, max = 5 }) {
  return (
    <span style={{ display: 'inline-flex', gap: '2px', cursor: onChange ? 'pointer' : 'default' }}>
      {Array.from({ length: max }, (_, i) => {
        const star = i + 1;
        return (
          <span
            key={star}
            onClick={() => onChange && onChange(star)}
            style={{
              fontSize: '1.4rem',
              color: star <= value ? '#c9a84c' : '#444',
              transition: 'color 0.15s',
              userSelect: 'none',
            }}
          >
            {star <= value ? '★' : '☆'}
          </span>
        );
      })}
    </span>
  );
}

// ── QuickReview panel ───────────────────────────────────────────────────
function QuickReview({ bookId, onClose }) {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ book_id: bookId, rating, content: content.trim() || '' }),
      });

      if (res.status === 403) {
        const data = await res.json();
        setError(data.error || 'You must borrow this book to review it');
      } else if (res.ok) {
        setMessage('Review submitted successfully!');
        setRating(0);
        setContent('');
        setTimeout(() => onClose && onClose(), 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit review');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: '16px',
        borderTop: '1px solid #333',
        background: '#1a1a1a',
        marginTop: 'auto',
      }}
    >
      <h4 style={{ margin: '0 0 12px', color: '#c9a84c', fontFamily: 'Cormorant Garamond, serif' }}>
        Quick Review
      </h4>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#ccc', fontSize: '0.85rem' }}>
          Rating
        </label>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#ccc', fontSize: '0.85rem' }}>
          Review (optional)
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share your thoughts about this book..."
          rows={3}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #444',
            background: '#222',
            color: '#eee',
            resize: 'vertical',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '0.85rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div
          style={{
            color: '#e74c3c',
            fontSize: '0.85rem',
            marginBottom: '8px',
            padding: '6px 10px',
            background: '#2c1010',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          style={{
            color: '#2ecc71',
            fontSize: '0.85rem',
            marginBottom: '8px',
            padding: '6px 10px',
            background: '#0f2a15',
            borderRadius: '4px',
          }}
        >
          {message}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '8px',
          background: submitting ? '#555' : '#c9a84c',
          color: '#000',
          border: 'none',
          borderRadius: '4px',
          cursor: submitting ? 'not-allowed' : 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 600,
          fontSize: '0.9rem',
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Review'}
      </button>
    </div>
  );
}

// ── Main PDFReader Component ────────────────────────────────────────────
export default function PDFReader({ bookId, bookTitle, onClose }) {
  const canvasRef = useRef(null);
  const pdfDocRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageInput, setPageInput] = useState('1');
  const [progressKey, setProgressKey] = useState(0); // trigger debounce reset

  // Side panels
  const [panel, setPanel] = useState('bookmarks'); // 'bookmarks' | 'highlights' | 'review'
  const [bookmarks, setBookmarks] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [newBookmarkLabel, setNewBookmarkLabel] = useState('');
  const [newHighlightText, setNewHighlightText] = useState('');
  const [newHighlightColor, setNewHighlightColor] = useState('#c9a84c');

  // Accumulated seconds for this reading session
  const sessionSecondsRef = useRef(0);
  const lastTickRef = useRef(Date.now());
  const totalPagesRef = useRef(null);

  // Debounced page value for saving
  const debouncedPage = useDebounce(currentPage, 3000);

  // ── Fetch PDF ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/books/${bookId}/view`, {
          headers: authHeaders(),
        });

        if (!res.ok) {
          throw new Error(res.status === 404 ? 'Book file not found' : 'Failed to load PDF');
        }

        const blob = await res.blob();
        const data = await blob.arrayBuffer();

        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        totalPagesRef.current = pdf.numPages;

        // Load saved reading progress
        try {
          const progRes = await fetch(`/api/history/progress/${bookId}`, {
            headers: authHeaders(),
          });
          if (progRes.ok) {
            const prog = await progRes.json();
            const savedPage = Math.min(Math.max(1, prog.current_page || 1), pdf.numPages);
            setCurrentPage(savedPage);
            setPageInput(String(savedPage));
          }
        } catch (e) {
          // ignore progress load failure
        }

        setLoading(false);
        renderPage(pdf, 1);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // ── Render page ────────────────────────────────────────────────────────
  const renderPage = useCallback(async (pdf, pageNum) => {
    if (!pdf || !canvasRef.current) return;

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) {
      console.error('Page render error:', e.message);
    }
  }, []);

  // ── Navigate ───────────────────────────────────────────────────────────
  const goToPage = useCallback(
    (pageNum) => {
      const p = Math.min(Math.max(1, pageNum), numPages);
      if (p === currentPage && pdfDocRef.current) return;

      setCurrentPage(p);
      setPageInput(String(p));
      if (pdfDocRef.current) {
        renderPage(pdfDocRef.current, p);
      }
    },
    [numPages, currentPage, renderPage]
  );

  const handleJumpInput = (e) => {
    const val = e.target.value;
    setPageInput(val);
    if (val && parseInt(val, 10) >= 1 && parseInt(val, 10) <= numPages) {
      goToPage(parseInt(val, 10));
    }
  };

  // ── Auto-save progress on debounced page change ──────────────────────
  useEffect(() => {
    if (debouncedPage < 1 || !totalPagesRef.current) return;

    // Calculate seconds increment since last tick
    const now = Date.now();
    const elapsed = Math.floor((now - lastTickRef.current) / 1000);
    lastTickRef.current = now;

    // Accumulate session seconds
    sessionSecondsRef.current += elapsed;

    fetch('/api/history/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        book_id: bookId,
        current_page: debouncedPage,
        total_pages: totalPagesRef.current,
        seconds_increment: elapsed || 10,
      }),
    }).catch(() => {
      // silent fail for progress save
    });
  }, [debouncedPage, bookId]);

  // ── Fetch bookmarks & highlights ──────────────────────────────────────
  const fetchBookmarks = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/bookmarks`, { headers: authHeaders() });
      if (res.ok) setBookmarks(await res.json());
    } catch (e) {
      /* ignore */
    }
  }, [bookId]);

  const fetchHighlights = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/highlights`, { headers: authHeaders() });
      if (res.ok) setHighlights(await res.json());
    } catch (e) {
      /* ignore */
    }
  }, [bookId]);

  useEffect(() => {
    fetchBookmarks();
    fetchHighlights();
  }, [fetchBookmarks, fetchHighlights]);

  // ── Bookmark actions ──────────────────────────────────────────────────
  const addBookmark = async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ page_number: currentPage, label: newBookmarkLabel.trim() || null }),
      });
      if (res.ok) {
        setNewBookmarkLabel('');
        fetchBookmarks();
        goToPage(currentPage);
      }
    } catch (e) {
      /* ignore */
    }
  };

  const deleteBookmark = async (bmId) => {
    try {
      await fetch(`/api/books/bookmarks/${bmId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      fetchBookmarks();
    } catch (e) {
      /* ignore */
    }
  };

  // ── Highlight actions ─────────────────────────────────────────────────
  const addHighlight = async () => {
    if (!newHighlightText.trim()) return;
    try {
      const res = await fetch(`/api/books/${bookId}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          page_number: currentPage,
          text_content: newHighlightText.trim(),
          color: newHighlightColor,
        }),
      });
      if (res.ok) {
        setNewHighlightText('');
        fetchHighlights();
      }
    } catch (e) {
      /* ignore */
    }
  };

  const deleteHighlight = async (hlId) => {
    try {
      await fetch(`/api/books/highlights/${hlId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      fetchHighlights();
    } catch (e) {
      /* ignore */
    }
  };

  // ── Panel content ──────────────────────────────────────────────────────
  const panelContent = () => {
    if (panel === 'bookmarks') {
      return (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="Label (optional)"
              value={newBookmarkLabel}
              onChange={(e) => setNewBookmarkLabel(e.target.value)}
              style={inputStyle}
            />
            <button onClick={addBookmark} style={smallBtnStyle}>
              Add Bookmark (p.{currentPage})
            </button>
          </div>

          {bookmarks.length === 0 ? (
            <p style={{ color: '#888', fontSize: '0.85rem' }}>No bookmarks yet</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {bookmarks.map((bm) => (
                <li
                  key={bm.id}
                  style={{
                    padding: '8px',
                    marginBottom: '6px',
                    background: '#1a1a1a',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span onClick={() => goToPage(bm.page_number)} style={{ flex: 1 }}>
                    <strong style={{ color: '#c9a84c' }}>p.{bm.page_number}</strong>
                    {bm.label && (
                      <span style={{ color: '#aaa', marginLeft: '6px', fontSize: '0.85rem' }}>
                        — {bm.label}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => deleteBookmark(bm.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#e74c3c',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: '0 4px',
                    }}
                    title="Delete bookmark"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (panel === 'highlights') {
      return (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <textarea
              placeholder="Paste highlighted text..."
              value={newHighlightText}
              onChange={(e) => setNewHighlightText(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <label style={{ color: '#aaa', fontSize: '0.8rem' }}>Color:</label>
              {['#c9a84c', '#e74c3c', '#3498db', '#2ecc71', '#e67e22'].map((c) => (
                <span
                  key={c}
                  onClick={() => setNewHighlightColor(c)}
                  style={{
                    display: 'inline-block',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    border: newHighlightColor === c ? '2px solid #fff' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
            <button onClick={addHighlight} style={smallBtnStyle}>
              Add Highlight
            </button>
          </div>

          {highlights.length === 0 ? (
            <p style={{ color: '#888', fontSize: '0.85rem' }}>No highlights yet</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {highlights.map((hl) => (
                <li
                  key={hl.id}
                  style={{
                    padding: '8px',
                    marginBottom: '6px',
                    background: '#1a1a1a',
                    borderRadius: '4px',
                    borderLeft: `4px solid ${hl.color || '#c9a84c'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#c9a84c', fontSize: '0.8rem' }}>p.{hl.page_number}</span>
                    <button
                      onClick={() => deleteHighlight(hl.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e74c3c',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        padding: '0 4px',
                      }}
                      title="Delete highlight"
                    >
                      &times;
                    </button>
                  </div>
                  <p style={{ margin: '4px 0 0', color: '#ddd', fontSize: '0.85rem' }}>
                    {hl.text_content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (panel === 'review') {
      return <QuickReview bookId={bookId} onClose={() => setPanel('bookmarks')} />;
    }

    return null;
  };

  // ── Styling constants ─────────────────────────────────────────────────
  const inputStyle = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #444',
    background: '#222',
    color: '#eee',
    fontSize: '0.85rem',
    marginBottom: '8px',
    fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box',
  };

  const smallBtnStyle = {
    width: '100%',
    padding: '6px',
    background: '#c9a84c',
    color: '#000',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.8rem',
    fontFamily: 'DM Sans, sans-serif',
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
        background: '#0d0d0d',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: '#1a1a1a',
          borderBottom: '1px solid #333',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '4px 8px',
            }}
            title="Close reader"
          >
            &larr; Back
          </button>
          <span style={{ color: '#c9a84c', fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem' }}>
            {bookTitle || 'PDF Reader'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            style={navBtnStyle(currentPage <= 1)}
          >
            &lsaquo; Prev
          </button>

          <span style={{ color: '#aaa', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
            Page{' '}
            <input
              type="number"
              value={pageInput}
              onChange={handleJumpInput}
              min={1}
              max={numPages}
              style={{
                width: '50px',
                padding: '2px 4px',
                textAlign: 'center',
                background: '#222',
                border: '1px solid #444',
                borderRadius: '3px',
                color: '#eee',
                fontSize: '0.9rem',
              }}
            />{' '}
            / {numPages}
          </span>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            style={navBtnStyle(currentPage >= numPages)}
          >
            Next &rsaquo;
          </button>
        </div>

        <div style={{ width: '80px' }} />
      </div>

      {/* ── Main content: canvas + side panel ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* PDF canvas area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            overflow: 'auto',
            padding: '16px',
            background: '#0d0d0d',
          }}
        >
          {loading && (
            <div style={{ color: '#888', marginTop: '40px', fontSize: '1.1rem' }}>
              Loading PDF...
            </div>
          )}
          {error && (
            <div
              style={{
                color: '#e74c3c',
                marginTop: '40px',
                padding: '16px',
                background: '#2c1010',
                borderRadius: '6px',
                maxWidth: '400px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: loading || error ? 'none' : 'block' }} />
        </div>

        {/* ── Side panel ── */}
        <div
          style={{
            width: '300px',
            borderLeft: '1px solid #333',
            background: '#141414',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Panel tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #333',
              background: '#1a1a1a',
            }}
          >
            {[
              { id: 'bookmarks', label: 'Bookmarks' },
              { id: 'highlights', label: 'Highlights' },
              { id: 'review', label: 'Review' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPanel(tab.id)}
                style={{
                  flex: 1,
                  padding: '10px 6px',
                  background: panel === tab.id ? '#c9a84c' : 'transparent',
                  color: panel === tab.id ? '#000' : '#888',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: panel === tab.id ? 700 : 400,
                  fontFamily: 'DM Sans, sans-serif',
                  transition: 'background 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>{panelContent()}</div>
        </div>
      </div>
    </div>
  );
}

function navBtnStyle(disabled) {
  return {
    padding: '4px 12px',
    background: disabled ? '#333' : '#2a2a2a',
    color: disabled ? '#555' : '#ccc',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'DM Sans, sans-serif',
  };
}
