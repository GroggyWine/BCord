import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import useTokenRefresher from "../hooks/useTokenRefresher";
import { playDoorbellDingDong, playMessageSent, playChannelClick } from "../utils/sounds";

export default function DmPage() {
  const { dmId } = useParams();
  const navigate = useNavigate();
  
  useTokenRefresher(10);
  
  // State - mirrors ChatPage
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [dmList, setDmList] = useState([]);
  const [selectedDmId, setSelectedDmId] = useState(dmId ? Number(dmId) : null);
  const [otherUsername, setOtherUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [newBody, setNewBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [rumbleVideos, setRumbleVideos] = useState([]);
  const [rumbleCollapsed, setRumbleCollapsed] = useState(false);
  const [rumbleManagerOpen, setRumbleManagerOpen] = useState(false);
  const [rumbleChannels, setRumbleChannels] = useState(() => {
    const saved = localStorage.getItem('rumbleChannels');
    return saved ? JSON.parse(saved) : [
      { id: 'Infowars', name: 'InfoWars', type: 'livestream', url: 'https://rumble.com/v6xkx0a-infowars-network-feed-live-247.html' },
      { id: 'SaltyCracker', name: 'SaltyCracker', type: 'channel' },
      { id: 'StevenCrowder', name: 'Steven Crowder', type: 'channel' }
    ];
  });
  const [leftSectionWidth, setLeftSectionWidth] = useState(210);
  const [friends, setFriends] = useState([]);
  const [friendsDrawerOpen, setFriendsDrawerOpen] = useState(false);
  const [hasUnreadDms, setHasUnreadDms] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPanelError, setAdminPanelError] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [users, setUsers] = useState([]);
  
  const messagesEndRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const messageInputRef = useRef(null);
  const friendsDrawerRef = useRef(null);
  const resizingRef = useRef(null);

  const userInitials = currentUser ? currentUser.slice(0, 2).toUpperCase() : "??";

  // Load current user and check admin status
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await axios.get("/api/profile", { withCredentials: true });
        if (res.data?.user) {
          setCurrentUser(res.data.user);
          
          // Check if user is admin by trying to access admin endpoint
          try {
            await axios.get("/api/admin/users", { withCredentials: true });
            setIsAdmin(true);
          } catch {
            setIsAdmin(false);
          }
        } else {
          navigate("/login");
        }
      } catch (err) {
        navigate("/login");
      }
    }
    loadUser();
  }, [navigate]);

  // Load servers (for rail)
  useEffect(() => {
    async function loadServers() {
      try {
        const res = await axios.get("/api/servers/list", { withCredentials: true });
        if (res.data?.servers) {
          setServers(res.data.servers);
        }
      } catch (err) {
        console.error("Failed to load servers:", err);
      }
    }
    loadServers();
  }, []);

  // Load DM list
  useEffect(() => {
    async function loadDmList() {
      try {
        const res = await axios.get("/api/dm/list", { withCredentials: true });
        let list = res.data?.dms || (Array.isArray(res.data) ? res.data : []);
        setDmList(list);
        
        if (dmId) {
          const targetId = Number(dmId);
          const match = list.find(d => d.dm_id === targetId);
          if (match) {
            setSelectedDmId(targetId);
            setOtherUsername(match.other_username || "Unknown");
          }
        }
      } catch (err) {
        console.error("Load DM list error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDmList();
  }, [dmId]);

  // Load messages
  useEffect(() => {
    if (!selectedDmId) return;
    prevMessageCountRef.current = 0;

    const loadMessages = async () => {
      try {
        const res = await axios.get(`/api/dm/thread?dm_id=${selectedDmId}`, { withCredentials: true });
        let msgs = res.data?.messages || (Array.isArray(res.data) ? res.data : []);
        
        if (msgs.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.sender_username !== currentUser) {
            playDoorbellDingDong();
          }
        }
        prevMessageCountRef.current = msgs.length;
        setMessages(msgs);
      } catch (err) {
        console.error("Load messages error:", err);
      }
    };

    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedDmId, currentUser]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll DM list
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get("/api/dm/list", { withCredentials: true });
        let list = res.data?.dms || (Array.isArray(res.data) ? res.data : []);
        setDmList(prev => JSON.stringify(prev) !== JSON.stringify(list) ? list : prev);
      } catch (err) {}
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load Rumble lineup
  useEffect(() => {
    const fetchRumble = async () => {
      try {
        const res = await axios.post('/api/rumble/lineup', { channels: rumbleChannels });
        if (res.data?.lineup) {
          const videos = res.data.lineup.map(item => ({
            title: item.title,
            channel: item.channelId || item.name || item.channel,
            video_url: item.url,
            thumbnail: item.thumbnail,
            isLive: item.isLive || false,
            type: item.type
          }));
          setRumbleVideos(videos);
        }
      } catch (err) {
        console.error("Rumble fetch error:", err);
      }
    };
    fetchRumble();
    const interval = setInterval(fetchRumble, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [rumbleChannels]);

  // Keyboard shortcut: Ctrl+Shift+K opens Rumble manager
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        setRumbleManagerOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save rumbleChannels to localStorage when changed
  useEffect(() => {
    localStorage.setItem('rumbleChannels', JSON.stringify(rumbleChannels));
  }, [rumbleChannels]);

  // Load friends
  useEffect(() => {
    async function loadFriends() {
      try {
        const res = await axios.get("/api/users/list", { withCredentials: true });
        if (res.data?.users) {
          const usernames = res.data.users
            .map(u => u.username)
            .filter(u => u !== currentUser);
          setFriends(usernames);
        }
      } catch (err) {}
    }
    if (currentUser) loadFriends();
  }, [currentUser]);

  // Poll online users
  useEffect(() => {
    const fetchOnline = async () => {
      try {
        const res = await axios.get("/api/users/online", { withCredentials: true });
        if (res.data?.online) setOnlineUsers(res.data.online);
      } catch (err) {}
    };
    fetchOnline();
    const interval = setInterval(fetchOnline, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close friends drawer on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (friendsDrawerOpen && friendsDrawerRef.current && !friendsDrawerRef.current.contains(e.target)) {
        setFriendsDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [friendsDrawerOpen]);

  // Resize handler
  const handleResizeStart = (e) => {
    e.preventDefault();
    resizingRef.current = true;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = useCallback((e) => {
    if (!resizingRef.current) return;
    const newWidth = Math.max(180, Math.min(350, e.clientX));
    setLeftSectionWidth(newWidth);
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  const sendMessage = async () => {
    if (!selectedDmId || !newBody.trim() || sending) return;
    
    setSending(true);
    try {
      await axios.post("/api/dm/send", {
        dm_id: selectedDmId,
        content: newBody.trim()
      }, { withCredentials: true });
      
      playMessageSent();
      setNewBody("");
      
      const res = await axios.get(`/api/dm/thread?dm_id=${selectedDmId}`, { withCredentials: true });
      let msgs = res.data?.messages || (Array.isArray(res.data) ? res.data : []);
      prevMessageCountRef.current = msgs.length;
      setMessages(msgs);
    } catch (err) {
      console.error("Send error:", err);
      alert("Failed to send message");
    } finally {
      setSending(false);
      setTimeout(() => messageInputRef.current?.focus(), 50);
    }
  };

  const selectDm = (dm) => {
    if (dm.dm_id === selectedDmId) return;
    playChannelClick();
    setSelectedDmId(dm.dm_id);
    setOtherUsername(dm.other_username || "Unknown");
    setMessages([]);
    prevMessageCountRef.current = 0;
    navigate(`/dm/${dm.dm_id}`, { replace: true });
  };

  const handleSelectServer = (serverId) => {
    navigate("/chat");
  };

  function toggleProfileMenu() {
    setProfileMenuOpen(!profileMenuOpen);
  }

  async function handleLogout() {
    try {
      await axios.post("/api/auth/logout", {}, { withCredentials: true });
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      navigate("/login");
    }
  }

  async function verifyAdminPassword() {
    setAdminPanelError("");
    try {
      const res = await axios.post("/api/admin/verify", { password: adminPassword }, { withCredentials: true });
      if (res.data?.verified) {
        setAdminVerified(true);
        loadUsers();
      }
    } catch (err) {
      setAdminPanelError(err.response?.data?.error || "Verification failed");
    }
  }

  async function loadUsers() {
    try {
      const res = await axios.get("/api/admin/users", { 
        headers: { "X-Admin-Password": adminPassword },
        withCredentials: true 
      });
      if (res.data?.users) {
        setUsers(res.data.users);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  }

  async function deleteUser(username) {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/admin/users/${username}`, {
        headers: { "X-Admin-Password": adminPassword },
        withCredentials: true
      });
      setUsers(users.filter(u => u.username !== username));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete user");
    }
  }

  async function resetPassword(username) {
    const newPass = window.prompt(`Enter new password for "${username}":`);
    if (!newPass) return;
    try {
      await axios.post(`/api/admin/users/${username}/reset-password`, 
        { new_password: newPass },
        { headers: { "X-Admin-Password": adminPassword }, withCredentials: true }
      );
      alert("Password reset successfully");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to reset password");
    }
  }

  const handleSelectFriend = async (username) => {
    try {
      const res = await axios.post("/api/dm/start", { other_username: username }, { withCredentials: true });
      setSelectedDmId(res.data.dm_id);
      setOtherUsername(username);
      setMessages([]);
      setFriendsDrawerOpen(false);
      navigate(`/dm/${res.data.dm_id}`, { replace: true });
    } catch (err) {
      console.error("Start DM error:", err);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
  };

  const shouldShowDateSeparator = (msg, prevMsg) => {
    if (!prevMsg) return true;
    const d1 = new Date(msg.created_at).toDateString();
    const d2 = new Date(prevMsg.created_at).toDateString();
    return d1 !== d2;
  };

  if (loading) {
    return (
      <div className="bcord-chat-root">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#9ca3af' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bcord-chat-root">
      {/* TOP BAR */}
      <div className="bcord-chat-topbar">
        <div className="bcord-chat-topbar-left">
          <span className="bcord-chat-topbar-title">My DMs</span>
          
        </div>
        <div className="bcord-chat-topbar-right">
          <div className="bcord-chat-topbar-bell">🔔</div>
        </div>
      </div>

      {/* MAIN BODY - Same grid as ChatPage */}
      <div 
        className="bcord-chat-body"
        style={{
          gridTemplateColumns: rumbleCollapsed 
            ? `${leftSectionWidth}px minmax(0, 1fr) 0px`
            : `${leftSectionWidth}px minmax(0, 1fr) 260px`
        }}
      >
        {/* LEFT SECTION */}
        <div className="bcord-left-section" style={{ width: `${leftSectionWidth}px` }}>
          <div className="resize-handle resize-handle-right" onMouseDown={handleResizeStart} />
          <div className="bcord-left-content">
            {/* SERVER RAIL */}
            <div className="bcord-chat-col bcord-chat-rail">
              <div className="bcord-chat-rail-top">
                {/* DM Button - Active since we're on DM page */}
                <div 
                  className="bcord-chat-rail-server active"
                  onClick={() => {}}
                  style={{ cursor: 'default' }}
                  title="Direct Messages"
                >
                  <div className="initials">DM</div>
                  {hasUnreadDms && <div className="dm-notification-dot"></div>}
                </div>
                
                <div className="bcord-chat-rail-top-divider" />
                
                {/* Server List */}
                {servers.map((server) => (
                  <button
                    key={server.id}
                    className="bcord-chat-rail-room"
                    onClick={() => handleSelectServer(server.id)}
                    title={server.name}
                  >
                    <div className="initials">{server.initials}</div>
                  </button>
                ))}
                
                <button
                  className="bcord-chat-rail-room add-server"
                  onClick={() => navigate("/chat")}
                  title="Back to Chat"
                >
                  <div className="initials">+</div>
                </button>
              </div>
            </div>

            {/* DM LIST (instead of channels) */}
            <div className="bcord-chat-col bcord-chat-rooms">
              <div className="bcord-chat-rooms-header">
                <div className="bcord-chat-rooms-title">CONVERSATIONS</div>
              </div>
              <div className="bcord-chat-rooms-list">
                {dmList.length === 0 ? (
                  <div style={{ padding: '16px', color: '#6b7280', fontSize: '13px', textAlign: 'center' }}>
                    No conversations yet
                  </div>
                ) : (
                  dmList.map((dm) => (
                    <button
                      key={dm.dm_id}
                      className={`bcord-chat-room-item ${selectedDmId === dm.dm_id ? 'active' : ''}`}
                      onClick={() => selectDm(dm)}
                    >
                      <div className="bcord-chat-room-content">
                        <span className="hash">@</span>
                        <span className="label">{dm.other_username || "Unknown"}</span>
                        {onlineUsers.includes(dm.other_username) && (
                          <span style={{ 
                            display: 'inline-block', 
                            width: '8px', 
                            height: '8px', 
                            background: '#22c55e', 
                            borderRadius: '50%', 
                            marginLeft: '6px' 
                          }} />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* USER PANEL */}
          <div className="bcord-user-panel">
            <div className="bcord-user-panel-info">
              <div 
                className="bcord-user-panel-avatar" 
                title={`${currentUser} - Click for menu`}
                onClick={toggleProfileMenu}
                style={{ cursor: 'pointer' }}
              >
                {userInitials}
                <span className="bcord-user-panel-status-dot" />
              </div>
              <div className="bcord-user-panel-details">
                <div className="bcord-user-panel-username">{currentUser}</div>
                <div className="bcord-user-panel-status">Online</div>
              </div>
            </div>
            <div className="bcord-user-panel-controls">
              <button className="bcord-user-panel-btn" title="Microphone">🎤</button>
              <button className="bcord-user-panel-btn" title="Headphones">🎧</button>
              <button className="bcord-user-panel-btn" title="Settings">⚙️</button>
            </div>
          </div>
        </div>

        {/* MAIN CHAT AREA */}
        <div className="bcord-chat-col bcord-chat-main">
          <div className="bcord-chat-main-header">
            <div className="bcord-chat-main-room">
              <span className="hash">@</span>
              <span>{otherUsername || 'Select a conversation'}</span>
              {otherUsername && onlineUsers.includes(otherUsername) && (
                <span style={{ color: '#22c55e', fontSize: '12px', marginLeft: '8px' }}>● Online</span>
              )}
            </div>
          </div>

          <div className="bcord-chat-messages">
            {!selectedDmId ? (
              <div className="bcord-chat-empty">Select a conversation to start messaging</div>
            ) : messages.length === 0 ? (
              <div className="bcord-chat-empty">No messages yet. Say hi to {otherUsername}!</div>
            ) : (
              messages.map((msg, index) => (
                <React.Fragment key={msg.dm_message_id || index}>
                  {shouldShowDateSeparator(msg, messages[index - 1]) && (
                    <div className="bcord-chat-date-separator">
                      <span className="bcord-chat-date-line"></span>
                      <span className="bcord-chat-date-text">{formatDate(msg.created_at)}</span>
                      <span className="bcord-chat-date-line"></span>
                    </div>
                  )}
                  <div className="bcord-chat-message">
                    <div className="bcord-chat-message-avatar">
                      {(msg.sender_username || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="bcord-chat-message-body">
                      <div className="bcord-chat-message-meta">
                        <span className="sender">{msg.sender_username}</span>
                        <span className="time">{formatTime(msg.created_at)}</span>
                      </div>
                      <div className="bcord-chat-message-text">{msg.content}</div>
                    </div>
                  </div>
                </React.Fragment>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {selectedDmId && (
            <div className="bcord-chat-composer">
              <textarea
                ref={messageInputRef}
                className="bcord-chat-input"
                value={newBody}
                onChange={(e) => {
                  if (e.target.value.length <= 500) {
                    setNewBody(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                    e.target.style.height = 'auto';
                  }
                }}
                placeholder={`Message @${otherUsername}`}
                rows={1}
                maxLength={500}
              />
              <button className="bcord-chat-send-btn" onClick={sendMessage} disabled={sending || !newBody.trim()}>
                {sending ? "..." : "Send"}
              </button>
            </div>
          )}
        </div>

        {/* RUMBLE COLLAPSE BUTTON */}
        <div 
          className={`rumble-collapse-btn ${rumbleCollapsed ? 'collapsed' : ''}`}
          onClick={() => setRumbleCollapsed(!rumbleCollapsed)}
          title={rumbleCollapsed ? "Show Rumble Lineup" : "Hide Rumble Lineup"}
        />

        {/* RUMBLE SIDEBAR */}
        <div className={`bcord-chat-col bcord-chat-rumble ${rumbleCollapsed ? 'rumble-collapsed' : ''}`}>
          <div className="bcord-chat-rumble-header">
            <div className="bcord-chat-rumble-title">RUMBLE LINEUP</div>
          </div>
          <div className="bcord-chat-rumble-list">
            {rumbleVideos.length === 0 ? (
              <div className="bcord-chat-rumble-loading">Loading...</div>
            ) : (
              rumbleVideos.map((video, index) => (
                <a 
                  key={index}
                  href={video.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`bcord-chat-rumble-item ${video.isLive ? 'is-live' : ''}`}
                >
                  {video.thumbnail && (
                    <img 
                      src={video.thumbnail} 
                      alt=""
                      className="rumble-thumbnail"
                      referrerPolicy="no-referrer"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                  <div className="rumble-info">
                    <div className="title">
                      {video.isLive && <span className="live-badge">LIVE</span>}
                      {video.title}
                    </div>
                    <div className="host">{video.channel}</div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Profile Menu Popup */}
      {profileMenuOpen && (
        <div className="profile-menu-overlay" onClick={() => setProfileMenuOpen(false)}>
          <div className="profile-menu-popup" onClick={(e) => e.stopPropagation()}>
            <div className="profile-menu-header">
              <div className="profile-avatar-large">
                {userInitials}
              </div>
              <div className="profile-info">
                <div className="profile-username">{currentUser}</div>
                <div className="profile-status">Online</div>
              </div>
            </div>
            
            <div className="profile-menu-divider"></div>
            
            <div className="profile-menu-items">
              <button className="profile-menu-item">
                <span className="icon">👤</span>
                <span className="label">My Profile</span>
              </button>
              <button className="profile-menu-item">
                <span className="icon">⚙️</span>
                <span className="label">Settings</span>
              </button>
              <button className="profile-menu-item">
                <span className="icon">🔒</span>
                <span className="label">Privacy</span>
              </button>
              {isAdmin && (
                <button 
                  className="profile-menu-item" 
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setAdminPanelOpen(true);
                  }}
                >
                  <span className="icon">👑</span>
                  <span className="label">Admin</span>
                </button>
              )}
            </div>
            
            <div className="profile-menu-divider"></div>
            
            <button className="profile-menu-item logout" onClick={handleLogout}>
              <span className="icon">🚪</span>
              <span className="label">Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {adminPanelOpen && (
        <div className="admin-panel-overlay" onClick={() => { setAdminPanelOpen(false); setAdminVerified(false); setAdminPassword(""); }}>
          <div className="admin-panel-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-panel-header">
              <h2>🔐 Admin Access</h2>
              <button className="admin-panel-close" onClick={() => { setAdminPanelOpen(false); setAdminVerified(false); setAdminPassword(""); }}>×</button>
            </div>
            
            {!adminVerified ? (
              <div className="admin-verify-form">
                <p>Enter the admin password to access the user management panel.</p>
                <label>Admin Password</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && verifyAdminPassword()}
                  placeholder="Enter admin password"
                />
                {adminPanelError && <div className="admin-error">{adminPanelError}</div>}
                <div className="admin-verify-buttons">
                  <button className="admin-btn-cancel" onClick={() => { setAdminPanelOpen(false); setAdminPassword(""); }}>Cancel</button>
                  <button className="admin-btn-verify" onClick={verifyAdminPassword}>Verify</button>
                </div>
              </div>
            ) : (
              <div className="admin-users-panel">
                <h3>User Management</h3>
                <div className="admin-users-list">
                  {users.map((user) => (
                    <div key={user.username} className="admin-user-row">
                      <div className="admin-user-info">
                        <span className="admin-user-name">{user.username}</span>
                        <span className="admin-user-email">{user.email}</span>
                      </div>
                      <div className="admin-user-actions">
                        <button onClick={() => resetPassword(user.username)}>Reset Password</button>
                        <button className="danger" onClick={() => deleteUser(user.username)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rumble Lineup Manager Modal (Ctrl+Shift+K) */}
      {rumbleManagerOpen && (
        <div className="profile-menu-overlay" onClick={() => setRumbleManagerOpen(false)}>
          <div 
            className="rumble-manager-modal" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              borderRadius: '12px',
              padding: '24px',
              width: '500px',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '18px' }}>📺 Rumble Lineup Manager</h2>
              <button 
                onClick={() => setRumbleManagerOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}
              >×</button>
            </div>
            
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
              Add up to 10 Rumble channels. Just paste a Rumble URL and it auto-detects the type!
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {rumbleChannels.map((channel, index) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  gap: '8px', 
                  alignItems: 'center',
                  background: '#0f172a',
                  padding: '12px',
                  borderRadius: '8px'
                }}>
                  <span style={{ color: '#64748b', fontSize: '12px', width: '20px' }}>{index + 1}.</span>
                  <select
                    value={channel.type}
                    onChange={(e) => {
                      const updated = [...rumbleChannels];
                      updated[index] = { ...channel, type: e.target.value };
                      if (e.target.value === 'channel') {
                        delete updated[index].url;
                      }
                      setRumbleChannels(updated);
                    }}
                    style={{
                      background: '#334155',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#e2e8f0',
                      padding: '6px 8px',
                      fontSize: '12px',
                      width: '100px'
                    }}
                  >
                    <option value="channel">Channel</option>
                    <option value="livestream">Livestream</option>
                  </select>
                  <input
                    type="text"
                    value={channel.id}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = [...rumbleChannels];
                      // Auto-detect if user pastes a Rumble URL
                      if (val.includes('rumble.com/c/')) {
                        // Channel URL: https://rumble.com/c/SaltyCracker
                        const match = val.match(/rumble\.com\/c\/([^\/?]+)/);
                        if (match) {
                          updated[index] = { ...channel, id: match[1], name: match[1], type: 'channel' };
                          setRumbleChannels(updated);
                          return;
                        }
                      } else if (val.includes('rumble.com/v')) {
                        // Video/Livestream URL: https://rumble.com/v6xkx0a-...
                        const videoId = val.split('/').pop()?.split('-')[0] || 'video';
                        updated[index] = { ...channel, id: videoId, name: channel.name || 'Livestream', type: 'livestream', url: val };
                        setRumbleChannels(updated);
                        return;
                      }
                      updated[index] = { ...channel, id: val };
                      setRumbleChannels(updated);
                    }}
                    placeholder="Channel ID or paste Rumble URL"
                    style={{
                      flex: 1,
                      background: '#334155',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#e2e8f0',
                      padding: '8px 12px',
                      fontSize: '13px'
                    }}
                  />
                  <input
                    type="text"
                    value={channel.name}
                    onChange={(e) => {
                      const updated = [...rumbleChannels];
                      updated[index] = { ...channel, name: e.target.value };
                      setRumbleChannels(updated);
                    }}
                    placeholder="Display Name"
                    style={{
                      width: '120px',
                      background: '#334155',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#e2e8f0',
                      padding: '8px 12px',
                      fontSize: '13px'
                    }}
                  />
                  {channel.type === 'livestream' && (
                    <input
                      type="text"
                      value={channel.url || ''}
                      onChange={(e) => {
                        const updated = [...rumbleChannels];
                        updated[index] = { ...channel, url: e.target.value };
                        setRumbleChannels(updated);
                      }}
                      placeholder="Rumble URL"
                      style={{
                        width: '200px',
                        background: '#334155',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#e2e8f0',
                        padding: '8px 12px',
                        fontSize: '13px'
                      }}
                    />
                  )}
                  <button
                    onClick={() => {
                      const updated = rumbleChannels.filter((_, i) => i !== index);
                      setRumbleChannels(updated);
                    }}
                    style={{
                      background: '#ef4444',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'white',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >🗑</button>
                </div>
              ))}
            </div>
            
            {rumbleChannels.length < 10 && (
              <button
                onClick={() => {
                  setRumbleChannels([...rumbleChannels, { id: '', name: '', type: 'channel' }]);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#334155',
                  border: '2px dashed #475569',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginBottom: '16px'
                }}
              >+ Add Channel ({rumbleChannels.length}/10)</button>
            )}
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setRumbleChannels([
                    { id: 'Infowars', name: 'InfoWars', type: 'livestream', url: 'https://rumble.com/v6xkx0a-infowars-network-feed-live-247.html' },
                    { id: 'SaltyCracker', name: 'SaltyCracker', type: 'channel' },
                    { id: 'StevenCrowder', name: 'Steven Crowder', type: 'channel' }
                  ]);
                }}
                style={{
                  padding: '10px 16px',
                  background: '#475569',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >Reset to Defaults</button>
              <button
                onClick={() => setRumbleManagerOpen(false)}
                style={{
                  padding: '10px 20px',
                  background: '#6366f1',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >Save & Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
