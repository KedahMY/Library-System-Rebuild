import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRecovery } from '../App';
import { useSessionRecorder } from '../components/CrashRecovery';
import Sidebar from '../components/Sidebar';
import ManageRequests from '../components/ManageRequests';
import ManagePublishedBooks from '../components/ManagePublishedBooks';
import DownloadedStats from '../components/DownloadedStats';
import NotificationBoard from '../components/NotificationBoard';
import ProfileEditor from '../components/ProfileEditor';
import api from '../utils/api';

// EXACT tab ids — crash recovery keys depend on these
const NAV_ITEMS = [
  { id: 'pending', label: 'Pending', icon: '⏳' },
  { id: 'all', label: 'All Books', icon: '📚' },
  { id: 'manage-books', label: 'Manage Books', icon: '⚙️' },
  { id: 'requests', label: 'Requests', icon: '📋' },
  { id: 'downloaded-stats', label: 'Downloads', icon: '📥' },
  { id: 'flagged-reviews', label: 'Flagged Reviews', icon: '🚩' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'borrow-records', label: 'Borrow Records', icon: '📋' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'profile', label: 'Profile', icon: '👤' }
];

const STATUS_BADGE = (status) => {
  const map = {
    pending: { background: '#fff3e0', color: '#e65100' },
    approved: { background: '#e8f5e9', color: '#2e7d32' },
    rejected: { background: '#fdecea', color: '#c62828' },
    active: { background: '#e3f2fd', color: '#1565c0' },
    returned: { background: '#e8f5e9', color: '#2e7d32' },
    overdue: { background: '#fdecea', color: '#c62828' },
    inactive: { background: '#f5f5f5', color: '#999' }
  };
  return map[status] || { background: '#f5f0eb', color: '#666' };
};

