// BiblioVault ManagePublishedBooks component — librarian management of all
// published books with add, edit, delete, bulk delete, and version history.

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = '';

function getToken() {
  return localStorage.getItem('token') || '';
}

function getAuthHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

export default function ManagePublishedBooks() {
  // Book list state
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [filters, setFilters] = useState({ search: '', status: '', genre: '' });

  // Add/Edit modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editBookId, setEditBookId] = useState(null);
  const [form, setForm] = useState({ title: '', author_name: '', genre: '', description: '', generate_summary: false });
  const [formFile, setFormFile] = useState(null);
  const [formCover, setFormCover] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState([]);

  // Version history state
  const [versionsBookId, setVersionsBookId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Message
  const [message, setMessage] = useState(null);

  const fetchBooks = useCallback(async (page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', page || pagination.page);
      params.append('limit', pagination.limit);
      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);
      if (filters.genre) params.append('genre', filters.genre);
      const res = await axios.get(`${API_BASE}/api/librarian/books?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      setBooks(res.data.books || []);
      setPagination((p) => ({ ...p, ...res.data.pagination }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load books');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchBooks(1);
  }, [filters]);

  // Add new book
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.author_name.trim() || !form.genre.trim()) {
      setFormError('Title, author name, and genre are required');
      return;
    }
    if (!formFile && !editBookId) {
      setFormError('Book file is required');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append('title', form.title.trim());
      formData.append('author_name', form.author_name.trim());
      formData.append('genre', form.genre.trim());
      if (form.description.trim()) formData.append('description', form.description.trim());
      if (formFile) formData.append('file', formFile);
      if (formCover) formData.append('cover_image', formCover);
      if (form.generate_summary) formData.append('generate_summary', 'true');

      await axios.post(`${API_BASE}/api/librarian/books`, formData, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' },
      });
      setMessage({ type: 'success', text: 'Book added successfully!' });
      setShowAddModal(false);
      resetForm();
      fetchBooks(1);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to add book');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Edit book
  const handleEdit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      if (form.title.trim()) formData.append('title', form.title.trim());
      if (form.author_name.trim()) formData.append('author_name', form.author_name.trim());
      if (form.genre.trim()) formData.append('genre', form.genre.trim());
      if (form.description.trim()) formData.append('description', form.description.trim());
      if (formFile) formData.append('file', formFile);
      if (formCover) formData.append('cover_image', formCover);

      await axios.put(`${API_BASE}/api/librarian/books/${editBookId}`, formData, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' },
      });
      setMessage({ type: 'success', text: 'Book updated successfully!' });
      setEditBookId(null);
      resetForm();
      fetchBooks(pagination.page);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update book');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete book
  const handleDelete = async (bookId) => {
    try {
      await axios.delete(`${API_BASE}/api/librarian/books/${bookId}`, {
        headers: getAuthHeaders(),
      });
      setMessage({ type: 'success', text: 'Book permanently deleted' });
      setDeleteConfirm(null);
      fetchBooks(pagination.page);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to delete' });
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (bulkDeleteIds.length === 0) return;
    try {
      await axios.post(
        `${API_BASE}/api/librarian/books/bulk-delete`,
        { book_ids: bulkDeleteIds },
        { headers: getAuthHeaders() }
      );
      setMessage({ type: 'success', text: `${bulkDeleteIds.length} book(s) deleted` });
      setBulkDeleteIds([]);
      fetchBooks(1);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Bulk delete failed' });
    }
  };

  // Fetch version history
  const handleVersions = async (bookId) => {
    setVersionsBookId(bookId);
    setVersionsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/librarian/books/${bookId}/versions`, {
        headers: getAuthHeaders(),
      });
      setVersions(res.data.versions || []);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load version history' });
    } finally {
      setVersionsLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ title: '', author_name: '', genre: '', description: '', generate_summary: false });
    setFormFile(null);
    setFormCover(null);
  };

  const openEditModal = (book) => {
    setForm({
      title: book.title,
      author_name: book.author_name,
      genre: book.genre,
      description: book.description || '',
      generate_summary: false,
    });
    setEditBookId(book.id);
    setShowAddModal(true);
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { background: '#fff3e0', color: '#e65100' },
      approved: { background: '#e8f5e9', color: '#2e7d32' },
      rejected: { background: '#ffebee', color: '#c62828' },
      pending_deletion: { background: '#fce4ec', color: '#c62828' },
    };
    const s = styles[status] || { background: '#f5f5f5', color: '#666' };
    return (
      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold', ...s }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', marginBottom: '1rem' }}>
        Manage Published Books
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

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search title or author..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          style={{ padding: '0.4rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.85rem', flex: 1, minWidth: '200px' }}
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
          <option value="pending_deletion">Pending Deletion</option>
        </select>
        <button
          onClick={() => { setShowAddModal(true); setEditBookId(null); resetForm(); }}
          style={{ padding: '0.4rem 1rem', background: '#2c1810', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          + Add Book
        </button>
        {bulkDeleteIds.length > 0 && (
          <button
            onClick={handleBulkDelete}
            style={{ padding: '0.4rem 1rem', background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Delete Selected ({bulkDeleteIds.length})
          </button>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 1rem 0' }}>
              {editBookId ? 'Edit Book' : 'Add New Book'}
            </h3>
            <form onSubmit={editBookId ? handleEdit : handleAdd}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>Title *</label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>Author Name *</label>
                <input type="text" value={form.author_name} onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>Genre *</label>
                <input type="text" value={form.genre} onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>Description</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              {!editBookId && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>Book File *</label>
                  <input type="file" onChange={(e) => setFormFile(e.target.files[0])} accept=".pdf,.txt,.doc,.docx"
                    style={{ fontSize: '0.85rem' }} />
                </div>
              )}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px' }}>Cover Image</label>
                <input type="file" onChange={(e) => setFormCover(e.target.files[0])} accept=".jpg,.jpeg,.png"
                  style={{ fontSize: '0.85rem' }} />
              </div>
              {!editBookId && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.generate_summary} onChange={(e) => setForm((f) => ({ ...f, generate_summary: e.target.checked }))} />
                    Generate description via AI (if no description provided)
                  </label>
                </div>
              )}
              {formError && <div style={{ color: '#c62828', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{formError}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowAddModal(false); resetForm(); setEditBookId(null); }}
                  style={{ padding: '0.5rem 1rem', background: '#666', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={formSubmitting}
                  style={{ padding: '0.5rem 1rem', background: formSubmitting ? '#999' : '#2c1810', color: '#fff', border: 'none', borderRadius: '4px', cursor: formSubmitting ? 'not-allowed' : 'pointer' }}>
                  {formSubmitting ? 'Saving...' : editBookId ? 'Update' : 'Add Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Book list */}
      <div style={{ border: '1px solid #e0d8c8', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0d8c8' }}>
                <th style={{ padding: '0.5rem 0.75rem', width: '30px' }}>
                  <input type="checkbox" onChange={(e) => {
                    if (e.target.checked) setBulkDeleteIds(books.map((b) => b.id));
                    else setBulkDeleteIds([]);
                  }} />
                </th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Title</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Author</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Genre</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Borrows</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Rating</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading books...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#c62828' }}>{error}</td>
                </tr>
              ) : books.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>No books found.</td>
                </tr>
              ) : (
                books.map((book, idx) => (
                  <tr key={book.id} style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <input type="checkbox" checked={bulkDeleteIds.includes(book.id)} onChange={(e) => {
                        if (e.target.checked) setBulkDeleteIds((ids) => [...ids, book.id]);
                        else setBulkDeleteIds((ids) => ids.filter((id) => id !== book.id));
                      }} />
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{book.title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{book.author_name}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{book.genre}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{getStatusBadge(book.status)}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{book.times_borrowed || 0}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                      {Number(book.average_rating || 0).toFixed(1)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button onClick={() => openEditModal(book)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#2c1810', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button onClick={() => handleVersions(book.id)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#1565c0', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                          History
                        </button>
                        <button onClick={() => setDeleteConfirm(book.id)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#c62828', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          {Array.from({ length: pagination.total_pages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => fetchBooks(p)}
              style={{
                padding: '0.3rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px',
                background: pagination.page === p ? '#2c1810' : '#fff',
                color: pagination.page === p ? '#fff' : '#333', cursor: 'pointer', fontSize: '0.85rem',
              }}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', maxWidth: '400px', textAlign: 'center' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#2c1810' }}>Confirm Delete</h4>
            <p style={{ fontSize: '0.9rem', color: '#555' }}>Are you sure you want to permanently delete this book? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding: '0.5rem 1rem', background: '#666', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                style={{ padding: '0.5rem 1rem', background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Panel */}
      {versionsBookId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
            <h4 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2c1810', margin: '0 0 1rem 0' }}>
              Version History
            </h4>
            {versionsLoading ? (
              <div style={{ color: '#666' }}>Loading versions...</div>
            ) : versions.length === 0 ? (
              <div style={{ color: '#999' }}>No version history available.</div>
            ) : (
              versions.map((v) => (
                <div key={v.id} style={{ padding: '0.75rem', marginBottom: '0.5rem', border: '1px solid #e0d8c8', borderRadius: '6px', background: '#f8f6f0' }}>
                  <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>
                    Changed by {v.changed_by_username} on {v.created_at ? new Date(v.created_at).toLocaleString() : ''}
                  </div>
                  <pre style={{ fontSize: '0.75rem', margin: 0, whiteSpace: 'pre-wrap', color: '#444', maxHeight: '150px', overflow: 'auto' }}>
                    {typeof v.changes === 'object' ? JSON.stringify(v.changes, null, 2) : v.changes}
                  </pre>
                </div>
              ))
            )}
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button onClick={() => setVersionsBookId(null)}
                style={{ padding: '0.5rem 1rem', background: '#2c1810', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
