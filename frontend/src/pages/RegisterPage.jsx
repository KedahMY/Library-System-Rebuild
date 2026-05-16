import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { id: 'student', label: 'Student', icon: '🎓' },
  { id: 'staff', label: 'Staff', icon: '👔' },
  { id: 'author', label: 'Author', icon: '✍️' },
  { id: 'librarian', label: 'Librarian', icon: '📚' }
];

function validateForm(data) {
  const errors = {};
  if (!data.username || data.username.length < 3) {
    errors.username = 'Username must be at least 3 characters';
  } else if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
    errors.username = 'Only letters, numbers, and underscores';
  }
  if (!data.full_name || data.full_name.trim().length === 0) {
    errors.full_name = 'Full name is required';
  }
  if (!data.password || data.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  } else if (!/[A-Z]/.test(data.password)) {
    errors.password = 'Must contain an uppercase letter';
  } else if (!/[a-z]/.test(data.password)) {
    errors.password = 'Must contain a lowercase letter';
  } else if (!/[0-9]/.test(data.password)) {
    errors.password = 'Must contain a digit';
  } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(data.password)) {
    errors.password = 'Must contain a special character';
  }
  if (data.password !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }
  return errors;
}

function getPortalPath(role) {
  if (role === 'student' || role === 'staff') return '/student';
  if (role === 'author') return '/author';
  if (role === 'librarian') return '/librarian';
  return '/login';
}

export default function RegisterPage() {
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    password: '',
    confirmPassword: '',
    bio: '',
    employee_id: ''
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!role) {
      setServerError('Please select a role');
      return;
    }

    const clientErrors = validateForm({ ...form });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        username: form.username,
        full_name: form.full_name,
        password: form.password,
        role
      };
      if (role === 'author') payload.bio = form.bio;
      if (role === 'librarian') payload.employee_id = form.employee_id;

      await register(payload);
      navigate(getPortalPath(role), { replace: true });
    } catch (err) {
      const responseData = err.response?.data;
      if (responseData?.errors) {
        const serverErrors = {};
        for (const [field, msg] of Object.entries(responseData.errors)) {
          serverErrors[field] = msg;
        }
        setErrors(prev => ({ ...prev, ...serverErrors }));
      } else {
        setServerError(responseData?.error || 'Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-navy)',
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--color-dark-card)',
        borderRadius: 'var(--radius-lg)',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '520px',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Create Account</h1>
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
          Join BiblioVault today
        </p>

        {serverError && (
          <div style={{
            background: 'rgba(231, 76, 60, 0.15)',
            border: '1px solid var(--color-ruby)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem',
            marginBottom: '1rem',
            color: '#e57373',
            fontSize: '0.9rem'
          }}>
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Role Selection */}
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'var(--color-text-muted)',
            fontSize: '0.85rem'
          }}>
            I am a...
          </label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            marginBottom: '1.5rem'
          }}>
            {ROLES.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setRole(r.id); setServerError(''); }}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: role === r.id
                    ? '2px solid var(--color-gold)'
                    : '1px solid var(--color-border)',
                  background: role === r.id
                    ? 'rgba(201, 168, 76, 0.1)'
                    : 'var(--color-dark-surface)',
                  color: role === r.id ? 'var(--color-gold)' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{r.icon}</div>
                {r.label}
              </button>
            ))}
          </div>

          {/* Username */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.35rem',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem'
            }}>
              Username
            </label>
            <input
              type="text"
              value={form.username}
              onChange={e => updateField('username', e.target.value)}
              placeholder="Choose a username"
              required
            />
            {errors.username && (
              <div style={{ color: '#e57373', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                {errors.username}
              </div>
            )}
          </div>

          {/* Full Name */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.35rem',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem'
            }}>
              Full Name
            </label>
            <input
              type="text"
              value={form.full_name}
              onChange={e => updateField('full_name', e.target.value)}
              placeholder="Your full name"
              required
            />
            {errors.full_name && (
              <div style={{ color: '#e57373', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                {errors.full_name}
              </div>
            )}
          </div>

          {/* Password */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.35rem',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem'
            }}>
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => updateField('password', e.target.value)}
              placeholder="At least 8 characters with uppercase, lowercase, digit & special"
              required
            />
            {errors.password && (
              <div style={{ color: '#e57373', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                {errors.password}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.35rem',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem'
            }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={e => updateField('confirmPassword', e.target.value)}
              placeholder="Re-enter your password"
              required
            />
            {errors.confirmPassword && (
              <div style={{ color: '#e57373', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                {errors.confirmPassword}
              </div>
            )}
          </div>

          {/* Bio (Author only) */}
          {role === 'author' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.35rem',
                color: 'var(--color-text-muted)',
                fontSize: '0.85rem'
              }}>
                Bio <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>(optional)</span>
              </label>
              <textarea
                value={form.bio}
                onChange={e => updateField('bio', e.target.value)}
                placeholder="Tell us about yourself"
                rows={3}
              />
            </div>
          )}

          {/* Employee ID (Librarian only) */}
          {role === 'librarian' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.35rem',
                color: 'var(--color-text-muted)',
                fontSize: '0.85rem'
              }}>
                Employee ID
              </label>
              <input
                type="text"
                value={form.employee_id}
                onChange={e => updateField('employee_id', e.target.value)}
                placeholder="Your employee ID"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !role}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', marginTop: '0.5rem' }}
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-gold)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
