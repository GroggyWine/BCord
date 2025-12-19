import React, { useState, useEffect } from "react";
import axios from "axios";

export default function DmList({ selectedDmId, onSelect, onNewDm, dmList, onRefresh }) {
  const [dms, setDms] = useState([]);

  // Use dmList from props if provided, otherwise load it
  useEffect(() => {
    if (dmList && dmList.length > 0) {
      setDms(dmList);
    } else {
      // Only load if not provided via props
      loadDms();
    }
  }, [dmList]);

  async function loadDms() {
    try {
      const res = await axios.get("/api/dm/list", { withCredentials: true });
      setDms(res.data);
    } catch (err) {
      console.error("Load DMs error:", err);
    }
  }

  function handleRefresh() {
    if (onRefresh) {
      onRefresh();
    } else {
      loadDms();
    }
  }

  return (
    <>
      <div className="bcord-chat-rooms-header">
        <div className="bcord-chat-rooms-title">Direct Messages</div>
        <div className="dm-list-header-actions">
          <button className="dm-list-refresh" onClick={handleRefresh} title="Refresh">
            ↻
          </button>
          <button className="dm-list-new" onClick={onNewDm} title="New DM">
            +
          </button>
        </div>
      </div>
      <div className="dm-list-items">
        {dms.length === 0 && (
          <div className="dm-list-empty">No DMs yet. Click + to start one!</div>
        )}
        {dms.map((dm) => (
          <button
            key={dm.dm_id}
            className={`dm-list-item ${selectedDmId === dm.dm_id ? "active" : ""}`}
            onClick={() => onSelect(dm)}
          >
            <div className="avatar">
              {dm.other_username.slice(0, 2).toUpperCase()}
            </div>
            <div className="content">
              <div className="name">{dm.other_username}</div>
              <div className="preview">{dm.last_message || "No messages yet"}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
