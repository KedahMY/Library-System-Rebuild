// BiblioVault ReviewSection component — displays reviews for a book and
// allows the current user to submit a new review (if they have borrowed it).
// Props: { bookId, currentUserId }

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

export default function ReviewSection({ bookId, currentUserId }) {
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [distribution, setDistribution] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New review form
  const [newRating, setNewRating] = useState(0);
  const [newContent, setNewContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Sort option
  const [sort, setSort] = useState('recent');

  const fetchReviews = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/reviews/book/${bookId}?sort=${sort}`, {
        headers: getAuthHeaders(),
      });
      setReviews(res.data.reviews || []);
      setAvgRating(res.data.avg_rating || 0);
      setReviewCount(res.data.review_count || 0);
      setDistribution(res.data.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [bookId, sort]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newRating === 0) {
      setSubmitError('Please select a rating');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      await axios.post(
        `${API_BASE}/api/reviews`,
        { book_id: bookId, rating: newRating, content: newContent, anonymous },
        { headers: getAuthHeaders() }
      );
      setSubmitSuccess(true);
      setNewRating(0);
      setNewContent('');
      setAnonymous(false);
      fetchReviews();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHelpful = async (reviewId) => {
    try {
      await axios.post(
        `${API_BASE}/api/reviews/${reviewId}/helpful`,
        {},
        { headers: getAuthHeaders() }
      );
      fetchReviews();
    } catch (err) {
      console.error('Failed to mark helpful:', err);
    }
  };

  if (loading) {
    return <div style={{ padding: '1rem', color: '#666' }}>Loading reviews...</div>;
  }

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Summary stats */}
      <div style={{
        display: 'flex',
        gap: '2rem',
        alignItems: 'center',
        marginBottom: '1.5rem',
        padding: '1rem',
        background: '#f8f6f0',
        borderRadius: '8px',
        flexWrap: 'wrap',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#c9a84c' }}>
            {avgRating.toFixed(1)}
          </div>
          <StarRating value={Math.round(avgRating)} readOnly />
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
            {reviewCount} review{reviewCount !== 1 ? 's' : ''}
          </div>
        </div>
        <div>
          {[5, 4, 3, 2, 1].map((star) => {
            const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;
            const pct = total > 0 ? ((distribution[star] || 0) / total) * 100 : 0;
            return (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0' }}>
                <span style={{ fontSize: '0.8rem', width: '30px' }}>{star} star</span>
                <div style={{
                  width: '100px',
                  height: '8px',
                  background: '#ddd',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: '#c9a84c',
                    borderRadius: '4px',
                  }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: '#666', width: '20px' }}>
                  {distribution[star] || 0}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '0.75rem',
          background: '#ffe0e0',
          color: '#8b0000',
          borderRadius: '6px',
          marginBottom: '1rem',
        }}>
          {error}
        </div>
      )}

      {/* Submit review form */}
      {currentUserId && (
        <form onSubmit={handleSubmit} style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          border: '1px solid #e0d8c8',
          borderRadius: '8px',
        }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontFamily: 'Cormorant Garamond, serif', color: '#2c1810' }}>
            Write a Review
          </h4>
          <div style={{ marginBottom: '0.75rem' }}>
            <StarRating value={newRating} onChange={setNewRating} />
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Share your thoughts about this book..."
            rows={3}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '0.9rem',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
              />
              Post anonymously
            </label>
            <button
              type="submit"
              disabled={submitting || newRating === 0}
              style={{
                padding: '0.5rem 1.25rem',
                background: submitting ? '#999' : '#2c1810',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                marginLeft: 'auto',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
          {submitError && (
            <div style={{ color: '#8b0000', fontSize: '0.85rem', marginTop: '0.5rem' }}>{submitError}</div>
          )}
          {submitSuccess && (
            <div style={{ color: '#2e7d32', fontSize: '0.85rem', marginTop: '0.5rem' }}>Review submitted successfully!</div>
          )}
        </form>
      )}

      {/* Sort controls */}
      {reviews.length > 0 && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>Sort by:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{
              padding: '0.25rem 0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.85rem',
            }}
          >
            <option value="recent">Most Recent</option>
            <option value="helpful">Most Helpful</option>
          </select>
        </div>
      )}

      {/* Reviews list */}
      {reviews.length === 0 && !loading && !error && (
        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
          No reviews yet. Be the first to review this book!
        </div>
      )}

      {reviews.map((review) => (
        <div key={review.id} style={{
          padding: '1rem',
          borderBottom: '1px solid #eee',
          marginBottom: '0.5rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <strong style={{ fontSize: '0.9rem', color: '#2c1810' }}>{review.full_name || review.username}</strong>
              {review.sentiment && (
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background: review.sentiment === 'positive' ? '#e8f5e9' :
                    review.sentiment === 'negative' ? '#ffebee' : '#f5f5f5',
                  color: review.sentiment === 'positive' ? '#2e7d32' :
                    review.sentiment === 'negative' ? '#c62828' : '#666',
                }}>
                  {review.sentiment}
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#999' }}>
              {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
            </span>
          </div>
          <div style={{ marginBottom: '4px' }}>
            <StarRating value={review.rating} readOnly />
          </div>
          {review.content && (
            <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#444', lineHeight: 1.5 }}>
              {review.content}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => handleHelpful(review.id)}
              style={{
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: '#666',
              }}
              title="Mark as helpful"
            >
              Helpful ({review.helpful_count || 0})
            </button>
            {review.reply && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: '#f8f6f0',
                borderLeft: '3px solid #c9a84c',
                borderRadius: '4px',
                width: '100%',
              }}>
                <div style={{ fontSize: '0.8rem', color: '#2c1810', fontWeight: 'bold', marginBottom: '4px' }}>
                  Author Reply
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>{review.reply.content}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
