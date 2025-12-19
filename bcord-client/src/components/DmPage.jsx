import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import useTokenRefresher from "../hooks/useTokenRefresher";
import { playDoorbellDingDong, playMessageSent } from "../utils/sounds";

export default function DmPage() {
  const { dmId } = useParams();
  const navigate = useNavigate();
  
  // Auto-refresh access token every 10 minutes
  useTokenRefresher(10);
  
  const [dmList, setDmList] = useState([]);
  const [selectedDmId, setSelectedDmId] = useState(dmId ? Number(dmId) : null);
  const [otherUsername, setOtherUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [newBody, setNewBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [sessionWarning, setSessionWarning] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  
  const messagesEndRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const authenticatedUserRef = useRef(null);
  const messageInputRef = useRef(null);

  // Verify current session matches expected user
  const verifySession = useCallback(async () => {
    try {
      const res = await axios.get("/api/profile", { withCredentials: true });
      const serverUser = res.data?.user;
      
      if (!serverUser) {
        navigate("/login");
        return false;
      }
      
      if (authenticatedUserRef.current && authenticatedUserRef.current !== serverUser) {
        setSessionWarning(true);
        setTimeout(() => navigate("/login"), 3000);
        return false;
      }
      
      return true;
    } catch (err) {
      navigate("/login");
      return false;
    }
  }, [navigate]);

  // Load current user on mount
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await axios.get("/api/profile", { withCredentials: true });
        if (res.data?.user) {
          authenticatedUserRef.current = res.data.user;
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

  // Load DM list and auto-select from URL
  useEffect(() => {
    async function loadDmList() {
      try {
        const res = await axios.get("/api/dm/list", { withCredentials: true });
        
        let list = [];
        if (Array.isArray(res.data)) {
          list = res.data;
        } else if (res.data?.dms) {
          list = res.data.dms;
        }
        
        setDmList(list);
        
        // Auto-select DM from URL parameter
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

  // Load messages when DM is selected
  useEffect(() => {
    if (!selectedDmId) return;
    prevMessageCountRef.current = 0;

    const loadMessages = async () => {
      try {
        const res = await axios.get(`/api/dm/thread?dm_id=${selectedDmId}`, { withCredentials: true });
        
        let msgs = res.data?.messages || (Array.isArray(res.data) ? res.data : []);
        
        // Play sound for new messages from others
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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for DM list updates
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

  // Poll for online users
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
      
      // Refresh messages
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

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="bcord-chat-page">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bcord-chat-page">
      {/* Session Warning */}
      {sessionWarning && (
        <div className="session-warning-overlay">
          <div className="session-warning-modal">
            <div className="warning-icon">⚠️</div>
            <h2>Session Changed</h2>
            <p>Another account has logged in. Redirecting...</p>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="bcord-chat-topbar">
        <div className="bcord-chat-topbar-left">
          <span className="bcord-chat-topbar-title">Direct Messages</span>
          <span className="bcord-chat-topbar-channel">
            {otherUsername ? `@${otherUsername}` : 'Select a conversation'}
          </span>
        </div>
        <div className="bcord-chat-topbar-right">
          <button 
            className="bcord-chat-topbar-btn"
            onClick={() => navigate("/chat")}
            title="Back to Chat"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Main Content - Same structure as ChatPage */}
      <div className="bcord-chat-body" style={{ gridTemplateColumns: '210px 1fr' }}>
        {/* Left Sidebar - DM List */}
        <div className="bcord-chat-col bcord-chat-left">
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
                  <span className="bcord-chat-room-hash">@</span>
                  <span className="bcord-chat-room-name">
                    {dm.other_username || "Unknown"}
                    {onlineUsers.includes(dm.other_username) && (
                      <span className="online-dot" style={{ 
                        display: 'inline-block', 
                        width: '8px', 
                        height: '8px', 
                        background: '#22c55e', 
                        borderRadius: '50%', 
                        marginLeft: '6px' 
                      }} />
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center - Messages */}
        <div className="bcord-chat-col bcord-chat-center">
          {/* Channel Header */}
          <div className="bcord-chat-channel-header">
            <span className="bcord-chat-channel-hash">@</span>
            <span className="bcord-chat-channel-name">
              {otherUsername || 'Select a conversation'}
              {otherUsername && onlineUsers.includes(otherUsername) && (
                <span style={{ color: '#22c55e', fontSize: '12px', marginLeft: '8px' }}>● Online</span>
              )}
            </span>
          </div>

          {/* Messages Area */}
          <div className="bcord-chat-messages">
            {!selectedDmId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                Select a conversation to start messaging
              </div>
            ) : messages.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                No messages yet. Say hi to {otherUsername}!
              </div>
            ) : (
              messages.map((m, idx) => (
                <div key={m.dm_message_id || idx} className="bcord-chat-message">
                  <div className="bcord-chat-message-avatar">
                    {(m.sender_username || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="bcord-chat-message-content">
                    <div className="bcord-chat-message-header">
                      <span className="bcord-chat-message-sender">{m.sender_username}</span>
                      <span className="bcord-chat-message-time">{formatTime(m.created_at)}</span>
                    </div>
                    <div className="bcord-chat-message-body">{m.content}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          {selectedDmId && (
            <div className="bcord-chat-input-area">
              <input
                ref={messageInputRef}
                type="text"
                className="bcord-chat-input"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value.slice(0, 500))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`Message @${otherUsername}`}
                disabled={sending}
                maxLength={500}
              />
              <button 
                className="bcord-chat-send-btn" 
                onClick={sendMessage}
                disabled={sending || !newBody.trim()}
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
