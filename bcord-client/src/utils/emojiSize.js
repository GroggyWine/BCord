// Utility to wrap emojis in spans for larger rendering
// Emoji regex pattern that matches most common emojis
const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;

export function wrapEmojis(text) {
  if (!text) return text;
  return text.replace(emojiRegex, '<span class="emoji">$1</span>');
}

export function hasEmojis(text) {
  if (!text) return false;
  return emojiRegex.test(text);
}