export default function LibrarianPortal() {
  const { user } = useAuth();
  const { recoveryState, clearRecoveryState } = useRecovery();

  // ---- Tab state with crash recovery ----
  const [activeTab, setActiveTab] = useState('pending');

  // ---- Snapshot fields ----
  const [filters, setFilters] = useState({ search: '', genre: '', status: '' });
  const [userFilters, setUserFilters] = useState({ search: '', role: '', status: '' });
  const [borrowFilters, setBorrowFilters] = useState({ search: '', status: '', dateFrom: '', dateTo: '' });
  const [notifFilter, setNotifFilter] = useState('all');
  const [notifShowArchived, setNotifShowArchived] = useState(false);

  // ---- Pending tab state ----
  const [pendingBooks, setPendingBooks] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState(null);
  const [selectedPending, setSelectedPending] = useState([]);
  const [previewBook, setPreviewBook] = useState(null);

  // ---- Flagged reviews tab state ----
  const [flaggedReviews, setFlaggedReviews] = useState([]);
  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [flaggedError, setFlaggedError] = useState(null);

  // ---- Users tab state ----
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [createUserForm, setCreateUserForm] = useState({
    username: '', email: '', password: '', full_name: '', role: 'student'
  });
  const [createUserSubmitting, setCreateUserSubmitting] = useState(false);
  const [createUserError, setCreateUserError] = useState(null);
  const [createUserSuccess, setCreateUserSuccess] = useState(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [bulkActionMsg, setBulkActionMsg] = useState(null);

  // ---- Borrow records tab state ----
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [borrowRecordsLoading, setBorrowRecordsLoading] = useState(false);
  const [borrowRecordsError, setBorrowRecordsError] = useState(null);

  // ---- Restore from crash recovery ----
  useEffect(() => {
    if (recoveryState && recoveryState.portal === 'librarian') {
      if (recoveryState.activeTab) {
        setActiveTab(recoveryState.activeTab);
      }
      if (recoveryState.stateSnapshot) {
        const snap = recoveryState.stateSnapshot;
        if (snap.filters !== undefined) setFilters(snap.filters);
        if (snap.userFilters !== undefined) setUserFilters(snap.userFilters);
        if (snap.borrowFilters !== undefined) setBorrowFilters(snap.borrowFilters);
        if (snap.notifFilter !== undefined) setNotifFilter(snap.notifFilter);
        if (snap.notifShowArchived !== undefined) setNotifShowArchived(snap.notifShowArchived);
      }
      clearRecoveryState();
    }
  }, [recoveryState, clearRecoveryState]);

  // ---- Session recorder ----
  const stateSnapshot = { filters, userFilters, borrowFilters, notifFilter, notifShowArchived };
  useSessionRecorder(user?.id, 'librarian', activeTab, stateSnapshot);

  // ---- Data fetching ----

  // Pending books
  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await api.get('/books/pending');
      setPendingBooks(res.data.books || res.data || []);
    } catch (err) {
      setPendingError(err.response?.data?.error || 'Failed to load pending books');
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'pending') fetchPending();
  }, [fetchPending, activeTab]);

  // Flagged reviews
  const fetchFlaggedReviews = useCallback(async () => {
    setFlaggedLoading(true);
    setFlaggedError(null);
    try {
      const res = await api.get('/reviews/flagged');
      setFlaggedReviews(res.data.reviews || res.data || []);
    } catch (err) {
      setFlaggedError(err.response?.data?.error || 'Failed to load flagged reviews');
    } finally {
      setFlaggedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'flagged-reviews') fetchFlaggedReviews();
  }, [fetchFlaggedReviews, activeTab]);

  // Users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params = {};
      if (userFilters.search) params.search = userFilters.search;
      if (userFilters.role) params.role = userFilters.role;
      if (userFilters.status) params.status = userFilters.status;
      const res = await api.get('/users', { params });
      setUsers(res.data.users || res.data || []);
    } catch (err) {
      setUsersError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [userFilters]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
  }, [fetchUsers, activeTab]);

  // Borrow records
  const fetchBorrowRecords = useCallback(async () => {
    setBorrowRecordsLoading(true);
    setBorrowRecordsError(null);
    try {
      const params = {};
      if (borrowFilters.search) params.search = borrowFilters.search;
      if (borrowFilters.status) params.status = borrowFilters.status;
      if (borrowFilters.dateFrom) params.date_from = borrowFilters.dateFrom;
      if (borrowFilters.dateTo) params.date_to = borrowFilters.dateTo;
      const res = await api.get('/books/borrow-records', { params });
      setBorrowRecords(res.data.records || res.data || []);
    } catch (err) {
      setBorrowRecordsError(err.response?.data?.error || 'Failed to load borrow records');
    } finally {
      setBorrowRecordsLoading(false);
    }
  }, [borrowFilters]);

  useEffect(() => {
    if (activeTab === 'borrow-records') fetchBorrowRecords();
  }, [fetchBorrowRecords, activeTab]);

  // ---- Handlers ----

  // Pending actions
  const handlePendingSelect = (id) => {
    setSelectedPending(prev =>
      prev.includes(id) ? prev.filter(bid => bid !== id) : [...prev, id]
    );
  };

  const handlePendingSelectAll = () => {
    if (selectedPending.length === pendingBooks.length) {
      setSelectedPending([]);
    } else {
      setSelectedPending(pendingBooks.map(b => b.id));
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.patch(`/books/${id}/approve`);
      fetchPending();
      setSelectedPending(prev => prev.filter(bid => bid !== id));
    } catch (err) {
      setPendingError(err.response?.data?.error || 'Failed to approve book');
    }
  };

  const handleReject = async (id) => {
    try {
      await api.patch(`/books/${id}/reject`);
      fetchPending();
      setSelectedPending(prev => prev.filter(bid => bid !== id));
    } catch (err) {
      setPendingError(err.response?.data?.error || 'Failed to reject book');
    }
  };

  const handleBulkApprove = async () => {
    if (selectedPending.length === 0) return;
    try {
      await Promise.all(selectedPending.map(id => api.patch(`/books/${id}/approve`)));
      setSelectedPending([]);
      fetchPending();
    } catch (err) {
      setPendingError(err.response?.data?.error || 'Failed to bulk approve');
    }
  };

  const handleBulkReject = async () => {
    if (selectedPending.length === 0) return;
    try {
      await Promise.all(selectedPending.map(id => api.patch(`/books/${id}/reject`)));
      setSelectedPending([]);
      fetchPending();
    } catch (err) {
      setPendingError(err.response?.data?.error || 'Failed to bulk reject');
    }
  };

  // Flagged reviews actions
  const handleResolveFlag = async (reviewId) => {
    try {
      await api.post(`/reviews/${reviewId}/resolve-flag`);
      fetchFlaggedReviews();
    } catch (err) {
      setFlaggedError(err.response?.data?.error || 'Failed to resolve flag');
    }
  };

  // User actions
  const handleToggleUserActive = async (userId, currentActive) => {
    try {
      const action = currentActive ? 'deactivate' : 'activate';
      await api.post(`/users/${userId}/${action}`);
      fetchUsers();
    } catch (err) {
      setUsersError(err.response?.data?.error || 'Failed to toggle user status');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!createUserForm.username.trim() || !createUserForm.email.trim() || !createUserForm.password.trim()) {
      setCreateUserError('Username, email, and password are required');
      return;
    }
    setCreateUserSubmitting(true);
    setCreateUserError(null);
    setCreateUserSuccess(null);
    try {
      await api.post('/users', createUserForm);
      setCreateUserSuccess('User created successfully');
      setCreateUserForm({ username: '', email: '', password: '', full_name: '', role: 'student' });
      fetchUsers();
    } catch (err) {
      setCreateUserError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setCreateUserSubmitting(false);
    }
  };

  const handleBulkAction = async (action) => {
    if (!window.confirm(`Perform "${action}" on all users?`)) return;
    try {
      const params = {};
      if (userFilters.role) params.role = userFilters.role;
      if (userFilters.status) params.status = userFilters.status;
      const res = await api.post('/librarian/users/bulk-action', { action, ...params });
      setBulkActionMsg(res.data.message || `Bulk action "${action}" completed`);
      fetchUsers();
    } catch (err) {
      setUsersError(err.response?.data?.error || 'Bulk action failed');
    }
  };

  // Borrow records actions
  const handleExportCSV = async () => {
    try {
      const params = {};
      if (borrowFilters.search) params.search = borrowFilters.search;
      if (borrowFilters.status) params.status = borrowFilters.status;
      if (borrowFilters.dateFrom) params.date_from = borrowFilters.dateFrom;
      if (borrowFilters.dateTo) params.date_to = borrowFilters.dateTo;
      const res = await api.get('/books/borrow-records/export', {
        params,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'borrow-records.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setBorrowRecordsError('Failed to export CSV');
    }
  };

  // ---- Tab content rendering ----
  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case 'pending':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Pending Books</h2>
            {pendingError && (
              <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{pendingError}</span>
                <button onClick={() => setPendingError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
              </div>
            )}

            {/* Bulk actions */}
            {selectedPending.length > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  {selectedPending.length} selected
                </span>
                <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.85rem' }} onClick={handleBulkApprove}>
                  Approve All Selected
                </button>
                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.85rem', color: '#c62828', borderColor: '#c62828' }} onClick={handleBulkReject}>
                  Reject All Selected
                </button>
              </div>
            )}

            {pendingLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading pending books...</div>
            ) : pendingBooks.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No books awaiting approval.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                      <th style={{ padding: 8, textAlign: 'center', width: 36 }}>
                        <input type="checkbox" checked={selectedPending.length === pendingBooks.length && pendingBooks.length > 0} onChange={handlePendingSelectAll} />
                      </th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Title</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Author</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Genre</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Submitted</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingBooks.map((book, i) => (
                      <tr key={book.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f0eb' }}>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedPending.includes(book.id)} onChange={() => handlePendingSelect(book.id)} />
                        </td>
                        <td style={{ padding: 8 }}>{book.title}</td>
                        <td style={{ padding: 8 }}>{book.author || 'Unknown'}</td>
                        <td style={{ padding: 8 }}>{book.genre || 'N/A'}</td>
                        <td style={{ padding: 8, textAlign: 'center', fontSize: 12 }}>
                          {book.created_at ? new Date(book.created_at).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => handleApprove(book.id)}
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px 10px', fontSize: '0.8rem', color: '#c62828', borderColor: '#c62828' }}
                              onClick={() => handleReject(book.id)}
                            >
                              Reject
                            </button>
                            <button
                              style={{ padding: '4px 10px', fontSize: '0.8rem', background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}
                              onClick={() => setPreviewBook(book)}
                            >
                              Preview
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Preview modal */}
            {previewBook && (
              <div
                onClick={() => setPreviewBook(null)}
                style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
                }}
              >
                <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 500, width: '100%', padding: '1.5rem', maxHeight: '80vh', overflow: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{previewBook.title}</h3>
                    <button onClick={() => setPreviewBook(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>&times;</button>
                  </div>
                  {previewBook.author && <p style={{ margin: '0 0 0.5rem', color: 'var(--color-text-muted)' }}>by {previewBook.author}</p>}
                  {previewBook.genre && (
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#f5f0eb', color: '#666', marginRight: 4 }}>
                      {previewBook.genre}
                    </span>
                  )}
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11,
                    ...STATUS_BADGE(previewBook.status)
                  }}>
                    {previewBook.status}
                  </span>
                  {previewBook.description && (
                    <p style={{ margin: '0.75rem 0', fontSize: '0.9rem', lineHeight: 1.5 }}>{previewBook.description}</p>
                  )}
                  {previewBook.file_url && (
                    <p style={{ fontSize: '0.85rem' }}>
                      <a href={previewBook.file_url} target="_blank" rel="noopener noreferrer">View PDF</a>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'all':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>All Books</h2>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search books..."
                value={filters.search}
                onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                style={{ flex: 1, minWidth: '200px' }}
              />
              <select
                value={filters.genre}
                onChange={e => setFilters(prev => ({ ...prev, genre: e.target.value }))}
                style={{ width: '150px' }}
              >
                <option value="">All Genres</option>
                <option value="fiction">Fiction</option>
                <option value="non-fiction">Non-Fiction</option>
                <option value="science">Science</option>
                <option value="history">History</option>
                <option value="technology">Technology</option>
              </select>
              <select
                value={filters.status}
                onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                style={{ width: '150px' }}
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <ManagePublishedBooks mode="all" />
          </div>
        );

      case 'manage-books':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Manage Books</h2>
            <ManagePublishedBooks mode="manage" />
          </div>
        );

      case 'requests':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Borrow Requests</h2>
            <ManageRequests />
          </div>
        );

      case 'downloaded-stats':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Download Statistics</h2>
            <DownloadedStats />
          </div>
        );

      case 'flagged-reviews':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Flagged Reviews</h2>
            {flaggedError && (
              <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{flaggedError}</span>
                <button onClick={() => setFlaggedError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
              </div>
            )}
            {flaggedLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading flagged reviews...</div>
            ) : flaggedReviews.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No flagged reviews requiring moderation.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                      <th style={{ padding: 8, textAlign: 'left' }}>Book</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>User</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Review</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Rating</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedReviews.map((review, i) => (
                      <tr key={review.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f0eb' }}>
                        <td style={{ padding: 8 }}>{review.book_title || 'Unknown'}</td>
                        <td style={{ padding: 8 }}>{review.username || 'Unknown'}</td>
                        <td style={{ padding: 8, maxWidth: 300 }}>
                          <div style={{ maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {review.content || '(no content)'}
                          </div>
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>{review.rating || '-'}</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => handleResolveFlag(review.id)}
                          >
                            Accept & Resolve
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

      case 'users':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Users</h2>
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateUser(!showCreateUser)}
              >
                {showCreateUser ? 'Cancel' : '+ Create User'}
              </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search users..."
                value={userFilters.search}
                onChange={e => setUserFilters(prev => ({ ...prev, search: e.target.value }))}
                style={{ flex: 1, minWidth: '200px' }}
              />
              <select
                value={userFilters.role}
                onChange={e => setUserFilters(prev => ({ ...prev, role: e.target.value }))}
                style={{ width: '150px' }}
              >
                <option value="">All Roles</option>
                <option value="student">Student</option>
                <option value="staff">Staff</option>
                <option value="author">Author</option>
                <option value="librarian">Librarian</option>
              </select>
              <select
                value={userFilters.status}
                onChange={e => setUserFilters(prev => ({ ...prev, status: e.target.value }))}
                style={{ width: '150px' }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Bulk actions */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline"
                style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                onClick={() => handleBulkAction('export')}
              >
                Export All
              </button>
              <button
                className="btn btn-outline"
                style={{ padding: '4px 12px', fontSize: '0.85rem', color: '#c62828', borderColor: '#c62828' }}
                onClick={() => handleBulkAction('deactivate_all')}
              >
                Deactivate All (Filtered)
              </button>
            </div>

            {bulkActionMsg && (
              <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, fontSize: 13 }}>
                {bulkActionMsg}
                <button onClick={() => setBulkActionMsg(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#2e7d32' }}>x</button>
              </div>
            )}

            {usersError && (
              <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{usersError}</span>
                <button onClick={() => setUsersError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
              </div>
            )}

            {/* Create User Form */}
            {showCreateUser && (
              <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Create New User</h3>
                <form onSubmit={handleCreateUser}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Username *</label>
                      <input
                        value={createUserForm.username}
                        onChange={e => setCreateUserForm(prev => ({ ...prev, username: e.target.value }))}
                        placeholder="Username"
                        style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Email *</label>
                      <input
                        type="email"
                        value={createUserForm.email}
                        onChange={e => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Email"
                        style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Password *</label>
                      <input
                        type="password"
                        value={createUserForm.password}
                        onChange={e => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Password"
                        style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Full Name</label>
                      <input
                        value={createUserForm.full_name}
                        onChange={e => setCreateUserForm(prev => ({ ...prev, full_name: e.target.value }))}
                        placeholder="Full name"
                        style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Role</label>
                    <select
                      value={createUserForm.role}
                      onChange={e => setCreateUserForm(prev => ({ ...prev, role: e.target.value }))}
                      style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
                    >
                      <option value="student">Student</option>
                      <option value="staff">Staff</option>
                      <option value="author">Author</option>
                      <option value="librarian">Librarian</option>
                    </select>
                  </div>
                  {createUserError && (
                    <div style={{ padding: '6px 10px', marginBottom: '0.5rem', background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 12 }}>{createUserError}</div>
                  )}
                  {createUserSuccess && (
                    <div style={{ padding: '6px 10px', marginBottom: '0.5rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, fontSize: 12 }}>{createUserSuccess}</div>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={createUserSubmitting}>
                    {createUserSubmitting ? 'Creating...' : 'Create User'}
                  </button>
                </form>
              </div>
            )}

            {/* Users table */}
            {usersLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading users...</div>
            ) : users.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No users found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                      <th style={{ padding: 8, textAlign: 'left' }}>Username</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Email</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Full Name</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Role</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => {
                      const isActive = u.is_active || u.status === 'active';
                      return (
                        <tr key={u.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f0eb' }}>
                          <td style={{ padding: 8 }}>{u.username}</td>
                          <td style={{ padding: 8 }}>{u.email}</td>
                          <td style={{ padding: 8 }}>{u.full_name || '-'}</td>
                          <td style={{ padding: 8, textAlign: 'center' }}>{u.role}</td>
                          <td style={{ padding: 8, textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: 11,
                              ...STATUS_BADGE(isActive ? 'active' : 'inactive')
                            }}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ padding: 8, textAlign: 'center' }}>
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => handleToggleUserActive(u.id, isActive)}
                            >
                              {isActive ? 'Deactivate' : 'Activate'}
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

      case 'borrow-records':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Borrow Records</h2>
              <button
                className="btn btn-primary"
                style={{ padding: '6px 16px' }}
                onClick={handleExportCSV}
              >
                Export CSV
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search records..."
                value={borrowFilters.search}
                onChange={e => setBorrowFilters(prev => ({ ...prev, search: e.target.value }))}
                style={{ flex: 1, minWidth: '200px' }}
              />
              <select
                value={borrowFilters.status}
                onChange={e => setBorrowFilters(prev => ({ ...prev, status: e.target.value }))}
                style={{ width: '150px' }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="returned">Returned</option>
                <option value="overdue">Overdue</option>
              </select>
              <input
                type="date"
                value={borrowFilters.dateFrom}
                onChange={e => setBorrowFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                style={{ width: '150px' }}
                title="From date"
              />
              <input
                type="date"
                value={borrowFilters.dateTo}
                onChange={e => setBorrowFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                style={{ width: '150px' }}
                title="To date"
              />
            </div>

            {borrowRecordsError && (
              <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{borrowRecordsError}</span>
                <button onClick={() => setBorrowRecordsError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
              </div>
            )}

            {borrowRecordsLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading borrow records...</div>
            ) : borrowRecords.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No borrow records found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                      <th style={{ padding: 8, textAlign: 'left' }}>User</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Book</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Borrow Date</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Due Date</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Return Date</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borrowRecords.map((rec, i) => (
                      <tr key={rec.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f0eb' }}>
                        <td style={{ padding: 8 }}>{rec.username || rec.user_name || 'Unknown'}</td>
                        <td style={{ padding: 8 }}>{rec.book_title || rec.title || 'Unknown'}</td>
                        <td style={{ padding: 8, textAlign: 'center', fontSize: 12 }}>
                          {rec.borrow_date ? new Date(rec.borrow_date).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: 8, textAlign: 'center', fontSize: 12 }}>
                          {rec.due_date ? new Date(rec.due_date).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: 8, textAlign: 'center', fontSize: 12 }}>
                          {rec.return_date ? new Date(rec.return_date).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 11,
                            ...STATUS_BADGE(rec.status)
                          }}>
                            {rec.status}
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

      case 'notifications':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Notifications</h2>
            <NotificationBoard />
          </div>
        );

      case 'profile':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Profile</h2>
            <ProfileEditor />
          </div>
        );

      default:
        return <div className="card" style={{ padding: '2rem' }}>Select a tab.</div>;
    }
  }, [activeTab, filters, userFilters, borrowFilters,
      pendingBooks, pendingLoading, pendingError, selectedPending, previewBook,
      flaggedReviews, flaggedLoading, flaggedError,
      users, usersLoading, usersError,
      createUserForm, createUserSubmitting, createUserError, createUserSuccess,
      showCreateUser, bulkActionMsg,
      borrowRecords, borrowRecordsLoading, borrowRecordsError]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        navItems={NAV_ITEMS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        unreadCount={0}
      />
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '2rem',
        background: 'var(--color-navy)'
      }}>
        {renderTabContent()}
      </main>
    </div>
  );
}
