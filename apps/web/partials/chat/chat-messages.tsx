'use client';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { isTextUIPart, isToolUIPart } from 'ai';

import { buildEntityCacheFromMessages } from '~/core/chat/entity-cache';
import type { EntityCache } from '~/core/chat/entity-cache';

import { Dots } from '~/design-system/dots';
import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

import { ChatMarkdown } from './chat-markdown';
import { useSmoothStream } from './use-smooth-stream';

function messageText(message: UIMessage): string {
  // Text parts in a UIMessage are split by tool calls — everything the
  // assistant said before a tool call lands in one part, everything after in
  // the next. Joining with '' glues the two utterances into one word; a
  // paragraph break renders them as separate paragraphs in the panel.
  return message.parts
    .filter(isTextUIPart)
    .map(part => part.text)
    .filter(text => text.length > 0)
    .join('\n\n');
}

function messageFollowUps(message: UIMessage): string[] {
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.type !== 'tool-suggestFollowUps') continue;
    if (part.state !== 'input-available' && part.state !== 'output-available') continue;
    const input = part.input as { suggestions?: unknown } | undefined;
    const suggestions = input?.suggestions;
    if (Array.isArray(suggestions)) {
      return suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    }
  }
  return [];
}

type Props = {
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error?: Error;
  onRetry: () => void;
  onSuggestion: (text: string) => void;
  disabled?: boolean;
};

export function ChatMessages({ messages, status, error, onRetry, onSuggestion, disabled }: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const lastAssistantId = lastAssistant?.id;
  const followUps = lastAssistant ? messageFollowUps(lastAssistant) : [];
  const showFollowUps = status === 'ready' && !error && followUps.length > 0;

  const entityCache = React.useMemo(() => buildEntityCacheFromMessages(messages), [messages]);

  // Track whether the user has scrolled away from the bottom so streaming
  // tokens don't fight them. A ref flag suppresses scrolled-away detection
  // for scroll events we trigger ourselves — otherwise clamping to keep the
  // assistant icon visible would look like a user scroll-up and freeze
  // auto-scroll for the rest of the turn.
  const stuckToBottomRef = React.useRef(true);
  const isAutoScrollingRef = React.useRef(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const NEAR_BOTTOM = 48;
    const onScroll = () => {
      if (isAutoScrollingRef.current) return;
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
      stuckToBottomRef.current = distance <= NEAR_BOTTOM;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // useLayoutEffect so we commit the new scroll position before the browser
  // paints the new content — prevents a one-frame flash of unscrolled text.
  const runAutoScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (!last) return;

    // Clear the auto-scroll flag once the scroll event we just caused has
    // fired, so a user-initiated scroll that arrives a frame later isn't
    // misread as our own programmatic one. Fallback rAFs handle the case
    // where no scroll event fires (setting scrollTop to the current value).
    const clearAutoScroll = () => {
      if (!isAutoScrollingRef.current) return;
      isAutoScrollingRef.current = false;
      el.removeEventListener('scroll', clearAutoScroll);
    };
    const armClear = () => {
      el.addEventListener('scroll', clearAutoScroll, { once: true, passive: true });
      requestAnimationFrame(() => requestAnimationFrame(clearAutoScroll));
    };

    // Auto-scroll only moves forward. If the user scrolls past our clamp to
    // follow streaming tokens themselves, we must not yank them back up.
    const scrollForwardTo = (top: number) => {
      if (top <= el.scrollTop) return;
      isAutoScrollingRef.current = true;
      el.scrollTop = top;
      armClear();
    };

    // Sending a new user turn always re-anchors to the bottom — even if the
    // user had scrolled up earlier, the new turn should pull them back down.
    if (last.role === 'user') {
      stuckToBottomRef.current = true;
      isAutoScrollingRef.current = true;
      el.scrollTop = el.scrollHeight;
      armClear();
      return;
    }

    if (!stuckToBottomRef.current) return;

    const bottom = Math.max(0, el.scrollHeight - el.clientHeight);
    const node = el.querySelector<HTMLElement>(`[data-message-id="${last.id}"]`);
    if (!node) {
      scrollForwardTo(bottom);
      return;
    }

    // Position of the assistant message's top edge inside the scroll container.
    // Using rects keeps this robust across offsetParent boundaries.
    const elRect = el.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const nodeTop = nodeRect.top - elRect.top + el.scrollTop;

    // Scroll to bottom; if that would push the icon above the top edge, clamp
    // so the icon peeks in with a small breathing-room offset.
    const ICON_PEEK = 8;
    const iconLimit = Math.max(0, nodeTop - ICON_PEEK);
    scrollForwardTo(Math.min(bottom, iconLimit));
  }, [messages]);

  React.useLayoutEffect(() => {
    runAutoScroll();
  }, [runAutoScroll, status]);

  // Catches height growth between message updates (e.g. the smooth-reveal
  // hook drip-feeding characters) that doesn't re-run the effect above.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => runAutoScroll());
    observer.observe(el);
    for (const child of Array.from(el.children)) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, [runAutoScroll]);

  return (
    <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-x-clip overflow-y-auto px-3 py-3">
      {messages.map(message => {
        const text = messageText(message);
        if (!text) return null;

        if (message.role === 'user') {
          return (
            <div key={message.id} data-message-id={message.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-md bg-grey-01 px-2 py-1.5 text-chat text-text">{text}</div>
            </div>
          );
        }

        const isStreamingThis = message.id === lastAssistantId && status === 'streaming';
        return (
          <AssistantMessage
            key={message.id}
            messageId={message.id}
            text={text}
            isStreaming={isStreamingThis}
            entityCache={entityCache}
          />
        );
      })}

      {status === 'submitted' && (
        <div className="flex justify-start px-2 py-1.5">
          <Dots />
        </div>
      )}

      {showFollowUps && (
        <div className="flex flex-col items-start gap-1 pt-1">
          {followUps.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(suggestion)}
              className="flex items-center justify-center rounded-full border border-grey-02 px-2 pt-2 pb-2.5 text-left text-[16px] leading-4 tracking-[-0.35px] text-text transition-colors hover:border-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex justify-start">
          <div className="max-w-[90%] rounded-md border border-red-01 px-2 py-1.5 text-chat text-red-01">
            Something went wrong.{' '}
            <button type="button" onClick={onRetry} className="underline">
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type AssistantMessageProps = {
  messageId: string;
  text: string;
  isStreaming: boolean;
  entityCache: EntityCache;
};

function AssistantMessage({ messageId, text, isStreaming, entityCache }: AssistantMessageProps) {
  const displayed = useSmoothStream(text, isStreaming);

  return (
    <div data-message-id={messageId} className="flex flex-col items-start gap-2">
      <AssistantSparkle />
      <div
        className="prose-chat max-w-[90%] text-chat text-text"
        style={
          isStreaming
            ? {
                WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 1.25em), rgba(0,0,0,0.4) 100%)',
                maskImage: 'linear-gradient(to bottom, black calc(100% - 1.25em), rgba(0,0,0,0.4) 100%)',
              }
            : undefined
        }
      >
        <ChatMarkdown text={displayed} cache={entityCache} />
      </div>
    </div>
  );
}
