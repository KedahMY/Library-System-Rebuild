import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

const STATUS_STYLES = {
  pending: { background: '#fff3e0', color: '#e65100' },
  approved: { background: '#e8f5e9', color: '#2e7d32' },
  rejected: { background: '#fdecea', color: '#c62828' },
  fulfilled: { background: '#e3f2fd', color: '#1565c0' }
};

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  fulfilled: 'Fulfilled'
};

export default function BookRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  const token = localStorage.getItem('token');

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequests(res.data.requests || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Debounced duplicate check
  useEffect(() => {
    if (!title || !author) {
      setDuplicate(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await API.get('/requests/check-duplicate', {
          params: { title, author },
          headers: { Authorization: `Bearer ${token}` }
        });
        setDuplicate(res.data);
      } catch (err) {
        setDuplicate(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [title, author, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || !author.trim() || !genre.trim()) {
      setError('Title, author, and genre are required');
      return;
    }

    try {
      setSubmitting(true);
      await API.post('/requests', {
        title: title.trim(),
        author: author.trim(),
        genre: genre.trim(),
        reason: reason.trim() || null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTitle('');
      setAuthor('');
      setGenre('');
      setReason('');
      setDuplicate(null);
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: 24 }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, margin: '0 0 16px 0' }}>
        Book Requests
      </h2>

      {error && (
        <div style={{ padding: 8, marginBottom: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
        </div>
      )}

      {/* Request form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 24, padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7' }}>
        <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, margin: '0 0 12px 0' }}>
          Request a New Book
        </h3>

        {duplicate && duplicate.duplicate && (
          <div style={{ padding: 8, marginBottom: 12, background: '#fff8e1', color: '#f57f17', borderRadius: 4, fontSize: 12, border: '1px solid #ffecb3' }}>
            You have already requested this book. Current status: {STATUS_LABELS[duplicate.status] || duplicate.status}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book title"
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Author *</label>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name"
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Genre *</label>
          <input
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="e.g., Fiction, Science, History"
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why would you like this book?"
            rows={2}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '8px 20px', background: '#1a1a2e', color: '#fff', border: 'none',
            borderRadius: 4, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1
          }}
        >
          {submitting ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>

      {/* Requests list */}
      <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, margin: '0 0 12px 0' }}>
        My Requests
      </h3>

      {loading ? (
        <div style={{ color: '#666' }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>You haven't made any requests yet.</div>
      ) : (
        <div>
          {requests.map((req) => (
            <div key={req.id} style={{ padding: 12, marginBottom: 8, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div>
                  <strong style={{ fontSize: 15 }}>{req.title}</strong>
                  <span style={{ fontSize: 13, color: '#666', marginLeft: 8 }}>by {req.author}</span>
                </div>
                <span style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  ...(STATUS_STYLES[req.status] || STATUS_STYLES.pending)
                }}>
                  {STATUS_LABELS[req.status] || req.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#666' }}>
                <span>Genre: {req.genre}</span>
                {req.priority === 'urgent' && (
                  <span style={{ color: '#c62828', fontWeight: 600 }}>Urgent</span>
                )}
                <span>{new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              {req.reason && (
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#666' }}>Reason: {req.reason}</p>
              )}
              {req.librarian_note && (
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#c62828' }}>Note: {req.librarian_note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
