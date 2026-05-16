import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = axios.create({ baseURL: '/api' });

export default function BookModal({ book: propBook, onClose, onBorrowSuccess, user: propUser }) {
  const { user: ctxUser } = useAuth();
  const user = propUser || ctxUser;
  const book = propBook;

  const [duration, setDuration] = useState(7);
  const [borrowing, setBorrowing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const overlayRef = useRef(null);

  // Keyboard handler for Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === overlayRef.current && onClose) onClose();
  }, [onClose]);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + duration);

  const handleBorrow = async () => {
    if (!book || !book.id) return;
    try {
      setBorrowing(true);
      setError(null);
      const token = localStorage.getItem('token');
      const res = await API.post(`/books/${book.id}/borrow`, {
        duration_days: duration
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(res.data);
      if (onBorrowSuccess) onBorrowSuccess(res.data);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || 'Failed to borrow book';
      if (status === 400) {
        setError(msg);
      } else if (status === 401) {
        window.location.href = '/login';
      } else if (status === 403) {
        setError('Permission denied');
      } else {
        setError(msg);
      }
    } finally {
      setBorrowing(false);
    }
  };

  if (!book) {
    return null;
  }

  const coverUrl = book.cover_url || book.cover_image || (book.file_name ? `/uploads/${book.file_name.replace(/\.[^.]+$/, '.jpg')}` : null);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%',
        maxHeight: '90vh', overflow: 'auto', position: 'relative',
        fontFamily: 'DM Sans, sans-serif'
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'none', border: 'none', fontSize: 22,
            cursor: 'pointer', color: '#999', zIndex: 1,
            width: 32, height: 32, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f0f0f0'; e.currentTarget.style.color = '#333'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#999'; }}
          aria-label="Close"
        >
          &times;
        </button>

        {/* Cover image */}
        {coverUrl && (
          <div style={{ width: '100%', height: 240, overflow: 'hidden', borderRadius: '12px 12px 0 0', background: '#f5f0eb' }}>
            <img
              src={coverUrl}
              alt={book.title}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}

        <div style={{ padding: 24 }}>
          {/* Title & author */}
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, margin: '0 0 4px 0', color: '#1a1a2e' }}>
            {book.title}
          </h2>
          {book.author && (
            <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#666' }}>
              by {book.author}
            </p>
          )}

          {/* Genre & status tags */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {book.genre && (
              <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, background: '#f5f0eb', color: '#666', fontWeight: 600 }}>
                {book.genre}
              </span>
            )}
            <span style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
              background: book.availability === 'available' ? '#e8f5e9' : '#fdecea',
              color: book.availability === 'available' ? '#2e7d32' : '#c62828'
            }}>
              {book.availability === 'available' ? 'Available' : 'Borrowed'}
            </span>
            {book.rating > 0 && (
              <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, background: '#fff8e1', color: '#f57f17', fontWeight: 600 }}>
                {'★'.repeat(Math.round(book.rating))} {book.rating.toFixed(1)}
              </span>
            )}
          </div>

          {/* Description */}
          {book.description && (
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#444', margin: '0 0 16px 0' }}>
              {book.description}
            </p>
          )}

          {/* Error message */}
          {error && (
            <div style={{
              padding: '8px 12px', marginBottom: 12, background: '#fdecea',
              color: '#c62828', borderRadius: 4, fontSize: 13
            }}>
              {error}
              <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: 14 }}>x</button>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div style={{
              padding: 12, marginBottom: 12, background: '#e8f5e9',
              color: '#2e7d32', borderRadius: 4, fontSize: 13
            }}>
              Successfully borrowed! Due date: {new Date(success.due_date || dueDate).toLocaleDateString()}
            </div>
          )}

          {/* Borrow section */}
          {!success && (
            <div style={{ borderTop: '1px solid #e0d5c7', paddingTop: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Borrow Duration: {duration} day{duration !== 1 ? 's' : ''}
                </label>
                <input
                  type="range"
                  min={1}
                  max={14}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#999' }}>
                  <span>1 day</span>
                  <span>Due: {dueDate.toLocaleDateString()}</span>
                  <span>14 days</span>
                </div>
              </div>

              <button
                onClick={handleBorrow}
                disabled={borrowing || book.availability !== 'available'}
                style={{
                  width: '100%', padding: '10px 20px',
                  background: book.availability === 'available' ? '#1a1a2e' : '#999',
                  color: '#fff', border: 'none', borderRadius: 6,
                  cursor: (borrowing || book.availability !== 'available') ? 'default' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                  opacity: borrowing ? 0.6 : 1
                }}
              >
                {borrowing ? 'Borrowing...' : book.availability === 'available' ? 'Borrow Now' : 'Currently Unavailable'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
