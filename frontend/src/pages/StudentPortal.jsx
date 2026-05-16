// BiblioVault StudentPortal — 7-tab portal for student and staff roles.
// Tabs: browse, recommendations, my-books, history, requests, notifications, profile.
// Path: /student

import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';
import { useAuth, useRecovery } from '../context/AuthContext.jsx';
import { useSessionRecorder, CrashTestButton, CrashUnrecoverableButton, SIMULATE_UNRECOVERABLE_CRASH } from '../components/CrashRecovery.jsx';
import BookModal from '../components/BookModal.jsx';
import PDFReader from '../components/PDFReader.jsx';
import QuickReview from '../components/QuickReview.jsx';
import NotificationBoard from '../components/NotificationBoard.jsx';
import ProfileEditor from '../components/ProfileEditor.jsx';
import BookRequests from '../components/BookRequests.jsx';
import ReadingHistory from '../components/ReadingHistory.jsx';

// ── Tab navigation items (exact ids per 06_screen_flow.md) ───────────────────
const NAV_ITEMS = [
  { id: 'browse',          label: 'Browse Books',    icon: '🔍' },
  { id: 'recommendations', label: 'Recommended',     icon: '⭐' },
  { id: 'my-books',        label: 'My Borrows',      icon: '📖' },
  { id: 'history',         label: 'Reading History', icon: '📜' },
  { id: 'requests',        label: 'Book Requests',   icon: '📨' },
  { id: 'notifications',   label: 'Notifications',   icon: '🔔' },
  { id: 'profile',         label: 'My Profile',      icon: '👤' },
];

