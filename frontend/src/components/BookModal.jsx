// BiblioVault BookModal — full book detail modal with cover, metadata,
// rating, availability badge, borrow CTA with duration slider (1–14 days),
// and "Quick Read" link for unborrowed books.
// Props: { book, onClose, onBorrow }
//
// Calls POST /api/books/:id/borrow when the user clicks the borrow CTA.

import React, { useState } from 'react';
import StarRating from './StarRating.jsx';

export default function BookModal({ book, onClose, onBorrow }) {
  const [durationDays, setDurationDays] = useState(7);
  const [borrowing, setBorrowing] = useState(false);
  const [borrowError, setBorrowError] = useState(null);
  const [borrowSuccess, setBorrowSuccess] = useState(false);

  if (!book) return null;

  const isAvailable = book.availability === 'available';

  const getToken = () => localStorage.getItem('token') || '';
  const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

  const handleBorrow = async () => {
    if (!isAvailable) return;

    setBorrowing(true);
    setBorrowError(null);

    try {
      const res = await fetch(`/api/books/${book.id}/borrow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ duration_days: durationDays }),
      });

      if (res.ok) {
        const data = await res.json();
        setBorrowSuccess(true);
        if (onBorrow) onBorrow(data);
      } else if (res.status === 400) {
        const data = await res.json();
        setBorrowError(data.error || 'Unable to borrow this book');
      } else {
        setBorrowError('Failed to borrow. Please try again.');
      }
    } catch (err) {
      setBorrowError('Network error. Please try again.');
    } finally {
      setBorrowing(false);
    }
  };

  // Calculate due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + durationDays);

  const modalOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5000,
    padding: '1rem',
  };

  const modalContentStyle = {
    background: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    overflow: 'auto',
    fontFamily: 'DM Sans, sans-serif',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header with close */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e0d8c8',
          }}
        >
          <h2
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              color: '#2c1810',
              margin: 0,
              fontSize: '1.5rem',
            }}
          >
            {book.title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              flexWrap: 'wrap',
              marginBottom: '1.25rem',
            }}
          >
            {/* Cover image */}
            <div
              style={{
                width: '140px',
                height: '200px',
                background: '#f0ece4',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #e0d8c8',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {book.cover_image ? (
                <img
                  src={`/${book.cover_image}`}
                  alt={`${book.title} cover`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentNode.innerHTML =
                      '<span style="font-size:2.5rem;color:#c9a84c;">&#128218;</span>';
                  }}
                />
              ) : (
                <span style={{ fontSize: '2.5rem', color: '#c9a84c' }}>
                  &#128218;
                </span>
              )}
            </div>

            {/* Metadata */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#444' }}>
                <strong>Author:</strong> {book.author_name}
              </p>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#444' }}>
                <strong>Genre:</strong> {book.genre}
              </p>
              {book.publish_date && (
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#666' }}>
                  <strong>Published:</strong>{' '}
                  {new Date(book.publish_date).toLocaleDateString()}
                </p>
              )}

              {/* Availability badge */}
              <div style={{ margin: '0.75rem 0' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    background: isAvailable ? '#e8f5e9' : '#ffebee',
                    color: isAvailable ? '#2e7d32' : '#c62828',
                  }}
                >
                  {isAvailable ? 'Available' : 'Borrowed'}
                </span>
              </div>

              {/* Rating */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                }}
              >
                <StarRating
                  value={Math.round(book.average_rating || 0)}
                  readOnly
                />
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  {book.average_rating
                    ? Number(book.average_rating).toFixed(1)
                    : 'No ratings'}
                  {book.review_count > 0 && (
                    <> ({book.review_count} review{book.review_count !== 1 ? 's' : ''})</>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          {book.description && (
            <div
              style={{
                marginBottom: '1.25rem',
                padding: '1rem',
                background: '#f8f6f0',
                borderRadius: '6px',
                fontSize: '0.9rem',
                color: '#444',
                lineHeight: 1.6,
              }}
            >
              {book.description}
            </div>
          )}

          {/* Borrow section (only show if available) */}
          {isAvailable && !borrowSuccess && (
            <div
              style={{
                padding: '1rem',
                border: '1px solid #e0d8c8',
                borderRadius: '8px',
                marginBottom: '1rem',
              }}
            >
              <h4
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  color: '#2c1810',
                  margin: '0 0 0.75rem 0',
                }}
              >
                Borrow This Book
              </h4>

              {/* Duration slider */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    color: '#555',
                    marginBottom: '6px',
                  }}
                >
                  Duration: <strong>{durationDays} day{durationDays > 1 ? 's' : ''}</strong>{' '}
                  (max 14)
                </label>
                <input
                  type="range"
                  min={1}
                  max={14}
                  value={durationDays}
                  onChange={(e) => setDurationDays(parseInt(e.target.value, 10))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Due date preview */}
              <div
                style={{
                  fontSize: '0.85rem',
                  color: '#666',
                  marginBottom: '0.75rem',
                }}
              >
                Due by:{' '}
                <strong>{dueDate.toLocaleDateString()}</strong>
              </div>

              {/* Error */}
              {borrowError && (
                <div
                  style={{
                    color: '#c62828',
                    fontSize: '0.85rem',
                    marginBottom: '0.5rem',
                    padding: '6px 10px',
                    background: '#ffebee',
                    borderRadius: '4px',
                  }}
                >
                  {borrowError}
                </div>
              )}

              {/* Borrow button */}
              <button
                onClick={handleBorrow}
                disabled={borrowing}
                style={{
                  width: '100%',
                  padding: '0.65rem 1rem',
                  background: borrowing ? '#999' : '#2c1810',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: borrowing ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {borrowing ? 'Borrowing...' : `Borrow for ${durationDays} day${durationDays > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Borrow success */}
          {borrowSuccess && (
            <div
              style={{
                padding: '1rem',
                background: '#e8f5e9',
                borderRadius: '8px',
                textAlign: 'center',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#2e7d32' }}>
                &#10003;
              </div>
              <p style={{ color: '#2e7d32', fontWeight: 600, margin: 0 }}>
                Book borrowed successfully! Due by {dueDate.toLocaleDateString()}.
              </p>
            </div>
          )}

          {/* Quick Read link — for unborrowed books */}
          {!isAvailable && (
            <div
              style={{
                padding: '0.75rem',
                background: '#fff8e1',
                borderRadius: '6px',
                textAlign: 'center',
                fontSize: '0.85rem',
                color: '#e65100',
              }}
            >
              This book is currently borrowed. Check back later.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
