import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import StarRating from './StarRating';

const API = axios.create({ baseURL: '/api' });

export default function AuthorReviews() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [replyText, setReplyText] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [submitting, setSubmitting] = useState({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Get author's books
      const subsRes = await API.get('/books/my-submissions', { headers });
      const authorBooks = subsRes.data || [];

      // For each book, get reviews with replies
      const booksWithReviews = await Promise.all(
        authorBooks.map(async (book) => {
          try {
            const revRes = await API.get(`/reviews/book/${book.id}/with-replies`, { headers });
            return { ...book, reviews_data: revRes.data };
          } catch (err) {
            return { ...book, reviews_data: { reviews: [], aggregate: null } };
          }
        })
      );

      setBooks(booksWithReviews.filter(b => b.reviews_data.reviews.length > 0));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFlag = async (reviewId) => {
    try {
      const token = localStorage.getItem('token');
      await API.post(`/reviews/${reviewId}/flag`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Refresh
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to flag review');
    }
  };

  const handleReply = async (reviewId) => {
    const content = replyText[reviewId];
    if (!content || content.trim().length === 0) return;

    try {
      setSubmitting(prev => ({ ...prev, [reviewId]: true }));
      const token = localStorage.getItem('token');
      await API.post(`/reviews/${reviewId}/reply`, { content: content.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReplyText(prev => ({ ...prev, [reviewId]: '' }));
      setReplyingTo(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reply');
    } finally {
      setSubmitting(prev => ({ ...prev, [reviewId]: false }));
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: '#666' }}>Loading reviews...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ padding: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, marginBottom: 12 }}>{error}</div>
        <button onClick={() => setError(null)} style={{ padding: '6px 12px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Dismiss</button>
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 15 }}>
        No reviews on your books yet.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: 24 }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, margin: '0 0 16px 0' }}>
        Reviews for Your Books
      </h2>

      {books.map((book) => (
        <div key={book.id} style={{ marginBottom: 24, padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7' }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, margin: '0 0 4px 0' }}>
            {book.title}
          </h3>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
            {book.reviews_data.aggregate && (
              <span>
                Avg: {book.reviews_data.aggregate.avg_rating.toFixed(1)} ({book.reviews_data.aggregate.count} review{book.reviews_data.aggregate.count !== 1 ? 's' : ''})
              </span>
            )}
          </div>

          {book.reviews_data.reviews.map((review) => (
            <div key={review.id} style={{ marginBottom: 12, padding: 12, background: '#fff', borderRadius: 6, border: '1px solid #e0d5c7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{review.username}</strong>
                  <StarRating value={review.rating} readOnly />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#999' }}>
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleFlag(review.id)}
                    style={{ fontSize: 11, background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', color: '#c62828' }}
                    title="Flag for moderation"
                  >
                    Flag
                  </button>
                </div>
              </div>
              {review.content && (
                <p style={{ margin: '4px 0', fontSize: 13, lineHeight: 1.5 }}>{review.content}</p>
              )}

              {/* Existing replies */}
              {review.replies && review.replies.length > 0 && (
                <div style={{ marginTop: 8, paddingLeft: 16, borderLeft: '2px solid #d4a017' }}>
                  {review.replies.map((reply) => (
                    <div key={reply.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: 12 }}>{reply.full_name}</strong>
                        <span style={{ fontSize: 10, color: '#d4a017', fontWeight: 600 }}>You</span>
                        <span style={{ fontSize: 10, color: '#999' }}>
                          {new Date(reply.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p style={{ margin: '2px 0', fontSize: 13 }}>{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply form */}
              {replyingTo === review.id && (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={replyText[review.id] || ''}
                    onChange={(e) => setReplyText(prev => ({ ...prev, [review.id]: e.target.value }))}
                    placeholder="Write your reply..."
                    rows={2}
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', fontSize: 13, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => handleReply(review.id)}
                      disabled={submitting[review.id]}
                      style={{ padding: '4px 12px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: submitting[review.id] ? 'default' : 'pointer', opacity: submitting[review.id] ? 0.6 : 1 }}
                    >
                      {submitting[review.id] ? 'Sending...' : 'Send Reply'}
                    </button>
                    <button
                      onClick={() => { setReplyingTo(null); setReplyText(prev => ({ ...prev, [review.id]: '' })); }}
                      style={{ padding: '4px 12px', background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {replyingTo !== review.id && (
                <button
                  onClick={() => setReplyingTo(review.id)}
                  style={{ marginTop: 6, fontSize: 12, background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                >
                  Reply
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
