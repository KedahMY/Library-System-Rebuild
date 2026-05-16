// BiblioVault AuthorPortal — 7-tab portal for author role.
// Tabs: publish, submissions, drafts, stats, reviews, notifications, profile.
// Path: /author

import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';
import { useAuth, useRecovery } from '../context/AuthContext.jsx';
import { useSessionRecorder, CrashTestButton, CrashUnrecoverableButton, SIMULATE_UNRECOVERABLE_CRASH } from '../components/CrashRecovery.jsx';
import AuthorStats from '../components/AuthorStats.jsx';
import AuthorReviews from '../components/AuthorReviews.jsx';
import NotificationBoard from '../components/NotificationBoard.jsx';
import ProfileEditor from '../components/ProfileEditor.jsx';

// ── Tab navigation items (exact ids per 06_screen_flow.md) ───────────────────
const NAV_ITEMS = [
  { id: 'publish',       label: 'Publish New Book', icon: '✍️' },
  { id: 'submissions',   label: 'My Submissions',   icon: '📋' },
  { id: 'drafts',        label: 'Drafts',           icon: '📝' },
  { id: 'stats',         label: 'Stats',            icon: '📊' },
  { id: 'reviews',       label: 'Reviews',          icon: '💬' },
  { id: 'notifications', label: 'Notifications',    icon: '🔔' },
  { id: 'profile',       label: 'My Profile',       icon: '👤' },
];

const GENRES = [
  'Fiction', 'Non-Fiction', 'Science Fiction', 'Fantasy', 'Mystery',
  'Romance', 'Thriller', 'Horror', 'Biography', 'History',
  'Science', 'Technology', 'Philosophy', 'Poetry', 'Drama', 'Comics',
];

