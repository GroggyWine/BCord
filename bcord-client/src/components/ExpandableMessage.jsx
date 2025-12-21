import React, { useState, useMemo } from "react";

/**
 * ExpandableMessage - Displays long messages in a compressed box
 * Messages over 500 chars are truncated with "Show more..." 
 * Click to expand in a modal with scrolling
 * Emojis are wrapped in spans for 25% larger rendering
 */

// Emoji regex pattern
const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;

// Process text to wrap emojis in spans
function processContent(text) {
  if (!text) return null;
  
  const parts = [];
  let lastIndex = 0;
  let match;
  
  // Reset regex
  emojiRegex.lastIndex = 0;
  
  while ((match = emojiRegex.exec(text)) !== null) {
    // Add text before emoji
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add emoji wrapped in span
    parts.push(
      <span key={match.index} className="emoji">{match[0]}</span>
    );
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

export default function ExpandableMessage({ content, maxLength = 500 }) {
  const [expanded, setExpanded] = useState(false);
  
  // Check if message needs truncation
  const needsTruncation = content && content.length > maxLength;
  const displayText = needsTruncation && !expanded 
    ? content.slice(0, maxLength) + "..." 
    : content;
  
  // Process content with emoji wrapping
  const processedContent = useMemo(() => processContent(content), [content]);
  const processedPreview = useMemo(() => processContent(displayText), [displayText]);
  
  if (!needsTruncation) {
    // Short message - render normally with preserved formatting
    return (
      <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>
        {processedContent}
      </div>
    );
  }
  
  return (
    <>
      {/* Collapsed view */}
      <div className="message-content expandable-message">
        <div className="message-preview" style={{ whiteSpace: 'pre-wrap' }}>
          {processedPreview}
        </div>
        <button 
          className="expand-message-btn"
          onClick={() => setExpanded(true)}
        >
          Show more ({content.length} chars)
        </button>
      </div>
      
      {/* Expanded modal */}
      {expanded && (
        <div className="message-modal-overlay" onClick={() => setExpanded(false)}>
          <div className="message-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="message-modal-close"
              onClick={() => setExpanded(false)}
              title="Close"
            >
              ✕
            </button>
            <div className="message-modal-content" style={{ whiteSpace: 'pre-wrap' }}>
              {processedContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
