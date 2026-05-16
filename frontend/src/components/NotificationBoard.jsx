// BiblioVault NotificationBoard — filterable notification inbox.
// Tabs: All / Unread / Archived.
// Per-item: type badge, timestamp, "Mark read", "Archive", "Delete" buttons.
// "Mark all read" button. For librarians: "Send Announcement" button.
// Props: {} (fetches for current user)
//
// API calls:
//   GET /api/notifications?category=&priority=&search=&is_archived=
//   PATCH /api/notifications/:id/read
//   PATCH /api/notifications/:id/archive
//   DELETE /api/notifications/:id
//   PATCH /api/notifications/read-all
//   POST /api/notifications/announcement

import React, { useState, useEffect, useCallback } from 'react';

// ── Auth helper ──────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Notification type badges ─────────────────────────────────────────
const NOTIF_STYLES = {
  due_reminder:      { bg: '#fff3e0', color: '#e65100', label: 'Due Reminder' },
  auto_return:       { bg: '#ffebee', color: '#c62828', label: 'Auto Return' },
  approval:          { bg: '#e8f5e9', color: '#2e7d32', label: 'Approved' },
  rejection:         { bg: '#ffebee', color: '#c62828', label: 'Rejected' },
  announcement:      { bg: '#e3f2fd', color: '#1565c0', label: 'Announcement' },
  new_submission:    { bg: '#f3e5f5', color: '#7b1fa2', label: 'New Submission' },
  user_update:       { bg: '#e0f2f1', color: '#00695c', label: 'User Update' },
  new_request:       { bg: '#fff8e1', color: '#f57f17', label: 'New Request' },
  request_rejected:  { bg: '#ffebee', color: '#c62828', label: 'Request Rejected' },
  request_fulfilled: { bg: '#e8f5e9', color: '#2e7d32', label: 'Request Fulfilled' },
  book_deleted:      { bg: '#fce4ec', color: '#880e4f', label: 'Book Deleted' },
  book_edited:       { bg: '#e8eaf6', color: '#283593', label: 'Book Edited' },
  new_review:        { bg: '#fce4ec', color: '#ad1457', label: 'New Review' },
  review_reply:      { bg: '#e8eaf6', color: '#3949ab', label: 'Review Reply' },
  review_flag:       { bg: '#ffebee', color: '#b71c1c', label: 'Review Flagged' },
  similar_book_added:{ bg: '#e0f7fa', color: '#00838f', label: 'Similar Book Added' },
  delete_request:    { bg: '#fce4ec', color: '#c62828', label: 'Delete Request' },
};

function getNotifStyle(type) {
  return NOTIF_STYLES[type] || { bg: '#f5f5f5', color: '#666', label: type || 'Notification' };
}

