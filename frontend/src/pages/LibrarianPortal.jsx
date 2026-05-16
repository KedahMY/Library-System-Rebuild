// BiblioVault LibrarianPortal — 10-tab portal for librarian role.
// Tabs: pending, all, manage-books, requests, downloaded-stats, flagged-reviews,
//        users, borrow-records, notifications, profile.
// Path: /librarian

import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';
import { useAuth, useRecovery } from '../context/AuthContext.jsx';
import { useSessionRecorder, CrashTestButton, CrashUnrecoverableButton, SIMULATE_UNRECOVERABLE_CRASH } from '../components/CrashRecovery.jsx';
import ManagePublishedBooks from '../components/ManagePublishedBooks.jsx';
import ManageRequests from '../components/ManageRequests.jsx';
import DownloadedStats from '../components/DownloadedStats.jsx';
import NotificationBoard from '../components/NotificationBoard.jsx';
import ProfileEditor from '../components/ProfileEditor.jsx';

// ── Tab navigation items (exact ids per 06_screen_flow.md) ───────────────────
const NAV_ITEMS = [
  { id: 'pending',          label: 'Pending Submissions', icon: '⏳' },
  { id: 'all',              label: 'All Submissions',     icon: '📋' },
  { id: 'manage-books',     label: 'Manage Books',        icon: '📚' },
  { id: 'requests',         label: 'Book Requests',       icon: '📨' },
  { id: 'downloaded-stats', label: 'Downloaded Stats',    icon: '📊' },
  { id: 'flagged-reviews',  label: 'Flagged Reviews',     icon: '🚩' },
  { id: 'users',            label: 'Manage Users',        icon: '👥' },
  { id: 'borrow-records',   label: 'Borrow Records',      icon: '📒' },
  { id: 'notifications',    label: 'Notifications',       icon: '🔔' },
  { id: 'profile',          label: 'My Profile',          icon: '👤' },
];