export default function StudentPortal() {
  const { user } = useAuth();
  const { recoveryState, clearRecoveryState } = useRecovery();
  const [activeTab, setActiveTab] = useState(
    recoveryState?.activeTab || 'browse'
  );

  // ── State snapshot fields (per 06_screen_flow.md §4.1) ─────────────────────
  const [search, setSearch] = useState(recoveryState?.stateSnapshot?.search || '');
  const [filterGenre, setFilterGenre] = useState(recoveryState?.stateSnapshot?.filterGenre || '');
  const [filterAvail, setFilterAvail] = useState(recoveryState?.stateSnapshot?.filterAvail || '');
  const [filterDate, setFilterDate] = useState(recoveryState?.stateSnapshot?.filterDate || '');

  // Clear recovery state after restoring (first render)
  useEffect(() => {
    if (recoveryState) {
      clearRecoveryState();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Books list
  const [books, setBooks] = useState([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState(null);

  // Recommendations
  const [recommendations, setRecommendations] = useState([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // My borrows
  const [myBorrows, setMyBorrows] = useState([]);
  const [borrowsLoading, setBorrowsLoading] = useState(false);

  // ── Session recorder ───────────────────────────────────────────────────────
  useSessionRecorder('student', activeTab, {
    search, filterGenre, filterAvail, filterDate,
  }, user?.id);

  // ── Fetch books for browse tab ─────────────────────────────────────────────
  const fetchBooks = useCallback(async () => {
    setBooksLoading(true);
    setBooksError(null);
    try {
      const res = await api.get('/books');
      setBooks(res.data || []);
    } catch (err) {
      setBooksError(err.response?.data?.error || 'Failed to load books');
    } finally {
      setBooksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'browse') {
      fetchBooks();
    }
  }, [activeTab, fetchBooks]);

  // ── Fetch recommendations ──────────────────────────────────────────────────
  const fetchRecommendations = useCallback(async () => {
    setRecsLoading(true);
    try {
      const res = await api.get('/books/recommendations');
      setRecommendations(res.data || []);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    } finally {
      setRecsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'recommendations') {
      fetchRecommendations();
    }
  }, [activeTab, fetchRecommendations]);

  // ── Fetch my borrows ───────────────────────────────────────────────────────
  const fetchMyBorrows = useCallback(async () => {
    setBorrowsLoading(true);
    try {
      const res = await api.get('/books/my-borrows');
      setMyBorrows(res.data || []);
    } catch (err) {
      console.error('Failed to load borrows:', err);
    } finally {
      setBorrowsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'my-books') {
      fetchMyBorrows();
    }
  }, [activeTab, fetchMyBorrows]);

  // ── Filter books by search, genre, availability ────────────────────────────
  const filteredBooks = books.filter((b) => {
    if (search && !b.title.toLowerCase().includes(search.toLowerCase()) &&
        !(b.author_name || '').toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filterGenre && b.genre !== filterGenre) return false;
    if (filterAvail === 'available' && b.availability !== 'available') return false;
    if (filterAvail === 'borrowed' && b.availability !== 'borrowed') return false;
    return true;
  });

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'browse':
        return renderBrowseTab();
      case 'recommendations':
        return renderRecommendationsTab();
      case 'my-books':
        return renderMyBorrowsTab();
      case 'history':
        return renderLazyComponent('ReadingHistory');
      case 'requests':
        return renderLazyComponent('BookRequests');
      case 'notifications':
        return renderLazyComponent('NotificationBoard');
      case 'profile':
        return renderLazyComponent('ProfileEditor');
      default:
        return <div style={{ color: '#666', padding: '2rem' }}>Select a tab.</div>;
    }
  };

  // Lazy-load components that we expect SA-8 to implement
  function renderLazyComponent(name) {
    try {
      // We try dynamic import patterns — but since components may or may not exist,
      // we use a simpler approach: render a placeholder wrapper that calls the
      // expected component if available.
      const Component = lazyComponentMap[name];
      if (Component) {
        return <Component />;
      }
      return (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: '#999',
          fontFamily: 'DM Sans, sans-serif',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📄</div>
          <div style={{ fontSize: '1rem' }}>{name} component is being loaded...</div>
        </div>
      );
    } catch (e) {
      return (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: '#999',
          fontFamily: 'DM Sans, sans-serif',
        }}>
          <div style={{ fontSize: '1rem' }}>{name} — loading...</div>
        </div>
      );
    }
  }

  // Shared style for tab panels
  const panelStyle = {
    fontFamily: 'DM Sans, sans-serif',
    padding: '1.5rem',
    maxWidth: '1000px',
  };

  // ── Browse Books tab ───────────────────────────────────────────────────────
  function renderBrowseTab() {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
          Browse Books
        </h2>

        {/* Filters */}
        <div style={{
          display: 'flex', gap: '0.75rem', marginBottom: '1.5rem',
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="Search by title or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '0.9rem',
              flex: 1,
              minWidth: '180px',
            }}
          />
          <select
            value={filterGenre}
            onChange={(e) => setFilterGenre(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid #ccc', borderRadius: '6px', fontSize: '0.9rem' }}
          >
            <option value="">All Genres</option>
            {['Fiction', 'Non-Fiction', 'Science Fiction', 'Fantasy', 'Mystery',
              'Romance', 'Thriller', 'Horror', 'Biography', 'History',
              'Science', 'Technology', 'Philosophy', 'Poetry', 'Drama', 'Comics',
            ].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select
            value={filterAvail}
            onChange={(e) => setFilterAvail(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid #ccc', borderRadius: '6px', fontSize: '0.9rem' }}
          >
            <option value="">All Availability</option>
            <option value="available">Available</option>
            <option value="borrowed">Borrowed</option>
          </select>
        </div>

        {/* Books grid */}
        {booksLoading ? (
          <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>Loading books...</div>
        ) : booksError ? (
          <div style={{ padding: '1rem', background: '#ffe0e0', color: '#8b0000', borderRadius: '6px' }}>
            {booksError}
          </div>
        ) : filteredBooks.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No books match these filters.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {filteredBooks.map((book) => (
              <div
                key={book.id}
                style={{
                  padding: '1.25rem',
                  border: '1px solid #e0d8c8',
                  borderRadius: '8px',
                  background: '#f8f6f0',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                }}
                onClick={() => {/* BookModal would open — SA-8 handles this */}}
              >
                <h3 style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  color: '#2c1810',
                  margin: '0 0 0.25rem 0',
                  fontSize: '1.1rem',
                }}>
                  {book.title}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#666' }}>
                  by {book.author_name}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '3px',
                    fontSize: '0.75rem',
                    background: '#e8f5e9',
                    color: '#2e7d32',
                    fontWeight: 'bold',
                  }}>
                    {book.genre}
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '3px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    background: book.availability === 'available' ? '#e3f2fd' : '#ffebee',
                    color: book.availability === 'available' ? '#1565c0' : '#c62828',
                  }}>
                    {book.availability === 'available' ? 'Available' : 'Borrowed'}
                  </span>
                </div>
                {book.publish_date && (
                  <div style={{ fontSize: '0.75rem', color: '#999' }}>
                    Published: {new Date(book.publish_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Recommendations tab ────────────────────────────────────────────────────
  function renderRecommendationsTab() {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
          Recommended for You
        </h2>
        {recsLoading ? (
          <div style={{ color: '#666' }}>Loading recommendations...</div>
        ) : recommendations.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No recommendations yet. Borrow some books to get personalized suggestions!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {recommendations.map((book) => (
              <div key={book.id} style={{
                padding: '1.25rem',
                border: '1px solid #c9a84c',
                borderRadius: '8px',
                background: '#fffbee',
              }}>
                <h3 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 0.25rem 0' }}>
                  {book.title}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#666' }}>
                  by {book.author_name}
                </p>
                <span style={{
                  padding: '2px 8px', borderRadius: '3px', fontSize: '0.75rem',
                  background: '#e8f5e9', color: '#2e7d32', fontWeight: 'bold',
                }}>
                  {book.genre}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── My Borrows tab ─────────────────────────────────────────────────────────
  function renderMyBorrowsTab() {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
          My Borrows
        </h2>
        {borrowsLoading ? (
          <div style={{ color: '#666' }}>Loading borrows...</div>
        ) : myBorrows.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '3rem' }}>
            No borrowed books yet. Browse the catalog to borrow a book!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Author</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Borrow Date</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Due Date</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {myBorrows.map((borrow, idx) => (
                  <tr key={borrow.id || idx} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>
                      {borrow.title || borrow.book_title}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{borrow.author_name}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                      {borrow.borrow_date ? new Date(borrow.borrow_date).toLocaleDateString() : ''}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                      {borrow.due_date ? new Date(borrow.due_date).toLocaleDateString() : ''}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                      <button
                        style={{
                          padding: '0.3rem 0.75rem',
                          marginRight: '0.5rem',
                          background: '#2c1810',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                        onClick={() => {/* PDFReader would open */}}
                      >
                        Read
                      </button>
                      <button
                        style={{
                          padding: '0.3rem 0.75rem',
                          background: '#8b0000',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                        onClick={() => {/* Return book */}}
                      >
                        Return
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
        width: '220px',
        minWidth: '220px',
        background: '#2c1810',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem 0',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {/* Brand */}
        <div style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: '1.5rem',
          padding: '0 1.25rem 1.25rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '1rem',
          color: '#c9a84c',
        }}>
          BiblioVault
        </div>

        {/* Role pill */}
        <div style={{
          padding: '0.25rem 1.25rem',
          marginBottom: '1rem',
          fontSize: '0.75rem',
          color: '#c9a84c',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {user?.role || 'User'}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.65rem 1.25rem',
                border: 'none',
                background: activeTab === item.id ? 'rgba(201, 168, 76, 0.15)' : 'transparent',
                color: activeTab === item.id ? '#c9a84c' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontFamily: 'DM Sans, sans-serif',
                textAlign: 'left',
                transition: 'all 0.2s',
                borderLeft: activeTab === item.id ? '3px solid #c9a84c' : '3px solid transparent',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Logout + Crash Test */}
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

// ── Logout button ────────────────────────────────────────────────────────────
function LogoutButton() {
  const { logout } = useAuth();
  const handleLogout = () => {
    logout();
    // The ProtectedRoute in App.jsx will redirect to /login
    window.location.href = '/login';
  };
  return (
    <button
      onClick={handleLogout}
      style={{
        width: '100%',
        padding: '0.5rem',
        background: 'rgba(255,255,255,0.1)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      Logout
    </button>
  );
}

// ── Lazy component map ───────────────────────────────────────────────────────
// These will be populated when SA-8 provides the components.
// For now, we render loading placeholders.
const lazyComponentMap = {
  BookModal,
  PDFReader,
  QuickReview,
  NotificationBoard,
  ProfileEditor,
  BookRequests,
  ReadingHistory,
};
