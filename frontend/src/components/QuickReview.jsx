// BiblioVault QuickReview — compact review submission form with inline StarRating.
// Can be used inside PDFReader or standalone.
// Props: { bookId, onSuccess?, onClose? }
// Submits to POST /api/reviews and handles 403 (not a borrower) gracefully.

import React, { useState } from 'react';

// ── Auth header helper ──────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Inline StarRating ───────────────────────────────────────────────────
// Renders 5 clickable stars. The `value` prop is the current rating (0-5),
// and `onChange` is called with the new rating when a star is clicked.
function StarRating({ value, onChange, max = 5, size = '1.5rem' }) {
  return (
    <span style={{ display: 'inline-flex', gap: '4px', cursor: onChange ? 'pointer' : 'default' }}>
      {Array.from({ length: max }, (_, i) => {
        const star = i + 1;
        return (
          <span
            key={star}
            onClick={() => onChange && onChange(star)}
            onMouseEnter={(e) => {
              if (onChange) e.target.style.transform = 'scale(1.2)';
            }}
            onMouseLeave={(e) => {
              if (onChange) e.target.style.transform = 'scale(1)';
            }}
            style={{
              fontSize: size,
              color: star <= value ? '#c9a84c' : '#444',
              transition: 'color 0.15s, transform 0.1s',
              userSelect: 'none',
              display: 'inline-block',
              lineHeight: 1,
            }}
            title={`${star} star${star > 1 ? 's' : ''}`}
          >
            {star <= value ? '★' : '☆'}
          </span>
        );
      })}
      {value > 0 && (
        <span style={{ color: '#aaa', fontSize: '0.85rem', marginLeft: '6px', lineHeight: size }}>
          ({value}/5)
        </span>
      )}
    </span>
  );
}

export { StarRating };

// ── QuickReview Component ───────────────────────────────────────────────
export default function QuickReview({ bookId, onSuccess, onClose }) {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e && e.preventDefault();

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
        body: JSON.stringify({
          book_id: bookId,
          rating,
          content: content.trim() || '',
        }),
      });

      const data = await res.json();

      if (res.status === 403) {
        setError(data.error || 'You must borrow this book to review it');
      } else if (res.ok) {
        setMessage('Review submitted successfully!');
        setRating(0);
        setContent('');
        if (onSuccess) onSuccess(data);
        if (onClose) setTimeout(onClose, 1500);
      } else if (res.status === 400) {
        setError(data.error || 'Invalid review submission');
      } else {
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
        background: '#1a1a1a',
        borderRadius: '8px',
        border: '1px solid #333',
        maxWidth: '400px',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <h4
        style={{
          margin: '0 0 16px',
          color: '#c9a84c',
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: '1.2rem',
          borderBottom: '1px solid #333',
          paddingBottom: '8px',
        }}
      >
        Review This Book
      </h4>

      {!message ? (
        <form onSubmit={handleSubmit}>
          {/* Rating */}
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                color: '#ccc',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Your Rating
            </label>
            <StarRating value={rating} onChange={setRating} size="1.8rem" />
          </div>

          {/* Review text */}
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                color: '#ccc',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Written Review <span style={{ color: '#888', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What did you think of this book?"
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #444',
                background: '#222',
                color: '#eee',
                resize: 'vertical',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '0.9rem',
                lineHeight: 1.5,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                color: '#e74c3c',
                fontSize: '0.85rem',
                marginBottom: '10px',
                padding: '8px 12px',
                background: '#2c1010',
                borderRadius: '4px',
                border: '1px solid #5a1a1a',
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: submitting ? '#666' : '#c9a84c',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 700,
              fontSize: '0.95rem',
              letterSpacing: '0.3px',
              transition: 'background 0.15s',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </form>
      ) : (
        /* Success message */
        <div
          style={{
            textAlign: 'center',
            padding: '20px 10px',
          }}
        >
          <div
            style={{
              fontSize: '2.5rem',
              marginBottom: '10px',
              color: '#2ecc71',
            }}
          >
            &#10003;
          </div>
          <p
            style={{
              color: '#2ecc71',
              fontSize: '1rem',
              fontWeight: 600,
              margin: 0,
            }}
          >
            {message}
          </p>
          {!onClose && (
            <button
              onClick={() => {
                setMessage(null);
                setRating(0);
                setContent('');
              }}
              style={{
                marginTop: '12px',
                padding: '6px 16px',
                background: '#333',
                color: '#ccc',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Write Another Review
            </button>
          )}
        </div>
      )}

      {/* Close button when used standalone with onClose */}
      {onClose && !submitting && (
        <div style={{ textAlign: 'right', marginTop: '8px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontFamily: 'DM Sans, sans-serif',
              textDecoration: 'underline',
              padding: '4px',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
