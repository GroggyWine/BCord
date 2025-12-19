import React from "react";

const FRIENDS = ["GroggyWine", "naed"];

export default function FriendList({ onSelectFriend }) {
  return (
    <>
      <div className="bcord-chat-rooms-header">
        <div className="bcord-chat-rooms-title">Friends</div>
      </div>
      <div className="friend-list-items">
        {FRIENDS.map((username) => (
          <button
            key={username}
            className="friend-list-item"
            onClick={() => onSelectFriend(username)}
          >
            <div className="avatar">
              {username.slice(0, 2).toUpperCase()}
            </div>
            <div className="content">
              <div className="name">{username}</div>
              <div className="status">Click to message</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
