import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import StarRating from './StarRating';

const API = axios.create({ baseURL: '/api' });

export default function ReviewSection({ bookId }) {
  const [reviews, setReviews] = useState([]);
  const [aggregate, setAggregate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/reviews/book/${bookId}/with-replies`);
      setReviews(res.data.reviews || []);
      setAggregate(res.data.aggregate);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Check if user has already reviewed
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !reviews.length) return;

    const payload = JSON.parse(atob(token.split('.')[1]));
    const userReview = reviews.find(r => r.user_id === payload.id);
    if (userReview) {
      setHasReviewed(true);
    }
  }, [reviews]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    try {
      setSubmitting(true);
      await API.post('/reviews', {
        book_id: bookId,
        rating,
        content: content.trim() || null,
        anonymous: anonymous ? 1 : 0
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setRating(0);
      setContent('');
      setAnonymous(false);
      setHasReviewed(true);
      fetchReviews();
    } catch (err) {
      if (err.response?.status === 403) {
        setError('You can only review books you have borrowed');
      } else if (err.response?.status === 409) {
        setError('You have already reviewed this book');
        setHasReviewed(true);
      } else {
        setError(err.response?.data?.error || 'Failed to submit review');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleHelpful = async (reviewId) => {
    try {
      await API.post(`/reviews/${reviewId}/helpful`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      fetchReviews();
    } catch (err) {
      console.error('Failed to mark helpful:', err);
    }
  };

  if (loading) {
    return <div style={{ padding: 16, color: '#666' }}>Loading reviews...</div>;
  }

  const getSentimentLabel = (sentiment) => {
    if (!sentiment) return null;
    const labels = { positive: 'Positive', negative: 'Negative', neutral: 'Neutral' };
    return labels[sentiment] || null;
  };

  const getSentimentColor = (sentiment) => {
    const colors = { positive: '#2e7d32', negative: '#c62828', neutral: '#666' };
    return colors[sentiment] || '#666';
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, margin: '0 0 8px 0' }}>
        Reviews
      </h3>

      {aggregate && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, padding: 12, background: '#f5f0eb', borderRadius: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a2e' }}>{aggregate.avg_rating.toFixed(1)}</div>
            <StarRating value={Math.round(aggregate.avg_rating)} readOnly />
            <div style={{ fontSize: 12, color: '#666' }}>{aggregate.count} review{aggregate.count !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ flex: 1 }}>
            {[5, 4, 3, 2, 1].map(star => {
              const count = aggregate.distribution[star] || 0;
              const pct = aggregate.count > 0 ? (count / aggregate.count) * 100 : 0;
              return (
                <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, width: 20 }}>{star}</span>
                  <div style={{ flex: 1, height: 8, background: '#ddd', borderRadius: 4 }}>
                    <div style={{ width: `${pct}%`, height: 8, background: '#d4a017', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#666', width: 24, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: 8, marginBottom: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
        </div>
      )}

      {/* Review form */}
      {!hasReviewed && (
        <form onSubmit={handleSubmit} style={{ marginBottom: 20, padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #e0d5c7' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 15 }}>Write a Review</h4>
          <div style={{ marginBottom: 8 }}>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your thoughts about this book..."
            rows={3}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', fontSize: 13, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Post anonymously
            </label>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '6px 16px', background: '#1a1a2e', color: '#fff', border: 'none',
                borderRadius: 4, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      )}

      {/* Reviews list */}
      {reviews.length === 0 && !loading && (
        <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 14 }}>
          No reviews yet. Be the first to review this book!
        </div>
      )}

      {reviews.map((review) => (
        <div key={review.id} style={{ marginBottom: 12, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e0d5c7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{review.username}</strong>
              <StarRating value={review.rating} readOnly />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {review.sentiment && (
                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: getSentimentColor(review.sentiment) + '20', color: getSentimentColor(review.sentiment), fontWeight: 600 }}>
                  {getSentimentLabel(review.sentiment)}
                </span>
              )}
              <span style={{ fontSize: 11, color: '#999' }}>
                {new Date(review.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          {review.content && (
            <p style={{ margin: '4px 0', fontSize: 13, lineHeight: 1.5 }}>{review.content}</p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => handleHelpful(review.id)}
              style={{ fontSize: 12, background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
            >
              Helpful ({review.helpful_count})
            </button>
          </div>

          {/* Author replies */}
          {review.replies && review.replies.length > 0 && (
            <div style={{ marginTop: 8, paddingLeft: 16, borderLeft: '2px solid #d4a017' }}>
              {review.replies.map((reply) => (
                <div key={reply.id} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ fontSize: 12, color: '#1a1a2e' }}>{reply.full_name}</strong>
                    <span style={{ fontSize: 10, color: '#999' }}>
                      {new Date(reply.created_at).toLocaleDateString()}
                    </span>
                    <span style={{ fontSize: 10, color: '#d4a017', fontWeight: 600 }}>Author</span>
                  </div>
                  <p style={{ margin: '2px 0', fontSize: 13 }}>{reply.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