export default function LibrarianPortal() {
  const { user } = useAuth();
  const { recoveryState, clearRecoveryState } = useRecovery();
  const [activeTab, setActiveTab] = useState(
    recoveryState?.activeTab || 'pending'
  );

  // ── State snapshot fields (per 06_screen_flow.md §6.1) ─────────────────────
  const [filters, setFilters] = useState(
    recoveryState?.stateSnapshot?.filters || { title: '', author: '', genre: '', status: '', dateFrom: '', dateTo: '' }
  );
  const [userFilters, setUserFilters] = useState(
    recoveryState?.stateSnapshot?.userFilters || { role: '', search: '' }
  );
  const [borrowFilters, setBorrowFilters] = useState(
    recoveryState?.stateSnapshot?.borrowFilters || { search: '', status: '', dateFrom: '', dateTo: '' }
  );
  const [notifFilter, setNotifFilter] = useState(
    recoveryState?.stateSnapshot?.notifFilter || { category: '', priority: '', search: '' }
  );
  const [notifShowArchived, setNotifShowArchived] = useState(
    recoveryState?.stateSnapshot?.notifShowArchived || false
  );

  // Clear recovery state after restoring (first render)
  useEffect(() => {
    if (recoveryState) {
      clearRecoveryState();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pending submissions
  const [pendingBooks, setPendingBooks] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [selectedPending, setSelectedPending] = useState([]);

  // All submissions
  const [allBooks, setAllBooks] = useState([]);
  const [allBooksLoading, setAllBooksLoading] = useState(false);

  // Flagged reviews
  const [flaggedReviews, setFlaggedReviews] = useState([]);
  const [flaggedLoading, setFlaggedLoading] = useState(false);

  // Users
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Borrow records
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [borrowLoading, setBorrowLoading] = useState(false);

  // ── Session recorder ───────────────────────────────────────────────────────
  useSessionRecorder('librarian', activeTab, {
    filters, userFilters, borrowFilters, notifFilter, notifShowArchived,
  }, user?.id);

  // ── Fetch pending submissions ──────────────────────────────────────────────
  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.title) params.append('title', filters.title);
      if (filters.author) params.append('author', filters.author);
      if (filters.genre) params.append('genre', filters.genre);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('date_from', filters.dateFrom);
      if (filters.dateTo) params.append('date_to', filters.dateTo);
      const res = await api.get(`/books/pending?${params.toString()}`);
      setPendingBooks(res.data || []);
    } catch (err) {
      console.error('Failed to load pending:', err);
    } finally {
      setPendingLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPending();
    }
  }, [activeTab, fetchPending]);

  // ── Fetch all submissions ──────────────────────────────────────────────────
  const fetchAllBooks = useCallback(async () => {
    setAllBooksLoading(true);
    try {
      const res = await api.get('/librarian/books');
      setAllBooks(res.data?.books || res.data || []);
    } catch (err) {
      console.error('Failed to load all books:', err);
    } finally {
      setAllBooksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'all') {
      fetchAllBooks();
    }
  }, [activeTab, fetchAllBooks]);

  // ── Fetch flagged reviews ─────────────────────────────────────────────────
  const fetchFlaggedReviews = useCallback(async () => {
    setFlaggedLoading(true);
    try {
      const res = await api.get('/reviews/flagged');
      setFlaggedReviews(res.data || []);
    } catch (err) {
      console.error('Failed to load flagged reviews:', err);
    } finally {
      setFlaggedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'flagged-reviews') {
      fetchFlaggedReviews();
    }
  }, [activeTab, fetchFlaggedReviews]);

  // ── Fetch users ────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (userFilters.role) params.append('role', userFilters.role);
      if (userFilters.search) params.append('search', userFilters.search);
      const res = await api.get(`/users?${params.toString()}`);
      setUsers(res.data?.users || res.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setUsersLoading(false);
    }
  }, [userFilters]);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab, fetchUsers]);

  // ── Fetch borrow records ──────────────────────────────────────────────────
  const fetchBorrowRecords = useCallback(async () => {
    setBorrowLoading(true);
    try {
      const params = new URLSearchParams();
      if (borrowFilters.search) params.append('search', borrowFilters.search);
      if (borrowFilters.status) params.append('status', borrowFilters.status);
      if (borrowFilters.dateFrom) params.append('date_from', borrowFilters.dateFrom);
      if (borrowFilters.dateTo) params.append('date_to', borrowFilters.dateTo);
      const res = await api.get(`/books/borrow-records?${params.toString()}`);
      setBorrowRecords(res.data?.records || res.data || []);
    } catch (err) {
      console.error('Failed to load borrow records:', err);
    } finally {
      setBorrowLoading(false);
    }
  }, [borrowFilters]);

  useEffect(() => {
    if (activeTab === 'borrow-records') {
      fetchBorrowRecords();
    }
  }, [activeTab, fetchBorrowRecords]);

  // ── Bulk approve/reject ────────────────────────────────────────────────────
  const handleBulkAction = async (action) => {
    if (selectedPending.length === 0) return;
    const confirmed = window.confirm(`Are you sure you want to ${action} ${selectedPending.length} selected submission(s)?`);
    if (!confirmed) return;

    try {
      await api.post('/books/bulk-action', {
        book_ids: selectedPending,
        action,
      });
      alert(`${action} successful!`);
      setSelectedPending([]);
      fetchPending();
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${action}`);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'pending':
        return renderPendingTab();
      case 'all':
        return renderAllSubmissionsTab();
      case 'manage-books':
        return renderLazyComponent('ManagePublishedBooks', { mode: 'manage-books' });
      case 'requests':
        return renderLazyComponent('ManageRequests');
      case 'downloaded-stats':
        return renderLazyComponent('DownloadedStats', { userId: user?.id });
      case 'flagged-reviews':
        return renderFlaggedReviewsTab();
      case 'users':
        return renderUsersTab();
      case 'borrow-records':
        return renderBorrowRecordsTab();
      case 'notifications':
        return renderLazyComponent('NotificationBoard');
      case 'profile':
        return renderLazyComponent('ProfileEditor');
      default:
        return <div style={{ color: '#666', padding: '2rem' }}>Select a tab.</div>;
    }
  };

  function renderLazyComponent(name, props = {}) {
    const Component = lazyComponentMap[name];
    if (Component) {
      return <Component {...props} />;
    }
    return (
      <div style={{
        textAlign: 'center', padding: '3rem', color: '#999',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📄</div>
        <div style={{ fontSize: '1rem' }}>{name} — loading...</div>
      </div>
    );
  }

  const panelStyle = {
    fontFamily: 'DM Sans, sans-serif',
    padding: '1.5rem',
    maxWidth: '1100px',
  };

  // ── Pending Submissions tab ────────────────────────────────────────────────
  function renderPendingTab() {
    const statusStyles = {
      pending: { bg: '#fff3e0', color: '#e65100' },
      pending_deletion: { bg: '#fce4ec', color: '#880e4f' },
      approved: { bg: '#e8f5e9', color: '#2e7d32' },
      rejected: { bg: '#ffebee', color: '#c62828' },
    };

    const toggleSelect = (id) => {
      setSelectedPending((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    };

    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: 0 }}>
            Pending Submissions
          </h2>
          {selectedPending.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => handleBulkAction('approve')}
                style={{
                  padding: '0.4rem 1rem', background: '#2e7d32', color: '#fff',
                  border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
                Approve ({selectedPending.length})
              </button>
              <button
                onClick={() => handleBulkAction('reject')}
                style={{
                  padding: '0.4rem 1rem', background: '#c62828', color: '#fff',
                  border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
                Reject ({selectedPending.length})
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex', gap: '0.75rem', marginBottom: '1.25rem',
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          <input type="text" placeholder="Title..." value={filters.title}
            onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))}
            style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem', width: '130px' }} />
          <input type="text" placeholder="Author..." value={filters.author}
            onChange={(e) => setFilters((f) => ({ ...f, author: e.target.value }))}
            style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem', width: '130px' }} />
          <select value={filters.genre} onChange={(e) => setFilters((f) => ({ ...f, genre: e.target.value }))}
            style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}>
            <option value="">All Genres</option>
            {['Fiction', 'Non-Fiction', 'Science Fiction', 'Fantasy', 'Mystery',
              'Romance', 'Thriller', 'Horror', 'Biography', 'History',
              'Science', 'Technology', 'Philosophy', 'Poetry', 'Drama', 'Comics',
            ].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="pending_deletion">Pending Deletion</option>
          </select>
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            style={{ padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }} />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            style={{ padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }} />
        </div>

        {/* Books table */}
        {pendingLoading ? (
          <div style={{ color: '#666' }}>Loading submissions...</div>
        ) : pendingBooks.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No pending submissions.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ width: '36px', padding: '0.5rem' }}>
                    <input type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPending(pendingBooks.map((b) => b.id));
                        } else {
                          setSelectedPending([]);
                        }
                      }}
                      checked={selectedPending.length === pendingBooks.length && pendingBooks.length > 0}
                    />
                  </th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Author</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Genre</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Submitted</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingBooks.map((book, idx) => {
                  const ss = statusStyles[book.status] || { bg: '#f5f5f5', color: '#666' };
                  return (
                    <tr key={book.id || idx} style={{
                      borderBottom: '1px solid #eee',
                      background: idx % 2 === 0 ? '#fff' : '#fafafa',
                    }}>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={selectedPending.includes(book.id)}
                          onChange={() => toggleSelect(book.id)}
                        />
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{book.title}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{book.author_name}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{book.genre}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
                          fontSize: '0.75rem', fontWeight: 'bold',
                          background: ss.bg, color: ss.color,
                        }}>
                          {book.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#666' }}>
                        {book.submitted_date ? new Date(book.submitted_date).toLocaleDateString() : ''}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Approve "${book.title}"?`)) return;
                            try {
                              await api.patch(`/books/${book.id}/approve`);
                              fetchPending();
                            } catch (err) {
                              alert(err.response?.data?.error || 'Failed to approve');
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem', background: '#2e7d32', color: '#fff',
                            border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem',
                            marginRight: '0.25rem',
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={async () => {
                            const reason = window.prompt('Rejection reason (optional):');
                            if (reason !== null) {
                              try {
                                await api.patch(`/books/${book.id}/reject`, reason ? { rejection_reason: reason } : {});
                                fetchPending();
                              } catch (err) {
                                alert(err.response?.data?.error || 'Failed to reject');
                              }
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem', background: '#c62828', color: '#fff',
                            border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem',
                          }}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── All Submissions tab ────────────────────────────────────────────────────
  function renderAllSubmissionsTab() {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
          All Submissions
        </h2>
        {allBooksLoading ? (
          <div style={{ color: '#666' }}>Loading all books...</div>
        ) : allBooks.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No books found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Author</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Genre</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Availability</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {allBooks.map((book, idx) => (
                  <tr key={book.id || idx} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{book.title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{book.author_name}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{book.genre}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold',
                        background: book.status === 'approved' ? '#e8f5e9' : book.status === 'rejected' ? '#ffebee' : '#fff3e0',
                        color: book.status === 'approved' ? '#2e7d32' : book.status === 'rejected' ? '#c62828' : '#e65100',
                      }}>
                        {book.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#666' }}>
                      {book.availability || '-'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#666' }}>
                      {book.submitted_date ? new Date(book.submitted_date).toLocaleDateString() : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Flagged Reviews tab ────────────────────────────────────────────────────
  function renderFlaggedReviewsTab() {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
          Flagged Reviews
        </h2>
        {flaggedLoading ? (
          <div style={{ color: '#666' }}>Loading flagged reviews...</div>
        ) : flaggedReviews.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No flagged reviews at this time.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Reviewer</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Book</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Content</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flaggedReviews.map((rev, idx) => (
                  <tr key={rev.id || idx} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{rev.username || rev.reviewer_name || 'Unknown'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{rev.book_title || 'Unknown'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#555', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rev.content || rev.review_text || ''}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                      <button
                        onClick={async () => {
                          try {
                            await api.post(`/reviews/${rev.id}/resolve-flag`, { action: 'accept' });
                            fetchFlaggedReviews();
                          } catch (err) {
                            alert(err.response?.data?.error || 'Failed');
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.5rem', background: '#2e7d32', color: '#fff',
                          border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem',
                          marginRight: '0.25rem',
                        }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await api.post(`/reviews/${rev.id}/resolve-flag`, { action: 'reject' });
                            fetchFlaggedReviews();
                          } catch (err) {
                            alert(err.response?.data?.error || 'Failed');
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.5rem', background: '#888', color: '#fff',
                          border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem',
                        }}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Manage Users tab ───────────────────────────────────────────────────────
  function renderUsersTab() {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: 0 }}>
            Manage Users
          </h2>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search by username or name..." value={userFilters.search}
            onChange={(e) => setUserFilters((f) => ({ ...f, search: e.target.value }))}
            style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem', flex: 1, minWidth: '150px' }} />
          <select value={userFilters.role} onChange={(e) => setUserFilters((f) => ({ ...f, role: e.target.value }))}
            style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}>
            <option value="">All Roles</option>
            <option value="student">Student</option>
            <option value="staff">Staff</option>
            <option value="author">Author</option>
            <option value="librarian">Librarian</option>
          </select>
        </div>

        {usersLoading ? (
          <div style={{ color: '#666' }}>Loading users...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No users found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Username</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Full Name</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Role</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Active</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Last Login</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr key={u.id || idx} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                    opacity: u.active === 0 ? 0.6 : 1,
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{u.username}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{u.full_name}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: '3px', fontSize: '0.75rem',
                        background: '#e3f2fd', color: '#1565c0', fontWeight: 'bold',
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {u.active !== 0 ? (
                        <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>Yes</span>
                      ) : (
                        <span style={{ color: '#c62828' }}>No</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#666' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                      <button
                        onClick={async () => {
                          try {
                            await api.patch(`/users/${u.id}/deactivate`);
                            fetchUsers();
                          } catch (err) {
                            alert(err.response?.data?.error || 'Failed to toggle');
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: u.active !== 0 ? '#c62828' : '#2e7d32',
                          color: '#fff', border: 'none', borderRadius: '3px',
                          cursor: 'pointer', fontSize: '0.75rem',
                        }}
                      >
                        {u.active !== 0 ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Borrow Records tab ─────────────────────────────────────────────────────
  function renderBorrowRecordsTab() {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: 0 }}>
            Borrow Records
          </h2>
          <button
            onClick={async () => {
              try {
                const res = await api.get('/books/borrow-records/export', { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'borrow-records.csv');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (err) {
                alert('Failed to export');
              }
            }}
            style={{
              padding: '0.4rem 1rem', background: '#2c1810', color: '#fff',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search by title or borrower..." value={borrowFilters.search}
            onChange={(e) => setBorrowFilters((f) => ({ ...f, search: e.target.value }))}
            style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem', flex: 1, minWidth: '150px' }} />
          <select value={borrowFilters.status} onChange={(e) => setBorrowFilters((f) => ({ ...f, status: e.target.value }))}
            style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="returned">Returned</option>
            <option value="overdue">Overdue</option>
          </select>
          <input type="date" value={borrowFilters.dateFrom} onChange={(e) => setBorrowFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            style={{ padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }} />
          <input type="date" value={borrowFilters.dateTo} onChange={(e) => setBorrowFilters((f) => ({ ...f, dateTo: e.target.value }))}
            style={{ padding: '0.35rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem' }} />
        </div>

        {borrowLoading ? (
          <div style={{ color: '#666' }}>Loading records...</div>
        ) : borrowRecords.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No borrow records found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Book Title</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Borrower</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Borrow Date</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Due Date</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Return Date</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {borrowRecords.map((rec, idx) => (
                  <tr key={rec.id || idx} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{rec.title || rec.book_title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{rec.username || rec.borrower_name}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                      {rec.borrow_date ? new Date(rec.borrow_date).toLocaleDateString() : ''}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                      {rec.due_date ? new Date(rec.due_date).toLocaleDateString() : ''}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                      {rec.return_date ? new Date(rec.return_date).toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold',
                        background: rec.status === 'active' ? '#e8f5e9' : rec.status === 'overdue' ? '#ffebee' : '#e3f2fd',
                        color: rec.status === 'active' ? '#2e7d32' : rec.status === 'overdue' ? '#c62828' : '#1565c0',
                      }}>
                        {rec.status || 'active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf8f5' }}>
      {/* Sidebar */}
      <div style={{
        width: '240px', minWidth: '240px',
        background: '#2c1810', color: '#fff',
        display: 'flex', flexDirection: 'column',
        padding: '1.5rem 0',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{
          fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem',
          padding: '0 1.25rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '1rem', color: '#c9a84c',
        }}>
          BiblioVault
        </div>
        <div style={{
          padding: '0.25rem 1.25rem', marginBottom: '1rem',
          fontSize: '0.75rem', color: '#c9a84c',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Librarian
        </div>
        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                width: '100%', padding: '0.6rem 1.25rem',
                border: 'none',
                background: activeTab === item.id ? 'rgba(201, 168, 76, 0.15)' : 'transparent',
                color: activeTab === item.id ? '#c9a84c' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer', fontSize: '0.88rem',
                fontFamily: 'DM Sans, sans-serif', textAlign: 'left',
                borderLeft: activeTab === item.id ? '3px solid #c9a84c' : '3px solid transparent',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <LogoutButton />
          <CrashTestButton />
          {SIMULATE_UNRECOVERABLE_CRASH && <CrashUnrecoverableButton />}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {renderTabContent()}
      </div>
    </div>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button
      onClick={() => { logout(); window.location.href = '/login'; }}
      style={{
        width: '100%', padding: '0.5rem',
        background: 'rgba(255,255,255,0.1)',
        color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      Logout
    </button>
  );
}

const lazyComponentMap = {
  ManagePublishedBooks,
  ManageRequests,
  DownloadedStats,
  NotificationBoard,
  ProfileEditor,
};
