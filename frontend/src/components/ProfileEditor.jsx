// BiblioVault ProfileEditor — edit profile, change password, upload avatar.
// Fetches the current user's profile and allows editing full_name, bio (author),
// employee_id (librarian). Separate section for password change with
// current password re-auth. Avatar upload with JPG/PNG validation and ≤5 MB limit.
// Props: {} (fetches current user)
//
// API calls:
//   GET /api/users/profile
//   PUT /api/users/profile   { full_name, bio?, employee_id?, current_password }
//   PUT /api/users/password  { current_password, new_password }
//   POST /api/users/profile-picture (multipart)

import React, { useState, useEffect, useCallback } from 'react';

// ── Auth helper ──────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ProfileEditor() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);

  // Profile form
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Password form
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState(null);

  // Avatar state
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const [avatarSuccess, setAvatarSuccess] = useState(false);

  // Message
  const [message, setMessage] = useState(null);

  // ── Fetch profile ──────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users/profile', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load profile');
      const data = await res.json();
      setProfile(data);
      setFullName(data.full_name || '');
      setBio(data.bio || '');
      setEmployeeId(data.employee_id || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Update profile ─────────────────────────────────────────────────
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setProfileError('Full name is required');
      return;
    }
    if (!currentPassword) {
      setProfileError('Current password is required to update profile');
      return;
    }

    setProfileSubmitting(true);
    setProfileError(null);
    setProfileSuccess(false);

    try {
      const body = {
        full_name: fullName.trim(),
        current_password: currentPassword,
      };
      if (profile?.role === 'author') body.bio = bio.trim();
      if (profile?.role === 'librarian') body.employee_id = employeeId.trim();

      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setProfileSuccess(true);
        setCurrentPassword('');
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        fetchProfile();
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json();
        setProfileError(data.error || data.errors?.full_name || 'Failed to update profile');
      }
    } catch (err) {
      setProfileError('Network error. Please try again.');
    } finally {
      setProfileSubmitting(false);
    }
  };

  // ── Change password ────────────────────────────────────────────────
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!pwCurrent) {
      setPwError('Current password is required');
      return;
    }
    if (!pwNew || pwNew.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('Passwords do not match');
      return;
    }

    setPwSubmitting(true);
    setPwError(null);
    setPwSuccess(false);

    try {
      const res = await fetch('/api/users/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          current_password: pwCurrent,
          new_password: pwNew,
        }),
      });

      if (res.ok) {
        setPwSuccess(true);
        setPwCurrent('');
        setPwNew('');
        setPwConfirm('');
        setMessage({ type: 'success', text: 'Password changed! Logging out...' });
        // Auto logout after password change
        setTimeout(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }, 2000);
      } else {
        const data = await res.json();
        setPwError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setPwError('Network error. Please try again.');
    } finally {
      setPwSubmitting(false);
    }
  };

  // ── Upload avatar ──────────────────────────────────────────────────
  const handleAvatarUpload = async () => {
    if (!avatarFile) {
      setAvatarError('Please select a file');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(avatarFile.type)) {
      setAvatarError('Only JPG and PNG files are allowed');
      return;
    }

    // Validate file size (5 MB)
    if (avatarFile.size > 5 * 1024 * 1024) {
      setAvatarError('File must be under 5 MB');
      return;
    }

    setAvatarUploading(true);
    setAvatarError(null);
    setAvatarSuccess(false);

    try {
      const formData = new FormData();
      formData.append('profile_picture', avatarFile);

      const res = await fetch('/api/users/profile-picture', {
        method: 'POST',
        headers: authHeaders(), // no Content-Type — FormData sets it
        body: formData,
      });

      if (res.ok) {
        setAvatarSuccess(true);
        setAvatarFile(null);
        setMessage({ type: 'success', text: 'Avatar uploaded!' });
        fetchProfile();
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json();
        setAvatarError(data.error || 'Failed to upload avatar');
      }
    } catch (err) {
      setAvatarError('Network error. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Password strength ─────────────────────────────────────────────
  const passwordErrors = [];
  if (pwNew) {
    if (pwNew.length < 8) passwordErrors.push('8+ chars');
    if (!/[A-Z]/.test(pwNew)) passwordErrors.push('uppercase');
    if (!/[a-z]/.test(pwNew)) passwordErrors.push('lowercase');
    if (!/[0-9]/.test(pwNew)) passwordErrors.push('digit');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwNew)) passwordErrors.push('special char');
  }
  const pwStrength =
    pwNew.length === 0 ? 0
    : passwordErrors.length === 0 ? 100
    : passwordErrors.length <= 2 ? 50
    : 25;
  const pwStrengthColor =
    passwordErrors.length === 0 ? '#2e7d32'
    : passwordErrors.length <= 2 ? '#ffa000'
    : '#c62828';

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          padding: '2rem',
          color: '#666',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        Loading profile...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          background: '#ffe0e0',
          color: '#8b0000',
          borderRadius: '6px',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: 'DM Sans, sans-serif',
        padding: '1.5rem',
        maxWidth: '600px',
      }}
    >
      <h2
        style={{
          fontFamily: 'Cormorant Garamond, serif',
          color: '#2c1810',
          marginBottom: '1.5rem',
        }}
      >
        My Profile
      </h2>

      {/* Inline message */}
      {message && (
        <div
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            borderRadius: '6px',
            background: message.type === 'success' ? '#e8f5e9' : '#ffe0e0',
            color: message.type === 'success' ? '#2e7d32' : '#8b0000',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem',
              color: 'inherit',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* ── Avatar Section ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          marginBottom: '2rem',
          padding: '1rem',
          background: '#f8f6f0',
          borderRadius: '8px',
          flexWrap: 'wrap',
        }}
      >
        {/* Avatar preview */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: '#e0d8c8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            border: '2px solid #c9a84c',
          }}
        >
          {profile?.profile_picture ? (
            <img
              src={`/${profile.profile_picture}`}
              alt="Profile"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentNode.innerHTML =
                  '<span style="font-size:2rem;color:#c9a84c;">&#128100;</span>';
              }}
            />
          ) : (
            <span style={{ fontSize: '2rem', color: '#c9a84c' }}>
              &#128100;
            </span>
          )}
        </div>

        {/* Upload controls */}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2c1810' }}>
            {profile?.full_name || profile?.username}
          </div>
          <div
            style={{
              fontSize: '0.8rem',
              color: '#666',
              marginBottom: '0.5rem',
            }}
          >
            {profile?.role}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={(e) => setAvatarFile(e.target.files[0])}
              style={{ fontSize: '0.8rem', flex: 1, minWidth: '120px' }}
            />
            <button
              onClick={handleAvatarUpload}
              disabled={avatarUploading || !avatarFile}
              style={{
                padding: '0.35rem 0.75rem',
                background: avatarUploading || !avatarFile ? '#999' : '#2c1810',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: avatarUploading || !avatarFile ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {avatarUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {avatarError && (
            <div
              style={{
                color: '#c62828',
                fontSize: '0.8rem',
                marginTop: '4px',
              }}
            >
              {avatarError}
            </div>
          )}
          {avatarSuccess && (
            <div
              style={{
                color: '#2e7d32',
                fontSize: '0.8rem',
                marginTop: '4px',
              }}
            >
              Avatar uploaded successfully!
            </div>
          )}
          <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '2px' }}>
            JPG/PNG, max 5 MB
          </div>
        </div>
      </div>

      {/* ── Edit Profile Form ─────────────────────────────────────────── */}
      <form
        onSubmit={handleProfileUpdate}
        style={{
          padding: '1.25rem',
          border: '1px solid #e0d8c8',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          background: '#fff',
        }}
      >
        <h3
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#2c1810',
            margin: '0 0 1rem 0',
          }}
        >
          Edit Profile
        </h3>

        <div style={{ marginBottom: '0.75rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.85rem',
              color: '#555',
              marginBottom: '4px',
              fontWeight: 500,
            }}
          >
            Full Name *
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Conditional: Author bio */}
        {profile?.role === 'author' && (
          <div style={{ marginBottom: '0.75rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                color: '#555',
                marginBottom: '4px',
                fontWeight: 500,
              }}
            >
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'DM Sans, sans-serif',
              }}
            />
          </div>
        )}

        {/* Conditional: Librarian employee_id */}
        {profile?.role === 'librarian' && (
          <div style={{ marginBottom: '0.75rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                color: '#555',
                marginBottom: '4px',
                fontWeight: 500,
              }}
            >
              Employee ID
            </label>
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Re-auth: current password required for profile changes */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.85rem',
              color: '#555',
              marginBottom: '4px',
              fontWeight: 500,
            }}
          >
            Current Password * <span style={{ fontWeight: 400, color: '#999' }}>(required for changes)</span>
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {profileError && (
          <div
            style={{
              color: '#c62828',
              fontSize: '0.85rem',
              marginBottom: '0.75rem',
              padding: '6px 10px',
              background: '#ffebee',
              borderRadius: '4px',
            }}
          >
            {profileError}
          </div>
        )}

        {profileSuccess && (
          <div
            style={{
              color: '#2e7d32',
              fontSize: '0.85rem',
              marginBottom: '0.75rem',
              padding: '6px 10px',
              background: '#e8f5e9',
              borderRadius: '4px',
            }}
          >
            Profile updated successfully!
          </div>
        )}

        <button
          type="submit"
          disabled={profileSubmitting}
          style={{
            padding: '0.5rem 1.5rem',
            background: profileSubmitting ? '#999' : '#2c1810',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: profileSubmitting ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          {profileSubmitting ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* ── Change Password Section ───────────────────────────────────── */}
      <form
        onSubmit={handlePasswordChange}
        style={{
          padding: '1.25rem',
          border: '1px solid #e0d8c8',
          borderRadius: '8px',
          background: '#fff',
        }}
      >
        <h3
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#2c1810',
            margin: '0 0 1rem 0',
          }}
        >
          Change Password
        </h3>

        <div style={{ marginBottom: '0.75rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.85rem',
              color: '#555',
              marginBottom: '4px',
              fontWeight: 500,
            }}
          >
            Current Password
          </label>
          <input
            type="password"
            value={pwCurrent}
            onChange={(e) => setPwCurrent(e.target.value)}
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.85rem',
              color: '#555',
              marginBottom: '4px',
              fontWeight: 500,
            }}
          >
            New Password
          </label>
          <input
            type="password"
            value={pwNew}
            onChange={(e) => setPwNew(e.target.value)}
            autoComplete="new-password"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
          {/* Password strength meter */}
          {pwNew.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div
                style={{
                  height: '4px',
                  background: '#e0e0e0',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pwStrength}%`,
                    background: pwStrengthColor,
                    borderRadius: '2px',
                    transition: 'all 0.3s',
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: pwStrengthColor,
                  marginTop: '2px',
                }}
              >
                {passwordErrors.length === 0
                  ? 'Strong password'
                  : `Weak — ${passwordErrors.join(', ')}`}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.85rem',
              color: '#555',
              marginBottom: '4px',
              fontWeight: 500,
            }}
          >
            Confirm New Password
          </label>
          <input
            type="password"
            value={pwConfirm}
            onChange={(e) => setPwConfirm(e.target.value)}
            autoComplete="new-password"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: pwConfirm && pwNew !== pwConfirm ? '1px solid #c62828' : '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
          {pwConfirm && pwNew !== pwConfirm && (
            <div
              style={{
                color: '#c62828',
                fontSize: '0.75rem',
                marginTop: '2px',
              }}
            >
              Passwords do not match
            </div>
          )}
        </div>

        {pwError && (
          <div
            style={{
              color: '#c62828',
              fontSize: '0.85rem',
              marginBottom: '0.75rem',
              padding: '6px 10px',
              background: '#ffebee',
              borderRadius: '4px',
            }}
          >
            {pwError}
          </div>
        )}

        {pwSuccess && (
          <div
            style={{
              color: '#2e7d32',
              fontSize: '0.85rem',
              marginBottom: '0.75rem',
              padding: '6px 10px',
              background: '#e8f5e9',
              borderRadius: '4px',
            }}
          >
            Password changed successfully! Logging out...
          </div>
        )}

        <button
          type="submit"
          disabled={pwSubmitting}
          style={{
            padding: '0.5rem 1.5rem',
            background: pwSubmitting ? '#999' : '#c62828',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: pwSubmitting ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          {pwSubmitting ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}
