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
  const [selectedDmId, setSelectedDmId] = useState(null);
  const [otherUsername, setOtherUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [newBody, setNewBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [sessionWarning, setSessionWarning] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  
  const messagesEndRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  
  // Track the authenticated user identity for session validation
  const authenticatedUserRef = useRef(null);
  const messageInputRef = useRef(null);

  // Verify current session matches expected user
  const verifySession = useCallback(async () => {
    try {
      const res = await axios.get("/api/profile", {
        withCredentials: true,
      });
      
      const serverUser = res.data?.user;
      
      if (!serverUser) {
        console.warn("[Session] No user in response - session expired");
        navigate("/login");
        return false;
      }
      
      // Check if the authenticated user changed (session hijack/crossover)
      if (authenticatedUserRef.current && authenticatedUserRef.current !== serverUser) {
        console.error(
          `[Session] CRITICAL: User identity changed from "${authenticatedUserRef.current}" to "${serverUser}"!`
        );
        setSessionWarning(true);
        
        // Force logout to prevent session crossover
        setTimeout(() => {
          navigate("/login");
        }, 3000);
        
        return false;
      }
      
      return true;
    } catch (err) {
      console.error("[Session] Verification failed:", err);
      navigate("/login");
      return false;
    }
  }, [navigate]);

  // Load current user on mount
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await axios.get("/api/profile", {
          withCredentials: true,
        });
        
        if (res.data && res.data.user) {
          const username = res.data.user;
          authenticatedUserRef.current = username;
          setCurrentUser(username);
          console.log(`[Session] Authenticated as: ${username}`);
        } else {
          console.error("No user in profile response - redirecting to login");
          navigate("/login");
        }
      } catch (err) {
        console.error("Failed to load user - redirecting to login:", err);
        navigate("/login");
      }
    }
    loadUser();
  }, [navigate]);

  // Initial load
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    (async () => {
      try {
        const res = await axios.get("/api/dm/list", { withCredentials: true });
        console.log("DM list response:", res.data);
        
        // Handle different response formats
        let list = [];
        if (Array.isArray(res.data)) {
          list = res.data;
        } else if (res.data && Array.isArray(res.data.dms)) {
          list = res.data.dms;
        } else if (res.data && typeof res.data === 'object') {
          // Maybe it's wrapped in another property
          const keys = Object.keys(res.data);
          for (const key of keys) {
            if (Array.isArray(res.data[key])) {
              list = res.data[key];
              break;
            }
          }
        }
        
        console.log("Processed DM list:", list);
        setDmList(list);
        
        if (dmId && list.length > 0) {
          const targetId = Number(dmId);
          const match = list.find(d => d.dm_id === targetId);
          if (match) {
            console.log("Found matching DM:", match);
            setSelectedDmId(targetId);
            setOtherUsername(match.other_username || "Unknown");
          } else {
            console.warn("DM not found in list:", targetId);
          }
        }
      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [dmId]);

  // Load messages with session verification
  useEffect(() => {
    if (!selectedDmId) return;
    prevMessageCountRef.current = 0; // Reset when switching DMs

    let pollCount = 0;

    const load = async () => {
      try {
        const res = await axios.get(`/api/dm/thread?dm_id=${selectedDmId}`, {
          withCredentials: true,
        });
        console.log("Thread response:", res.data);
        
        let msgs = [];
        if (Array.isArray(res.data)) {
          msgs = res.data;
        } else if (res.data && Array.isArray(res.data.messages)) {
          msgs = res.data.messages;
        }
        
        // Check for new messages from other users
        if (msgs.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.sender_username !== currentUser) {
            playDoorbellDingDong();
          }
        }
        prevMessageCountRef.current = msgs.length;
        
        setMessages(msgs);
        
        // Mark DM as read
        axios.post(`/api/dm/${selectedDmId}/mark-read`, {}, { withCredentials: true }).catch(() => {});
      } catch (err) {
        console.error("Load messages error:", err);
      }
    };

    load();
    
    const interval = setInterval(async () => {
      pollCount++;
      
      // Verify session every 3 polls (15 seconds)
      if (pollCount >= 3) {
        pollCount = 0;
        const sessionValid = await verifySession();
        if (!sessionValid) {
          clearInterval(interval);
          return;
        }
      }
      
      load();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [selectedDmId, verifySession]);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Poll for DM list updates (new conversations started by others)
  useEffect(() => {
    const pollDmList = async () => {
      try {
        const res = await axios.get("/api/dm/list", { withCredentials: true });
        
        let list = [];
        if (Array.isArray(res.data)) {
          list = res.data;
        } else if (res.data && Array.isArray(res.data.dms)) {
          list = res.data.dms;
        } else if (res.data && typeof res.data === 'object') {
          const keys = Object.keys(res.data);
          for (const key of keys) {
            if (Array.isArray(res.data[key])) {
              list = res.data[key];
              break;
            }
          }
        }
        
        // Only update if the list changed (to avoid unnecessary re-renders)
        setDmList(prevList => {
          if (JSON.stringify(prevList) !== JSON.stringify(list)) {
            return list;
          }
          return prevList;
        });
      } catch (err) {
        // Silently fail - don't spam console
      }
    };
    
    const interval = setInterval(pollDmList, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Poll for online users
  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const res = await axios.get("/api/users/online", { withCredentials: true });
        if (res.data && Array.isArray(res.data.online)) {
          setOnlineUsers(res.data.online);
        }
      } catch (err) {
        // Silently fail
      }
    };
    
    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 10000); // Poll every 10 seconds
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
      const res = await axios.get(`/api/dm/thread?dm_id=${selectedDmId}`, {
        withCredentials: true,
      });
      
      let msgs = [];
      if (Array.isArray(res.data)) {
        msgs = res.data;
      } else if (res.data && Array.isArray(res.data.messages)) {
        msgs = res.data.messages;
      }
        // Check for new messages from other users
        if (msgs.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.sender_username !== currentUser) {
            playDoorbellDingDong();
          }
        }
        prevMessageCountRef.current = msgs.length;
        
        setMessages(msgs);
        
        // Mark DM as read
        axios.post(`/api/dm/${selectedDmId}/mark-read`, {}, { withCredentials: true }).catch(() => {});
    } catch (err) {
      console.error("Send error:", err);
      alert("Failed to send message");
    } finally {
      setSending(false);
      // Keep focus on input for next message
      setTimeout(() => {
        if (messageInputRef.current) {
          messageInputRef.current.focus();
        }
      }, 50);
    }
  };

  const selectDm = (dm) => {
    // Skip if already viewing this DM
    if (dm.dm_id === selectedDmId) return;
    setSelectedDmId(dm.dm_id);
    setOtherUsername(dm.other_username || "Unknown");
    setMessages([]);
    navigate(`/dm/${dm.dm_id}`);
  };

  // Check if a user is online
  const isUserOnline = (username) => {
    return onlineUsers.includes(username);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020617',
        color: '#e5e7eb',
        fontSize: '16px'
      }}>
        Loading DM...
      </div>
    );
  }

  return (
    <div className="dm-page-root">
      {/* Session Warning Modal */}
      {sessionWarning && (
        <div className="session-warning-overlay">
          <div className="session-warning-modal">
            <div className="warning-icon">⚠️</div>
            <h2>Session Changed</h2>
            <p>
              Another account has logged in on this browser. 
              You are being redirected to the login page for security.
            </p>
            <p className="warning-note">
              Note: Only one account can be active per browser. 
              Use a different browser or incognito window for multiple accounts.
            </p>
          </div>
        </div>
      )}

      <div className="dm-page-nav">
        <button onClick={() => navigate("/chat")} className="dm-back-btn">
          ← Back to Chat
        </button>
        <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '12px' }}>
          Logged in as: {currentUser}
        </span>
      </div>

      <div className="dm-page-content">
        <aside className="dm-page-sidebar">
          <div className="bcord-chat-rooms-header">
            <div className="bcord-chat-rooms-title">Direct Messages</div>
          </div>
          <div className="dm-list-items">
            {dmList.length === 0 ? (
              <div className="dm-list-empty">No DMs yet</div>
            ) : (
              dmList.map((dm) => (
                <button
                  key={dm.dm_id}
                  className={`dm-list-item ${selectedDmId === dm.dm_id ? "active" : ""}`}
                  onClick={() => selectDm(dm)}
                >
                  <div className="avatar-container">
                    <div className="avatar">
                      {(dm.other_username || "?").slice(0, 2).toUpperCase()}
                    </div>
                    {isUserOnline(dm.other_username) && (
                      <div className="online-indicator" />
                    )}
                  </div>
                  <div className="content">
                    <div className="name">{dm.other_username || "Unknown"}</div>
                    <div className="preview">{dm.last_message || "No messages yet"}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="dm-page-main">
          {!selectedDmId ? (
            <div className="dm-page-empty">
              Select a conversation from the list
            </div>
          ) : (
            <div className="dm-thread-root">
              <header className="dm-thread-header">
                <div className="dm-thread-title">
                  <span className="dm-thread-hash">@</span>
                  <span>{otherUsername}</span>
                  {isUserOnline(otherUsername) && (
                    <span className="online-badge">● Online</span>
                  )}
                </div>
              </header>

              <div className="dm-thread-body">
                {messages.length === 0 ? (
                  <div className="dm-thread-status">
                    No messages yet. Say hi to {otherUsername}!
                  </div>
                ) : (
                  messages.map((m, idx) => (
                    <div key={m.dm_message_id || idx} className="dm-thread-message">
                      <div className="avatar">
                        {(m.sender_username || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="content">
                        <div className="meta">
                          <span className="sender">{m.sender_username || "Unknown"}</span>
                          <span className="time">{new Date(m.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text">{m.content}</div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="dm-thread-composer">
                <textarea
                  ref={messageInputRef}
                  value={newBody}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= 500) {
                      setNewBody(value);
                      // Auto-resize
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                      // Reset height after sending
                      e.target.style.height = 'auto';
                    }
                  }}
                  placeholder={`Message @${otherUsername}`}
                  rows={1}
                  disabled={sending}
                  maxLength={500}
                />
                {newBody.length > 400 && (
                  <span style={{
                    position: 'absolute',
                    right: '80px',
                    bottom: '18px',
                    fontSize: '11px',
                    color: newBody.length >= 500 ? '#ef4444' : '#9ca3af'
                  }}>
                    {newBody.length}/500
                  </span>
                )}
                <button disabled={sending || !newBody.trim()} onClick={sendMessage}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
