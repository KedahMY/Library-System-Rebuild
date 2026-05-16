// BiblioVault Sidebar — vertical navigation sidebar for all three portals.
// Props: { portalName, tabs, activeTab, onTabChange, unreadCount }
// Includes brand, role pill, nav items with unread badge, Logout, Crash Test,
// and optionally Crash (No Recovery) when SIMULATE_UNRECOVERABLE_CRASH is true.
//
// Import from CrashRecovery for crash-test buttons:
//   CrashTestButton, CrashUnrecoverableButton, SIMULATE_UNRECOVERABLE_CRASH

import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  CrashTestButton,
  CrashUnrecoverableButton,
  SIMULATE_UNRECOVERABLE_CRASH,
} from './CrashRecovery.jsx';

export default function Sidebar({
  portalName = '',
  tabs = [],
  activeTab = '',
  onTabChange = () => {},
  unreadCount = 0,
}) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div
      style={{
        width: '240px',
        minWidth: '240px',
        background: '#2c1810',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem 0',
        fontFamily: 'DM Sans, sans-serif',
        height: '100vh',
        boxSizing: 'border-box',
      }}
    >
      {/* Brand */}
      <div
        style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: '1.5rem',
          padding: '0 1.25rem 1.25rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '0.75rem',
          color: '#c9a84c',
        }}
      >
        BiblioVault
      </div>

      {/* Role pill */}
      <div
        style={{
          padding: '0.25rem 1.25rem',
          marginBottom: '0.75rem',
          fontSize: '0.75rem',
          color: '#c9a84c',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {portalName || user?.role || 'User'}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '0.65rem 1.25rem',
              border: 'none',
              background:
                activeTab === item.id
                  ? 'rgba(201, 168, 76, 0.15)'
                  : 'transparent',
              color:
                activeTab === item.id
                  ? '#c9a84c'
                  : 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontFamily: 'DM Sans, sans-serif',
              textAlign: 'left',
              transition: 'all 0.2s',
              borderLeft:
                activeTab === item.id
                  ? '3px solid #c9a84c'
                  : '3px solid transparent',
              position: 'relative',
            }}
          >
            <span>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {/* Unread notification badge */}
            {item.id === 'notifications' && unreadCount > 0 && (
              <span
                style={{
                  background: '#c62828',
                  color: '#fff',
                  borderRadius: '50%',
                  padding: '2px 6px',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  lineHeight: '1.2',
                  minWidth: '18px',
                  textAlign: 'center',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom section: Logout + Crash buttons */}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <LogoutButton onLogout={handleLogout} />

        {/* Crash Test button — visible in all portals */}
        <CrashTestButton />

        {/* Crash (No Recovery) — visible only when SIMULATE_UNRECOVERABLE_CRASH is true */}
        {SIMULATE_UNRECOVERABLE_CRASH && <CrashUnrecoverableButton />}
      </div>
    </div>
  );
}

function LogoutButton({ onLogout }) {
  return (
    <button
      onClick={onLogout}
      style={{
        width: '100%',
        padding: '0.5rem',
        background: 'rgba(255,255,255,0.1)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      Logout
    </button>
  );
}
