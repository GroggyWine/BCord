import React, { useState, useRef, useEffect } from "react";

// Common emoji categories
const EMOJI_CATEGORIES = {
  "😀 Smileys": ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐"],
  "❤️ Hearts": ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️", "💌"],
  "👋 Gestures": ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💪"],
  "🎉 Celebration": ["🎉", "🎊", "🎈", "🎁", "🎀", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🎗️", "🎄", "🎃", "🎆", "🎇", "✨", "🎵", "🎶", "🔥", "💯", "⭐", "🌟", "💫", "🌈"],
  "👍 Reactions": ["👍", "👎", "👏", "🙌", "🤝", "💪", "🔥", "💯", "✅", "❌", "⭐", "❓", "❗", "💡", "👀", "👁️", "🗣️", "💬", "💭", "🗨️", "👤", "👥"],
  "🍕 Food": ["🍕", "🍔", "🍟", "🌭", "🥪", "🌮", "🌯", "🥗", "🍿", "🧈", "🍳", "🥞", "🧇", "🥓", "🍖", "🍗", "🍜", "🍝", "🍣", "🍱", "🍩", "🍪", "🎂", "🍰", "🧁", "🍫", "🍬", "🍭", "☕", "🍵", "🥤", "🧃", "🍺", "🍻", "🥂", "🍷"],
  "⚽ Sports": ["⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🎯", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛷", "⛸️", "🎿", "🏂"],
  "🐱 Animals": ["🐱", "🐶", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊"],
  "💻 Tech": ["💻", "🖥️", "🖨️", "⌨️", "🖱️", "🖲️", "💾", "💿", "📀", "📱", "📲", "☎️", "📞", "📟", "📠", "🔋", "🔌", "💡", "🔦", "🕯️", "🧯", "🛢️", "💸", "💵", "💴", "💶", "💷", "🪙", "💰", "💳", "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🔩", "⚙️"],
};

export default function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState(Object.keys(EMOJI_CATEGORIES)[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const pickerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Filter emojis by search
  const getFilteredEmojis = () => {
    if (!searchTerm.trim()) {
      return EMOJI_CATEGORIES[activeCategory];
    }
    // Search all categories
    const allEmojis = Object.values(EMOJI_CATEGORIES).flat();
    return allEmojis;
  };

  const handleEmojiClick = (emoji) => {
    onSelect(emoji);
  };

  return (
    <div className="emoji-picker" ref={pickerRef}>
      <div className="emoji-picker-header">
        <input
          type="text"
          className="emoji-search"
          placeholder="Search emojis..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
        />
      </div>
      
      {!searchTerm && (
        <div className="emoji-categories">
          {Object.keys(EMOJI_CATEGORIES).map((category) => (
            <button
              key={category}
              className={`emoji-category-btn ${activeCategory === category ? 'active' : ''}`}
              onClick={() => setActiveCategory(category)}
              title={category}
            >
              {category.split(" ")[0]}
            </button>
          ))}
        </div>
      )}
      
      <div className="emoji-grid">
        {getFilteredEmojis().map((emoji, idx) => (
          <button
            key={`${emoji}-${idx}`}
            className="emoji-btn"
            onClick={() => handleEmojiClick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
