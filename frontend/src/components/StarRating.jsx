import React from 'react';

const STAR_SIZE = 24;

export default function StarRating({ value, onChange, readOnly }) {
  const stars = [1, 2, 3, 4, 5];

  const handleClick = (rating) => {
    if (!readOnly && onChange) {
      onChange(rating);
    }
  };

  const starStyle = {
    cursor: readOnly ? 'default' : 'pointer',
    fontSize: STAR_SIZE,
    color: '#d4a017',
    transition: 'color 0.15s'
  };

  return (
    <div style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {stars.map((star) => (
        <span
          key={star}
          onClick={() => handleClick(star)}
          style={{
            ...starStyle,
            opacity: star <= value ? 1 : 0.25
          }}
          onMouseEnter={(e) => {
            if (!readOnly) e.target.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            if (!readOnly) e.target.style.opacity = star <= value ? 1 : 0.25;
          }}
          role={readOnly ? 'img' : 'button'}
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
        >
          {star <= value ? '★' : '☆'}
        </span>
      ))}
      {value > 0 && (
        <span style={{ marginLeft: 6, fontSize: 13, color: '#666' }}>
          {value}/5
        </span>
      )}
    </div>
  );
}
