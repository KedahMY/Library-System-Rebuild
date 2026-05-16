// BiblioVault ManageRequests component — librarian's book request management
// with Open Library search, manual upload fulfillment, priority setting, rejection,
// and analytics view.

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = '';

function getToken() {
  return localStorage.getItem('token') || '';
}

function getAuthHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

export default function ManageRequests() {
  // Request list state
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' });

  // OL search state
  const [searchingRequest, setSearchingRequest] = useState(null);
  const [olResults, setOlResults] = useState(null);
  const [olLoading, setOlLoading] = useState(false);
  const [olError, setOlError] = useState(null);

  // Download state
  const [downloading, setDownloading] = useState(null);

  // Reject state
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  // Analytics state
  const [analytics, setAnalytics] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Message
  const [message, setMessage] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.search) params.append('search', filters.search);
      const res = await axios.get(`${API_BASE}/api/requests?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      setRequests(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const fetchAnalytics = async () => {
    setShowAnalytics(!showAnalytics);
    if (!analytics) {
      try {
        const res = await axios.get(`${API_BASE}/api/requests/analytics`, {
          headers: getAuthHeaders(),
        });
        setAnalytics(res.data);
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to load analytics' });
      }
    }
  };

  // Open Library search
  const handleOlSearch = async (requestId) => {
    setSearchingRequest(requestId);
    setOlResults(null);
    setOlError(null);
    setOlLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE}/api/requests/${requestId}/openlibrary-search`,
        { headers: getAuthHeaders() }
      );
      setOlResults(res.data);
    } catch (err) {
      setOlError(err.response?.data?.error || 'Open Library search failed');
    } finally {
      setOlLoading(false);
    }
  };

  // Download from IA
  const handleDownload = async (requestId, iaId, olTitle, olAuthor, coverId, generateSummary) => {
    setDownloading(requestId);
    setMessage(null);
    try {
      const res = await axios.post(
        `${API_BASE}/api/requests/${requestId}/download`,
        {
          ia_id: iaId,
          ol_title: olTitle,
          ol_author: olAuthor,
          cover_id: coverId || null,
          generate_summary: generateSummary || false,
        },
        { headers: getAuthHeaders() }
      );
      setMessage({ type: 'success', text: `Book downloaded and request fulfilled! (Book ID: ${res.data.book_id})` });
      setOlResults(null);
      setSearchingRequest(null);
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Download failed' });
    } finally {
      setDownloading(null);
    }
  };

  // Set priority
  const handlePriority = async (requestId, priority) => {
    try {
      await axios.patch(
        `${API_BASE}/api/requests/${requestId}/priority`,
        { priority },
        { headers: getAuthHeaders() }
      );
      setMessage({ type: 'success', text: `Priority set to ${priority}` });
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update priority' });
    }
  };

  // Reject request
  const handleReject = async (requestId) => {
    try {
      await axios.patch(
        `${API_BASE}/api/requests/${requestId}/reject`,
        { note: rejectNote || undefined },
        { headers: getAuthHeaders() }
      );
      setMessage({ type: 'success', text: 'Request rejected' });
      setRejectId(null);
      setRejectNote('');
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reject' });
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
        display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
        fontSize: '0.75rem', fontWeight: 'bold', ...s,
      }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
        Manage Book Requests
      </h2>

      {message && (
        <div style={{
          padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px',
          background: message.type === 'success' ? '#e8f5e9' : '#ffe0e0',
          color: message.type === 'success' ? '#2e7d32' : '#8b0000',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search title or author..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          style={{
            padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem', flex: 1, minWidth: '200px',
          }}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="fulfilled">Fulfilled</option>
        </select>
        <select
          value={filters.priority}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
          style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="normal">Normal</option>
        </select>
        <button
          onClick={fetchAnalytics}
          style={{
            padding: '0.4rem 0.75rem', background: '#2c1810', color: '#fff',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
          }}
        >
          {showAnalytics ? 'Hide Analytics' : 'Analytics'}
        </button>
      </div>

      {/* Analytics panel */}
      {showAnalytics && analytics && (
        <div style={{
          padding: '1rem', marginBottom: '1rem', border: '1px solid #e0d8c8',
          borderRadius: '8px', background: '#f8f6f0',
        }}>
          <h4 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 0.75rem 0' }}>
            Request Analytics
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>By Status:</strong>
              {analytics.byStatus.map((s) => (
                <div key={s.status} style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  {s.status}: {s.count}
                </div>
              ))}
            </div>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Top Genres:</strong>
              {analytics.byGenre.slice(0, 5).map((g) => (
                <div key={g.genre} style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  {g.genre}: {g.count}
                </div>
              ))}
            </div>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Top Authors:</strong>
              {analytics.byAuthor.slice(0, 5).map((a) => (
                <div key={a.author} style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  {a.author}: {a.count}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Request list */}
      {loading ? (
        <div style={{ color: '#666' }}>Loading requests...</div>
      ) : error ? (
        <div style={{ padding: '0.75rem', background: '#ffe0e0', color: '#8b0000', borderRadius: '6px' }}>{error}</div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No requests match the filters.</div>
      ) : (
        requests.map((req) => (
          <div key={req.id} style={{
            padding: '1rem', marginBottom: '0.75rem',
            border: '1px solid #e0d8c8', borderRadius: '8px',
            background: req.priority === 'urgent' ? '#fff8f0' : '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <strong>{req.title}</strong> by {req.author}
                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
                  Genre: {req.genre} | Requested by: {req.requester_name || req.requester_username}
                  {req.created_at && <> | {new Date(req.created_at).toLocaleDateString()}</>}
                </div>
                {req.reason && (
                  <div style={{ fontSize: '0.8rem', color: '#555', marginTop: '4px', fontStyle: 'italic' }}>
                    "{req.reason}"
                  </div>
                )}
                {req.librarian_note && (
                  <div style={{ fontSize: '0.8rem', color: '#c62828', marginTop: '4px' }}>
                    Note: {req.librarian_note}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {getStatusBadge(req.status)}
                {req.priority === 'urgent' && (
                  <span style={{ color: '#c62828', fontWeight: 'bold', fontSize: '0.75rem' }}>URGENT</span>
                )}
              </div>
            </div>

            {/* Actions for pending requests */}
            {req.status === 'pending' && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Priority toggle */}
                <button
                  onClick={() => handlePriority(req.id, req.priority === 'urgent' ? 'normal' : 'urgent')}
                  style={{
                    padding: '0.35rem 0.75rem', fontSize: '0.8rem',
                    background: req.priority === 'urgent' ? '#fff3e0' : '#fff',
                    border: '1px solid #e65100', borderRadius: '4px',
                    color: '#e65100', cursor: 'pointer',
                  }}
                >
                  {req.priority === 'urgent' ? 'Mark Normal' : 'Mark Urgent'}
                </button>

                {/* OL Search */}
                <button
                  onClick={() => handleOlSearch(req.id)}
                  style={{
                    padding: '0.35rem 0.75rem', fontSize: '0.8rem',
                    background: '#1565c0', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer',
                  }}
                >
                  Search Open Library
                </button>

                {/* Reject */}
                {rejectId === req.id ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Rejection note (optional)"
                      style={{ padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.8rem' }}
                    />
                    <button
                      onClick={() => handleReject(req.id)}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => { setRejectId(null); setRejectNote(''); }}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: '#666', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRejectId(req.id)}
                    style={{
                      padding: '0.35rem 0.75rem', fontSize: '0.8rem',
                      background: '#fff', border: '1px solid #c62828', borderRadius: '4px',
                      color: '#c62828', cursor: 'pointer',
                    }}
                  >
                    Reject
                  </button>
                )}
              </div>
            )}

            {/* OL Search results */}
            {searchingRequest === req.id && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f5f5f5', borderRadius: '6px' }}>
                {olLoading ? (
                  <div style={{ color: '#666', fontSize: '0.85rem' }}>Searching Open Library...</div>
                ) : olError ? (
                  <div style={{ color: '#c62828', fontSize: '0.85rem' }}>{olError}</div>
                ) : olResults ? (
                  <div>
                    {/* Exact matches */}
                    {olResults.exact && olResults.exact.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <strong style={{ fontSize: '0.85rem' }}>Exact Matches:</strong>
                        {olResults.exact.map((item, idx) => (
                          <div key={idx} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.5rem', marginTop: '0.5rem', background: '#fff', borderRadius: '4px',
                            border: '1px solid #e0d8c8',
                          }}>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.title}</div>
                              <div style={{ fontSize: '0.8rem', color: '#666' }}>{item.author} ({item.year || 'N/A'})</div>
                              {item.ia_identifier && (
                                <div style={{ fontSize: '0.75rem', color: '#1565c0' }}>IA: {item.ia_identifier}</div>
                              )}
                            </div>
                            {item.ia_identifier && (
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <input type="checkbox" defaultChecked={false} id={`gen-summary-${req.id}-${idx}`} />
                                  Gen summary
                                </label>
                                <button
                                  onClick={() => {
                                    const genSummary = document.getElementById(`gen-summary-${req.id}-${idx}`)?.checked || false;
                                    handleDownload(req.id, item.ia_identifier, item.title, item.author, item.cover_id, genSummary);
                                  }}
                                  disabled={downloading === req.id}
                                  style={{
                                    padding: '0.35rem 0.75rem', fontSize: '0.8rem',
                                    background: downloading === req.id ? '#999' : '#2c1810',
                                    color: '#fff', border: 'none', borderRadius: '4px', cursor: downloading === req.id ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {downloading === req.id ? 'Downloading...' : 'Download'}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Alternatives */}
                    {olResults.alternatives && olResults.alternatives.length > 0 && (
                      <div>
                        <strong style={{ fontSize: '0.85rem' }}>Alternatives:</strong>
                        {olResults.alternatives.map((item, idx) => (
                          <div key={idx} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.5rem', marginTop: '0.5rem', background: '#fff', borderRadius: '4px',
                            border: '1px solid #e0d8c8',
                          }}>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.title}</div>
                              <div style={{ fontSize: '0.8rem', color: '#666' }}>{item.author} ({item.year || 'N/A'})</div>
                              {item.ia_identifier && (
                                <div style={{ fontSize: '0.75rem', color: '#1565c0' }}>IA: {item.ia_identifier}</div>
                              )}
                            </div>
                            {item.ia_identifier && (
                              <button
                                onClick={() => handleDownload(req.id, item.ia_identifier, item.title, item.author, item.cover_id, false)}
                                disabled={downloading === req.id}
                                style={{
                                  padding: '0.35rem 0.75rem', fontSize: '0.8rem',
                                  background: downloading === req.id ? '#999' : '#2c1810',
                                  color: '#fff', border: 'none', borderRadius: '4px', cursor: downloading === req.id ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {downloading === req.id ? 'Downloading...' : 'Download'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {(!olResults.exact || olResults.exact.length === 0) && (!olResults.alternatives || olResults.alternatives.length === 0) && (
                      <div style={{ color: '#999', fontSize: '0.85rem' }}>No results found on Open Library.</div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
