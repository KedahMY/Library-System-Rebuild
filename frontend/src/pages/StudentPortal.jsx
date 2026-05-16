import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRecovery } from '../App';
import { useSessionRecorder } from '../components/CrashRecovery';
import Sidebar from '../components/Sidebar';
import BookModal from '../components/BookModal';
import PDFReader from '../components/PDFReader';
import QuickReview from '../components/QuickReview';
import NotificationBoard from '../components/NotificationBoard';
import ProfileEditor from '../components/ProfileEditor';
import ReadingHistory from '../components/ReadingHistory';
import BookRequests from '../components/BookRequests';
import api from '../utils/api';

// EXACT tab ids — crash recovery keys depend on these
const NAV_ITEMS = [
  { id: 'browse', label: 'Browse', icon: '📚' },
  { id: 'recommendations', label: 'Recommendations', icon: '⭐' },
  { id: 'my-books', label: 'My Books', icon: '📖' },
  { id: 'history', label: 'History', icon: '🕐' },
  { id: 'requests', label: 'Requests', icon: '📋' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'profile', label: 'Profile', icon: '👤' }
];

export default function StudentPortal() {
  const { user } = useAuth();
  const { recoveryState, clearRecoveryState } = useRecovery();

  // ---- Tab state ----
  const [activeTab, setActiveTab] = useState('browse');

  // ---- Snapshot fields (SA-8 will wire these up fully) ----
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterAvail, setFilterAvail] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [multiBorrowMode, setMultiBorrowMode] = useState(false);
  const [multiBorrowDuration, setMultiBorrowDuration] = useState(14);
  const [selectedForBorrow, setSelectedForBorrow] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [readingBook, setReadingBook] = useState(null);
  const [notifFilter, setNotifFilter] = useState('all');
  const [notifShowArchived, setNotifShowArchived] = useState(false);
  const [borrowSearch, setBorrowSearch] = useState('');
  const [borrowFilterGenre, setBorrowFilterGenre] = useState('');
  const [borrowFilterAvail, setBorrowFilterAvail] = useState(false);
  const [borrowFilterDate, setBorrowFilterDate] = useState('');

  // ---- API data state ----
  const [books, setBooks] = useState([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState(null);

  const [recommendedBooks, setRecommendedBooks] = useState([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState(null);

  const [borrowedBooks, setBorrowedBooks] = useState([]);
  const [myBooksLoading, setMyBooksLoading] = useState(false);
  const [myBooksError, setMyBooksError] = useState(null);

  // ---- Restore from crash recovery when recoveryState becomes available ----
  useEffect(() => {
    if (recoveryState && recoveryState.portal === 'student') {
      if (recoveryState.activeTab) {
        setActiveTab(recoveryState.activeTab);
      }
      if (recoveryState.stateSnapshot) {
        const snap = recoveryState.stateSnapshot;
        if (snap.search !== undefined) setSearch(snap.search);
        if (snap.filterGenre !== undefined) setFilterGenre(snap.filterGenre);
        if (snap.filterAvail !== undefined) setFilterAvail(snap.filterAvail);
        if (snap.filterDate !== undefined) setFilterDate(snap.filterDate);
        if (snap.multiBorrowMode !== undefined) setMultiBorrowMode(snap.multiBorrowMode);
        if (snap.multiBorrowDuration !== undefined) setMultiBorrowDuration(snap.multiBorrowDuration);
        if (snap.selectedForBorrow !== undefined) setSelectedForBorrow(snap.selectedForBorrow);
        if (snap.selectedBook !== undefined) setSelectedBook(snap.selectedBook);
        if (snap.readingBook !== undefined) setReadingBook(snap.readingBook);
        if (snap.notifFilter !== undefined) setNotifFilter(snap.notifFilter);
        if (snap.notifShowArchived !== undefined) setNotifShowArchived(snap.notifShowArchived);
        if (snap.borrowSearch !== undefined) setBorrowSearch(snap.borrowSearch);
        if (snap.borrowFilterGenre !== undefined) setBorrowFilterGenre(snap.borrowFilterGenre);
        if (snap.borrowFilterAvail !== undefined) setBorrowFilterAvail(snap.borrowFilterAvail);
        if (snap.borrowFilterDate !== undefined) setBorrowFilterDate(snap.borrowFilterDate);
      }
      clearRecoveryState();
    }
  }, [recoveryState, clearRecoveryState]);

  // ---- Session recorder ----
  const stateSnapshot = {
    search, filterGenre, filterAvail, filterDate,
    multiBorrowMode, multiBorrowDuration, selectedForBorrow,
    selectedBook, readingBook, notifFilter, notifShowArchived,
    borrowSearch, borrowFilterGenre, borrowFilterAvail, borrowFilterDate
  };

  useSessionRecorder(user?.id, 'student', activeTab, stateSnapshot);

  // ---- Data fetching ----
  const fetchBooks = useCallback(async () => {
    setBooksLoading(true);
    setBooksError(null);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterGenre) params.genre = filterGenre;
      if (filterAvail) params.available = 'true';
      if (filterDate) params.published_after = filterDate;
      const res = await api.get('/books', { params });
      setBooks(res.data.books || res.data || []);
    } catch (err) {
      setBooksError(err.response?.data?.error || 'Failed to load books');
    } finally {
      setBooksLoading(false);
    }
  }, [search, filterGenre, filterAvail, filterDate]);

  const fetchRecommendations = useCallback(async () => {
    setRecsLoading(true);
    setRecsError(null);
    try {
      const res = await api.get('/books/recommendations');
      setRecommendedBooks(res.data.books || res.data || []);
    } catch (err) {
      setRecsError(err.response?.data?.error || 'Failed to load recommendations');
    } finally {
      setRecsLoading(false);
    }
  }, []);

  const fetchMyBooks = useCallback(async () => {
    setMyBooksLoading(true);
    setMyBooksError(null);
    try {
      const params = {};
      if (borrowSearch) params.search = borrowSearch;
      if (borrowFilterGenre) params.genre = borrowFilterGenre;
      if (borrowFilterAvail) params.available = 'true';
      if (borrowFilterDate) params.published_after = borrowFilterDate;
      const res = await api.get('/books/my-borrows', { params });
      setBorrowedBooks(res.data.books || res.data || []);
    } catch (err) {
      setMyBooksError(err.response?.data?.error || 'Failed to load borrowed books');
    } finally {
      setMyBooksLoading(false);
    }
  }, [borrowSearch, borrowFilterGenre, borrowFilterAvail, borrowFilterDate]);

  useEffect(() => {
    if (activeTab === 'browse') fetchBooks();
  }, [fetchBooks, activeTab]);

  useEffect(() => {
    if (activeTab === 'recommendations') fetchRecommendations();
  }, [fetchRecommendations, activeTab]);

  useEffect(() => {
    if (activeTab === 'my-books') fetchMyBooks();
  }, [fetchMyBooks, activeTab]);

  // ---- Handlers ----
  const handleReturnBook = async (bookId) => {
    try {
      await api.post(`/books/${bookId}/return`);
      fetchMyBooks();
    } catch (err) {
      setMyBooksError(err.response?.data?.error || 'Failed to return book');
    }
  };

  const handleReadBook = useCallback((book) => {
    setReadingBook(book);
  }, []);

  const handleMultiBorrow = async () => {
    if (selectedForBorrow.length === 0) return;
    try {
      await api.post('/books/borrow-multi', {
        book_ids: selectedForBorrow,
        duration_days: multiBorrowDuration
      });
      setSelectedForBorrow([]);
      setMultiBorrowMode(false);
      fetchBooks();
    } catch (err) {
      setBooksError(err.response?.data?.error || 'Failed to borrow books');
    }
  };

  // ---- Render book card helper ----
  const renderBookCard = (book) => (
    <div
      key={book.id}
      className="card"
      style={{ padding: '1rem', cursor: 'pointer' }}
      onClick={() => setSelectedBook(book)}
    >
      {(book.cover_url || book.cover_image) && (
        <img
          src={book.cover_url || book.cover_image}
          alt={book.title}
          style={{ width: '100%', height: 180, objectFit: 'contain', marginBottom: '0.5rem' }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{book.title}</h3>
      {book.author && (
        <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{book.author}</p>
      )}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
        {book.genre && (
          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#f5f0eb', color: '#666' }}>
            {book.genre}
          </span>
        )}
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 11,
          background: book.availability === 'available' ? '#e8f5e9' : '#fdecea',
          color: book.availability === 'available' ? '#2e7d32' : '#c62828'
        }}>
          {book.availability === 'available' ? 'Available' : 'Borrowed'}
        </span>
        {book.match_reason && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#d4a017', fontStyle: 'italic', width: '100%' }}>
            {book.match_reason}
          </p>
        )}
      </div>
    </div>
  );

  // ---- Error dismiss helper ----
  const ErrorBanner = ({ message, onDismiss }) => (
    message ? (
      <div style={{
        padding: '8px 12px', marginBottom: '1rem', background: '#fdecea',
        color: '#c62828', borderRadius: 4, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span>{message}</span>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: 14 }}>x</button>
      </div>
    ) : null
  );

  // ---- Tab content rendering ----
  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case 'browse':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Browse Books</h2>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search by title, author, or ISBN..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: '200px' }}
              />
              <select value={filterGenre} onChange={e => setFilterGenre(e.target.value)} style={{ width: '150px' }}>
                <option value="">All Genres</option>
                <option value="fiction">Fiction</option>
                <option value="non-fiction">Non-Fiction</option>
                <option value="science">Science</option>
                <option value="history">History</option>
                <option value="technology">Technology</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={filterAvail}
                  onChange={e => setFilterAvail(e.target.checked)}
                />
                Available only
              </label>
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                style={{ width: '160px' }}
                title="Filter by publication date"
              />
            </div>
            <ErrorBanner message={booksError} onDismiss={() => setBooksError(null)} />
            {booksLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading books...
              </div>
            ) : books.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No books found.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {books.map(book => renderBookCard(book))}
              </div>
            )}
          </div>
        );

      case 'recommendations':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Recommendations</h2>
            <ErrorBanner message={recsError} onDismiss={() => setRecsError(null)} />
            {recsLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading recommendations...
              </div>
            ) : recommendedBooks.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No recommendations yet. Keep reading to get personalized suggestions!
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {recommendedBooks.map(book => renderBookCard(book))}
              </div>
            )}
          </div>
        );

      case 'my-books':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>My Books</h2>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Search your books..."
                value={borrowSearch}
                onChange={e => setBorrowSearch(e.target.value)}
                style={{ flex: 1, minWidth: '200px' }}
              />
              <select value={borrowFilterGenre} onChange={e => setBorrowFilterGenre(e.target.value)} style={{ width: '150px' }}>
                <option value="">All Genres</option>
                <option value="fiction">Fiction</option>
                <option value="non-fiction">Non-Fiction</option>
                <option value="science">Science</option>
                <option value="history">History</option>
                <option value="technology">Technology</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={borrowFilterAvail}
                  onChange={e => setBorrowFilterAvail(e.target.checked)}
                />
                Available only
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={multiBorrowMode}
                  onChange={e => setMultiBorrowMode(e.target.checked)}
                />
                Multi-borrow
              </label>
              {multiBorrowMode && (
                <input
                  type="number"
                  value={multiBorrowDuration}
                  onChange={e => setMultiBorrowDuration(Number(e.target.value))}
                  min={1}
                  max={90}
                  style={{ width: '80px' }}
                  title="Borrow duration (days)"
                />
              )}
            </div>
            <ErrorBanner message={myBooksError} onDismiss={() => setMyBooksError(null)} />
            {readingBook ? (
              <div>
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button className="btn btn-outline" onClick={() => setReadingBook(null)}>
                    Back to My Books
                  </button>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    Now reading: <strong style={{ color: 'var(--color-text-primary)' }}>{readingBook.title || readingBook}</strong>
                  </span>
                </div>
                <PDFReader book={readingBook} onClose={() => setReadingBook(null)} />
              </div>
            ) : myBooksLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading your borrowed books...
              </div>
            ) : borrowedBooks.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                You haven't borrowed any books yet. Browse the catalog to find your next read!
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {borrowedBooks.map(book => (
                  <div key={book.id} className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{book.title}</h3>
                      {book.author && (
                        <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{book.author}</p>
                      )}
                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                        {book.genre && <span>Genre: {book.genre}</span>}
                        {book.borrow_date && <span>Borrowed: {new Date(book.borrow_date).toLocaleDateString()}</span>}
                        {book.due_date && <span>Due: {new Date(book.due_date).toLocaleDateString()}</span>}
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 11,
                          background: book.status === 'active' ? '#e3f2fd' : '#e8f5e9',
                          color: book.status === 'active' ? '#1565c0' : '#2e7d32'
                        }}>
                          {book.status || 'active'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {multiBorrowMode && (
                        <input
                          type="checkbox"
                          checked={selectedForBorrow.includes(book.id)}
                          onChange={() => {
                            setSelectedForBorrow(prev =>
                              prev.includes(book.id)
                                ? prev.filter(id => id !== book.id)
                                : [...prev, book.id]
                            );
                          }}
                        />
                      )}
                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                        onClick={() => handleReadBook(book)}
                      >
                        Read
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                        onClick={() => handleReturnBook(book.id)}
                      >
                        Return
                      </button>
                    </div>
                  </div>
                ))}
                {multiBorrowMode && selectedForBorrow.length > 0 && (
                  <button className="btn btn-primary" onClick={handleMultiBorrow}>
                    Borrow Selected ({selectedForBorrow.length}) for {multiBorrowDuration} days
                  </button>
                )}
              </div>
            )}
          </div>
        );

      case 'history':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Reading History</h2>
            <ReadingHistory />
          </div>
        );

      case 'requests':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Book Requests</h2>
            <BookRequests />
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
  }, [activeTab, search, filterGenre, filterAvail, filterDate,
      multiBorrowMode, multiBorrowDuration, borrowSearch,
      borrowFilterGenre, borrowFilterAvail, readingBook,
      books, booksLoading, booksError,
      recommendedBooks, recsLoading, recsError,
      borrowedBooks, myBooksLoading, myBooksError,
      handleReadBook]);

  // ---- BookModal overlay ----
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
      {selectedBook && (
        <BookModal
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onBorrowSuccess={() => {
            if (activeTab === 'browse') fetchBooks();
            if (activeTab === 'my-books') fetchMyBooks();
          }}
        />
      )}
    </div>
  );
}
