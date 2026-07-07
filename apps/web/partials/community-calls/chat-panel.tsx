'use client';

import * as React from 'react';

import Textarea from 'react-textarea-autosize';

import { formatRelativeTime } from '~/core/community-calls/format';
import { formatChatMessageLinks } from '~/core/community-calls/format-chat-links';
import { ChatEntry } from '~/core/community-calls/use-persistent-chat';

import { Avatar } from '~/design-system/avatar';

const GROUPING_WINDOW_MS = 60_000;

type Props = {
  messages: ChatEntry[];
  send: (content: string) => Promise<void>;
  isViewer: boolean;
};

/**
 * Chat sidebar — LiveKit live messages merged with persisted history, per-message
 * avatars. `messages`/`send` come from `usePersistentChat`, lifted to the room
 * body so unread tracking keeps working while this panel isn't mounted.
 */
export function ChatPanel({ messages, send, isViewer }: Props) {
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const onSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setDraft('');
    setSending(true);
    try {
      await send(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ul ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((entry, idx) => {
          const prev = messages[idx - 1];
          const grouped =
            prev &&
            prev.senderIdentity === entry.senderIdentity &&
            entry.timestamp - prev.timestamp < GROUPING_WINDOW_MS;
          return <ChatRow key={entry.id} entry={entry} showHeader={!grouped} />;
        })}
        {messages.length === 0 && <li className="pt-8 text-center text-metadata text-grey-03">No messages yet</li>}
      </ul>

      {!isViewer && (
        <form
          onSubmit={e => {
            e.preventDefault();
            onSend();
          }}
          className="flex items-end gap-2 border-t border-grey-02 p-2"
        >
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Send a message…"
            minRows={1}
            maxRows={5}
            maxLength={500}
            className="max-h-24 flex-1 resize-none rounded-md border border-grey-02 bg-white px-2 py-1.5 text-metadata text-text placeholder:text-grey-03 focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="shrink-0 rounded-md bg-ctaPrimary px-3 py-1.5 text-metadataMedium text-white disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function ChatRow({ entry, showHeader }: { entry: ChatEntry; showHeader: boolean }) {
  return (
    <li className="flex gap-2">
      <div className="w-6 shrink-0">
        {showHeader && (
          <span className="block size-6 overflow-hidden rounded-full">
            <Avatar
              value={entry.senderName}
              avatarUrl={entry.senderAvatarCid ? `ipfs://${entry.senderAvatarCid}` : undefined}
              size={24}
            />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-metadataMedium text-text">{entry.senderName}</span>
            <span className="text-footnote text-grey-03">{formatRelativeTime(entry.timestamp)}</span>
          </div>
        )}
        <p className="text-metadata break-words whitespace-pre-wrap text-text">
          {formatChatMessageLinks(entry.content)}
        </p>
      </div>
    </li>
  );
}
