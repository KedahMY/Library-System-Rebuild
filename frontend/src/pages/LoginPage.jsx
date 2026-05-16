// BiblioVault LoginPage — centered dark-theme login card.
// On success, navigates to the correct portal based on user role.
// Path: /login

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userData = await login(username.trim(), password);
      const roleMap = {
        student: '/student',
        staff: '/student',
        author: '/author',
        librarian: '/librarian',
      };
      const target = roleMap[userData.role] || '/portal';
      navigate(target, { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

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
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#2c1810',
            fontSize: '2rem',
            margin: '0 0 0.25rem 0',
          }}>
            BiblioVault
          </h1>
          <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              color: '#555',
              marginBottom: '6px',
              fontWeight: 500,
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                border: '1px solid #d0d0d0',
                borderRadius: '6px',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#c9a84c'; }}
              onBlur={(e) => { e.target.style.borderColor = '#d0d0d0'; }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              color: '#555',
              marginBottom: '6px',
              fontWeight: 500,
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                border: '1px solid #d0d0d0',
                borderRadius: '6px',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#c9a84c'; }}
              onBlur={(e) => { e.target.style.borderColor = '#d0d0d0'; }}
            />
          </div>

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
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          fontSize: '0.9rem',
          color: '#666',
        }}>
          Don't have an account?{' '}
          <Link
            to="/register"
            style={{
              color: '#c9a84c',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
