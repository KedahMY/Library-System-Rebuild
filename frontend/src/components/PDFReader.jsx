import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const API = axios.create({ baseURL: '/api' });
const PROGRESS_DEBOUNCE_MS = 3000;
const CANVAS_MAX_WIDTH = 800;

export default function PDFReader({ book, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [jumpInput, setJumpInput] = useState('');
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState([]);
  const [bmLoading, setBmLoading] = useState(false);
  const [bmAddPage, setBmAddPage] = useState('');
  const [bmAddLabel, setBmAddLabel] = useState('');

  // Highlights
  const [highlights, setHighlights] = useState([]);
  const [hlLoading, setHlLoading] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectedTextPage, setSelectedTextPage] = useState(null);
  const [hlColor, setHlColor] = useState('#ffff00');

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const token = localStorage.getItem('token');

  // ============= Load PDF =============
  useEffect(() => {
    if (!book || !book.id) {
      setError('No book specified');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await API.get(`/books/${book.id}/view`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        });

        if (cancelled) return;

        const blob = res.data;
        const arrayBuffer = await blob.arrayBuffer();

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;

        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load PDF');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============= Render page =============
  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const containerWidth = containerRef.current?.clientWidth || CANVAS_MAX_WIDTH;
      const viewport = page.getViewport({ scale: zoom });
      const scale = Math.min(zoom, containerWidth / viewport.width);
      const scaledViewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
    } catch (err) {
      console.error('Page render error:', err);
    }
  }, [pdfDoc, zoom]);

  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= numPages) {
      renderPage(currentPage);
    }
  }, [currentPage, renderPage, pdfDoc, numPages]);

  // ============= Load saved progress =============
  useEffect(() => {
    if (!book || !book.id || !pdfDoc) return;

    const loadProgress = async () => {
      try {
        const res = await API.get(`/history/progress/${book.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const savedPage = res.data.current_page;
        if (savedPage && savedPage >= 1 && savedPage <= numPages) {
          setCurrentPage(savedPage);
        }
      } catch (err) {
        // Progress not found — start from page 1
      }
    };

    loadProgress();
  }, [book?.id, pdfDoc, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============= Save progress (debounced) =============
  useEffect(() => {
    if (!book || !book.id || !numPages) return;

    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
    }

    progressTimerRef.current = setTimeout(async () => {
      try {
        await API.post(`/history/progress`, {
          book_id: book.id,
          current_page: currentPage,
          total_pages: numPages,
          seconds_increment: 3
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        // Silently fail — progress saving is non-critical
      }
    }, PROGRESS_DEBOUNCE_MS);

    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
      }
    };
  }, [currentPage, numPages, book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============= Load bookmarks =============
  const fetchBookmarks = useCallback(async () => {
    if (!book || !book.id) return;
    try {
      setBmLoading(true);
      const res = await API.get(`/books/${book.id}/bookmarks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBookmarks(res.data.bookmarks || []);
    } catch (err) {
      console.error('Failed to load bookmarks');
    } finally {
      setBmLoading(false);
    }
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showBookmarks) fetchBookmarks();
  }, [showBookmarks, fetchBookmarks]);

  const handleAddBookmark = async () => {
    const page = parseInt(bmAddPage) || currentPage;
    const label = bmAddLabel.trim() || `Page ${page}`;
    try {
      await API.post(`/books/${book.id}/bookmarks`, {
        page_number: page,
        label
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBmAddPage('');
      setBmAddLabel('');
      fetchBookmarks();
    } catch (err) {
      setError('Failed to save bookmark');
    }
  };

  const handleDeleteBookmark = async (bmId) => {
    try {
      await API.delete(`/books/bookmarks/${bmId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchBookmarks();
    } catch (err) {
      setError('Failed to delete bookmark');
    }
  };

  const handleGoToBookmark = (pageNum) => {
    setCurrentPage(pageNum);
    setJumpInput(String(pageNum));
  };

  // ============= Load highlights =============
  const fetchHighlights = useCallback(async () => {
    if (!book || !book.id) return;
    try {
      setHlLoading(true);
      const res = await API.get(`/books/${book.id}/highlights`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHighlights(res.data.highlights || []);
    } catch (err) {
      console.error('Failed to load highlights');
    } finally {
      setHlLoading(false);
    }
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showHighlights) fetchHighlights();
  }, [showHighlights, fetchHighlights]);

  const handleDeleteHighlight = async (hlId) => {
    try {
      await API.delete(`/books/highlights/${hlId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchHighlights();
    } catch (err) {
      setError('Failed to delete highlight');
    }
  };

  // ============= Text selection detection =============
  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectedText('');
        setSelectedTextPage(null);
        return;
      }
      setSelectedText(sel.toString().trim());
      setSelectedTextPage(currentPage);
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    };
  }, [currentPage]);

  const handleAddHighlight = async () => {
    if (!selectedText) return;
    try {
      await API.post(`/books/${book.id}/highlights`, {
        page_number: selectedTextPage || currentPage,
        text_content: selectedText,
        color: hlColor
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedText('');
      setSelectedTextPage(null);
      if (showHighlights) fetchHighlights();
    } catch (err) {
      setError('Failed to save highlight');
    }
  };

  // ============= Navigation =============
  const goToPrevPage = () => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  };

  const goToNextPage = () => {
    if (currentPage < numPages) setCurrentPage(p => p + 1);
  };

  const handleJumpToPage = (e) => {
    e.preventDefault();
    const page = parseInt(jumpInput);
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page);
    }
    setJumpInput('');
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 3.0));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));

  // ============= Keyboard shortcuts =============
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') goToPrevPage();
      if (e.key === 'ArrowRight') goToNextPage();
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ============= Render =============
  if (!book) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#999', fontFamily: 'DM Sans, sans-serif' }}>
        No book selected.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#666', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ marginBottom: 12 }}>Loading PDF...</div>
        <div style={{
          width: 40, height: 40, border: '3px solid #e0d5c7',
          borderTopColor: '#1a1a2e', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto'
        }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ padding: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ marginTop: 12, padding: '6px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>
    );
  }

  if (!pdfDoc) return null;

  return (
    <div style={{
      fontFamily: 'DM Sans, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      border: '1px solid #e0d5c7',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#fff'
    }}>
      {/* ===== Toolbar ===== */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: '#f5f0eb', borderBottom: '1px solid #e0d5c7', flexWrap: 'wrap'
      }}>
        {/* Book title */}
        <strong style={{ fontSize: 13, marginRight: 8, flex: 1, minWidth: 100 }}>
          {book.title || 'PDF Reader'}
        </strong>

        {/* Navigation */}
        <button onClick={goToPrevPage} disabled={currentPage <= 1}
          style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 3, background: '#fff', cursor: currentPage <= 1 ? 'default' : 'pointer', fontSize: 12 }}>
          &lsaquo; Prev
        </button>

        <form onSubmit={handleJumpToPage} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            placeholder="Page"
            min={1}
            max={numPages}
            style={{ width: 50, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12, textAlign: 'center' }}
          />
          <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>
            / {numPages}
          </span>
        </form>

        <button onClick={goToNextPage} disabled={currentPage >= numPages}
          style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 3, background: '#fff', cursor: currentPage >= numPages ? 'default' : 'pointer', fontSize: 12 }}>
          Next &rsaquo;
        </button>

        {/* Zoom */}
        <button onClick={handleZoomOut} disabled={zoom <= 0.5}
          style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 3, background: '#fff', cursor: zoom <= 0.5 ? 'default' : 'pointer', fontSize: 12 }}>
          Zoom -
        </button>
        <span style={{ fontSize: 12, color: '#666', minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={handleZoomIn} disabled={zoom >= 3.0}
          style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 3, background: '#fff', cursor: zoom >= 3.0 ? 'default' : 'pointer', fontSize: 12 }}>
          Zoom +
        </button>

        {/* Panel toggles */}
        <button
          onClick={() => { setShowBookmarks(!showBookmarks); setShowHighlights(false); }}
          style={{
            padding: '4px 10px', border: '1px solid #ccc', borderRadius: 3,
            background: showBookmarks ? '#1a1a2e' : '#fff',
            color: showBookmarks ? '#fff' : '#333', cursor: 'pointer', fontSize: 12
          }}
        >
          Bookmarks
        </button>
        <button
          onClick={() => { setShowHighlights(!showHighlights); setShowBookmarks(false); }}
          style={{
            padding: '4px 10px', border: '1px solid #ccc', borderRadius: 3,
            background: showHighlights ? '#1a1a2e' : '#fff',
            color: showHighlights ? '#fff' : '#333', cursor: 'pointer', fontSize: 12
          }}
        >
          Highlights
        </button>

        {/* Close */}
        {onClose && (
          <button onClick={onClose}
            style={{ padding: '4px 10px', border: 'none', borderRadius: 3, background: '#c62828', color: '#fff', cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}>
            Close
          </button>
        )}
      </div>

      {/* ===== Main content area ===== */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel: Bookmarks */}
        {showBookmarks && (
          <div style={{
            width: 240, minWidth: 240, borderRight: '1px solid #e0d5c7',
            overflow: 'auto', background: '#fafafa', padding: 12
          }}>
            <h4 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 15, margin: '0 0 10px 0' }}>
              Bookmarks
            </h4>

            {/* Add bookmark form */}
            <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
              <input
                value={bmAddLabel}
                onChange={(e) => setBmAddLabel(e.target.value)}
                placeholder="Label (optional)"
                style={{ padding: '5px 8px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="number"
                  value={bmAddPage}
                  onChange={(e) => setBmAddPage(e.target.value)}
                  placeholder={`Page ${currentPage}`}
                  min={1}
                  max={numPages}
                  style={{ flex: 1, padding: '5px 8px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12 }}
                />
                <button onClick={handleAddBookmark}
                  style={{ padding: '5px 10px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>
                  Add
                </button>
              </div>
            </div>

            {/* Bookmarks list */}
            {bmLoading ? (
              <div style={{ color: '#666', fontSize: 12 }}>Loading...</div>
            ) : bookmarks.length === 0 ? (
              <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 20 }}>
                No bookmarks yet
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {bookmarks.map((bm) => (
                  <div key={bm.id} style={{
                    padding: '6px 8px', background: '#fff', borderRadius: 4,
                    border: '1px solid #e0d5c7', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div
                      onClick={() => handleGoToBookmark(bm.page_number)}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{bm.label}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>Page {bm.page_number}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteBookmark(bm.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: 14, padding: '0 4px' }}
                      title="Delete bookmark"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Left panel: Highlights */}
        {showHighlights && (
          <div style={{
            width: 240, minWidth: 240, borderRight: '1px solid #e0d5c7',
            overflow: 'auto', background: '#fafafa', padding: 12
          }}>
            <h4 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 15, margin: '0 0 10px 0' }}>
              Highlights
            </h4>

            {hlLoading ? (
              <div style={{ color: '#666', fontSize: 12 }}>Loading...</div>
            ) : highlights.length === 0 ? (
              <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 20 }}>
                No highlights yet. Select text to highlight.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {highlights.map((hl) => (
                  <div key={hl.id} style={{
                    padding: '8px', background: '#fff', borderRadius: 4,
                    border: '1px solid #e0d5c7'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{
                        display: 'inline-block', width: 14, height: 14,
                        borderRadius: 2, background: hl.color || '#ffff00',
                        flexShrink: 0, marginTop: 2
                      }} />
                      <span style={{ fontSize: 11, color: '#999' }}>pg {hl.page_number}</span>
                    </div>
                    <p style={{ margin: '0 0 4px 0', fontSize: 12, lineHeight: 1.4, color: '#444' }}>
                      &ldquo;{(hl.text_content || '').substring(0, 100)}{(hl.text_content || '').length > 100 ? '...' : ''}&rdquo;
                    </p>
                    <button
                      onClick={() => handleDeleteHighlight(hl.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: 11, padding: 0 }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== PDF Canvas area ===== */}
        <div
          ref={containerRef}
          style={{
            flex: 1, overflow: 'auto', display: 'flex',
            justifyContent: 'center', padding: 16,
            background: '#f0f0f0'
          }}
        >
          <div style={{ position: 'relative' }}>
            <canvas ref={canvasRef} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)', background: '#fff' }} />

            {/* Text selection highlight button */}
            {selectedText && (
              <div style={{
                position: 'absolute', bottom: -40, left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex', gap: 6, alignItems: 'center',
                background: '#1a1a2e', color: '#fff', padding: '6px 12px',
                borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap', zIndex: 10
              }}>
                <input
                  type="color"
                  value={hlColor}
                  onChange={(e) => setHlColor(e.target.value)}
                  style={{ width: 24, height: 24, border: 'none', cursor: 'pointer', padding: 0 }}
                />
                <button
                  onClick={handleAddHighlight}
                  style={{ background: '#d4a017', color: '#fff', border: 'none', borderRadius: 3, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
                >
                  Highlight
                </button>
                <button
                  onClick={() => { setSelectedText(''); setSelectedTextPage(null); }}
                  style={{ background: 'none', color: '#999', border: 'none', cursor: 'pointer', fontSize: 14 }}
                >
                  &times;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Bottom status bar ===== */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', background: '#f5f0eb', borderTop: '1px solid #e0d5c7',
        fontSize: 12, color: '#666'
      }}>
        <span>Page {currentPage} of {numPages}</span>
        <span>{book.title}</span>
      </div>
    </div>
  );
}
