'use client';

import * as React from 'react';

import cx from 'classnames';

import type { EntityCache } from '~/core/chat/entity-cache';

import { Avatar } from '~/design-system/avatar';

import { ChatMarkdown } from '~/partials/chat/chat-markdown';

import { formatParticipantName } from './space-chat-data';
import type { SpaceChatMessage, SpaceChatParticipant } from './types';

const EMPTY_ENTITY_CACHE: EntityCache = new Map();

type Props = {
  spaceName: string;
  messages: SpaceChatMessage[];
  participantsById: Map<string, SpaceChatParticipant>;
  isLoading?: boolean;
  error?: Error | null;
};

export function SpaceChatMessageList({
  spaceName,
  messages,
  participantsById,
  isLoading = false,
  error = null,
}: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [spaceName, messages.length]);

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-metadata text-grey-04">
        Could not load chat. {error.message}
      </div>
    );
  }

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-metadata text-grey-04">
        Loading messages...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-metadata text-grey-04">
        No messages in {spaceName} yet.
      </div>
    );
  }

  let lastDate = '';

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-white py-3">
      {messages.map(message => {
        const author = participantsById.get(message.authorId) ?? message.author;
        const messageDate = formatDate(message.createdAt);
        const showDate = messageDate !== lastDate;
        lastDate = messageDate;

        return (
          <React.Fragment key={message.id}>
            {showDate ? <DateDivider label={messageDate} /> : null}
            <MessageRow message={message} author={author} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3 px-4">
      <div className="h-px flex-1 bg-divider" />
      <div className="text-footnoteMedium text-grey-04">{label}</div>
      <div className="h-px flex-1 bg-divider" />
    </div>
  );
}

function MessageRow({ message, author }: { message: SpaceChatMessage; author: SpaceChatParticipant | undefined }) {
  return (
    <article className="group relative flex gap-3 px-4 py-2 transition-colors hover:bg-bg">
      <div className="mt-0.5 size-9 shrink-0 overflow-hidden rounded-full">
        <Avatar avatarUrl={author?.avatarUrl} value={author?.address ?? message.authorId} size={36} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-metadataMedium text-text">{formatParticipantName(author)}</h2>
          {author?.role ? (
            <span
              className={cx(
                'rounded px-1 py-px text-footnoteMedium',
                author.role === 'editor' ? 'bg-ctaTertiary text-ctaHover' : 'bg-grey-01 text-grey-04'
              )}
            >
              {author.role}
            </span>
          ) : null}
          <time dateTime={message.createdAt} className="shrink-0 text-footnote text-grey-04">
            {formatTime(message.createdAt)}
          </time>
          {message.pending ? <span className="text-footnote text-grey-04">Sending...</span> : null}
        </div>
        {message.deletedAt ? (
          <div className="mt-1 text-chat text-grey-04 italic">Message deleted</div>
        ) : (
          <div className="prose-chat mt-1 text-chat text-text">
            <ChatMarkdown text={message.body} cache={EMPTY_ENTITY_CACHE} />
          </div>
        )}
        {!message.deletedAt && message.editedAt ? <div className="mt-1 text-footnote text-grey-04">Edited</div> : null}
        {message.reactions && message.reactions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.reactions.map(reaction => (
              <button
                key={reaction.emoji}
                type="button"
                className={cx(
                  'rounded-full border px-2 py-0.5 text-footnoteMedium transition-colors',
                  reaction.reacted
                    ? 'border-ctaPrimary bg-ctaTertiary text-ctaHover'
                    : 'border-grey-02 bg-white text-grey-04 hover:border-text hover:text-text'
                )}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="absolute top-2 right-3 hidden rounded border border-grey-02 bg-white shadow-button group-hover:flex">
        <button type="button" className="px-2 py-1 text-footnoteMedium text-grey-04 hover:text-text">
          Reply
        </button>
      </div>
    </article>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Today';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}
