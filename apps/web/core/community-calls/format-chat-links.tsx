import * as React from 'react';

const URL_PATTERN = '(https?:\\/\\/[^\\s<>"\')]+[^\\s<>"\'),.;!?])';
const EMAIL_PATTERN = '([a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)+)';
const LINK_REGEX = new RegExp(`${URL_PATTERN}|${EMAIL_PATTERN}`, 'g');

/** Turns URLs and email addresses in a plain-text chat message into clickable links. */
export function formatChatMessageLinks(message: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of message.matchAll(LINK_REGEX)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push(message.substring(lastIndex, matchIndex));
    }

    const matchedText = match[0];
    if (matchedText.includes('@')) {
      parts.push(
        <a
          key={matchIndex}
          className="text-ctaPrimary underline"
          href={`mailto:${matchedText}`}
          target="_blank"
          rel="noreferrer"
        >
          {matchedText}
        </a>
      );
    } else {
      const href = /^https?:\/\//.test(matchedText) ? matchedText : `https://${matchedText}`;
      parts.push(
        <a key={matchIndex} className="text-ctaPrimary underline" href={href} target="_blank" rel="noreferrer">
          {matchedText}
        </a>
      );
    }

    lastIndex = matchIndex + matchedText.length;
  }

  if (lastIndex < message.length) {
    parts.push(message.substring(lastIndex));
  }

  return parts.length > 0 ? parts : message;
}
