import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CrashTestButton, CrashUnrecoverableButton } from './CrashRecovery';

export default function Sidebar({ navItems, activeTab, onTabChange, user, unreadCount }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside style={{
      width: '240px',
      minWidth: '240px',
      height: '100vh',
      background: 'var(--color-dark-surface)',
      borderRight: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '1.25rem',
        borderBottom: '1px solid var(--color-border)'
      }}>
        <h3 style={{ margin: 0, color: 'var(--color-gold)' }}>BiblioVault</h3>
      </div>

      {/* User Info */}
      {user && (
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'var(--color-gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-navy)',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            flexShrink: 0
          }}>
            {user.full_name ? user.full_name.charAt(0).toUpperCase() : '?'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {user.full_name || user.username}
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--color-gold)',
              textTransform: 'capitalize'
            }}>
              {user.role}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, overflow: 'auto', padding: '0.5rem 0' }}>
        {navItems.map(item => {
          const isActive = item.id === activeTab;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.625rem 1.25rem',
                border: 'none',
                background: isActive ? 'rgba(201, 168, 76, 0.12)' : 'transparent',
                color: isActive ? 'var(--color-gold)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textAlign: 'left',
                transition: 'all 0.15s',
                position: 'relative'
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'notifications' && unreadCount > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'var(--color-ruby)',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '999px',
                  minWidth: '18px',
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom: Logout + Crash buttons */}
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '0.75rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        <button
          onClick={handleLogout}
          title="Logout"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)';
            e.currentTarget.style.borderColor = 'var(--color-ruby)';
            e.currentTarget.style.color = '#e57373';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          <span>🚪</span>
          <span>Logout</span>
        </button>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <div style={{ flex: 1, fontSize: '0.75rem' }}><CrashTestButton /></div>
          <div style={{ flex: 1, fontSize: '0.75rem' }}><CrashUnrecoverableButton /></div>
        </div>
      </div>
    </aside>
  );
}
