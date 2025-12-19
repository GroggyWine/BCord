import React, { useEffect, useState, useRef } from "react";
import axios from "axios";

// Format timestamp to readable format like "10:32:29 pm 12/11/2025"
function formatTimestamp(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  
  return `${displayHours}:${minutes}:${seconds} ${ampm} ${month}/${day}/${year}`;
}

export default function DmThread({ dmId, otherUsername }) {
  const [messages, setMessages] = useState([]);
  const [newBody, setNewBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  // Fetch thread
  async function loadThread() {
    if (!dmId) return;
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`/api/dm/thread?dm_id=${dmId}`, {
        withCredentials: true,
      });
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error("loadThread error", err);
      const msg =
        err?.response?.data?.error || err?.message || "Failed to load DM thread.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadThread();
    // simple 5s polling for now
    const id = setInterval(loadThread, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmId]);

  // Auto scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function sendMessage() {
    if (!dmId || !newBody.trim()) return;
    setSending(true);
    setError("");
    try {
      await axios.post(
        "/api/dm/send",
        { dm_id: dmId, content: newBody.trim() },
        { withCredentials: true }
      );
      setNewBody("");
      await loadThread();
    } catch (err) {
      console.error("sendMessage error", err);
      const msg =
        err?.response?.data?.error || err?.message || "Failed to send message.";
      setError(msg);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="dm-thread-root">
      <header className="dm-thread-header">
        <div className="dm-thread-title">
          <span className="dm-thread-hash">@</span>
          <span>{otherUsername || "Direct Message"}</span>
        </div>
      </header>

      <div className="dm-thread-body" ref={listRef}>
        {loading && messages.length === 0 && (
          <div className="dm-thread-status">Loading messages…</div>
        )}
        {error && (
          <div className="dm-thread-error">{error}</div>
        )}
        {messages.length === 0 && !loading && !error && (
          <div className="dm-thread-status">
            No messages yet. Say hi to {otherUsername}!
          </div>
        )}
        {messages.map((m) => (
          <div key={m.dm_message_id} className="dm-thread-message">
            <div className="avatar">
              {m.sender_username.slice(0, 2).toUpperCase()}
            </div>
            <div className="content">
              <div className="meta">
                <span className="sender">{m.sender_username}</span>
                <span className="time">{formatTimestamp(m.created_at)}</span>
              </div>
              <div className="text">{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dm-thread-composer">
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message @${otherUsername}`}
          rows={2}
        />
        <button disabled={sending} onClick={sendMessage}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
