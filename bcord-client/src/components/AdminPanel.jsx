import React, { useState, useEffect } from "react";
import axios from "axios";

export default function AdminPanel({ onClose }) {
  const [password, setPassword] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, user: null });

  async function handleVerify() {
    setError("");
    setLoading(true);
    
    try {
      await axios.post(
        "/api/admin/verify",
        { password },
        { withCredentials: true }
      );
      
      setIsVerified(true);
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || "Invalid password");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await axios.get("/api/admin/users", {
        withCredentials: true,
      });
      
      setUsers(res.data.users || []);
    } catch (err) {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  // Handle right-click on email
  function handleContextMenu(e, user) {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      user: user
    });
  }

  // Close context menu
  function closeContextMenu() {
    setContextMenu({ visible: false, x: 0, y: 0, user: null });
  }

  // Verify user action
  async function handleVerifyUser() {
    if (!contextMenu.user) return;
    
    try {
      await axios.post(
        "/api/admin/verify-user",
        { user_id: contextMenu.user.id },
        { withCredentials: true }
      );
      
      await loadUsers();
      closeContextMenu();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to verify user");
      closeContextMenu();
    }
  }

  // Delete user action
  async function handleDeleteUser() {
    if (!contextMenu.user) return;
    
    if (!confirm(`Are you sure you want to delete user "${contextMenu.user.username}"?`)) {
      closeContextMenu();
      return;
    }
    
    try {
      await axios.delete(
        `/api/admin/users/${contextMenu.user.id}`,
        { withCredentials: true }
      );
      
      await loadUsers();
      closeContextMenu();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete user");
      closeContextMenu();
    }
  }

  // Close context menu when clicking outside
  useEffect(() => {
    function handleClick() {
      if (contextMenu.visible) {
        closeContextMenu();
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu.visible]);

  if (!isVerified) {
    return (
      <div className="profile-menu-overlay" onClick={onClose}>
        <div 
          className="create-server-modal" 
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '400px' }}
        >
          <div className="modal-header">
            <h2>🔐 Admin Access</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '12px' }}>
              Enter the admin password to access the user management panel.
            </p>
            <label style={{ display: 'block', marginBottom: '8px', color: '#e5e7eb', fontWeight: '600' }}>
              Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={{
                width: '100%',
                padding: '12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#e5e7eb',
                fontSize: '16px'
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerify();
              }}
              autoFocus
            />
            {error && (
              <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '8px' }}>
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button 
              className="btn-cancel"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid #475569',
                borderRadius: '8px',
                color: '#e5e7eb',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button 
              className="btn-create"
              onClick={handleVerify}
              disabled={loading}
              style={{
                padding: '10px 20px',
                background: loading ? '#4b5563' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-menu-overlay" onClick={onClose}>
      <div 
        className="create-server-modal" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '800px', maxHeight: '80vh' }}
      >
        <div className="modal-header">
          <h2>👥 User Management</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#9ca3af' }}>Loading users...</p>
          ) : (
            <div style={{ marginTop: '16px' }}>
              <p style={{ color: '#6b7280', fontSize: '12px', marginBottom: '12px' }}>
                💡 Right-click on a user's email for options
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #334155' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#e5e7eb', fontWeight: '600' }}>Username</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#e5e7eb', fontWeight: '600' }}>Email</th>
                    <th style={{ padding: '12px', textAlign: 'center', color: '#e5e7eb', fontWeight: '600' }}>Verified</th>
                    <th style={{ padding: '12px', textAlign: 'center', color: '#e5e7eb', fontWeight: '600' }}>Admin</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#e5e7eb', fontWeight: '600' }}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr 
                      key={user.id}
                      style={{ 
                        borderBottom: '1px solid #1e293b',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px', color: '#e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: '600',
                            fontSize: '14px'
                          }}>
                            {user.username.slice(0, 2).toUpperCase()}
                          </div>
                          {user.username}
                        </div>
                      </td>
                      <td 
                        style={{ 
                          padding: '12px', 
                          color: '#9ca3af', 
                          fontSize: '14px',
                          cursor: 'context-menu'
                        }}
                        onContextMenu={(e) => handleContextMenu(e, user)}
                      >
                        {user.email}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {user.verified ? (
                          <span style={{ color: '#10b981' }}>✓</span>
                        ) : (
                          <span style={{ color: '#ef4444' }}>✗</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {user.is_admin ? (
                          <span style={{ 
                            background: '#6366f1', 
                            color: '#fff', 
                            padding: '4px 8px', 
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            ADMIN
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', color: '#9ca3af', fontSize: '13px' }}>
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px' }}>
                  No users found
                </p>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button 
            className="btn-cancel"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid #475569',
              borderRadius: '8px',
              color: '#e5e7eb',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 10000,
            minWidth: '160px',
            overflow: 'hidden'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #334155', color: '#9ca3af', fontSize: '12px' }}>
            {contextMenu.user?.username}
          </div>
          
          {!contextMenu.user?.verified && (
            <button
              onClick={handleVerifyUser}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                color: '#10b981',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#334155'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              ✓ Verify User
            </button>
          )}
          
          <button
            onClick={handleDeleteUser}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#334155'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            🗑 Delete User
          </button>
        </div>
      )}
    </div>
  );
}
