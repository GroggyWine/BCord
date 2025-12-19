import React, { useState } from "react";
import axios from "axios";

export default function NewDmModal({ onClose, onSuccess }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleStartDm(e) {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      const res = await axios.post(
        "/api/dm/start",
        { other_username: username.trim() },
        { withCredentials: true }
      );
      
      // Success! Call parent with new DM info
      onSuccess({
        dm_id: res.data.dm_id,
        other_username: res.data.other_username,
        other_user_id: null, // We don't have this yet
        last_message_content: "",
        last_message_time: new Date().toISOString()
      });
      onClose();
    } catch (err) {
      console.error("Start DM error:", err);
      const msg = err?.response?.data?.error || err?.message || "Failed to start DM";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Start New DM</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleStartDm} className="modal-body">
          <div className="form-group">
            <label htmlFor="dm-username">Username</label>
            <input
              id="dm-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username..."
              autoFocus
              disabled={loading}
            />
          </div>
          
          {error && <div className="form-error">{error}</div>}
          
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Starting..." : "Start DM"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
