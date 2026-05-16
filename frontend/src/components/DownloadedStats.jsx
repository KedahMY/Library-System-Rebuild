// BiblioVault DownloadedStats component — librarian view of all books
// added via Open Library download or manual upload, with source breakdown.
// Props: { userId }

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = '';

function getToken() {
  return localStorage.getItem('token') || '';
}

function getAuthHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

export default function DownloadedStats({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/stats/downloaded`, {
        headers: getAuthHeaders(),
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load downloaded stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <div style={{ padding: '1rem', color: '#666' }}>Loading downloaded book stats...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', background: '#ffe0e0', color: '#8b0000', borderRadius: '6px' }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: '1rem', color: '#999' }}>No downloaded book data available.</div>;
  }

  const { books = [], summary = {}, by_source = {} } = data;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h2 style={{
        fontFamily: 'Cormorant Garamond, serif',
        color: '#2c1810',
        marginBottom: '1rem',
      }}>
        Downloaded Book Stats
      </h2>

      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ padding: '1rem', background: '#f8f6f0', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c9a84c' }}>{summary.total_books}</div>
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>Total Books</div>
        </div>
        <div style={{ padding: '1rem', background: '#f8f6f0', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c9a84c' }}>{summary.total_borrows}</div>
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>Total Borrows</div>
        </div>
        <div style={{ padding: '1rem', background: '#f8f6f0', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c9a84c' }}>{by_source.open_library || 0}</div>
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>From Open Library</div>
        </div>
        <div style={{ padding: '1rem', background: '#f8f6f0', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c9a84c' }}>{by_source.manual_upload || 0}</div>
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>Manual Uploads</div>
        </div>
      </div>

      {/* Source breakdown */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}>
        {Object.entries(by_source).map(([source, count]) => (
          <div key={source} style={{
            flex: 1,
            minWidth: '150px',
            padding: '0.75rem',
            background: source === 'open_library' ? '#e3f2fd' : '#fce4ec',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: source === 'open_library' ? '#1976d2' : '#c62828',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              fontWeight: 'bold',
            }}>
              {count}
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                {source === 'open_library' ? 'Open Library' : 'Manual Upload'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#666' }}>
                {source === 'open_library' ? 'Internet Archive' : 'Direct upload'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Books table */}
      <div style={{
        border: '1px solid #e0d8c8',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: '#f8f6f0',
          borderBottom: '1px solid #e0d8c8',
          fontWeight: 'bold',
          color: '#2c1810',
        }}>
          Downloaded Books
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Author</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Genre</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Source</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Borrows</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Avg Rating</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Reviews</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Downloaded</th>
              </tr>
            </thead>
            <tbody>
              {books.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                    No downloaded books yet
                  </td>
                </tr>
              ) : (
                books.map((book, idx) => (
                  <tr key={book.id} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{book.title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{book.author_name}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{book.genre}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '0.75rem',
                        background: book.source === 'open_library' ? '#e3f2fd' : '#fce4ec',
                        color: book.source === 'open_library' ? '#1565c0' : '#c62828',
                      }}>
                        {book.source === 'open_library' ? 'Open Library' : 'Manual'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{book.times_borrowed || 0}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                      {Number(book.avg_rating || 0).toFixed(1)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{book.review_count || 0}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: '#666' }}>
                      {book.downloaded_at ? new Date(book.downloaded_at).toLocaleDateString() : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
