import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = axios.create({ baseURL: '/api' });

const STATUS_STYLES = {
  pending: { background: '#fff3e0', color: '#e65100' },
  approved: { background: '#e8f5e9', color: '#2e7d32' },
  rejected: { background: '#fdecea', color: '#c62828' },
  published: { background: '#e8f5e9', color: '#2e7d32' }
};

const ITEMS_PER_PAGE = 20;

export default function ManagePublishedBooks({ mode = 'all' }) {
  const { user } = useAuth();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & filter
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Edit state
  const [editingBook, setEditingBook] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Bulk select
  const [selectedIds, setSelectedIds] = useState([]);

  // Version history
  const [versionBook, setVersionBook] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Add new book modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    title: '', author: '', genre: '', description: '', file: null, cover: null
  });
  const [addSaving, setAddSaving] = useState(false);

  const isManage = mode === 'manage' || user?.role === 'author';
  const token = localStorage.getItem('token');

  const fetchBooks = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: ITEMS_PER_PAGE };
      if (search) params.search = search;
      if (filterGenre) params.genre = filterGenre;
      if (filterStatus) params.status = filterStatus;

      const res = await API.get('/librarian/books', {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      setBooks(res.data.books || []);
      setTotalPages(res.data.total_pages || 1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load books');
    } finally {
      setLoading(false);
    }
  }, [search, filterGenre, filterStatus, page, token]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  // --- Edit ---
  const startEdit = (book) => {
    setEditingBook(book.id);
    setEditForm({
      title: book.title || '',
      author: book.author || '',
      genre: book.genre || '',
      description: book.description || '',
      status: book.status || ''
    });
  };

  const cancelEdit = () => {
    setEditingBook(null);
    setEditForm({});
  };

  const handleEditSave = async () => {
    try {
      setEditSaving(true);
      await API.put(`/librarian/books/${editingBook}`, editForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEditingBook(null);
      setEditForm({});
      fetchBooks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update book');
    } finally {
      setEditSaving(false);
    }
  };

  // --- Delete ---
  const handleDelete = async (id) => {
    try {
      await API.delete(`/librarian/books/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeleteConfirm(null);
      setSelectedIds(prev => prev.filter(bid => bid !== id));
      fetchBooks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete book');
    }
  };

  // --- Bulk delete ---
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} book(s)? This cannot be undone.`)) return;
    try {
      await API.post('/librarian/books/bulk-delete', { ids: selectedIds }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedIds([]);
      fetchBooks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to bulk delete');
    }
  };

  // --- Version history ---
  const handleShowVersions = async (bookId) => {
    try {
      setVersionsLoading(true);
      setVersionBook(bookId);
      const res = await API.get(`/librarian/books/${bookId}/versions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVersions(res.data.versions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load version history');
    } finally {
      setVersionsLoading(false);
    }
  };

  // --- Add new book ---
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.title.trim() || !addForm.author.trim()) {
      setError('Title and author are required');
      return;
    }
    try {
      setAddSaving(true);
      const formData = new FormData();
      formData.append('title', addForm.title.trim());
      formData.append('author', addForm.author.trim());
      if (addForm.genre) formData.append('genre', addForm.genre.trim());
      if (addForm.description) formData.append('description', addForm.description.trim());
      if (addForm.file) formData.append('file', addForm.file);
      if (addForm.cover) formData.append('cover', addForm.cover);

      await API.post('/librarian/books', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setShowAddModal(false);
      setAddForm({ title: '', author: '', genre: '', description: '', file: null, cover: null });
      fetchBooks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add book');
    } finally {
      setAddSaving(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(bid => bid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === books.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(books.map(b => b.id));
    }
  };

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

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by title or author..."
            style={{ flex: 1, minWidth: 180, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
          />
          <select value={filterGenre} onChange={(e) => { setFilterGenre(e.target.value); setPage(1); }}
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}>
            <option value="">All Genres</option>
            <option value="fiction">Fiction</option>
            <option value="non-fiction">Non-Fiction</option>
            <option value="science">Science</option>
            <option value="history">History</option>
            <option value="technology">Technology</option>
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isManage && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '8px 16px', background: '#1a1a2e', color: '#fff',
                border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13
              }}
            >
              + Add New Book
            </button>
          )}
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              style={{
                padding: '8px 16px', background: '#c62828', color: '#fff',
                border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13
              }}
            >
              Delete Selected ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Books table */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading books...</div>
      ) : books.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          No books found.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                  <th style={{ padding: 8, textAlign: 'center', width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === books.length && books.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Title</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Author</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Genre</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Availability</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Borrows</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {books.map((book, i) => (
                  <tr key={book.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f0eb' }}>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(book.id)}
                        onChange={() => toggleSelect(book.id)}
                      />
                    </td>
                    <td style={{ padding: 8 }}>{book.title}</td>
                    <td style={{ padding: 8 }}>{book.author}</td>
                    <td style={{ padding: 8 }}>{book.genre}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 11,
                        ...(STATUS_STYLES[book.status] || STATUS_STYLES.pending)
                      }}>
                        {book.status}
                      </span>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 11,
                        background: book.availability === 'available' ? '#e8f5e9' : '#fdecea',
                        color: book.availability === 'available' ? '#2e7d32' : '#c62828'
                      }}>
                        {book.availability || 'N/A'}
                      </span>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{book.times_borrowed || 0}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {editingBook === book.id ? (
                          <>
                            <button
                              onClick={handleEditSave}
                              disabled={editSaving}
                              style={{ padding: '3px 8px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 3, cursor: editSaving ? 'default' : 'pointer', fontSize: 11 }}
                            >
                              {editSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              style={{ padding: '3px 8px', background: '#999', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEdit(book)}
                            style={{ padding: '3px 8px', background: '#1565c0', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirm(book.id)}
                          style={{ padding: '3px 8px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handleShowVersions(book.id)}
                          style={{ padding: '3px 8px', background: '#4a6741', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}
                        >
                          Versions
                        </button>
                      </div>

                      {/* Inline edit form */}
                      {editingBook === book.id && (
                        <div style={{ marginTop: 8, padding: 8, background: '#fff', border: '1px solid #e0d5c7', borderRadius: 4 }}>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <input
                              value={editForm.title}
                              onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                              placeholder="Title"
                              style={{ padding: '4px 6px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12 }}
                            />
                            <input
                              value={editForm.author}
                              onChange={(e) => setEditForm(prev => ({ ...prev, author: e.target.value }))}
                              placeholder="Author"
                              style={{ padding: '4px 6px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12 }}
                            />
                            <input
                              value={editForm.genre}
                              onChange={(e) => setEditForm(prev => ({ ...prev, genre: e.target.value }))}
                              placeholder="Genre"
                              style={{ padding: '4px 6px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12 }}
                            />
                            <textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Description"
                              rows={2}
                              style={{ padding: '4px 6px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12, resize: 'vertical', fontFamily: 'DM Sans, sans-serif' }}
                            />
                            <select
                              value={editForm.status}
                              onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                              style={{ padding: '4px 6px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12 }}
                            >
                              <option value="">Select status</option>
                              <option value="pending">Pending</option>
                              <option value="approved">Approved</option>
                              <option value="rejected">Rejected</option>
                              <option value="published">Published</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Delete confirmation */}
                      {deleteConfirm === book.id && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 11, color: '#c62828' }}>Confirm delete?</span>
                          <button
                            onClick={() => handleDelete(book.id)}
                            style={{ padding: '2px 8px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={{ padding: '2px 8px', background: '#999', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}
                          >
                            No
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ padding: '4px 12px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', fontSize: 12 }}
              >
                Previous
              </button>
              <span style={{ fontSize: 13, color: '#666' }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ padding: '4px 12px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', fontSize: 12 }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Version History Modal */}
      {versionBook && (
        <div
          onClick={() => { setVersionBook(null); setVersions([]); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 8, maxWidth: 500, width: '100%',
              maxHeight: '80vh', overflow: 'auto', padding: 20
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, margin: 0 }}>Version History</h3>
              <button
                onClick={() => { setVersionBook(null); setVersions([]); }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}
              >
                &times;
              </button>
            </div>
            {versionsLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>Loading versions...</div>
            ) : versions.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>No version history available.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {versions.map((v, i) => (
                  <div key={v.id || i} style={{ padding: 10, background: '#fafafa', borderRadius: 6, border: '1px solid #e0d5c7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <strong>v{v.version_number || i + 1}</strong>
                      <span style={{ color: '#999' }}>{new Date(v.created_at).toLocaleString()}</span>
                    </div>
                    {v.changes && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{v.changes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add New Book Modal */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 8, maxWidth: 480, width: '100%',
              maxHeight: '90vh', overflow: 'auto', padding: 24
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, margin: 0 }}>Add New Book</h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#999' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddSubmit}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title *</label>
                  <input
                    value={addForm.title}
                    onChange={(e) => setAddForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Book title"
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Author *</label>
                  <input
                    value={addForm.author}
                    onChange={(e) => setAddForm(prev => ({ ...prev, author: e.target.value }))}
                    placeholder="Author name"
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Genre</label>
                  <input
                    value={addForm.genre}
                    onChange={(e) => setAddForm(prev => ({ ...prev, genre: e.target.value }))}
                    placeholder="e.g. Fiction, Science"
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
                  <textarea
                    value={addForm.description}
                    onChange={(e) => setAddForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Book description"
                    rows={3}
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Book File</label>
                  <input
                    type="file"
                    onChange={(e) => setAddForm(prev => ({ ...prev, file: e.target.files[0] }))}
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Cover Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAddForm(prev => ({ ...prev, cover: e.target.files[0] }))}
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 16px', background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSaving}
                  style={{
                    padding: '8px 16px', background: '#1a1a2e', color: '#fff',
                    border: 'none', borderRadius: 4,
                    cursor: addSaving ? 'default' : 'pointer',
                    opacity: addSaving ? 0.6 : 1, fontSize: 13
                  }}
                >
                  {addSaving ? 'Adding...' : 'Add Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
