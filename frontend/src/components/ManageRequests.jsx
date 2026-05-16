import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

const STATUS_STYLES = {
  pending: { background: '#fff3e0', color: '#e65100' },
  approved: { background: '#e8f5e9', color: '#2e7d32' },
  rejected: { background: '#fdecea', color: '#c62828' },
  fulfilled: { background: '#e3f2fd', color: '#1565c0' }
};

export default function ManageRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [olResults, setOlResults] = useState(null);
  const [olLoading, setOlLoading] = useState(false);
  const [rejectNote, setRejectNote] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (searchTerm) params.search = searchTerm;

      const res = await API.get('/requests', { params, headers });
      setRequests(res.data.requests || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, searchTerm, token]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handlePriority = async (id, priority) => {
    try {
      await API.patch(`/requests/${id}/priority`, { priority }, { headers });
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update priority');
    }
  };

  const handleReject = async (id) => {
    try {
      await API.patch(`/requests/${id}/reject`, { note: rejectNote[id] || null }, { headers });
      setRejectNote(prev => ({ ...prev, [id]: '' }));
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject request');
    }
  };

  const handleSearchOL = async (id) => {
    try {
      setOlLoading(true);
      setOlResults(null);
      const res = await API.get(`/requests/${id}/openlibrary-search`, { headers });
      setOlResults(res.data);
      setExpandedId(id);
    } catch (err) {
      setError(err.response?.data?.error || 'Open Library search failed');
    } finally {
      setOlLoading(false);
    }
  };

  const handleDownload = async (requestId, iaId, olTitle, olAuthor, coverId, generateSummary) => {
    try {
      await API.post(`/requests/${requestId}/download`, {
        ia_id: iaId,
        ol_title: olTitle,
        ol_author: olAuthor,
        cover_id: coverId,
        generate_summary: generateSummary
      }, { headers });
      setOlResults(null);
      setExpandedId(null);
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Download failed');
    }
  };

  const handleManualUpload = async (requestId, e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
      await API.post(`/requests/${requestId}/upload-manual`, formData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' }
      });
      form.reset();
      setExpandedId(null);
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await API.get('/requests/analytics', { headers });
      setAnalytics(res.data);
      setShowAnalytics(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load analytics');
    }
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, margin: 0 }}>
          Manage Book Requests
        </h2>
        <button
          onClick={() => showAnalytics ? setShowAnalytics(false) : fetchAnalytics()}
          style={{ padding: '6px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
        >
          {showAnalytics ? 'Hide Analytics' : 'Analytics'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 8, marginBottom: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
        </div>
      )}

      {/* Analytics panel */}
      {showAnalytics && analytics && (
        <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, margin: '0 0 12px 0' }}>Analytics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <h4 style={{ fontSize: 14, margin: '0 0 8px 0' }}>By Status</h4>
              {analytics.byStatus.map(s => (
                <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span>{s.status}</span>
                  <strong>{s.count}</strong>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ fontSize: 14, margin: '0 0 8px 0' }}>Top Genres</h4>
              {analytics.byGenre.map(g => (
                <div key={g.genre} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span>{g.genre}</span>
                  <strong>{g.count}</strong>
                </div>
              ))}
            </div>
          </div>
          {analytics.overTime && analytics.overTime.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 14, margin: '0 0 8px 0' }}>30-Day Timeline</h4>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 60 }}>
                {analytics.overTime.map(d => (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '100%', background: '#1a1a2e', borderRadius: '2px 2px 0 0',
                      height: `${Math.max(4, (d.count / Math.max(...analytics.overTime.map(x => x.count))) * 50)}px`
                    }} />
                    <span style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by title or author..."
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, flex: 1, minWidth: 200 }}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="fulfilled">Fulfilled</option>
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Priority</option>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {/* Requests list */}
      {loading ? (
        <div style={{ color: '#666' }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>No requests match the current filters.</div>
      ) : (
        <div>
          {requests.map((req) => (
            <div key={req.id} style={{ marginBottom: 8, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7', overflow: 'hidden' }}>
              {/* Summary row */}
              <div
                onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                style={{ padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: 15 }}>{req.title}</strong>
                    <span style={{ fontSize: 13, color: '#666' }}>by {req.author}</span>
                    {req.priority === 'urgent' && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fdecea', color: '#c62828', fontWeight: 600 }}>URGENT</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#666' }}>
                    <span>Genre: {req.genre}</span>
                    <span>by {req.username}</span>
                    <span>{new Date(req.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    ...(STATUS_STYLES[req.status] || STATUS_STYLES.pending)
                  }}>
                    {req.status}
                  </span>
                  <span style={{ fontSize: 18, color: '#999' }}>{expandedId === req.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === req.id && (
                <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #e0d5c7' }}>
                  {req.reason && (
                    <p style={{ fontSize: 13, margin: '8px 0', color: '#666' }}>Reason: {req.reason}</p>
                  )}

                  {/* Status-specific actions */}
                  {req.status === 'pending' && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handlePriority(req.id, req.priority === 'urgent' ? 'normal' : 'urgent')}
                          style={{ padding: '4px 12px', background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                        >
                          {req.priority === 'urgent' ? 'Set Normal' : 'Set Urgent'}
                        </button>
                      </div>

                      {/* Reject form */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                          value={rejectNote[req.id] || ''}
                          onChange={(e) => setRejectNote(prev => ({ ...prev, [req.id]: e.target.value }))}
                          placeholder="Rejection reason (optional)"
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }}
                        />
                        <button
                          onClick={() => handleReject(req.id)}
                          style={{ padding: '4px 12px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                        >
                          Reject
                        </button>
                      </div>

                      {/* Open Library search */}
                      <button
                        onClick={() => handleSearchOL(req.id)}
                        disabled={olLoading}
                        style={{ padding: '6px 16px', background: '#1565c0', color: '#fff', border: 'none', borderRadius: 4, cursor: olLoading ? 'default' : 'pointer', fontSize: 13, opacity: olLoading ? 0.6 : 1 }}
                      >
                        {olLoading ? 'Searching Open Library...' : 'Search Open Library'}
                      </button>

                      {/* OL results */}
                      {olResults && (
                        <div style={{ marginTop: 12, padding: 12, background: '#fff', borderRadius: 6, border: '1px solid #e0d5c7' }}>
                          {/* Exact matches */}
                          {olResults.exact && olResults.exact.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                              <h4 style={{ fontSize: 14, margin: '0 0 8px 0', color: '#2e7d32' }}>Exact Matches</h4>
                              {olResults.exact.map((book, i) => (
                                <OLResultCard
                                  key={i}
                                  book={book}
                                  requestId={req.id}
                                  onDownload={handleDownload}
                                />
                              ))}
                            </div>
                          )}

                          {/* Alternatives */}
                          {olResults.alternatives && olResults.alternatives.length > 0 && (
                            <div>
                              <h4 style={{ fontSize: 14, margin: '0 0 8px 0' }}>Alternatives</h4>
                              {olResults.alternatives.map((book, i) => (
                                <OLResultCard
                                  key={i}
                                  book={book}
                                  requestId={req.id}
                                  onDownload={handleDownload}
                                />
                              ))}
                            </div>
                          )}

                          {(!olResults.exact || olResults.exact.length === 0) &&
                           (!olResults.alternatives || olResults.alternatives.length === 0) && (
                            <div style={{ color: '#999', fontSize: 13 }}>No results found on Open Library.</div>
                          )}
                        </div>
                      )}

                      {/* Manual upload */}
                      <div style={{ marginTop: 12, padding: 12, background: '#fff', borderRadius: 6, border: '1px solid #e0d5c7' }}>
                        <h4 style={{ fontSize: 14, margin: '0 0 8px 0' }}>Manual Upload</h4>
                        <form onSubmit={(e) => handleManualUpload(req.id, e)}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <input name="title" placeholder="Title (optional)" style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }} />
                            <input name="author" placeholder="Author (optional)" style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <input name="genre" placeholder="Genre (optional)" style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }} />
                            <input name="description" placeholder="Description (optional)" style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }} />
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Book file *</label>
                            <input type="file" name="file" required style={{ fontSize: 12 }} />
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Cover image (optional)</label>
                            <input type="file" name="cover" style={{ fontSize: 12 }} />
                          </div>
                          <button type="submit" style={{ padding: '6px 16px', background: '#4a6741', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
                            Upload & Fulfill
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  {req.librarian_note && (
                    <p style={{ fontSize: 12, color: '#666', marginTop: 4, fontStyle: 'italic' }}>Librarian note: {req.librarian_note}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// OL result sub-component
function OLResultCard({ book, requestId, onDownload }) {
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (generateSummary) => {
    if (!book.ia_identifier) {
      alert('No Internet Archive identifier available for this book.');
      return;
    }
    setDownloading(true);
    setGeneratingSummary(generateSummary);
    try {
      await onDownload(requestId, book.ia_identifier, book.title, book.author, book.cover_id, generateSummary);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ padding: 8, marginBottom: 8, background: '#f5f0eb', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <div><strong style={{ fontSize: 13 }}>{book.title}</strong> <span style={{ fontSize: 12, color: '#666' }}>({book.year || 'N/A'})</span></div>
        <div style={{ fontSize: 12, color: '#666' }}>by {book.author}</div>
        {book.ia_identifier && <div style={{ fontSize: 11, color: '#999' }}>IA: {book.ia_identifier}</div>}
        {book.cover_id && <div style={{ fontSize: 11, color: '#999' }}>Cover ID: {book.cover_id}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {book.ia_identifier && (
          <>
            <button
              onClick={() => handleDownload(false)}
              disabled={downloading}
              style={{ padding: '4px 10px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: downloading ? 'default' : 'pointer', fontSize: 11, opacity: downloading ? 0.6 : 1 }}
            >
              {downloading && !generatingSummary ? 'Downloading...' : 'Download'}
            </button>
            <button
              onClick={() => handleDownload(true)}
              disabled={downloading}
              style={{ padding: '4px 10px', background: '#d4a017', color: '#fff', border: 'none', borderRadius: 4, cursor: downloading ? 'default' : 'pointer', fontSize: 11, opacity: downloading ? 0.6 : 1 }}
            >
              {downloading && generatingSummary ? 'Generating...' : '+ Summary'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