export default function AuthorPortal() {
  const { user } = useAuth();
  const { recoveryState, clearRecoveryState } = useRecovery();
  const [activeTab, setActiveTab] = useState(
    recoveryState?.activeTab || 'publish'
  );

  // ── State snapshot fields (per 06_screen_flow.md §5.1) ─────────────────────
  const [form, setForm] = useState(
    recoveryState?.stateSnapshot?.form || { title: '', genre: [], description: '' }
  );
  const [draftId, setDraftId] = useState(recoveryState?.stateSnapshot?.draftId || null);
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

  // Submissions
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Drafts
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);

  // ── Session recorder ───────────────────────────────────────────────────────
  useSessionRecorder('author', activeTab, {
    form, draftId, notifFilter, notifShowArchived,
  }, user?.id);

  // ── Fetch submissions ──────────────────────────────────────────────────────
  const fetchSubmissions = useCallback(async () => {
    setSubmissionsLoading(true);
    try {
      const res = await api.get('/books/my-submissions');
      setSubmissions(res.data || []);
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'submissions') {
      fetchSubmissions();
    }
  }, [activeTab, fetchSubmissions]);

  // ── Fetch drafts ───────────────────────────────────────────────────────────
  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await api.get('/books/my-drafts');
      setDrafts(res.data || []);
    } catch (err) {
      console.error('Failed to load drafts:', err);
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'drafts') {
      fetchDrafts();
    }
  }, [activeTab, fetchDrafts]);

  // ── Publish form handlers ──────────────────────────────────────────────────
  const handleGenreToggle = (genre) => {
    setForm((prev) => ({
      ...prev,
      genre: prev.genre.includes(genre)
        ? prev.genre.filter((g) => g !== genre)
        : [...prev.genre, genre],
    }));
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'publish':
        return renderPublishTab();
      case 'submissions':
        return renderSubmissionsTab();
      case 'drafts':
        return renderDraftsTab();
      case 'stats':
        return renderLazyComponent('AuthorStats', { authorId: user?.id });
      case 'reviews':
        return renderLazyComponent('AuthorReviews', { authorId: user?.id });
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
    maxWidth: '1000px',
  };

  // ── Publish New Book tab ───────────────────────────────────────────────────
  function renderPublishTab() {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1.5rem' }}>
          Publish New Book
        </h2>

        <div style={{ maxWidth: '600px' }}>
          {/* Title */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Title *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Book title"
              style={{
                width: '100%', padding: '0.6rem 0.75rem',
                border: '1px solid #d0d0d0', borderRadius: '6px',
                fontSize: '0.9rem', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Author name (pre-filled) */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Author Name
            </label>
            <input
              type="text"
              value={user?.full_name || ''}
              disabled
              style={{
                width: '100%', padding: '0.6rem 0.75rem',
                border: '1px solid #e0e0e0', borderRadius: '6px',
                fontSize: '0.9rem', boxSizing: 'border-box',
                background: '#f5f5f5', color: '#666',
              }}
            />
          </div>

          {/* Genre multi-select */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '6px', fontWeight: 500 }}>
              Genre(s) *
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => handleGenreToggle(g)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    border: form.genre.includes(g) ? '2px solid #c9a84c' : '1px solid #d0d0d0',
                    borderRadius: '20px',
                    background: form.genre.includes(g) ? '#fffbee' : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: form.genre.includes(g) ? '#c9a84c' : '#555',
                    fontWeight: form.genre.includes(g) ? 600 : 400,
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Description * (minimum 20 characters)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Write a description for your book..."
              rows={4}
              style={{
                width: '100%', padding: '0.6rem 0.75rem',
                border: '1px solid #d0d0d0', borderRadius: '6px',
                fontSize: '0.9rem', boxSizing: 'border-box',
                resize: 'vertical', fontFamily: 'DM Sans, sans-serif',
              }}
            />
            <div style={{
              fontSize: '0.75rem', color: form.description.length >= 20 ? '#2e7d32' : '#999',
              marginTop: '4px',
            }}>
              {form.description.length} / 20 characters minimum
            </div>
          </div>

          {/* Generate Summary button */}
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              type="button"
              style={{
                padding: '0.5rem 1.25rem',
                background: '#5b8c5a',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontFamily: 'DM Sans, sans-serif',
              }}
              onClick={async () => {
                try {
                  const res = await api.post('/llm/summary', {
                    title: form.title,
                    author: user?.full_name,
                    genre: form.genre.join(', '),
                    style: 'short',
                  });
                  if (res.data?.summary) {
                    setForm((prev) => ({ ...prev, description: res.data.summary }));
                  }
                } catch (err) {
                  console.error('Failed to generate summary:', err);
                  alert(err.response?.data?.error || 'Failed to generate summary');
                }
              }}
            >
              Generate Summary (AI)
            </button>
          </div>

          {/* File upload */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Book File * (PDF, TXT, DOC, DOCX — max 50 MB)
            </label>
            <input
              type="file"
              accept=".pdf,.txt,.doc,.docx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{
                width: '100%', padding: '0.5rem 0',
                fontSize: '0.85rem',
              }}
            />
          </div>

          {/* Cover image (optional) */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Cover Image (optional — JPG/PNG, max 2 MB)
            </label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              style={{
                width: '100%', padding: '0.5rem 0',
                fontSize: '0.85rem',
              }}
            />
          </div>

          {/* Submit button */}
          <button
            type="button"
            style={{
              padding: '0.65rem 2rem',
              background: '#2c1810',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 600,
              fontFamily: 'DM Sans, sans-serif',
            }}
            onClick={async () => {
              if (!form.title.trim()) { alert('Title is required'); return; }
              if (form.genre.length === 0) { alert('At least one genre is required'); return; }
              if (form.description.trim().length < 20) { alert('Description must be at least 20 characters'); return; }

              try {
                const formData = new FormData();
                formData.append('title', form.title.trim());
                formData.append('author_name', user?.full_name || '');
                formData.append('genre', form.genre.join(', '));
                formData.append('description', form.description.trim());

                const fileInput = document.querySelector('input[type="file"][accept*=".pdf"]');
                if (fileInput?.files[0]) {
                  formData.append('file', fileInput.files[0]);
                }

                const coverInput = document.querySelector('input[type="file"][accept*=".jpg"]');
                if (coverInput?.files[0]) {
                  formData.append('cover_image', coverInput.files[0]);
                }

                await api.post('/books/submit', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                alert('Book submitted successfully!');
                setForm({ title: '', genre: [], description: '' });
                setDraftId(null);
              } catch (err) {
                alert(err.response?.data?.error || 'Failed to submit book');
              }
            }}
          >
            Submit Book
          </button>
        </div>
      </div>
    );
  }

  // ── My Submissions tab ────────────────────────────────────────────────────
  function renderSubmissionsTab() {
    const statusStyles = {
      pending: { bg: '#fff3e0', color: '#e65100' },
      approved: { bg: '#e8f5e9', color: '#2e7d32' },
      rejected: { bg: '#ffebee', color: '#c62828' },
      pending_deletion: { bg: '#fce4ec', color: '#880e4f' },
    };

    return (
      <div style={panelStyle}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
          My Submissions
        </h2>
        {submissionsLoading ? (
          <div style={{ color: '#666' }}>Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No submissions yet. Use the Publish tab to submit a book.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Genre</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Submitted</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((book, idx) => {
                  const ss = statusStyles[book.status] || { bg: '#f5f5f5', color: '#666' };
                  return (
                    <tr key={book.id || idx} style={{
                      borderBottom: '1px solid #eee',
                      background: idx % 2 === 0 ? '#fff' : '#fafafa',
                    }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{book.title}</td>
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
                        <button style={{
                          padding: '0.3rem 0.6rem', background: '#2c1810', color: '#fff',
                          border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem',
                          marginRight: '0.3rem',
                        }}>
                          Edit
                        </button>
                        <button style={{
                          padding: '0.3rem 0.6rem', background: '#c62828', color: '#fff',
                          border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem',
                        }}>
                          Delete
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

  // ── Drafts tab ─────────────────────────────────────────────────────────────
  function renderDraftsTab() {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
          Drafts
        </h2>
        {draftsLoading ? (
          <div style={{ color: '#666' }}>Loading drafts...</div>
        ) : drafts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No drafts saved. Start a new book submission and it will auto-save.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Genre</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Last Saved</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d, idx) => (
                  <tr key={d.id || idx} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{d.title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{d.genre}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#666' }}>
                      {d.submitted_date ? new Date(d.submitted_date).toLocaleString() : ''}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                      <button style={{
                        padding: '0.3rem 0.75rem', background: '#5b8c5a', color: '#fff',
                        border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                      }}>
                        Resume
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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf8f5' }}>
      {/* Sidebar */}
      <div style={{
        width: '220px', minWidth: '220px',
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
          Author
        </div>
        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                width: '100%', padding: '0.65rem 1.25rem',
                border: 'none',
                background: activeTab === item.id ? 'rgba(201, 168, 76, 0.15)' : 'transparent',
                color: activeTab === item.id ? '#c9a84c' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer', fontSize: '0.9rem',
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
  AuthorStats,
  AuthorReviews,
  NotificationBoard,
  ProfileEditor,
};
