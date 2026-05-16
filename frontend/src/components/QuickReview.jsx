import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

export default function QuickReview({ book }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!book || !book.id) {
      setLoading(false);
      setError('No book specified');
      return;
    }

    let cancelled = false;

    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');
        const res = await API.get(`/books/quick-review/${book.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        });
        if (!cancelled) {
          const url = URL.createObjectURL(res.data);
          setObjectUrl(url);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load preview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPreview();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!book) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#999', fontFamily: 'DM Sans, sans-serif' }}>
        No book selected for preview.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#666', fontFamily: 'DM Sans, sans-serif' }}>
        Loading preview...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ padding: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#999', fontFamily: 'DM Sans, sans-serif' }}>
        Preview not available.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
        Preview of &quot;{book.title}&quot; — first pages
      </div>
      <iframe
        src={objectUrl}
        title={`Preview of ${book.title}`}
        style={{
          width: '100%',
          height: 500,
          border: '1px solid #e0d5c7',
          borderRadius: 8,
          background: '#fff'
        }}
      />
    </div>
  );
}
