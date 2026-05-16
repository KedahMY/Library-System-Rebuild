// BiblioVault BookRequests component — student/staff book request submission
// form and request history list with duplicate detection.
// No props — uses the authenticated user context.

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = '';

function getToken() {
  return localStorage.getItem('token') || '';
}

function getAuthHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

export default function BookRequests() {
  // Form state
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Duplicate detection
  const [duplicate, setDuplicate] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Request history
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Genre options
  const GENRES = [
    'Fiction', 'Non-Fiction', 'Science Fiction', 'Fantasy', 'Mystery',
    'Romance', 'Thriller', 'Horror', 'Biography', 'History',
    'Science', 'Technology', 'Philosophy', 'Poetry', 'Drama', 'Comics',
  ];

  // Fetch user's requests
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/requests/mine`, {
        headers: getAuthHeaders(),
      });
      setRequests(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Duplicate check with debounce
  useEffect(() => {
    if (!title.trim()) {
      setDuplicate(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        const res = await axios.get(
          `${API_BASE}/api/requests/check-duplicate?title=${encodeURIComponent(title.trim())}&author=${encodeURIComponent(author.trim())}`,
          { headers: getAuthHeaders() }
        );
        setDuplicate(res.data);
      } catch (err) {
        setDuplicate(null);
      } finally {
        setCheckingDuplicate(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [title, author]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !author.trim() || !genre.trim()) {
      setSubmitError('Title, author, and genre are required');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      await axios.post(
        `${API_BASE}/api/requests`,
        { title: title.trim(), author: author.trim(), genre: genre.trim(), reason: reason.trim() || undefined },
        { headers: getAuthHeaders() }
      );
      setSubmitSuccess(true);
      setTitle('');
      setAuthor('');
      setGenre('');
      setReason('');
      setDuplicate(null);
      fetchRequests();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { background: '#fff3e0', color: '#e65100' },
      approved: { background: '#e8f5e9', color: '#2e7d32' },
      rejected: { background: '#ffebee', color: '#c62828' },
      fulfilled: { background: '#e3f2fd', color: '#1565c0' },
    };
    const s = styles[status] || { background: '#f5f5f5', color: '#666' };
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '3px',
        fontSize: '0.75rem',
        fontWeight: 'bold',
        ...s,
      }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h2 style={{
        fontFamily: 'Cormorant Garamond, serif',
        color: '#2c1810',
        marginBottom: '1rem',
      }}>
        Book Requests
      </h2>

      {/* Submit form */}
      <form onSubmit={handleSubmit} style={{
        padding: '1.25rem',
        border: '1px solid #e0d8c8',
        borderRadius: '8px',
        marginBottom: '2rem',
        background: '#f8f6f0',
      }}>
        <h3 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 1rem 0' }}>
          Request a New Book
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book title"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>
              Author *
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>
            Genre *
          </label>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Select a genre</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why would you like this book?"
            rows={2}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Duplicate warning */}
        {duplicate && duplicate.duplicate && (
          <div style={{
            padding: '0.5rem 0.75rem',
            background: '#fff3e0',
            color: '#e65100',
            borderRadius: '4px',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}>
            Note: A similar request already exists (status: {duplicate.status}).
          </div>
        )}
        {checkingDuplicate && (
          <div style={{ color: '#999', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            Checking for duplicates...
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !author.trim() || !genre.trim()}
            style={{
              padding: '0.6rem 1.5rem',
              background: submitting || !title.trim() || !author.trim() || !genre.trim() ? '#999' : '#2c1810',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: submitting || !title.trim() || !author.trim() || !genre.trim() ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
          {submitSuccess && (
            <span style={{ color: '#2e7d32', fontSize: '0.85rem' }}>
              Request submitted successfully!
            </span>
          )}
        </div>

        {submitError && (
          <div style={{ color: '#c62828', fontSize: '0.85rem', marginTop: '0.5rem' }}>{submitError}</div>
        )}
      </form>

      {/* Request history */}
      <div>
        <h3 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '0.75rem' }}>
          My Requests
        </h3>

        {loading ? (
          <div style={{ color: '#666' }}>Loading requests...</div>
        ) : error ? (
          <div style={{ padding: '0.75rem', background: '#ffe0e0', color: '#8b0000', borderRadius: '6px' }}>
            {error}
          </div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
            No requests yet. Use the form above to request a book.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Author</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Genre</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Priority</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req, idx) => (
                  <tr key={req.id} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{req.title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{req.author}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{req.genre}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{getStatusBadge(req.status)}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {req.priority === 'urgent' ? (
                        <span style={{ color: '#c62828', fontWeight: 'bold', fontSize: '0.8rem' }}>Urgent</span>
                      ) : (
                        <span style={{ color: '#666' }}>Normal</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: '#666' }}>
                      {req.created_at ? new Date(req.created_at).toLocaleDateString() : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
