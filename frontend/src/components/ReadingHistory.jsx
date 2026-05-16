// BiblioVault ReadingHistory component — student/staff reading history with
// filters, insights, achievements, and export functionality.

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_BASE = '';

function getToken() {
  return localStorage.getItem('token') || '';
}

function getAuthHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

const COLORS = ['#c9a84c', '#2c1810', '#5b8c5a', '#8b4513', '#4a7c9b', '#c93a3a', '#7b68ee', '#cd853f'];

export default function ReadingHistory() {
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'insights' | 'achievements'

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [filters, setFilters] = useState({ search: '', genre: '', status: '', dateFrom: '', dateTo: '' });

  // Insights state
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Achievements state
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.genre) params.append('genre', filters.genre);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('date_from', filters.dateFrom);
      if (filters.dateTo) params.append('date_to', filters.dateTo);
      const res = await axios.get(`${API_BASE}/api/history?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      setHistory(res.data || []);
    } catch (err) {
      setHistoryError(err.response?.data?.error || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    if (activeTab === 'insights' && !insights) {
      fetchInsights();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'achievements' && !achievements) {
      fetchAchievements();
    }
  }, [activeTab]);

  const fetchInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/history/insights`, {
        headers: getAuthHeaders(),
      });
      setInsights(res.data);
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setInsightsLoading(false);
    }
  };

  const fetchAchievements = async () => {
    setAchievementsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/history/achievements`, {
        headers: getAuthHeaders(),
      });
      setAchievements(res.data);
    } catch (err) {
      console.error('Failed to load achievements:', err);
    } finally {
      setAchievementsLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const res = await axios.get(`${API_BASE}/api/history/export?format=${format}`, {
        headers: getAuthHeaders(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reading-history.${format}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(`Export ${format} failed:`, err);
    }
  };

  const getStatusBadge = (status, dueDate) => {
    const now = new Date().toISOString();
    if (status === 'active' && dueDate < now) {
      return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold', background: '#ffebee', color: '#c62828' }}>Overdue</span>;
    }
    const styles = {
      active: { background: '#e8f5e9', color: '#2e7d32' },
      returned: { background: '#e3f2fd', color: '#1565c0' },
    };
    const s = styles[status] || { background: '#f5f5f5', color: '#666' };
    return (
      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold', ...s }}>
        {status === 'active' && dueDate >= now ? 'Active' : status}
      </span>
    );
  };

  const tabs = [
    { id: 'history', label: 'History' },
    { id: 'insights', label: 'Insights' },
    { id: 'achievements', label: 'Achievements' },
  ];

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
        Reading History
      </h2>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #e0d8c8', paddingBottom: '0.5rem' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.5rem 1.25rem', border: 'none', borderRadius: '4px 4px 0 0',
              background: activeTab === tab.id ? '#2c1810' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#666',
              cursor: 'pointer', fontSize: '0.9rem', fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              fontFamily: 'DM Sans, sans-serif',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* === HISTORY TAB === */}
      {activeTab === 'history' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search by title or author..." value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem', flex: 1, minWidth: '150px' }} />
            <input type="text" placeholder="Genre filter" value={filters.genre}
              onChange={(e) => setFilters((f) => ({ ...f, genre: e.target.value }))}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem', width: '120px' }} />
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="returned">Returned</option>
              <option value="overdue">Overdue</option>
            </select>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              style={{ padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }} />
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              style={{ padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => handleExport('csv')}
                style={{ padding: '0.4rem 0.75rem', background: '#2c1810', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                CSV
              </button>
              <button onClick={() => handleExport('pdf')}
                style={{ padding: '0.4rem 0.75rem', background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                PDF
              </button>
            </div>
          </div>

          {/* History list */}
          {historyLoading ? (
            <div style={{ color: '#666' }}>Loading history...</div>
          ) : historyError ? (
            <div style={{ padding: '0.75rem', background: '#ffe0e0', color: '#8b0000', borderRadius: '6px' }}>{historyError}</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No reading history yet. Borrow a book to get started!</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Author</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Borrow Date</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Due Date</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Return Date</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, idx) => (
                    <tr key={row.id || idx} style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{row.title || row.book_title}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{row.author_name}</td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                        {row.borrow_date ? new Date(row.borrow_date).toLocaleDateString() : ''}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                        {row.due_date ? new Date(row.due_date).toLocaleDateString() : ''}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                        {row.return_date ? new Date(row.return_date).toLocaleDateString() : '-'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        {getStatusBadge(row.status, row.due_date)}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                        {row.current_page && row.total_pages
                          ? `${Math.round((row.current_page / row.total_pages) * 100)}%`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* === INSIGHTS TAB === */}
      {activeTab === 'insights' && (
        <div>
          {insightsLoading ? (
            <div style={{ color: '#666' }}>Loading insights...</div>
          ) : !insights ? (
            <div style={{ color: '#999' }}>No insights available yet.</div>
          ) : (
            <div>
              {/* Summary cards */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem', marginBottom: '1.5rem',
              }}>
                {[
                  { label: 'Total Borrows', value: insights.total_borrows || 0 },
                  { label: 'Avg Duration', value: insights.avg_duration ? `${insights.avg_duration} days` : 'N/A' },
                  { label: 'Unique Books', value: insights.unique_books || 0 },
                  { label: 'Total Read Time', value: insights.total_seconds_read ? `${Math.round(insights.total_seconds_read / 60)} min` : '0 min' },
                ].map((card) => (
                  <div key={card.label} style={{ padding: '1rem', background: '#f8f6f0', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c9a84c' }}>{card.value}</div>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Genre breakdown pie chart */}
              {insights.byGenre && insights.byGenre.length > 0 && (
                <div style={{ padding: '1rem', border: '1px solid #e0d8c8', borderRadius: '8px', marginBottom: '1.5rem' }}>
                  <h4 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 1rem 0' }}>
                    Books by Genre
                  </h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={insights.byGenre} cx="50%" cy="50%" outerRadius={80} dataKey="count" label={({ genre, count }) => `${genre}: ${count}`}>
                        {insights.byGenre.map((entry, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Monthly trend line chart */}
              {insights.byMonth && insights.byMonth.length > 0 && (
                <div style={{ padding: '1rem', border: '1px solid #e0d8c8', borderRadius: '8px' }}>
                  <h4 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 1rem 0' }}>
                    Monthly Borrow Trend
                  </h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={insights.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#c9a84c" strokeWidth={2} name="Borrows" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === ACHIEVEMENTS TAB === */}
      {activeTab === 'achievements' && (
        <div>
          {achievementsLoading ? (
            <div style={{ color: '#666' }}>Loading achievements...</div>
          ) : !achievements || achievements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</div>
              <div style={{ color: '#999', fontSize: '1rem' }}>No achievements yet. Keep reading to unlock badges!</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {achievements.map((achievement, idx) => (
                <div key={idx} style={{
                  padding: '1.5rem 1rem',
                  border: `2px solid ${achievement.unlocked ? '#c9a84c' : '#e0d8c8'}`,
                  borderRadius: '8px',
                  textAlign: 'center',
                  opacity: achievement.unlocked ? 1 : 0.5,
                  background: achievement.unlocked ? '#fffbee' : '#f8f6f0',
                }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                    {achievement.icon || '📚'}
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#2c1810' }}>
                    {achievement.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                    {achievement.description}
                  </div>
                  {achievement.unlocked && achievement.unlocked_at && (
                    <div style={{ fontSize: '0.75rem', color: '#c9a84c', marginTop: '6px' }}>
                      Unlocked: {new Date(achievement.unlocked_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