export default function NotificationBoard() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread' | 'archived'
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');

  // Announcement state (librarian only)
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementTarget, setAnnouncementTarget] = useState('');
  const [announcementPriority, setAnnouncementPriority] = useState('normal');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [announcementError, setAnnouncementError] = useState(null);
  const [announcementSuccess, setAnnouncementSuccess] = useState(false);

  // Message for inline feedback
  const [message, setMessage] = useState(null);

  // Determine if user is librarian (for announcement button)
  const storedUser = localStorage.getItem('user');
  const currentUser = storedUser ? JSON.parse(storedUser) : null;
  const isLibrarian = currentUser?.role === 'librarian';

  // ── Fetch notifications ────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (priority) params.append('priority', priority);
      if (search) params.append('search', search);
      if (filterTab === 'archived') {
        params.append('is_archived', 'true');
      } else {
        params.append('is_archived', 'false');
      }

      const res = await fetch(`/api/notifications?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to load notifications');
      const data = await res.json();
      setNotifications(data.notifications || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [category, priority, search, filterTab]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Mark read ───────────────────────────────────────────────────────
  const handleMarkRead = async (id) => {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: authHeaders(),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      );
    } catch (e) {
      console.error('Failed to mark read:', e);
    }
  };

  // ── Archive ─────────────────────────────────────────────────────────
  const handleArchive = async (id) => {
    try {
      await fetch(`/api/notifications/${id}/archive`, {
        method: 'PATCH',
        headers: authHeaders(),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.error('Failed to archive:', e);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  // ── Mark all read ───────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: authHeaders(),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setMessage({ type: 'success', text: 'All notifications marked as read' });
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      console.error('Failed to mark all read:', e);
    }
  };

  // ── Send announcement ───────────────────────────────────────────────
  const handleSendAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementMessage.trim()) {
      setAnnouncementError('Title and message are required');
      return;
    }

    setSendingAnnouncement(true);
    setAnnouncementError(null);
    setAnnouncementSuccess(false);

    try {
      const body = {
        title: announcementTitle.trim(),
        message: announcementMessage.trim(),
        priority: announcementPriority,
      };
      if (announcementTarget) body.target_role = announcementTarget;

      const res = await fetch('/api/notifications/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setAnnouncementSuccess(true);
        setAnnouncementTitle('');
        setAnnouncementMessage('');
        setMessage({ type: 'success', text: 'Announcement sent!' });
        setTimeout(() => {
          setShowAnnouncementForm(false);
          setAnnouncementSuccess(false);
        }, 2000);
      } else {
        const data = await res.json();
        setAnnouncementError(data.error || 'Failed to send announcement');
      }
    } catch (err) {
      setAnnouncementError('Network error');
    } finally {
      setSendingAnnouncement(false);
    }
  };

  // ── Filter: unread items (client-side) ──────────────────────────────
  const displayedNotifications =
    filterTab === 'unread'
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Render ──────────────────────────────────────────────────────────
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { id: 'archived', label: 'Archived' },
  ];

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: '1.5rem', maxWidth: '800px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <h2
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#2c1810',
            margin: 0,
          }}
        >
          Notifications
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              style={{
                padding: '0.4rem 0.75rem',
                background: '#2c1810',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Mark All Read
            </button>
          )}
          {isLibrarian && (
            <button
              onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
              style={{
                padding: '0.4rem 0.75rem',
                background: '#1565c0',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {showAnnouncementForm ? 'Cancel' : 'Send Announcement'}
            </button>
          )}
        </div>
      </div>

      {/* Inline message */}
      {message && (
        <div
          style={{
            padding: '0.6rem 0.75rem',
            marginBottom: '1rem',
            borderRadius: '6px',
            background: message.type === 'success' ? '#e8f5e9' : '#ffe0e0',
            color: message.type === 'success' ? '#2e7d32' : '#8b0000',
            fontSize: '0.85rem',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Announcement form */}
      {showAnnouncementForm && (
        <form
          onSubmit={handleSendAnnouncement}
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            border: '1px solid #e0d8c8',
            borderRadius: '8px',
            background: '#f8f6f0',
          }}
        >
          <h4
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              color: '#2c1810',
              margin: '0 0 0.75rem 0',
            }}
          >
            Send Announcement
          </h4>
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              value={announcementTitle}
              onChange={(e) => setAnnouncementTitle(e.target.value)}
              placeholder="Announcement title *"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <textarea
              value={announcementMessage}
              onChange={(e) => setAnnouncementMessage(e.target.value)}
              placeholder="Announcement message *"
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'DM Sans, sans-serif',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              marginBottom: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <select
              value={announcementTarget}
              onChange={(e) => setAnnouncementTarget(e.target.value)}
              style={{
                padding: '0.4rem 0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.85rem',
                flex: 1,
              }}
            >
              <option value="">All Roles</option>
              <option value="student">Students</option>
              <option value="staff">Staff</option>
              <option value="author">Authors</option>
              <option value="librarian">Librarians</option>
            </select>
            <select
              value={announcementPriority}
              onChange={(e) => setAnnouncementPriority(e.target.value)}
              style={{
                padding: '0.4rem 0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.85rem',
              }}
            >
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          {announcementError && (
            <div
              style={{
                color: '#c62828',
                fontSize: '0.85rem',
                marginBottom: '0.5rem',
              }}
            >
              {announcementError}
            </div>
          )}
          {announcementSuccess && (
            <div
              style={{
                color: '#2e7d32',
                fontSize: '0.85rem',
                marginBottom: '0.5rem',
              }}
            >
              Announcement sent successfully!
            </div>
          )}
          <button
            type="submit"
            disabled={sendingAnnouncement}
            style={{
              padding: '0.5rem 1.25rem',
              background: sendingAnnouncement ? '#999' : '#1565c0',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: sendingAnnouncement ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {sendingAnnouncement ? 'Sending...' : 'Send'}
          </button>
        </form>
      )}

      {/* Filter tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          borderBottom: '2px solid #e0d8c8',
          paddingBottom: '0.5rem',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id)}
            style={{
              padding: '0.4rem 1rem',
              border: 'none',
              borderRadius: '4px 4px 0 0',
              background: filterTab === tab.id ? '#2c1810' : 'transparent',
              color: filterTab === tab.id ? '#fff' : '#666',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: filterTab === tab.id ? 'bold' : 'normal',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search notifications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '0.4rem 0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.85rem',
            flex: 1,
            minWidth: '150px',
          }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: '0.4rem 0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        >
          <option value="">All Types</option>
          {Object.entries(NOTIF_STYLES).map(([key, val]) => (
            <option key={key} value={key}>
              {val.label}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          style={{
            padding: '0.4rem 0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Notifications list */}
      {loading ? (
        <div style={{ color: '#666', padding: '2rem', textAlign: 'center' }}>
          Loading notifications...
        </div>
      ) : error ? (
        <div
          style={{
            padding: '1rem',
            background: '#ffe0e0',
            color: '#8b0000',
            borderRadius: '6px',
          }}
        >
          {error}
        </div>
      ) : displayedNotifications.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            color: '#999',
            padding: '3rem',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔔</div>
          <div>No notifications{filterTab !== 'all' ? ` (${filterTab})` : ''}.</div>
        </div>
      ) : (
        <div>
          {displayedNotifications.map((n) => {
            const style = getNotifStyle(n.type);
            return (
              <div
                key={n.id}
                style={{
                  padding: '0.75rem 1rem',
                  marginBottom: '0.5rem',
                  border: '1px solid #e0d8c8',
                  borderRadius: '6px',
                  background: n.is_read ? '#fff' : '#fffbee',
                  borderLeft: n.is_read
                    ? '1px solid #e0d8c8'
                    : '3px solid #c9a84c',
                  transition: 'background 0.15s',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {/* Type badge */}
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        background: style.bg,
                        color: style.color,
                        marginBottom: '4px',
                      }}
                    >
                      {style.label}
                    </span>

                    {/* Title */}
                    {n.title && (
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          color: '#2c1810',
                          marginTop: '2px',
                        }}
                      >
                        {n.title}
                      </div>
                    )}

                    {/* Message */}
                    {n.message && (
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: '#555',
                          marginTop: '4px',
                          lineHeight: 1.4,
                        }}
                      >
                        {n.message}
                      </div>
                    )}

                    {/* Timestamp */}
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#999',
                        marginTop: '6px',
                      }}
                    >
                      {n.created_at
                        ? new Date(n.created_at).toLocaleString()
                        : ''}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.35rem',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        title="Mark as read"
                        style={{
                          padding: '3px 8px',
                          fontSize: '0.7rem',
                          background: '#2c1810',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                        }}
                      >
                        Read
                      </button>
                    )}
                    {filterTab !== 'archived' && (
                      <button
                        onClick={() => handleArchive(n.id)}
                        title="Archive"
                        style={{
                          padding: '3px 8px',
                          fontSize: '0.7rem',
                          background: '#5b8c5a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                        }}
                      >
                        Archive
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      title="Delete"
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.7rem',
                        background: '#c62828',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Priority indicator */}
                {n.priority === 'urgent' && (
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '0.7rem',
                      color: '#c62828',
                      fontWeight: 'bold',
                    }}
                  >
                    &#9888; Urgent
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
