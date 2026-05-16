// BiblioVault RegisterPage — multi-role registration with client-side validation.
// Role selection grid, conditional fields, password strength check.
// On success, shows message and redirects to /login after 2 seconds.
// Path: /register

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ROLES = [
  { id: 'student', label: 'Student', icon: '🎓' },
  { id: 'staff', label: 'Staff', icon: '👨‍🏫' },
  { id: 'author', label: 'Author', icon: '✍️' },
  { id: 'librarian', label: 'Librarian', icon: '📚' },
];

const GENRES = [
  'Fiction', 'Non-Fiction', 'Science Fiction', 'Fantasy', 'Mystery',
  'Romance', 'Thriller', 'Horror', 'Biography', 'History',
  'Science', 'Technology', 'Philosophy', 'Poetry', 'Drama', 'Comics',
];

// ── Password strength check ──────────────────────────────────────────────────
function checkPasswordStrength(password) {
  const errors = [];
  if (password.length < 8) errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('one digit');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('one special character (!@#$%^&*(),.?":{}|<>)');
  return errors;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bio, setBio] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Password strength meter
  const passwordErrors = password ? checkPasswordStrength(password) : [];
  const passwordStrength =
    password.length === 0 ? 0
    : passwordErrors.length === 0 ? 100
    : passwordErrors.length <= 2 ? 50
    : 25;

  const getStrengthLabel = () => {
    if (password.length === 0) return '';
    if (passwordErrors.length === 0) return 'Strong';
    if (passwordErrors.length <= 2) return 'Medium';
    return 'Weak';
  };

  const getStrengthColor = () => {
    if (passwordErrors.length === 0) return '#2e7d32';
    if (passwordErrors.length <= 2) return '#ffa000';
    return '#c62828';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validation
    const errors = {};

    if (!role) {
      errors.role = 'Please select a role';
    }

    if (!username.trim()) {
      errors.username = 'Username is required';
    } else if (username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      errors.username = 'Username can only contain letters, numbers, and underscores';
    }

    if (!fullName.trim()) {
      errors.full_name = 'Full name is required';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else {
      const pwErrors = checkPasswordStrength(password);
      if (pwErrors.length > 0) {
        errors.password = `Password must contain: ${pwErrors.join(', ')}`;
      }
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        username: username.trim(),
        full_name: fullName.trim(),
        password,
        role,
      };
      if (role === 'author' && bio.trim()) {
        payload.bio = bio.trim();
      }
      if (role === 'librarian' && employeeId.trim()) {
        payload.employee_id = employeeId.trim();
      }

      await register(payload);
      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err) {
      const serverErrors = err.response?.data?.errors;
      if (serverErrors) {
        setFieldErrors(serverErrors);
      } else {
        setError(err.response?.data?.error || err.response?.data?.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '2.5rem 2rem',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#2e7d32', margin: '0 0 0.5rem 0' }}>
            Registration Successful!
          </h2>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Redirecting to login page...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      fontFamily: 'DM Sans, sans-serif',
      padding: '2rem 1rem',
      boxSizing: 'border-box',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: '520px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#2c1810',
            fontSize: '2rem',
            margin: '0 0 0.25rem 0',
          }}>
            Create Account
          </h1>
          <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
            Join BiblioVault
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Role selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              color: '#555',
              marginBottom: '8px',
              fontWeight: 500,
            }}>
              I am a...
            </label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem',
            }}>
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  style={{
                    padding: '0.6rem',
                    border: role === r.id ? '2px solid #c9a84c' : '1px solid #d0d0d0',
                    borderRadius: '8px',
                    background: role === r.id ? '#fffbee' : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: 'DM Sans, sans-serif',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '2px' }}>{r.icon}</div>
                  <div style={{
                    fontWeight: role === r.id ? 600 : 400,
                    color: role === r.id ? '#c9a84c' : '#333',
                  }}>
                    {r.label}
                  </div>
                </button>
              ))}
            </div>
            {fieldErrors.role && (
              <div style={{ color: '#c62828', fontSize: '0.8rem', marginTop: '4px' }}>
                {fieldErrors.role}
              </div>
            )}
          </div>

          {/* Username */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Username *
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              autoComplete="username"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                border: fieldErrors.username ? '1px solid #c62828' : '1px solid #d0d0d0',
                borderRadius: '6px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {fieldErrors.username && (
              <div style={{ color: '#c62828', fontSize: '0.8rem', marginTop: '4px' }}>{fieldErrors.username}</div>
            )}
          </div>

          {/* Full Name */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Full Name *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              autoComplete="name"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                border: fieldErrors.full_name ? '1px solid #c62828' : '1px solid #d0d0d0',
                borderRadius: '6px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {fieldErrors.full_name && (
              <div style={{ color: '#c62828', fontSize: '0.8rem', marginTop: '4px' }}>{fieldErrors.full_name}</div>
            )}
          </div>

          {/* Password */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Password *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              autoComplete="new-password"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                border: fieldErrors.password ? '1px solid #c62828' : '1px solid #d0d0d0',
                borderRadius: '6px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {/* Password strength meter */}
            {password.length > 0 && (
              <div style={{ marginTop: '6px' }}>
                <div style={{
                  height: '4px',
                  background: '#e0e0e0',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${passwordStrength}%`,
                    background: getStrengthColor(),
                    borderRadius: '2px',
                    transition: 'all 0.3s',
                  }} />
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: getStrengthColor(),
                  marginTop: '2px',
                }}>
                  {getStrengthLabel()}
                  {passwordErrors.length > 0 && ' — ' + passwordErrors.join(', ')}
                </div>
              </div>
            )}
            {fieldErrors.password && (
              <div style={{ color: '#c62828', fontSize: '0.8rem', marginTop: '4px' }}>{fieldErrors.password}</div>
            )}
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
              Confirm Password *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                border: fieldErrors.confirmPassword ? '1px solid #c62828' : '1px solid #d0d0d0',
                borderRadius: '6px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {fieldErrors.confirmPassword && (
              <div style={{ color: '#c62828', fontSize: '0.8rem', marginTop: '4px' }}>{fieldErrors.confirmPassword}</div>
            )}
          </div>

          {/* Conditional: Author bio */}
          {role === 'author' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
                Bio (optional)
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell readers about yourself..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  border: '1px solid #d0d0d0',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              />
            </div>
          )}

          {/* Conditional: Librarian employee_id */}
          {role === 'librarian' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '4px', fontWeight: 500 }}>
                Employee ID (optional)
              </label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g., LIB-12345"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  border: '1px solid #d0d0d0',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* General error */}
          {error && (
            <div style={{
              padding: '0.65rem 0.75rem',
              background: '#fff0f0',
              color: '#c62828',
              borderRadius: '6px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              border: '1px solid #ffcdd2',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: loading ? '#999' : '#2c1810',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              marginTop: '0.5rem',
            }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          fontSize: '0.9rem',
          color: '#666',
        }}>
          Already have an account?{' '}
          <Link
            to="/login"
            style={{
              color: '#c9a84c',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
