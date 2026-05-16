import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

export default function DownloadedStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await API.get('/stats/downloaded', {
        headers: { Authorization: `Bearer ${token}` }
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
    return <div style={{ padding: 24, color: '#666' }}>Loading downloaded stats...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ padding: 12, background: '#fdecea', color: '#c62828', borderRadius: 4 }}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { books, by_source, aggregate } = data;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: 24 }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, margin: '0 0 16px 0' }}>
        Downloaded Books Stats
      </h2>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ padding: 16, background: '#f5f0eb', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>{aggregate.total_downloaded}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Total Downloaded</div>
        </div>
        <div style={{ padding: 16, background: '#f5f0eb', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>{aggregate.total_borrows}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Total Borrows</div>
        </div>
      </div>

      {/* Source breakdown */}
      {by_source && by_source.length > 0 && (
        <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, margin: '0 0 12px 0' }}>
            Source Breakdown
          </h3>
          <div style={{ display: 'flex', gap: 16 }}>
            {by_source.map(s => (
              <div key={s.source} style={{ padding: 12, background: '#fff', borderRadius: 6, border: '1px solid #e0d5c7', flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{s.count}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {s.source === 'open_library' ? 'Open Library' : s.source === 'manual_upload' ? 'Manual Upload' : s.source}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Books table */}
      {books.length > 0 ? (
        <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7' }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, margin: '0 0 12px 0' }}>
            Downloaded Books
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>Title</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Author</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Genre</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Borrows</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Avg Rating</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Reviews</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Source</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Request</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b, i) => (
                  <tr key={b.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f0eb' }}>
                    <td style={{ padding: 8 }}>{b.title}</td>
                    <td style={{ padding: 8 }}>{b.author_name}</td>
                    <td style={{ padding: 8 }}>{b.genre}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, background: b.availability === 'available' ? '#e8f5e9' : '#fff3e0', color: b.availability === 'available' ? '#2e7d32' : '#e65100' }}>
                        {b.availability}
                      </span>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{b.times_borrowed}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{b.avg_rating.toFixed(1)}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{b.review_count}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, background: b.source === 'open_library' ? '#e3f2fd' : '#fce4ec', color: b.source === 'open_library' ? '#1565c0' : '#c62828' }}>
                        {b.source === 'open_library' ? 'OL' : 'Manual'}
                      </span>
                    </td>
                    <td style={{ padding: 8, fontSize: 12 }}>
                      {b.request_title ? `${b.request_title} by ${b.request_author}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          No downloaded books yet.
        </div>
      )}
    </div>
  );
}
