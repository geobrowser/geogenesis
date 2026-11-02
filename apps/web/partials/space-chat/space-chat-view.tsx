'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import Textarea from 'react-textarea-autosize';

import {
  type DraftMention,
  bodyToDraft,
  draftToBody,
  mentionQueryAt,
  messageSegments,
} from '~/core/space-chat/mentions';

import { Avatar } from '~/design-system/avatar';

import type { ChatViewComposer, ChatViewMessage, ChatViewPerson, ChatViewReaction, ChatViewStatus } from './types';

export const SPACE_CHAT_VIEW_COPY = {
  empty: 'No messages yet.',
  loading: 'Loading messages…',
  failed: 'Could not load the chat.',
  retry: 'Try again',
  join: 'Join',
  joinRetry: 'Try again',
  /** The Explore join control's copy for a sent request. */
  membershipPending: 'Membership pending',
  loadOlder: 'Load earlier messages',
  loadingOlder: 'Loading…',
  deleted: 'Message deleted',
  edited: 'edited',
  sending: 'Sending…',
  send: 'Send',
  reply: 'Reply',
  react: 'React',
  edit: 'Edit',
  delete: 'Delete',
  save: 'Save',
  cancel: 'Cancel',
  confirmDelete: 'Delete this message?',
  newMessages: 'New messages',
  placeholder: 'Send a message…',
  replyingTo: (name: string) => `Replying to ${name}`,
  originalMessage: 'Original message',
  sendFailed: 'Could not send. Try again.',
  notSent: (text: string) => `Not sent: ${text}`,
  restore: 'Restore',
  editFailed: 'Could not save the edit. Try again.',
  deleteFailed: 'Could not delete. Try again.',
  reactFailed: 'Could not react. Try again.',
  unknownPerson: 'someone',
} as const;

/** The reactions offered; others already on a message show and toggle too. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'] as const;

const GROUPING_WINDOW_MS = 5 * 60_000;
const STICK_TO_BOTTOM_PX = 48;
const MENTION_RESULTS = 6;

type Props = {
  /** Oldest first. */
  messages: ChatViewMessage[];
  status: ChatViewStatus;
  onRetry?: () => void;
  /** Absent once the start of the room is loaded. */
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
  composer: ChatViewComposer;
  /** Dashless or dashed. */
  viewerId: string | null;
  onEdit?: (id: string, body: string) => Promise<void>;
  /** Offered on the viewer's own with `canDeleteOwn`, and on everyone's with `canDeleteAny`. */
  onDelete?: (id: string) => Promise<void>;
  canDeleteOwn?: boolean;
  canDeleteAny?: boolean;
  /** Reactions toggle when given; otherwise they only show. */
  onReact?: (id: string, value: string, added: boolean) => Promise<void>;
  /** Replies are offered when the composer posts and this is set. */
  canReply?: boolean;
  /** A mentioned person's name; `null` leaves the token's fallback. */
  mentionName?: (personId: string) => string | null;
  errorMessage?: (error: unknown, fallback: string) => string;
  /** The list's accessible name. */
  label: string;
  emptyLabel?: string;
  className?: string;
};

/**
 * A room's text chat: messages, then a composer. Knows nothing about where the messages come from.
 * Follows lobby chat's `RoomChat` and adds replies, reactions and mentions.
 */
