import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRecovery } from '../App';
import { useSessionRecorder } from '../components/CrashRecovery';
import Sidebar from '../components/Sidebar';
import ManagePublishedBooks from '../components/ManagePublishedBooks';
import AuthorStats from '../components/AuthorStats';
import AuthorReviews from '../components/AuthorReviews';
import NotificationBoard from '../components/NotificationBoard';
import ProfileEditor from '../components/ProfileEditor';
import api from '../utils/api';

// EXACT tab ids — crash recovery keys depend on these
const NAV_ITEMS = [
  { id: 'publish', label: 'Publish', icon: '📝' },
  { id: 'submissions', label: 'Submissions', icon: '📋' },
  { id: 'drafts', label: 'Drafts', icon: '📄' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'reviews', label: 'Reviews', icon: '⭐' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'profile', label: 'Profile', icon: '👤' }
];

const STATUS_STYLE_MAP = {
  approved: { background: '#e8f5e9', color: '#2e7d32' },
  rejected: { background: '#fdecea', color: '#c62828' },
  pending: { background: '#fff3e0', color: '#e65100' }
};

export default function AuthorPortal() {
  const { user } = useAuth();
  const { recoveryState, clearRecoveryState } = useRecovery();

  // ---- Tab state with crash recovery ----
  const [activeTab, setActiveTab] = useState('publish');

  // ---- Snapshot fields ----
  const [form, setForm] = useState({ title: '', genre: '', description: '' });
  const [formFile, setFormFile] = useState(null);
  const [formCover, setFormCover] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [notifFilter, setNotifFilter] = useState('all');
  const [notifShowArchived, setNotifShowArchived] = useState(false);

  // ---- Publish tab state ----
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(null);
  const [publishError, setPublishError] = useState(null);
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishSaved, setPublishSaved] = useState(false);

  // ---- Submissions tab state ----
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState(null);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', genre: '', description: '' });

  // ---- Drafts tab state ----
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState(null);

  // ---- Ref for auto-save draft ----
  const formRef = useRef(form);
  formRef.current = form;

  // ---- Restore from crash recovery ----
  useEffect(() => {
    if (recoveryState && recoveryState.portal === 'author') {
      if (recoveryState.activeTab) {
        setActiveTab(recoveryState.activeTab);
      }
      if (recoveryState.stateSnapshot) {
        const snap = recoveryState.stateSnapshot;
        if (snap.form !== undefined) setForm(snap.form);
        if (snap.draftId !== undefined) setDraftId(snap.draftId);
        if (snap.notifFilter !== undefined) setNotifFilter(snap.notifFilter);
        if (snap.notifShowArchived !== undefined) setNotifShowArchived(snap.notifShowArchived);
      }
      clearRecoveryState();
    }
  }, [recoveryState, clearRecoveryState]);

  // ---- Session recorder ----
  const stateSnapshot = { form, draftId, notifFilter, notifShowArchived };
  useSessionRecorder(user?.id, 'author', activeTab, stateSnapshot);

  // ---- Auto-save draft every 3 seconds ----
  useEffect(() => {
    if (activeTab !== 'publish') return;

    const interval = setInterval(async () => {
      const current = formRef.current;
      if (!current.title && !current.genre && !current.description) return;

      setPublishSaving(true);
      try {
        const payload = {
          title: current.title,
          genre: current.genre,
          description: current.description
        };
        if (draftId) payload.draft_id = draftId;

        const res = await api.post('/books/draft', payload);
        if (res.data.draft_id && !draftId) {
          setDraftId(res.data.draft_id);
        }
        setPublishSaved(true);
      } catch (err) {
        // Silent failure for auto-save
      } finally {
        setPublishSaving(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, draftId]);

  // ---- Data fetching ----
  const fetchSubmissions = useCallback(async () => {
    setSubmissionsLoading(true);
    setSubmissionsError(null);
    try {
      const res = await api.get('/books/my-submissions');
      setSubmissions(res.data.books || res.data || []);
    } catch (err) {
      setSubmissionsError(err.response?.data?.error || 'Failed to load submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const res = await api.get('/books/my-drafts');
      setDrafts(res.data.books || res.data || []);
    } catch (err) {
      setDraftsError(err.response?.data?.error || 'Failed to load drafts');
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'submissions') fetchSubmissions();
  }, [fetchSubmissions, activeTab]);

  useEffect(() => {
    if (activeTab === 'drafts') fetchDrafts();
  }, [fetchDrafts, activeTab]);

  // ---- Handlers ----

  // Form field helpers
  const handleFormChange = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  // Publish submit
  const handlePublishSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setPublishError('Title is required');
      return;
    }
    if (!form.genre) {
      setPublishError('Genre is required');
      return;
    }

    setPublishSubmitting(true);
    setPublishError(null);
    setPublishSuccess(null);

    try {
      const formData = new FormData();
      formData.append('title', form.title.trim());
      formData.append('genre', form.genre);
      formData.append('description', form.description.trim());
      if (formFile) formData.append('file', formFile);
      if (formCover) formData.append('cover', formCover);
      if (draftId) formData.append('draft_id', draftId);

      await api.post('/books/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPublishSuccess('Book submitted successfully! It is now pending librarian review.');
      setForm({ title: '', genre: '', description: '' });
      setFormFile(null);
      setFormCover(null);
      setDraftId(null);
      setPublishSaved(false);
    } catch (err) {
      setPublishError(err.response?.data?.error || 'Failed to submit book');
    } finally {
      setPublishSubmitting(false);
    }
  };

  // Submissions actions
  const handleEditSubmission = (book) => {
    setEditingSubmission(book.id);
    setEditForm({
      title: book.title || '',
      genre: book.genre || '',
      description: book.description || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingSubmission(null);
    setEditForm({ title: '', genre: '', description: '' });
  };

  const handleSaveEdit = async (id) => {
    try {
      await api.put(`/books/${id}`, editForm);
      setEditingSubmission(null);
      fetchSubmissions();
    } catch (err) {
      setSubmissionsError(err.response?.data?.error || 'Failed to update submission');
    }
  };

  const handleDeleteSubmission = async (id) => {
    try {
      await api.delete(`/books/${id}`);
      fetchSubmissions();
    } catch (err) {
      setSubmissionsError(err.response?.data?.error || 'Failed to delete submission');
    }
  };

  // Drafts actions
  const handleResumeDraft = (draft) => {
    setForm({
      title: draft.title || '',
      genre: draft.genre || '',
      description: draft.description || ''
    });
    setFormFile(null);
    setFormCover(null);
    if (draft.id) setDraftId(draft.id);
    setActiveTab('publish');
  };

  // ---- Tab content rendering ----
  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case 'publish':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Publish New Book</h2>
            <div className="card" style={{ padding: '2rem' }}>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                Upload your manuscript, set metadata, and publish to the BiblioVault catalog.
                {publishSaved && draftId && (
                  <span style={{ marginLeft: '0.5rem', color: '#2e7d32', fontSize: '0.85rem' }}>
                    (Draft auto-saved {publishSaving ? '...' : '✓'})
                  </span>
                )}
              </p>

              {publishError && (
                <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
                  {publishError}
                  <button onClick={() => setPublishError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
                </div>
              )}
              {publishSuccess && (
                <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, fontSize: 13 }}>
                  {publishSuccess}
                </div>
              )}

              <form onSubmit={handlePublishSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Title *</label>
                  <input
                    type="text"
                    placeholder="Book title"
                    value={form.title}
                    onChange={e => handleFormChange('title', e.target.value)}
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Genre *</label>
                  <select
                    value={form.genre}
                    onChange={e => handleFormChange('genre', e.target.value)}
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
                  >
                    <option value="">Select genre...</option>
                    <option value="fiction">Fiction</option>
                    <option value="non-fiction">Non-Fiction</option>
                    <option value="science">Science</option>
                    <option value="history">History</option>
                    <option value="technology">Technology</option>
                  </select>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Description</label>
                  <textarea
                    rows={4}
                    placeholder="Book description..."
                    value={form.description}
                    onChange={e => handleFormChange('description', e.target.value)}
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Upload PDF</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => setFormFile(e.target.files[0] || null)}
                  />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Cover Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setFormCover(e.target.files[0] || null)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={publishSubmitting}
                >
                  {publishSubmitting ? 'Submitting...' : 'Submit for Review'}
                </button>
              </form>
            </div>
          </div>
        );

      case 'submissions':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Submissions</h2>
            {submissionsError && (
              <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
                {submissionsError}
                <button onClick={() => setSubmissionsError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
              </div>
            )}
            {submissionsLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading submissions...
              </div>
            ) : submissions.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                You haven't submitted any books yet.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {submissions.map(book => (
                  <div key={book.id} className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{book.title}</h3>
                        <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                          {book.genre || 'No genre'}
                          {book.created_at && <> — Submitted: {new Date(book.created_at).toLocaleDateString()}</>}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          ...(STATUS_STYLE_MAP[book.status] || STATUS_STYLE_MAP.pending)
                        }}>
                          {book.status}
                        </span>
                        {editingSubmission === book.id ? (
                          <>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                              onClick={() => handleSaveEdit(book.id)}
                            >
                              Save
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                              onClick={handleCancelEdit}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-outline"
                            style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                            onClick={() => handleEditSubmission(book)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="btn btn-outline"
                          style={{ padding: '4px 12px', fontSize: '0.8rem', color: '#c62828', borderColor: '#c62828' }}
                          onClick={() => handleDeleteSubmission(book.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {editingSubmission === book.id && (
                      <div style={{
                        marginTop: '0.75rem', padding: '0.75rem',
                        background: '#fafafa', borderRadius: 6,
                        border: '1px solid #e0d5c7', display: 'grid', gap: '0.5rem'
                      }}>
                        <input
                          value={editForm.title}
                          onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Title"
                          style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                        />
                        <input
                          value={editForm.genre}
                          onChange={e => setEditForm(prev => ({ ...prev, genre: e.target.value }))}
                          placeholder="Genre"
                          style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                        />
                        <textarea
                          value={editForm.description}
                          onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Description"
                          rows={2}
                          style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
                        />
                      </div>
                    )}
                    {book.description && editingSubmission !== book.id && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        {book.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'drafts':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Drafts</h2>
            {draftsError && (
              <div style={{ padding: '8px 12px', marginBottom: '1rem', background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
                {draftsError}
                <button onClick={() => setDraftsError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
              </div>
            )}
            {draftsLoading ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading drafts...
              </div>
            ) : drafts.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No saved drafts. Start a new book submission to create a draft.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {drafts.map(draft => (
                  <div key={draft.id} className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{draft.title || 'Untitled Draft'}</h3>
                      <p style={{ margin: '0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        {draft.genre || 'No genre'}
                        {draft.updated_at && <> — Last saved: {new Date(draft.updated_at).toLocaleString()}</>}
                      </p>
                      {draft.description && (
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          {draft.description.length > 100 ? draft.description.substring(0, 100) + '...' : draft.description}
                        </p>
                      )}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '6px 16px', flexShrink: 0 }}
                      onClick={() => handleResumeDraft(draft)}
                    >
                      Resume
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'stats':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Author Statistics</h2>
            <AuthorStats />
          </div>
        );

      case 'reviews':
        return (
          <div>
            <h2 style={{ marginBottom: '1rem' }}>Reviews</h2>
            <AuthorReviews />
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
  }, [activeTab, form, draftId,
      publishSubmitting, publishSuccess, publishError, publishSaving, publishSaved,
      submissions, submissionsLoading, submissionsError,
      editingSubmission, editForm,
      drafts, draftsLoading, draftsError,
      handleFormChange]);

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
