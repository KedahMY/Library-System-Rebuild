// BiblioVault StarRating component — clickable 5-star rating widget.
// Props: { value, onChange, readOnly? }

import React from 'react';

const starStyle = {
  cursor: 'pointer',
  fontSize: '1.5rem',
  color: '#c9a84c',
  transition: 'color 0.15s ease',
  background: 'none',
  border: 'none',
  padding: '2px',
};

export default function StarRating({ value = 0, onChange, readOnly = false }) {
  const handleClick = (rating) => {
    if (!readOnly && onChange) {
      onChange(rating);
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          style={{
            ...starStyle,
            cursor: readOnly ? 'default' : 'pointer',
            opacity: star <= value ? 1 : 0.3,
          }}
          onClick={() => handleClick(star)}
          onMouseEnter={(e) => {
            if (!readOnly) {
              e.currentTarget.style.transform = 'scale(1.2)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          disabled={readOnly}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          title={`${star} star${star > 1 ? 's' : ''}`}
        >
          {star <= value ? '★' : '☆'}
        </button>
      ))}
    </span>
  );
}