export function SpaceChatView({
  messages,
  status,
  onRetry,
  onLoadOlder,
  loadingOlder = false,
  composer,
  viewerId,
  onEdit,
  onDelete,
  canDeleteOwn = true,
  canDeleteAny = false,
  onReact,
  canReply = false,
  mentionName = () => null,
  errorMessage = (_error, fallback) => fallback,
  label,
  emptyLabel = SPACE_CHAT_VIEW_COPY.empty,
  className,
}: Props) {
  const listRef = React.useRef<HTMLOListElement>(null);
  const atBottomRef = React.useRef(true);
  const heightRef = React.useRef(0);
  const [unseen, setUnseen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<ChatViewMessage | null>(null);
  const firstId = messages[0]?.id ?? null;
  const lastId = messages.at(-1)?.id ?? null;
  const lastIsOwn = viewerId !== null && messages.length > 0 && sameId(messages.at(-1)!.author.id, viewerId);
  const previousEnds = React.useRef<{ first: string | null; last: string | null }>({ first: null, last: null });
  const posting = composer.kind === 'post';

  React.useLayoutEffect(() => {
    const list = listRef.current;
    const previous = previousEnds.current;
    previousEnds.current = { first: firstId, last: lastId };
    if (!list || lastId === null) return;
    if (previous.last === lastId && previous.first !== firstId) {
      // An older page went in above: keep what the reader was looking at in place.
      list.scrollTop += list.scrollHeight - heightRef.current;
    } else if (previous.last !== lastId) {
      if (atBottomRef.current || lastIsOwn) {
        list.scrollTop = list.scrollHeight;
        setUnseen(false);
      } else {
        setUnseen(true);
      }
    }
    heightRef.current = list.scrollHeight;
  }, [firstId, lastId, lastIsOwn]);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    heightRef.current = list.scrollHeight;
    atBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_TO_BOTTOM_PX;
    if (atBottomRef.current) setUnseen(false);
  };

  const jumpToLatest = () => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    atBottomRef.current = true;
    setUnseen(false);
  };

  return (
    <div className={cx('relative flex min-h-0 flex-col', className)} data-testid="space-chat">
      {status === 'loading' && messages.length === 0 ? (
        <ChatNotice>{SPACE_CHAT_VIEW_COPY.loading}</ChatNotice>
      ) : status === 'error' && messages.length === 0 ? (
        <ChatNotice>
          {SPACE_CHAT_VIEW_COPY.failed}
          {onRetry ? (
            <button type="button" onClick={onRetry} className="ml-2 text-text underline">
              {SPACE_CHAT_VIEW_COPY.retry}
            </button>
          ) : null}
        </ChatNotice>
      ) : messages.length === 0 ? (
        <ChatNotice>{emptyLabel}</ChatNotice>
      ) : (
        <ol
          ref={listRef}
          onScroll={onScroll}
          aria-label={label}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
        >
          {onLoadOlder ? (
            <li className="flex justify-center py-1">
              <button
                type="button"
                onClick={onLoadOlder}
                disabled={loadingOlder}
                className="rounded px-2 py-0.5 text-footnoteMedium text-grey-04 hover:bg-grey-01 hover:text-text disabled:opacity-60"
              >
                {loadingOlder ? SPACE_CHAT_VIEW_COPY.loadingOlder : SPACE_CHAT_VIEW_COPY.loadOlder}
              </button>
            </li>
          ) : null}
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const grouped =
              previous !== undefined &&
              !previous.deleted &&
              !message.replyTo &&
              sameId(previous.author.id, message.author.id) &&
              Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUPING_WINDOW_MS;
            const own = viewerId !== null && sameId(message.author.id, viewerId);
            return (
              <ChatRow
                key={message.id}
                message={message}
                showHeader={!grouped}
                onEdit={own && onEdit ? onEdit : undefined}
                onDelete={onDelete && ((own && canDeleteOwn) || canDeleteAny) ? onDelete : undefined}
                onReact={onReact}
                onReply={posting && canReply ? () => setReplyTo(message) : undefined}
                mentionName={mentionName}
                mentionCandidates={composer.kind === 'post' ? composer.mentionCandidates : undefined}
                errorMessage={errorMessage}
              />
            );
          })}
        </ol>
      )}

      {unseen ? (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-text px-3 py-1 text-footnoteMedium text-white shadow-light"
        >
          {SPACE_CHAT_VIEW_COPY.newMessages}
        </button>
      ) : null}

      <ChatComposer
        composer={composer}
        errorMessage={errorMessage}
        replyTo={posting ? replyTo : null}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}

function ChatNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-24 flex-1 items-center justify-center px-4 text-center text-metadata text-grey-04">
      <p>{children}</p>
    </div>
  );
}

