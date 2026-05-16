// BiblioVault AuthorReviews component — displays all reviews on the
// author's books with reply and flag functionality.
// Props: { authorId }

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import StarRating from './StarRating.jsx';

const API_BASE = '';

function getToken() {
  return localStorage.getItem('token') || '';
}

function getAuthHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

export default function AuthorReviews({ authorId }) {
  const [booksWithReviews, setBooksWithReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [replyContent, setReplyContent] = useState({});
  const [flagging, setFlagging] = useState({});
  const [message, setMessage] = useState(null);

  const fetchAuthorReviews = useCallback(async () => {
    if (!authorId) return;
    setLoading(true);
    setError(null);
    try {
      // Get the author's books
      const booksRes = await axios.get(`${API_BASE}/api/books/my-submissions`, {
        headers: getAuthHeaders(),
      });
      const books = booksRes.data || [];

      // For each book, fetch its reviews
      const booksWithReviewsData = [];
      for (const book of books) {
        try {
          const reviewsRes = await axios.get(
            `${API_BASE}/api/reviews/book/${book.id}?sort=recent`,
            { headers: getAuthHeaders() }
          );
          if (reviewsRes.data.reviews && reviewsRes.data.reviews.length > 0) {
            booksWithReviewsData.push({
              ...book,
              reviews: reviewsRes.data.reviews,
              avg_rating: reviewsRes.data.avg_rating,
              review_count: reviewsRes.data.review_count,
            });
          }
        } catch (err) {
          // Skip books whose reviews couldn't be loaded
          console.error(`Failed to load reviews for book ${book.id}:`, err.message);
        }
      }
      setBooksWithReviews(booksWithReviewsData);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  useEffect(() => {
    fetchAuthorReviews();
  }, [fetchAuthorReviews]);

  const handleReply = async (reviewId) => {
    const content = replyContent[reviewId];
    if (!content || !content.trim()) return;

    try {
      await axios.post(
        `${API_BASE}/api/reviews/${reviewId}/reply`,
        { content: content.trim() },
        { headers: getAuthHeaders() }
      );
      setReplyContent((prev) => ({ ...prev, [reviewId]: '' }));
      setMessage({ type: 'success', text: 'Reply posted successfully' });
      fetchAuthorReviews();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to post reply' });
    }
  };

  const handleFlag = async (reviewId) => {
    setFlagging((prev) => ({ ...prev, [reviewId]: true }));
    try {
      await axios.post(
        `${API_BASE}/api/reviews/${reviewId}/flag`,
        {},
        { headers: getAuthHeaders() }
      );
      setMessage({ type: 'success', text: 'Review flagged for moderation' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to flag review' });
    } finally {
      setFlagging((prev) => ({ ...prev, [reviewId]: false }));
    }
  };

  if (loading) {
    return <div style={{ padding: '1rem', color: '#666' }}>Loading reviews...</div>;
  }

  if (error) {
    return (
      <div style={{
        padding: '1rem',
        background: '#ffe0e0',
        color: '#8b0000',
        borderRadius: '6px',
      }}>
        {error}
      </div>
    );
  }

  if (booksWithReviews.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
        No reviews on your books yet.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {message && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          borderRadius: '6px',
          background: message.type === 'success' ? '#e8f5e9' : '#ffe0e0',
          color: message.type === 'success' ? '#2e7d32' : '#8b0000',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
          >
            &times;
          </button>
        </div>
      )}

      {booksWithReviews.map((book) => (
        <div key={book.id} style={{
          marginBottom: '2rem',
          padding: '1rem',
          border: '1px solid #e0d8c8',
          borderRadius: '8px',
        }}>
          <h3 style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#2c1810',
            margin: '0 0 0.25rem 0',
          }}>
            {book.title}
          </h3>
          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
            Avg Rating: {book.avg_rating ? Number(book.avg_rating).toFixed(1) : 'N/A'} |{' '}
            {book.review_count || 0} review{(book.review_count || 0) !== 1 ? 's' : ''}
          </div>

          {book.reviews.map((review) => (
            <div key={review.id} style={{
              padding: '0.75rem',
              borderBottom: '1px solid #eee',
              marginBottom: '0.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>{review.full_name || review.username}</strong>
                  <StarRating value={review.rating} readOnly />
                </div>
                <span style={{ fontSize: '0.75rem', color: '#999' }}>
                  {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
                </span>
              </div>

              {review.content && (
                <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#444' }}>
                  {review.content}
                </p>
              )}

              {/* Author reply display */}
              {review.reply && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  background: '#f8f6f0',
                  borderLeft: '3px solid #c9a84c',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}>
                  <strong>Your reply:</strong> {review.reply.content}
                </div>
              )}

              {/* Reply form and flag button */}
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                {!review.reply && (
                  <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={replyContent[review.id] || ''}
                      onChange={(e) => setReplyContent((prev) => ({ ...prev, [review.id]: e.target.value }))}
                      placeholder="Write a reply..."
                      style={{
                        flex: 1,
                        padding: '0.4rem 0.5rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                      }}
                    />
                    <button
                      onClick={() => handleReply(review.id)}
                      disabled={!replyContent[review.id] || !replyContent[review.id].trim()}
                      style={{
                        padding: '0.4rem 0.75rem',
                        background: replyContent[review.id]?.trim() ? '#2c1810' : '#ccc',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: replyContent[review.id]?.trim() ? 'pointer' : 'not-allowed',
                        fontSize: '0.85rem',
                      }}
                    >
                      Reply
                    </button>
                  </div>
                )}
                <button
                  onClick={() => handleFlag(review.id)}
                  disabled={flagging[review.id]}
                  style={{
                    padding: '0.4rem 0.75rem',
                    background: 'none',
                    border: '1px solid #d32f2f',
                    borderRadius: '4px',
                    color: '#d32f2f',
                    cursor: flagging[review.id] ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {flagging[review.id] ? 'Flagging...' : 'Flag'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
