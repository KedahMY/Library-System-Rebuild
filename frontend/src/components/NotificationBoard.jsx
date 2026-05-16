import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = axios.create({ baseURL: '/api' });
const AUTO_REFRESH_MS = 60000;

const TYPE_STYLES = {
  info: { background: '#e3f2fd', color: '#1565c0' },
  warning: { background: '#fff3e0', color: '#e65100' },
  error: { background: '#fdecea', color: '#c62828' },
  success: { background: '#e8f5e9', color: '#2e7d32' },
  announcement: { background: '#f3e5f5', color: '#7b1fa2' },
  system: { background: '#f5f5f5', color: '#616161' }
};

export default function NotificationBoard() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Announcement form (librarian only)
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [announceTargetRole, setAnnounceTargetRole] = useState('');
  const [announcePriority, setAnnouncePriority] = useState('');
  const [announceSubmitting, setAnnounceSubmitting] = useState(false);
  const [announceError, setAnnounceError] = useState(null);
  const [announceSuccess, setAnnounceSuccess] = useState(false);

  const intervalRef = useRef(null);
  const isLibrarian = user?.role === 'librarian';

  const token = localStorage.getItem('token');

  const fetchNotifications = useCallback(async () => {
    try {
      const params = {};
      if (filterCategory) params.category = filterCategory;
      if (filterPriority) params.priority = filterPriority;
      if (filterType) params.type = filterType;
      if (searchQuery) params.search = searchQuery;
      if (showArchived) params.archived = 'true';

      const res = await API.get('/notifications', {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(res.data.notifications || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterPriority, filterType, searchQuery, showArchived, token]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(fetchNotifications, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  // --- Actions ---
  const handleMarkRead = async (id) => {
    try {
      await API.patch(`/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: 1 } : n)
      );
    } catch (err) {
      setError('Failed to mark as read');
    }
  };

  const handleArchive = async (id) => {
    try {
      await API.patch(`/notifications/${id}/archive`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      setError('Failed to archive notification');
    }
  };

  const handleDelete = async (id) => {
    try {
      await API.delete(`/notifications/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      setError('Failed to delete notification');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await API.patch('/notifications/read-all', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      setError('Failed to mark all as read');
    }
  };

  const handleSendAnnouncement = async (e) => {
    e.preventDefault();
    if (!announceTitle.trim() || !announceMessage.trim()) {
      setAnnounceError('Title and message are required');
      return;
    }
    try {
      setAnnounceSubmitting(true);
      setAnnounceError(null);
      setAnnounceSuccess(false);
      const body = { title: announceTitle.trim(), message: announceMessage.trim() };
      if (announceTargetRole) body.target_role = announceTargetRole;
      if (announcePriority) body.priority = announcePriority;

      await API.post('/notifications/announcement', body, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnnounceSuccess(true);
      setAnnounceTitle('');
      setAnnounceMessage('');
      setAnnounceTargetRole('');
      setAnnouncePriority('');
      fetchNotifications();
    } catch (err) {
      setAnnounceError(err.response?.data?.error || 'Failed to send announcement');
    } finally {
      setAnnounceSubmitting(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

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

      {/* Librarian announcement form */}
      {isLibrarian && (
        <div style={{
          marginBottom: 16, padding: 16, background: '#fafafa',
          borderRadius: 8, border: '1px solid #e0d5c7'
        }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, margin: '0 0 12px 0' }}>
            Send Announcement
          </h3>
          <form onSubmit={handleSendAnnouncement}>
            <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
              <input
                value={announceTitle}
                onChange={(e) => setAnnounceTitle(e.target.value)}
                placeholder="Announcement title"
                style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
              />
              <textarea
                value={announceMessage}
                onChange={(e) => setAnnounceMessage(e.target.value)}
                placeholder="Announcement message"
                rows={2}
                style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={announceTargetRole}
                  onChange={(e) => setAnnounceTargetRole(e.target.value)}
                  style={{ flex: 1, padding: 6, border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }}
                >
                  <option value="">All roles</option>
                  <option value="student">Students</option>
                  <option value="author">Authors</option>
                  <option value="librarian">Librarians</option>
                </select>
                <select
                  value={announcePriority}
                  onChange={(e) => setAnnouncePriority(e.target.value)}
                  style={{ flex: 1, padding: 6, border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }}
                >
                  <option value="">Normal priority</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {announceError && (
              <div style={{ padding: '6px 10px', marginBottom: 8, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 12 }}>
                {announceError}
              </div>
            )}
            {announceSuccess && (
              <div style={{ padding: '6px 10px', marginBottom: 8, background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, fontSize: 12 }}>
                Announcement sent successfully
              </div>
            )}

            <button
              type="submit"
              disabled={announceSubmitting}
              style={{
                padding: '6px 16px', background: '#1a1a2e', color: '#fff',
                border: 'none', borderRadius: 4,
                cursor: announceSubmitting ? 'default' : 'pointer',
                opacity: announceSubmitting ? 0.6 : 1, fontSize: 13
              }}
            >
              {announceSubmitting ? 'Sending...' : 'Send Announcement'}
            </button>
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notifications..."
          style={{ flex: 1, minWidth: 180, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
        >
          <option value="">All Categories</option>
          <option value="borrow">Borrow</option>
          <option value="return">Return</option>
          <option value="review">Review</option>
          <option value="request">Request</option>
          <option value="system">System</option>
          <option value="announcement">Announcement</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
        >
          <option value="">All Priority</option>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
        >
          <option value="">All Types</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="success">Success</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {/* Actions bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#666' }}>
          {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{ padding: '4px 12px', background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications list */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          No notifications yet
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {notifications.map((notif) => {
            const typeStyle = TYPE_STYLES[notif.type] || TYPE_STYLES.info;
            return (
              <div
                key={notif.id}
                style={{
                  padding: 12, borderRadius: 8,
                  background: notif.is_read ? '#fff' : '#f5f0eb',
                  border: notif.is_read ? '1px solid #e0d5c7' : '1px solid #d4a017',
                  display: 'flex', gap: 12, alignItems: 'flex-start'
                }}
              >
                {/* Type badge */}
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11,
                  fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  ...typeStyle
                }}>
                  {notif.type}
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>
                      {notif.title}
                      {!notif.is_read && (
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#d4a017', marginLeft: 6, verticalAlign: 'middle' }} />
                      )}
                    </strong>
                    <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(notif.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#555', lineHeight: 1.4 }}>
                    {notif.message}
                  </p>

                  {/* Priority badge */}
                  {notif.priority === 'urgent' && (
                    <span style={{
                      display: 'inline-block', marginTop: 4, padding: '1px 6px',
                      borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: '#fdecea', color: '#c62828'
                    }}>
                      Urgent
                    </span>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {!notif.is_read && (
                      <button
                        onClick={() => handleMarkRead(notif.id)}
                        style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', padding: 0 }}
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      onClick={() => handleArchive(notif.id)}
                      style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 0 }}
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => handleDelete(notif.id)}
                      style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', padding: 0 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