function MessageBody({ body, mentionName }: { body: string; mentionName: (personId: string) => string | null }) {
  return (
    <>
      {messageSegments(body).map((segment, index) =>
        segment.kind === 'text' ? (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ) : (
          <span key={index} className="rounded bg-grey-01 px-0.5 text-metadataMedium text-text">
            @{mentionName(segment.personId) ?? SPACE_CHAT_VIEW_COPY.unknownPerson}
          </span>
        )
      )}
    </>
  );
}

/** A reply's quote of the message it answers, as plain text. */
function quoteText(body: string, mentionName: (personId: string) => string | null) {
  return messageSegments(body)
    .map(segment =>
      segment.kind === 'text' ? segment.text : `@${mentionName(segment.personId) ?? SPACE_CHAT_VIEW_COPY.unknownPerson}`
    )
    .join('');
}

function ChatRow({
  message,
  showHeader,
  onEdit,
  onDelete,
  onReact,
  onReply,
  mentionName,
  mentionCandidates,
  errorMessage,
}: {
  message: ChatViewMessage;
  showHeader: boolean;
  onEdit?: (id: string, body: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onReact?: (id: string, value: string, added: boolean) => Promise<void>;
  onReply?: () => void;
  mentionName: (personId: string) => string | null;
  mentionCandidates?: ChatViewPerson[];
  errorMessage: (error: unknown, fallback: string) => string;
}) {
  const [mode, setMode] = React.useState<'read' | 'editing' | 'confirm_delete' | 'reacting'>('read');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const actionable = !message.deleted && !message.pending;
  const reactions = message.reactions ?? [];

  const save = async (body: string) => {
    if (!onEdit || busy) return;
    if (body === message.body) return setMode('read');
    setBusy(true);
    setError(null);
    try {
      await onEdit(message.id, body);
      setMode('read');
    } catch (cause) {
      setError(errorMessage(cause, SPACE_CHAT_VIEW_COPY.editFailed));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(message.id);
      setMode('read');
    } catch (cause) {
      setError(errorMessage(cause, SPACE_CHAT_VIEW_COPY.deleteFailed));
    } finally {
      setBusy(false);
    }
  };

  const react = async (value: string, added: boolean) => {
    if (!onReact) return;
    setMode('read');
    setError(null);
    try {
      await onReact(message.id, value, added);
    } catch (cause) {
      setError(errorMessage(cause, SPACE_CHAT_VIEW_COPY.reactFailed));
    }
  };

  return (
    <li
      className={cx('group relative flex gap-2 px-3', showHeader ? 'pt-2' : 'pt-0.5')}
      data-testid="space-chat-message"
    >
      <div className="w-7 shrink-0">
        {showHeader ? (
          <span className="block size-7 overflow-hidden rounded-full">
            <Avatar avatarUrl={message.author.avatarUrl} value={message.author.avatarSeed} size={28} />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        {message.replyTo ? <ReplyQuote replyTo={message.replyTo} mentionName={mentionName} /> : null}
        {showHeader ? (
          <div className="flex items-baseline gap-1.5">
            {message.author.profileLink ? (
              <Link
                href={message.author.profileLink}
                className="truncate text-metadataMedium text-text hover:underline"
              >
                {message.author.name}
              </Link>
            ) : (
              <span className="truncate text-metadataMedium text-text">{message.author.name}</span>
            )}
            <time dateTime={message.createdAt} className="shrink-0 text-footnote text-grey-04">
              {timeLabel(message.createdAt)}
            </time>
          </div>
        ) : null}
        {message.deleted ? (
          <p className="text-metadata text-grey-04 italic">{SPACE_CHAT_VIEW_COPY.deleted}</p>
        ) : mode === 'editing' ? (
          <EditForm
            body={message.body}
            busy={busy}
            mentionName={mentionName}
            mentionCandidates={mentionCandidates}
            onSave={body => void save(body)}
            onCancel={() => setMode('read')}
          />
        ) : (
          <p
            className={cx(
              'text-metadata wrap-break-word whitespace-pre-wrap text-text',
              message.pending && 'opacity-60'
            )}
          >
            <MessageBody body={message.body} mentionName={mentionName} />
            {message.editedAt ? (
              <span className="ml-1 text-footnote text-grey-04">({SPACE_CHAT_VIEW_COPY.edited})</span>
            ) : null}
          </p>
        )}
        {message.pending ? <p className="text-footnote text-grey-04">{SPACE_CHAT_VIEW_COPY.sending}</p> : null}
        {!message.deleted && reactions.length > 0 ? (
          <ReactionBar reactions={reactions} onToggle={onReact && actionable ? react : undefined} />
        ) : null}
        {mode === 'reacting' ? (
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={SPACE_CHAT_VIEW_COPY.react}>
            {QUICK_REACTIONS.map(value => {
              const reacted = reactions.some(reaction => reaction.value === value && reaction.reacted);
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={`React ${value}`}
                  aria-pressed={reacted}
                  onClick={() => void react(value, !reacted)}
                  className={cx(
                    'rounded-md border px-1.5 py-0.5 text-metadata',
                    reacted ? 'border-text bg-grey-01' : 'border-grey-02 hover:bg-grey-01'
                  )}
                >
                  {value}
                </button>
              );
            })}
            <SmallButton onClick={() => setMode('read')}>{SPACE_CHAT_VIEW_COPY.cancel}</SmallButton>
          </div>
        ) : null}
        {mode === 'confirm_delete' ? (
          <div className="mt-1 flex items-center gap-2" role="group" aria-label={SPACE_CHAT_VIEW_COPY.confirmDelete}>
            <span className="text-footnote text-grey-04">{SPACE_CHAT_VIEW_COPY.confirmDelete}</span>
            <SmallButton onClick={() => void remove()} disabled={busy} danger>
              {SPACE_CHAT_VIEW_COPY.delete}
            </SmallButton>
            <SmallButton onClick={() => setMode('read')}>{SPACE_CHAT_VIEW_COPY.cancel}</SmallButton>
          </div>
        ) : null}
        {error ? (
          <p className="text-footnote text-red-01" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {actionable && mode === 'read' && (onEdit || onDelete || onReact || onReply) ? (
        // Visible on hover and focus; always on a touch screen, which has no hover.
        <div className="absolute top-1 right-2 flex gap-1 rounded-md border border-grey-02 bg-white opacity-0 shadow-light group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:self-start [@media(hover:none)]:border-0 [@media(hover:none)]:opacity-100 [@media(hover:none)]:shadow-none">
          {onReact ? (
            <SmallButton onClick={() => setMode('reacting')} aria-label={`${SPACE_CHAT_VIEW_COPY.react} to message`}>
              {SPACE_CHAT_VIEW_COPY.react}
            </SmallButton>
          ) : null}
          {onReply ? (
            <SmallButton onClick={onReply} aria-label={`${SPACE_CHAT_VIEW_COPY.reply} to message`}>
              {SPACE_CHAT_VIEW_COPY.reply}
            </SmallButton>
          ) : null}
          {onEdit ? (
            <SmallButton
              onClick={() => {
                setError(null);
                setMode('editing');
              }}
              aria-label={`${SPACE_CHAT_VIEW_COPY.edit} message`}
            >
              {SPACE_CHAT_VIEW_COPY.edit}
            </SmallButton>
          ) : null}
          {onDelete ? (
            <SmallButton
              onClick={() => {
                setError(null);
                setMode('confirm_delete');
              }}
              aria-label={`${SPACE_CHAT_VIEW_COPY.delete} message`}
            >
              {SPACE_CHAT_VIEW_COPY.delete}
            </SmallButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ReplyQuote({
  replyTo,
  mentionName,
}: {
  replyTo: NonNullable<ChatViewMessage['replyTo']>;
  mentionName: (personId: string) => string | null;
}) {
  return (
    <p
      className="mb-0.5 truncate border-l-2 border-grey-02 pl-2 text-footnote text-grey-04"
      data-testid="space-chat-reply-quote"
    >
      {replyTo.found ? (
        <>
          <span className="text-footnoteMedium">{replyTo.authorName}</span>{' '}
          {replyTo.deleted ? SPACE_CHAT_VIEW_COPY.deleted : quoteText(replyTo.body, mentionName)}
        </>
      ) : (
        SPACE_CHAT_VIEW_COPY.originalMessage
      )}
    </p>
  );
}

function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: ChatViewReaction[];
  onToggle?: (value: string, added: boolean) => Promise<void>;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reactions.map(reaction => (
        <button
          key={reaction.value}
          type="button"
          disabled={!onToggle}
          aria-pressed={reaction.reacted}
          aria-label={`${reaction.value} ${reaction.count}`}
          onClick={() => void onToggle?.(reaction.value, !reaction.reacted)}
          className={cx(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-footnote disabled:cursor-default',
            reaction.reacted ? 'border-text bg-grey-01 text-text' : 'border-grey-02 text-grey-04',
            onToggle && 'hover:bg-grey-01'
          )}
        >
          <span>{reaction.value}</span>
          <span className="tabular-nums">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

function EditForm({
  body,
  busy,
  mentionName,
  mentionCandidates,
  onSave,
  onCancel,
}: {
  body: string;
  busy: boolean;
  mentionName: (personId: string) => string | null;
  mentionCandidates?: ChatViewPerson[];
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const initial = React.useMemo(() => bodyToDraft(body, mentionName), [body, mentionName]);
  const mention = useMentionDraft(initial.draft, initial.mentions, mentionCandidates);
  const save = () => {
    if (busy || mention.draft.trim() === '') return;
    onSave(draftToBody(mention.draft.trim(), mention.mentions));
  };
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        save();
      }}
      className="relative flex flex-col gap-1.5"
    >
      <MentionPicker mention={mention} />
      <Textarea
        ref={mention.inputRef}
        value={mention.draft}
        onChange={mention.onChange}
        onSelect={mention.onSelect}
        onKeyDown={event => {
          if (mention.onKeyDown(event)) return;
          if (event.key === 'Escape') onCancel();
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            save();
          }
        }}
        aria-label="Edit message"
        // Text typed while the save is in flight would close with the form.
        readOnly={busy}
        autoFocus
        minRows={1}
        maxRows={5}
        className="w-full resize-none rounded-md border border-grey-02 bg-white px-2 py-1 text-metadata text-text focus:outline-hidden"
      />
      <div className="flex gap-2">
        <SmallButton type="submit" disabled={busy || mention.draft.trim() === ''}>
          {SPACE_CHAT_VIEW_COPY.save}
        </SmallButton>
        <SmallButton onClick={onCancel}>{SPACE_CHAT_VIEW_COPY.cancel}</SmallButton>
      </div>
    </form>
  );
}

function SmallButton({
  danger = false,
  type = 'button',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        'rounded px-1.5 py-0.5 text-footnoteMedium disabled:opacity-40',
        danger ? 'text-red-01 hover:bg-red-02' : 'text-grey-04 hover:bg-grey-01 hover:text-text',
        className
      )}
    />
  );
}

type MentionDraft = ReturnType<typeof useMentionDraft>;

type UnsentDraft = { draft: string; mentions: DraftMention[]; replyToId: string | null };

/** A draft with `@` mentions: the text, the people picked, and the open picker's state. */
function useMentionDraft(initialDraft: string, initialMentions: DraftMention[], candidates?: ChatViewPerson[]) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = React.useState(initialDraft);
  const [mentions, setMentions] = React.useState<DraftMention[]>(initialMentions);
  const [query, setQuery] = React.useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = React.useState(0);

  const results = React.useMemo(() => {
    if (!query || !candidates) return [];
    const needle = query.query.toLowerCase();
    return candidates.filter(person => person.name.toLowerCase().includes(needle)).slice(0, MENTION_RESULTS);
  }, [candidates, query]);

  const track = (value: string, caret: number | null) => {
    const next = candidates && caret !== null ? mentionQueryAt(value, caret) : null;
    setQuery(next);
    setHighlight(0);
  };

  const pick = (person: ChatViewPerson) => {
    if (!query) return;
    const input = inputRef.current;
    const caret = input?.selectionStart ?? draft.length;
    const inserted = `@${person.name} `;
    const next = draft.slice(0, query.start) + inserted + draft.slice(caret);
    setDraft(next);
    setMentions(current =>
      current.some(mention => mention.personId === person.id)
        ? current
        : [...current, { personId: person.id, name: person.name }]
    );
    setQuery(null);
    const at = query.start + inserted.length;
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(at, at);
    });
  };

  return {
    inputRef,
    draft,
    mentions,
    results,
    highlight,
    pick,
    reset: () => {
      setDraft('');
      setMentions([]);
      setQuery(null);
    },
    restore: (nextDraft: string, nextMentions: DraftMention[]) => {
      setDraft(nextDraft);
      setMentions(nextMentions);
      setQuery(null);
    },
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      track(event.target.value, event.target.selectionStart);
    },
    onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      track(target.value, target.selectionStart);
    },
    /** `true` when the picker took the key. */
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (results.length === 0) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlight(current => (current + step + results.length) % results.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(results[highlight] ?? results[0]!);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setQuery(null);
        return true;
      }
      return false;
    },
  };
}

function MentionPicker({ mention }: { mention: MentionDraft }) {
  if (mention.results.length === 0) return null;
  return (
    <ul
      role="listbox"
      aria-label="Mention someone"
      className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-md border border-grey-02 bg-white py-1 shadow-light"
    >
      {mention.results.map((person, index) => (
        <li key={person.id} role="option" aria-selected={index === mention.highlight}>
          <button
            type="button"
            // Keeps focus in the textarea, so its caret is still there to insert at.
            onMouseDown={event => event.preventDefault()}
            onClick={() => mention.pick(person)}
            className={cx(
              'flex w-full items-center gap-2 px-2 py-1 text-left text-metadata text-text',
              index === mention.highlight ? 'bg-grey-01' : 'hover:bg-grey-01'
            )}
          >
            <span className="block size-5 shrink-0 overflow-hidden rounded-full">
              <Avatar avatarUrl={person.avatarUrl} value={person.avatarSeed} size={20} />
            </span>
            <span className="truncate">{person.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChatComposer({
  composer,
  errorMessage,
  replyTo,
  onCancelReply,
}: {
  composer: ChatViewComposer;
  errorMessage: (error: unknown, fallback: string) => string;
  replyTo: ChatViewMessage | null;
  onCancelReply: () => void;
}) {
  const mention = useMentionDraft('', [], composer.kind === 'post' ? composer.mentionCandidates : undefined);
  const [error, setError] = React.useState<string | null>(null);
  // Sends that failed while the box held newer text, oldest first, until restored.
  const [unsent, setUnsent] = React.useState<UnsentDraft[]>([]);
  // Sends go one after another, so they post in the order typed.
  const queue = React.useRef<Promise<void>>(Promise.resolve());
  const draftRef = React.useRef(mention.draft);
  draftRef.current = mention.draft;
  const inputRef = mention.inputRef;

  React.useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [inputRef, replyTo]);

  if (composer.kind === 'none') return null;
  if (composer.kind === 'closed') {
    return <p className="border-t border-grey-02 px-3 py-2.5 text-footnote text-grey-04">{composer.reason}</p>;
  }
  if (composer.kind === 'join') {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-grey-02 px-3 py-2">
        <p className="min-w-0 text-metadata text-grey-04">{composer.label}</p>
        {composer.state === 'requested' ? (
          <span className="shrink-0 text-metadata text-grey-04">{SPACE_CHAT_VIEW_COPY.membershipPending}</span>
        ) : (
          <button
            type="button"
            onClick={composer.onJoin}
            disabled={composer.state === 'sending'}
            className="flex h-6 shrink-0 items-center rounded border border-grey-02 px-2 text-metadata text-text shadow-button transition-colors duration-150 hover:border-text disabled:opacity-60"
          >
            {composer.state === 'error' ? SPACE_CHAT_VIEW_COPY.joinRetry : SPACE_CHAT_VIEW_COPY.join}
          </button>
        )}
      </div>
    );
  }

  const onSend = composer.onSend;
  // The box clears at once so the next message can be typed; a failed one comes back into an
  // empty box, or waits under the error until restored.
  const send = () => {
    const draft = mention.draft.trim();
    if (draft === '') return;
    const sent: UnsentDraft = { draft, mentions: mention.mentions, replyToId: replyTo?.id ?? null };
    mention.reset();
    onCancelReply();
    setError(null);
    queue.current = queue.current.then(async () => {
      try {
        await onSend(draftToBody(sent.draft, sent.mentions), sent.replyToId);
      } catch (cause) {
        setError(errorMessage(cause, SPACE_CHAT_VIEW_COPY.sendFailed));
        if (draftRef.current.trim() === '') {
          draftRef.current = sent.draft;
          mention.restore(sent.draft, sent.mentions);
        } else {
          setUnsent(current => [...current, sent]);
        }
      }
    });
  };

  const restoreUnsent = () => {
    const current = mention.draft.trim();
    const drafts = [...unsent.map(entry => entry.draft), ...(current ? [current] : [])];
    mention.restore(drafts.join('\n'), [...unsent.flatMap(entry => entry.mentions), ...mention.mentions]);
    setUnsent([]);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="border-t border-grey-02 p-2">
      {error ? (
        <p className="px-1 pb-1 text-footnote text-red-01" role="alert">
          {error}
        </p>
      ) : null}
      {unsent.length > 0 ? (
        <div className="flex items-center gap-2 px-1 pb-1 text-footnote text-grey-04">
          <span className="min-w-0 flex-1 truncate">
            {SPACE_CHAT_VIEW_COPY.notSent(unsent.map(entry => entry.draft).join(' · '))}
          </span>
          <SmallButton onClick={restoreUnsent}>{SPACE_CHAT_VIEW_COPY.restore}</SmallButton>
        </div>
      ) : null}
      {replyTo ? (
        <div className="flex items-center gap-2 px-1 pb-1 text-footnote text-grey-04">
          <span className="min-w-0 flex-1 truncate">{SPACE_CHAT_VIEW_COPY.replyingTo(replyTo.author.name)}</span>
          <SmallButton onClick={onCancelReply} aria-label="Cancel reply">
            {SPACE_CHAT_VIEW_COPY.cancel}
          </SmallButton>
        </div>
      ) : null}
      <form
        onSubmit={event => {
          event.preventDefault();
          send();
        }}
        className="relative flex items-end gap-2"
      >
        <MentionPicker mention={mention} />
        <Textarea
          ref={inputRef}
          value={mention.draft}
          onChange={mention.onChange}
          onSelect={mention.onSelect}
          onKeyDown={event => {
            if (mention.onKeyDown(event)) return;
            if (event.key === 'Escape' && replyTo) onCancelReply();
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          aria-label="Message"
          placeholder={composer.placeholder ?? SPACE_CHAT_VIEW_COPY.placeholder}
          minRows={1}
          maxRows={5}
          maxLength={composer.maxLength}
          className="max-h-28 flex-1 resize-none rounded-md border border-grey-02 bg-white px-2 py-1.5 text-metadata text-text placeholder:text-grey-03 focus:outline-hidden"
        />
        <button
          type="submit"
          disabled={mention.draft.trim() === ''}
          className="shrink-0 rounded-md bg-text px-3 py-1.5 text-metadataMedium text-white disabled:opacity-40"
        >
          {SPACE_CHAT_VIEW_COPY.send}
        </button>
      </form>
    </div>
  );
}

/** geo-chat spells ids dashed in some fields and dashless in others. */
function sameId(a: string, b: string) {
  return a.replaceAll('-', '').toLowerCase() === b.replaceAll('-', '').toLowerCase();
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}
