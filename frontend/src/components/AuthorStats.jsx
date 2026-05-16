// BiblioVault AuthorStats component — author statistics dashboard with
// per-book table, summary cards, sentiment pie chart, and 30-day borrow trend.
// Uses recharts for visualizations. Props: { authorId }

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

const API_BASE = '';

function getToken() {
  return localStorage.getItem('token') || '';
}

function getAuthHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

const COLORS = ['#c9a84c', '#2c1810', '#5b8c5a', '#8b4513', '#4a7c9b', '#c93a3a'];
const SENTIMENT_COLORS = { positive: '#2e7d32', neutral: '#ffa000', negative: '#c62828', unclassified: '#9e9e9e' };

export default function AuthorStats({ authorId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!authorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/stats/author`, {
        headers: getAuthHeaders(),
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <div style={{ padding: '1rem', color: '#666' }}>Loading stats...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', background: '#ffe0e0', color: '#8b0000', borderRadius: '6px' }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: '1rem', color: '#999' }}>No stats available.</div>;
  }

  const { books = [], summary = {}, sentiment = [], trends = [] } = data;

  // Format sentiment data for pie chart
  const sentimentData = sentiment.map((s) => ({
    name: s.sentiment || 'unclassified',
    value: s.count,
  }));

  if (sentimentData.length === 0) {
    sentimentData.push({ name: 'unclassified', value: 0 });
  }

  // Format trend data
  const trendData = trends.map((t) => ({
    date: t.date,
    borrows: t.count,
  }));

  // Book bar chart data
  const bookChartData = books.map((b) => ({
    name: b.title.length > 15 ? b.title.substring(0, 15) + '...' : b.title,
    borrows: b.times_borrowed || 0,
    rating: b.avg_rating || 0,
    reviews: b.review_count || 0,
  }));

  const handleExportCSV = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/stats/author/export`, {
        headers: getAuthHeaders(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'author-stats.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h2 style={{
        fontFamily: 'Cormorant Garamond, serif',
        color: '#2c1810',
        marginBottom: '1rem',
      }}>
        Author Stats
      </h2>

      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {[
          { label: 'Total Books', value: summary.total_books },
          { label: 'Published', value: summary.published_books },
          { label: 'Total Borrows', value: summary.total_borrows },
          { label: 'Total Reviews', value: summary.total_reviews },
          { label: 'Avg Rating', value: summary.avg_rating ? Number(summary.avg_rating).toFixed(1) : 'N/A' },
        ].map((card) => (
          <div key={card.label} style={{
            padding: '1rem',
            background: '#f8f6f0',
            borderRadius: '8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c9a84c' }}>{card.value}</div>
            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Borrows bar chart */}
        <div style={{
          padding: '1rem',
          background: '#fff',
          border: '1px solid #e0d8c8',
          borderRadius: '8px',
        }}>
          <h4 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 1rem 0' }}>
            Books by Borrow Count
          </h4>
          {bookChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bookChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="borrows" fill="#c9a84c" name="Borrows" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>No data yet</div>
          )}
        </div>

        {/* Sentiment pie chart */}
        <div style={{
          padding: '1rem',
          background: '#fff',
          border: '1px solid #e0d8c8',
          borderRadius: '8px',
        }}>
          <h4 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 1rem 0' }}>
            Review Sentiment
          </h4>
          {sentimentData.some((s) => s.value > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={index} fill={SENTIMENT_COLORS[entry.name] || '#9e9e9e'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>No reviews yet</div>
          )}
        </div>
      </div>

      {/* 30-day borrow trend */}
      {trendData.length > 0 && (
        <div style={{
          padding: '1rem',
          background: '#fff',
          border: '1px solid #e0d8c8',
          borderRadius: '8px',
          marginBottom: '2rem',
        }}>
          <h4 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 1rem 0' }}>
            30-Day Borrow Trend
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="borrows" stroke="#c9a84c" strokeWidth={2} name="Borrows" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-book table */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0d8c8',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: '#f8f6f0',
          borderBottom: '1px solid #e0d8c8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h4 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: 0 }}>
            Per-Book Details
          </h4>
          <button
            onClick={handleExportCSV}
            style={{
              padding: '0.4rem 0.75rem',
              background: '#2c1810',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Export CSV
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Genre</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Borrows</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Avg Rating</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Reviews</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Reads (s)</th>
              </tr>
            </thead>
            <tbody>
              {books.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                    No books published yet
                  </td>
                </tr>
              ) : (
                books.map((book, idx) => (
                  <tr key={book.id} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{book.title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{book.genre}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: book.status === 'approved' ? '#e8f5e9' :
                          book.status === 'rejected' ? '#ffebee' : '#fff3e0',
                        color: book.status === 'approved' ? '#2e7d32' :
                          book.status === 'rejected' ? '#c62828' : '#e65100',
                      }}>
                        {book.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{book.times_borrowed || 0}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                      {Number(book.avg_rating || 0).toFixed(1)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{book.review_count || 0}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{book.total_seconds_read || 0}</td>
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
