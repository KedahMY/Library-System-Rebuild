import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

const STATUS_STYLES = {
  active: { background: '#e3f2fd', color: '#1565c0' },
  returned: { background: '#e8f5e9', color: '#2e7d32' },
  overdue: { background: '#fdecea', color: '#c62828' },
  lost: { background: '#fdecea', color: '#c62828' }
};

const ACHIEVEMENT_ICONS = {
  first_book: '📖',
  ten_books: '📚',
  fifty_books: '🏆',
  hundred_books: '👑',
  streak_7: '🔥',
  streak_30: '💪',
  genre_explorer: '🌍'
};

export default function ReadingHistory() {
  const [activeTab, setActiveTab] = useState('list');

  // History list
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Expanded rows
  const [expandedId, setExpandedId] = useState(null);

  // Insights
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Achievements
  const [achievements, setAchievements] = useState([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  const token = localStorage.getItem('token');

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (filterGenre) params.genre = filterGenre;
      if (filterStatus) params.status = filterStatus;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await API.get('/history', {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistory(res.data.history || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [search, filterGenre, filterStatus, dateFrom, dateTo, token]);

  useEffect(() => {
    if (activeTab === 'list') fetchHistory();
  }, [fetchHistory, activeTab]);

  const fetchInsights = useCallback(async () => {
    try {
      setInsightsLoading(true);
      const res = await API.get('/history/insights', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInsights(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load insights');
    } finally {
      setInsightsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'insights') fetchInsights();
  }, [fetchInsights, activeTab]);

  const fetchAchievements = useCallback(async () => {
    try {
      setAchievementsLoading(true);
      const res = await API.get('/history/achievements', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAchievements(res.data.achievements || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load achievements');
    } finally {
      setAchievementsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'achievements') fetchAchievements();
  }, [fetchAchievements, activeTab]);

  const handleExport = async (format) => {
    try {
      const res = await API.get(`/history/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reading-history.${format}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export history');
    }
  };

  const TAB_STYLE = (active) => ({
    padding: '8px 18px', border: 'none',
    background: active ? '#1a1a2e' : '#f0f0f0',
    color: active ? '#fff' : '#666', cursor: 'pointer',
    borderRadius: '4px 4px 0 0', fontSize: 13, fontWeight: active ? 600 : 400
  });

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {error && (
        <div style={{
          padding: '8px 12px', marginBottom: 12, background: '#fdecea',
          color: '#c62828', borderRadius: 4, fontSize: 13
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
        <button onClick={() => setActiveTab('list')} style={TAB_STYLE(activeTab === 'list')}>
          Reading History
        </button>
        <button onClick={() => setActiveTab('insights')} style={TAB_STYLE(activeTab === 'insights')}>
          Insights
        </button>
        <button onClick={() => setActiveTab('achievements')} style={TAB_STYLE(activeTab === 'achievements')}>
          Achievements
        </button>
      </div>

      {/* ========== LIST TAB ========== */}
      {activeTab === 'list' && (
        <div style={{
          padding: 16, background: '#fafafa',
          border: '1px solid #e0d5c7', borderRadius: '0 8px 8px 8px'
        }}>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or author..."
              style={{ flex: 1, minWidth: 160, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
            />
            <select value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}>
              <option value="">All Genres</option>
              <option value="fiction">Fiction</option>
              <option value="non-fiction">Non-Fiction</option>
              <option value="science">Science</option>
              <option value="history">History</option>
              <option value="technology">Technology</option>
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="returned">Returned</option>
              <option value="overdue">Overdue</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
              title="From date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
              title="To date"
            />
          </div>

          {/* Export buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => handleExport('csv')}
              style={{ padding: '4px 12px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport('pdf')}
              style={{ padding: '4px 12px', background: '#4a6741', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              Export PDF
            </button>
          </div>

          {/* History list */}
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading history...</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              No reading history yet
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {history.map((entry) => {
                const statusStyle = STATUS_STYLES[entry.status] || STATUS_STYLES.active;
                const progress = entry.total_pages > 0
                  ? Math.round((entry.current_page / entry.total_pages) * 100)
                  : 0;

                return (
                  <div key={entry.id} style={{
                    background: '#fff', borderRadius: 8, border: '1px solid #e0d5c7',
                    overflow: 'hidden'
                  }}>
                    {/* Summary row */}
                    <div
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      style={{ padding: 12, cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <strong style={{ fontSize: 14 }}>{entry.title}</strong>
                          <span style={{ fontSize: 13, color: '#666', marginLeft: 8 }}>by {entry.author}</span>
                        </div>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          ...statusStyle
                        }}>
                          {entry.status}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#666', marginBottom: 6 }}>
                        <span>{entry.genre}</span>
                        <span>Borrowed: {new Date(entry.borrow_date).toLocaleDateString()}</span>
                        {entry.return_date && (
                          <span>Returned: {new Date(entry.return_date).toLocaleDateString()}</span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#eee', borderRadius: 3 }}>
                          <div style={{
                            width: `${progress}%`, height: 6,
                            background: progress === 100 ? '#2e7d32' : '#d4a017',
                            borderRadius: 3, transition: 'width 0.3s'
                          }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>
                          {entry.current_page || 0}/{entry.total_pages || '?'} pages ({progress}%)
                        </span>
                        <span style={{ fontSize: 18, color: '#999' }}>
                          {expandedId === entry.id ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expandedId === entry.id && (
                      <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #e0d5c7' }}>
                        {entry.description && (
                          <p style={{ fontSize: 13, color: '#666', margin: '8px 0' }}>{entry.description}</p>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#666' }}>
                          <div>Status: <strong>{entry.status}</strong></div>
                          <div>Genre: <strong>{entry.genre}</strong></div>
                          <div>Borrow Date: <strong>{new Date(entry.borrow_date).toLocaleDateString()}</strong></div>
                          <div>Due Date: <strong>{entry.due_date ? new Date(entry.due_date).toLocaleDateString() : '-'}</strong></div>
                          {entry.return_date && <div>Return Date: <strong>{new Date(entry.return_date).toLocaleDateString()}</strong></div>}
                          <div>Pages Read: <strong>{entry.current_page || 0}/{entry.total_pages || '?'}</strong></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========== INSIGHTS TAB ========== */}
      {activeTab === 'insights' && (
        <div style={{
          padding: 16, background: '#fafafa',
          border: '1px solid #e0d5c7', borderRadius: '0 8px 8px 8px'
        }}>
          {insightsLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading insights...</div>
          ) : !insights ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              No insights available yet.
            </div>
          ) : (
            <div>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total Books', value: insights.total_books },
                  { label: 'Total Pages', value: insights.total_pages },
                  { label: 'Current Reads', value: insights.current_reads },
                  { label: 'Avg Rating', value: insights.avg_rating?.toFixed(1) || '-' }
                ].map(card => (
                  <div key={card.label} style={{ padding: 14, background: '#fff', borderRadius: 8, border: '1px solid #e0d5c7', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>{card.value ?? '-'}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Genre breakdown */}
              {insights.genre_breakdown && insights.genre_breakdown.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 15, margin: '0 0 8px 0' }}>Genre Breakdown</h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {insights.genre_breakdown.map((g, i) => (
                      <div key={i} style={{
                        padding: '8px 14px', background: '#fff', borderRadius: 6,
                        border: '1px solid #e0d5c7', textAlign: 'center', flex: 1, minWidth: 80
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{g.count}</div>
                        <div style={{ fontSize: 11, color: '#666' }}>{g.genre}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly trend */}
              {insights.monthly_trend && insights.monthly_trend.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 15, margin: '0 0 8px 0' }}>Monthly Reading Trend</h4>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 80 }}>
                    {insights.monthly_trend.map((m, i) => {
                      const maxVal = Math.max(...insights.monthly_trend.map(x => x.count), 1);
                      const heightPct = (m.count / maxVal) * 100;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{
                            width: '100%', background: '#1a1a2e', borderRadius: '2px 2px 0 0',
                            height: `${Math.max(4, heightPct * 0.7)}px`,
                            minHeight: 4
                          }} />
                          <span style={{ fontSize: 8, color: '#666', marginTop: 4, transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                            {m.month}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top genres */}
              {insights.top_genres && insights.top_genres.length > 0 && (
                <div>
                  <h4 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 15, margin: '0 0 8px 0' }}>Favorite Genres</h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {insights.top_genres.map((g, i) => (
                      <div key={i} style={{
                        padding: '6px 12px', borderRadius: 20,
                        background: i === 0 ? '#d4a017' : i === 1 ? '#C0C0C0' : i === 2 ? '#cd7f32' : '#f5f0eb',
                        color: i <= 2 ? '#fff' : '#666', fontSize: 12, fontWeight: 600
                      }}>
                        #{i + 1} {g.genre} ({g.count})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== ACHIEVEMENTS TAB ========== */}
      {activeTab === 'achievements' && (
        <div style={{
          padding: 16, background: '#fafafa',
          border: '1px solid #e0d5c7', borderRadius: '0 8px 8px 8px'
        }}>
          {achievementsLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading achievements...</div>
          ) : achievements.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              No achievements yet. Start reading to earn badges!
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {achievements.map((ach, i) => {
                const isEarned = ach.earned || ach.unlocked;
                const icon = ACHIEVEMENT_ICONS[ach.badge_id] || '🏅';
                return (
                  <div key={ach.badge_id || i} style={{
                    padding: 16, borderRadius: 10, textAlign: 'center',
                    background: isEarned ? '#fff' : '#f5f5f5',
                    border: isEarned ? '2px solid #d4a017' : '2px dashed #ddd',
                    opacity: isEarned ? 1 : 0.6,
                    transition: 'all 0.2s'
                  }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isEarned ? '#1a1a2e' : '#999', marginBottom: 4 }}>
                      {ach.name || ach.badge_id}
                    </div>
                    {ach.description && (
                      <div style={{ fontSize: 11, color: '#666' }}>{ach.description}</div>
                    )}
                    {isEarned && (
                      <div style={{
                        marginTop: 6, display: 'inline-block', padding: '2px 8px',
                        borderRadius: 10, background: '#e8f5e9', color: '#2e7d32',
                        fontSize: 10, fontWeight: 600
                      }}>
                        Earned
                      </div>
                    )}
                    {ach.earned_date && (
                      <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                        {new Date(ach.earned_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
