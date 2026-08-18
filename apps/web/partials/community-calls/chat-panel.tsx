'use client';

import * as React from 'react';

import Textarea from 'react-textarea-autosize';

import { formatRelativeTime } from '~/core/community-calls/format';
import { formatChatMessageLinks } from '~/core/community-calls/format-chat-links';
import { ChatEntry } from '~/core/community-calls/use-persistent-chat';
import { useToast } from '~/core/hooks/use-toast';

import { Avatar } from '~/design-system/avatar';
import { Image } from '~/design-system/icons/image';

const GROUPING_WINDOW_MS = 60_000;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

type Props = {
  messages: ChatEntry[];
  send: (content: string, files?: File[]) => Promise<void>;
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
  const [attachedFile, setAttachedFile] = React.useState<File | null>(null);
  const [, setToast] = useToast();
  const listRef = React.useRef<HTMLUListElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setToast(<>Only image attachments are supported.</>);
    if (file.size > MAX_ATTACHMENT_BYTES) return setToast(<>Images must be 5MB or smaller.</>);
    setAttachedFile(file);
  };

  const onSend = async () => {
    const content = draft.trim();
    if ((!content && !attachedFile) || sending) return;
    setDraft('');
    const files = attachedFile ? [attachedFile] : undefined;
    setAttachedFile(null);
    setSending(true);
    try {
      await send(content, files);
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
        <div className="border-t border-grey-02 p-2">
          {attachedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-grey-02 px-2 py-1">
              <span className="min-w-0 flex-1 truncate text-footnote text-grey-04">{attachedFile.name}</span>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                aria-label="Remove attachment"
                className="shrink-0 text-footnote text-grey-04 hover:text-text"
              >
                Remove
              </button>
            </div>
          )}
          <form
            onSubmit={e => {
              e.preventDefault();
              onSend();
            }}
            className="flex items-end gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="hidden"
              aria-hidden
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach an image"
              className="flex shrink-0 items-center justify-center rounded-md border border-grey-02 p-2 text-grey-04 hover:text-text"
            >
              <Image />
            </button>
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
              disabled={sending || (!draft.trim() && !attachedFile)}
              className="shrink-0 rounded-md bg-ctaPrimary px-3 py-1.5 text-metadataMedium text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
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
        {entry.content && (
          <p className="text-metadata wrap-break-word whitespace-pre-wrap text-text">
            {formatChatMessageLinks(entry.content)}
          </p>
        )}
        {entry.attachedFiles?.map((file, i) => (
          <ChatAttachmentImage key={i} file={file} />
        ))}
      </div>
    </li>
  );
}

/** Ephemeral, in-session-only image attachment — never persisted, so this blob URL
 *  is the only place the bytes exist beyond LiveKit's data channel. */
function ChatAttachmentImage({ file }: { file: File }) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1.5 block">
      <img src={url} alt={file.name} className="max-h-48 max-w-full rounded-md border border-grey-02" />
    </a>
  );
}
