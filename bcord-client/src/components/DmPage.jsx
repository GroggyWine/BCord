import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import useTokenRefresher from "../hooks/useTokenRefresher";
import { playDoorbellDingDong, playMessageSent } from "../utils/sounds";

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
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [rumbleVideos, setRumbleVideos] = useState([]);
  const [rumbleCollapsed, setRumbleCollapsed] = useState(false);
  const [leftSectionWidth, setLeftSectionWidth] = useState(210);
  const [friends, setFriends] = useState([]);
  const [friendsDrawerOpen, setFriendsDrawerOpen] = useState(false);
  const [hasUnreadDms, setHasUnreadDms] = useState(false);
  
  const messagesEndRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const messageInputRef = useRef(null);
  const friendsDrawerRef = useRef(null);
  const resizingRef = useRef(null);

  const userInitials = currentUser ? currentUser.slice(0, 2).toUpperCase() : "??";

  // Load current user
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await axios.get("/api/profile", { withCredentials: true });
        if (res.data?.user) {
          setCurrentUser(res.data.user);
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
        const res = await axios.get('/api/rumble/lineup');
        if (res.data?.lineup) {
          const videos = res.data.lineup.map(item => ({
            title: item.title,
            channel: item.channelId || item.name,
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
    const interval = setInterval(fetchRumble, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
    setSelectedDmId(dm.dm_id);
    setOtherUsername(dm.other_username || "Unknown");
    setMessages([]);
    prevMessageCountRef.current = 0;
    navigate(`/dm/${dm.dm_id}`, { replace: true });
  };

  const handleSelectServer = (serverId) => {
    navigate("/chat");
  };

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
      <div className="bcord-chat-page">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#9ca3af' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bcord-chat-page">
      {/* TOP BAR */}
      <div className="bcord-chat-topbar">
        <div className="bcord-chat-topbar-left">
          <span className="bcord-chat-topbar-title">Direct Messages</span>
          <span className="bcord-chat-topbar-channel">
            {otherUsername ? `@${otherUsername}` : ''}
          </span>
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
                  onClick={() => setFriendsDrawerOpen(!friendsDrawerOpen)}
                  style={{ cursor: 'pointer' }}
                  title="Friends & DMs"
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
              <div className="bcord-user-panel-avatar" title={currentUser}>
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

      {/* FRIENDS DRAWER */}
      <div ref={friendsDrawerRef} className={`bcord-chat-friends-drawer ${friendsDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-inner">
          <div className="drawer-header">
            <div className="title">Friends & DMs</div>
            <button className="close-btn" onClick={() => setFriendsDrawerOpen(false)}>×</button>
          </div>
          <div className="drawer-list">
            {friends.length === 0 ? (
              <div style={{ padding: '10px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
                Loading friends...
              </div>
            ) : (
              friends.map((username) => (
                <button
                  key={username}
                  className="drawer-item"
                  onClick={() => handleSelectFriend(username)}
                >
                  <div className="avatar-wrapper">
                    <div className="avatar">{username.slice(0, 2).toUpperCase()}</div>
                    {onlineUsers.includes(username) && <div className="online-indicator"></div>}
                  </div>
                  <div className="name">{username}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
