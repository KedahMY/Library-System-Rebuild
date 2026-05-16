import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = axios.create({ baseURL: '/api' });

const TAB_STYLE = (active) => ({
  padding: '8px 18px',
  border: 'none',
  background: active ? '#1a1a2e' : '#f0f0f0',
  color: active ? '#fff' : '#666',
  cursor: 'pointer',
  borderRadius: '4px 4px 0 0',
  fontSize: 13,
  fontWeight: active ? 600 : 400
});

const INPUT_STYLE = {
  width: '100%', padding: 8, border: '1px solid #ccc',
  borderRadius: 4, boxSizing: 'border-box', fontSize: 13
};

const LABEL_STYLE = {
  fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4
};

export default function ProfileEditor() {
  const { user, updateUser } = useAuth();

  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Profile form
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  // Password form
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState(null);
  const [pwError, setPwError] = useState(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // Avatar form
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarMsg, setAvatarMsg] = useState(null);
  const [avatarError, setAvatarError] = useState(null);
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);

  const token = localStorage.getItem('token');

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/users/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.data;
      setProfile(data);
      setFullName(data.full_name || '');
      setBio(data.bio || '');
      setEmployeeId(data.employee_id || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // --- Profile tab ---
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setProfileMsg({ type: 'error', text: 'Current password is required to save changes' });
      return;
    }
    try {
      setProfileSubmitting(true);
      setProfileMsg(null);
      const body = { full_name: fullName, current_password: currentPassword };
      if (user?.role === 'author') body.bio = bio;
      if (user?.role === 'librarian') body.employee_id = employeeId;

      const res = await API.put('/users/profile', body, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfileMsg({ type: 'success', text: 'Profile updated successfully' });
      setCurrentPassword('');
      if (res.data.user) {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        stored.full_name = res.data.user.full_name || fullName;
        localStorage.setItem('user', JSON.stringify(stored));
      }
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update profile' });
    } finally {
      setProfileSubmitting(false);
    }
  };

  // --- Password tab ---
  const validatePassword = (pw) => {
    if (pw.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter';
    if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter';
    if (!/[0-9]/.test(pw)) return 'Password must contain a digit';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain a special character';
    return null;
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwMsg(null);

    if (!pwCurrent) {
      setPwError('Current password is required');
      return;
    }
    if (!pwNew) {
      setPwError('New password is required');
      return;
    }
    const validationError = validatePassword(pwNew);
    if (validationError) {
      setPwError(validationError);
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('Passwords do not match');
      return;
    }

    try {
      setPwSubmitting(true);
      await API.post('/users/change-password', {
        current_password: pwCurrent,
        new_password: pwNew
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPwMsg('Password changed successfully');
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPwSubmitting(false);
    }
  };

  // --- Avatar tab ---
  const handleAvatarSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate type
    const allowedTypes = ['image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Only JPG and PNG files are allowed');
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    // Validate size
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('File size must be 5MB or less');
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    setAvatarError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarSubmit = async (e) => {
    e.preventDefault();
    if (!avatarFile) {
      setAvatarError('Please select an image file');
      return;
    }

    try {
      setAvatarSubmitting(true);
      setAvatarError(null);
      setAvatarMsg(null);
      const formData = new FormData();
      formData.append('profile_picture', avatarFile);

      const res = await API.post('/users/profile-picture', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setAvatarMsg('Avatar updated successfully');
      setAvatarFile(null);
      if (res.data.profile_picture_url) {
        // Update auth context if it has avatar URL
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        stored.profile_picture_url = res.data.profile_picture_url;
        localStorage.setItem('user', JSON.stringify(stored));
      }
    } catch (err) {
      setAvatarError(err.response?.data?.error || 'Failed to upload avatar');
    } finally {
      setAvatarSubmitting(false);
    }
  };

  // Cleanup avatar preview URL
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  if (loading) {
    return <div style={{ padding: 24, color: '#666', fontFamily: 'DM Sans, sans-serif' }}>Loading profile...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ padding: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>x</button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const isAuthor = user?.role === 'author';
  const isLibrarian = user?.role === 'librarian';

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
        <button onClick={() => setActiveTab('profile')} style={TAB_STYLE(activeTab === 'profile')}>
          Profile
        </button>
        <button onClick={() => setActiveTab('password')} style={TAB_STYLE(activeTab === 'password')}>
          Change Password
        </button>
        <button onClick={() => setActiveTab('avatar')} style={TAB_STYLE(activeTab === 'avatar')}>
          Avatar
        </button>
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <form onSubmit={handleProfileSubmit} style={{ padding: 20, background: '#fafafa', border: '1px solid #e0d5c7', borderRadius: '0 8px 8px 8px' }}>
          <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
            <div>
              <label style={LABEL_STYLE}>Username</label>
              <input value={profile.username || ''} disabled style={{ ...INPUT_STYLE, background: '#f5f5f5', color: '#999' }} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Email</label>
              <input value={profile.email || ''} disabled style={{ ...INPUT_STYLE, background: '#f5f5f5', color: '#999' }} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                style={INPUT_STYLE}
              />
            </div>
            {isAuthor && (
              <div>
                <label style={LABEL_STYLE}>Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell readers about yourself"
                  rows={3}
                  style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'DM Sans, sans-serif' }}
                />
              </div>
            )}
            {isLibrarian && (
              <div>
                <label style={LABEL_STYLE}>Employee ID</label>
                <input
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="Employee ID"
                  style={INPUT_STYLE}
                />
              </div>
            )}
            <div>
              <label style={LABEL_STYLE}>Current Password *</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required to save changes"
                style={INPUT_STYLE}
              />
            </div>
          </div>

          {profileMsg && (
            <div style={{
              padding: '8px 12px', marginTop: 12, borderRadius: 4, fontSize: 13,
              background: profileMsg.type === 'success' ? '#e8f5e9' : '#fdecea',
              color: profileMsg.type === 'success' ? '#2e7d32' : '#c62828'
            }}>
              {profileMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={profileSubmitting}
            style={{
              marginTop: 16, padding: '8px 20px', background: '#1a1a2e',
              color: '#fff', border: 'none', borderRadius: 4,
              cursor: profileSubmitting ? 'default' : 'pointer',
              opacity: profileSubmitting ? 0.6 : 1, fontSize: 13
            }}
          >
            {profileSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* Password tab */}
      {activeTab === 'password' && (
        <form onSubmit={handlePasswordSubmit} style={{ padding: 20, background: '#fafafa', border: '1px solid #e0d5c7', borderRadius: '0 8px 8px 8px' }}>
          <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
            <div>
              <label style={LABEL_STYLE}>Current Password</label>
              <input
                type="password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                placeholder="Enter current password"
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>New Password</label>
              <input
                type="password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                placeholder="8+ chars, upper, lower, digit, special"
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Confirm New Password</label>
              <input
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                placeholder="Re-enter new password"
                style={INPUT_STYLE}
              />
            </div>
          </div>

          {pwError && (
            <div style={{ padding: '8px 12px', marginTop: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
              {pwError}
            </div>
          )}
          {pwMsg && (
            <div style={{ padding: '8px 12px', marginTop: 12, background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, fontSize: 13 }}>
              {pwMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={pwSubmitting}
            style={{
              marginTop: 16, padding: '8px 20px', background: '#1a1a2e',
              color: '#fff', border: 'none', borderRadius: 4,
              cursor: pwSubmitting ? 'default' : 'pointer',
              opacity: pwSubmitting ? 0.6 : 1, fontSize: 13
            }}
          >
            {pwSubmitting ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      )}

      {/* Avatar tab */}
      {activeTab === 'avatar' && (
        <div style={{ padding: 20, background: '#fafafa', border: '1px solid #e0d5c7', borderRadius: '0 8px 8px 8px' }}>
          {/* Current avatar */}
          {(profile.profile_picture_url || avatarPreview) && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <img
                src={avatarPreview || profile.profile_picture_url}
                alt="Profile avatar"
                style={{
                  width: 120, height: 120, borderRadius: '50%',
                  objectFit: 'cover', border: '3px solid #e0d5c7'
                }}
              />
            </div>
          )}

          {/* No avatar state */}
          {!profile.profile_picture_url && !avatarPreview && (
            <div style={{
              marginBottom: 16, textAlign: 'center',
              width: 120, height: 120, borderRadius: '50%',
              background: '#f0f0f0', border: '3px dashed #ccc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px auto', fontSize: 12, color: '#999'
            }}>
              No Avatar
            </div>
          )}

          <form onSubmit={handleAvatarSubmit} style={{ maxWidth: 400, margin: '0 auto' }}>
            <div style={{ marginBottom: 12 }}>
              <label style={LABEL_STYLE}>Select Avatar Image</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={handleAvatarSelect}
                style={{ fontSize: 13 }}
              />
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                JPG or PNG only. Maximum 5MB.
              </div>
            </div>

            {avatarError && (
              <div style={{ padding: '8px 12px', marginBottom: 12, background: '#fdecea', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
                {avatarError}
              </div>
            )}
            {avatarMsg && (
              <div style={{ padding: '8px 12px', marginBottom: 12, background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, fontSize: 13 }}>
                {avatarMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={avatarSubmitting || !avatarFile}
              style={{
                padding: '8px 20px', background: avatarFile ? '#1a1a2e' : '#999',
                color: '#fff', border: 'none', borderRadius: 4,
                cursor: (avatarSubmitting || !avatarFile) ? 'default' : 'pointer',
                opacity: avatarSubmitting ? 0.6 : 1, fontSize: 13
              }}
            >
              {avatarSubmitting ? 'Uploading...' : 'Upload Avatar'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
