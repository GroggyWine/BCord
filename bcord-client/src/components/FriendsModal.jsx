import React, { useState, useEffect } from "react";
import axios from "axios";

export default function FriendsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("add");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [pendingRes, sentRes, friendsRes] = await Promise.all([
        axios.get("/api/friends/pending", { withCredentials: true }),
        axios.get("/api/friends/sent", { withCredentials: true }),
        axios.get("/api/friends/list", { withCredentials: true })
      ]);
      setPendingRequests(pendingRes.data?.requests || []);
      setSentRequests(sentRes.data?.requests || []);
      setFriends(friendsRes.data?.friends || []);
    } catch (err) {
      console.error("Failed to load friend data:", err);
    }
  };

  const handleSendRequest = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      await axios.post("/api/friends/request", { username: username.trim() }, { withCredentials: true });
      setMessage({ type: "success", text: `Friend request sent to ${username}!` });
      setUsername("");
      loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Failed to send request" });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (requestId, fromUsername) => {
    try {
      await axios.post("/api/friends/accept", { request_id: requestId }, { withCredentials: true });
      setMessage({ type: "success", text: `You are now friends with ${fromUsername}!` });
      loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Failed to accept" });
    }
  };

  const handleReject = async (requestId) => {
    try {
      await axios.post("/api/friends/reject", { request_id: requestId }, { withCredentials: true });
      loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Failed to reject" });
    }
  };

  const handleCancelSent = async (requestId) => {
    try {
      await axios.post("/api/friends/reject", { request_id: requestId }, { withCredentials: true });
      loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Failed to cancel" });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="friends-modal-overlay" onClick={onClose}>
      <div className="friends-modal" onClick={(e) => e.stopPropagation()}>
        <div className="friends-modal-header">
          <h2>👥 Friends</h2>
          <button className="friends-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="friends-modal-tabs">
          <button 
            className={`friends-tab ${activeTab === "add" ? "active" : ""}`}
            onClick={() => setActiveTab("add")}
          >
            Add Friend
          </button>
          <button 
            className={`friends-tab ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
          >
            Pending {pendingRequests.length > 0 && <span className="badge">{pendingRequests.length}</span>}
          </button>
          <button 
            className={`friends-tab ${activeTab === "sent" ? "active" : ""}`}
            onClick={() => setActiveTab("sent")}
          >
            Sent {sentRequests.length > 0 && <span className="badge">{sentRequests.length}</span>}
          </button>
          <button 
            className={`friends-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Friends
          </button>
        </div>

        <div className="friends-modal-content">
          {message.text && (
            <div className={`friends-message ${message.type}`}>
              {message.text}
            </div>
          )}

          {activeTab === "add" && (
            <form onSubmit={handleSendRequest} className="friends-add-form">
              <p className="friends-add-description">
                You can add a friend with their BeKord username.
              </p>
              <div className="friends-input-group">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter a username"
                  className="friends-input"
                  autoFocus
                />
                <button 
                  type="submit" 
                  className="friends-send-btn"
                  disabled={loading || !username.trim()}
                >
                  {loading ? "Sending..." : "Send Request"}
                </button>
              </div>
            </form>
          )}

          {activeTab === "pending" && (
            <div className="friends-list">
              {pendingRequests.length === 0 ? (
                <p className="friends-empty">No pending friend requests</p>
              ) : (
                pendingRequests.map((req) => (
                  <div key={req.id} className="friends-request-item">
                    <div className="friends-request-avatar">
                      {req.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="friends-request-info">
                      <div className="friends-request-name">{req.username}</div>
                      <div className="friends-request-subtitle">Incoming Friend Request</div>
                    </div>
                    <div className="friends-request-actions">
                      <button 
                        className="friends-accept-btn"
                        onClick={() => handleAccept(req.id, req.username)}
                      >
                        ✓
                      </button>
                      <button 
                        className="friends-reject-btn"
                        onClick={() => handleReject(req.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "sent" && (
            <div className="friends-list">
              {sentRequests.length === 0 ? (
                <p className="friends-empty">No sent friend requests</p>
              ) : (
                sentRequests.map((req) => (
                  <div key={req.id} className="friends-request-item">
                    <div className="friends-request-avatar">
                      {req.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="friends-request-info">
                      <div className="friends-request-name">{req.username}</div>
                      <div className="friends-request-subtitle">Outgoing Friend Request</div>
                    </div>
                    <div className="friends-request-actions">
                      <button 
                        className="friends-cancel-btn"
                        onClick={() => handleCancelSent(req.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "all" && (
            <div className="friends-list">
              {friends.length === 0 ? (
                <p className="friends-empty">No friends yet. Add some!</p>
              ) : (
                friends.map((friend, idx) => (
                  <div key={idx} className="friends-request-item">
                    <div className="friends-request-avatar">
                      {friend.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="friends-request-info">
                      <div className="friends-request-name">{friend}</div>
                      <div className="friends-request-subtitle">Friend</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
