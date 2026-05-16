import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const API = axios.create({ baseURL: '/api' });
const COLORS = ['#2e7d32', '#c62828', '#666'];
const PIE_COLORS = ['#1a1a2e', '#d4a017', '#4a6741', '#8b4513', '#2c3e50'];

export default function AuthorStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await API.get('/stats/author', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await API.get('/stats/author/export', {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'author-stats.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export stats');
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: '#666' }}>Loading stats...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ padding: 12, background: '#fdecea', color: '#c62828', borderRadius: 4 }}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { books, summary, sentiment, thirty_day_trend } = data;

  const barData = books.map(b => ({
    name: b.title.length > 20 ? b.title.substring(0, 20) + '...' : b.title,
    borrows: b.times_borrowed,
    reviews: b.review_count,
    rating: b.avg_rating
  }));

  const sentimentData = [
    { name: 'Positive', value: sentiment.positive },
    { name: 'Negative', value: sentiment.negative },
    { name: 'Neutral', value: sentiment.neutral }
  ].filter(s => s.value > 0);

  const trendData = thirty_day_trend.map(t => ({
    date: t.date,
    borrows: t.count
  }));

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, margin: 0 }}>
          Author Stats
        </h2>
        <button
          onClick={handleExport}
          style={{ padding: '6px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
        >
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Books', value: summary.total_books },
          { label: 'Published', value: summary.published_books },
          { label: 'Total Borrows', value: summary.total_borrows },
          { label: 'Total Reviews', value: summary.total_reviews },
          { label: 'Overall Rating', value: summary.overall_rating.toFixed(1) }
        ].map(card => (
          <div key={card.label} style={{ padding: 16, background: '#f5f0eb', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>{card.value}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{card.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Borrows per book chart */}
        <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7' }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, margin: '0 0 12px 0' }}>
            Borrows per Book
          </h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="borrows" fill="#1a1a2e" name="Borrows" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>No data available</div>
          )}
        </div>

        {/* Sentiment pie chart */}
        <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7' }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, margin: '0 0 12px 0' }}>
            Review Sentiment
          </h3>
          {sentimentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>No reviews yet</div>
          )}
        </div>
      </div>

      {/* 30-day trend */}
      {trendData.length > 0 && (
        <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, margin: '0 0 12px 0' }}>
            30-Day Borrow Trend
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="borrows" fill="#d4a017" name="Borrows" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-book table */}
      {books.length > 0 && (
        <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7' }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, margin: '0 0 12px 0' }}>
            Per-Book Details
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>Title</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Genre</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Borrows</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Avg Rating</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Reviews</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Readers</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b, i) => (
                  <tr key={b.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f0eb' }}>
                    <td style={{ padding: 8 }}>{b.title}</td>
                    <td style={{ padding: 8 }}>{b.genre}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, background: b.status === 'approved' ? '#e8f5e9' : '#fff3e0', color: b.status === 'approved' ? '#2e7d32' : '#e65100' }}>
                        {b.status}
                      </span>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{b.times_borrowed}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{b.avg_rating.toFixed(1)}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{b.review_count}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{b.read_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
