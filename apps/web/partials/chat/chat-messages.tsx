'use client';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { isTextUIPart, isToolUIPart } from 'ai';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

import type { EditToolFailure } from '~/core/chat/edit-types';
import { isEditToolPartType } from '~/core/chat/edit-types';
import { buildEntityCacheFromMessages } from '~/core/chat/entity-cache';
import type { EntityCache } from '~/core/chat/entity-cache';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

import { ChatMarkdown } from './chat-markdown';
import { useSmoothStream } from './use-smooth-stream';

function userText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map(p => p.text)
    .join('');
}

// Only text after the last main tool call — drops any preamble the model
// emits before/between tools.
function visibleAssistantText(message: UIMessage): string {
  let lastMainToolIndex = -1;
  message.parts.forEach((part, i) => {
    if (!isToolUIPart(part)) return;
    if (part.type === 'tool-suggestFollowUps') return;
    lastMainToolIndex = i;
  });

  const texts: string[] = [];
  for (let i = lastMainToolIndex + 1; i < message.parts.length; i++) {
    const part = message.parts[i];
    if (!isTextUIPart(part)) continue;
    if (part.text.length === 0) continue;
    const trimmed = part.text.trim();
    const prior = (texts[texts.length - 1] ?? '').trim();
    // Equality-on-trimmed dedup. An endsWith heuristic would swallow
    // legitimate short trailing parts like "." that follow a longer text.
    if (prior === trimmed) continue;
    texts.push(part.text);
  }
  return texts.join('\n\n');
}

function hasPendingMainTools(message: UIMessage): boolean {
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.type === 'tool-suggestFollowUps') continue;
    if (part.state !== 'output-available' && part.state !== 'output-error') return true;
  }
  return false;
}

// Silent edit failures: surface inline since the model may not narrate them.
type EditFailureNote = { toolName: string; failure: EditToolFailure };

function messageEditFailures(message: UIMessage): EditFailureNote[] {
  const failures: EditFailureNote[] = [];
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (!isEditToolPartType(part.type)) continue;
    if (part.state !== 'output-available') continue;
    const output = part.output as { ok?: boolean } | undefined;
    if (!output || output.ok !== false) continue;
    failures.push({ toolName: part.type.replace(/^tool-/, ''), failure: output as EditToolFailure });
  }
  return failures;
}

function describeEditFailure(note: EditFailureNote): string {
  const { toolName, failure } = note;
  switch (failure.error) {
    case 'not_signed_in':
      return `${toolName}: sign in to make this change.`;
    case 'not_authorized':
      return `${toolName}: you're not a member of that space.`;
    case 'invalid_input':
      return `${toolName}: invalid input.${failure.message ? ` ${failure.message}` : ''}`;
    case 'not_found':
      return `${toolName}: ${failure.message ?? "couldn't find that."}`;
    case 'wrong_type':
      return `${toolName}: ${failure.message ?? 'wrong property type.'}`;
    case 'rate_limited':
      return `${toolName}: too many edits — try again in ${failure.retryAfter ?? '...'}s.`;
    case 'lookup_failed':
      return `${toolName}: lookup failed. Retry in a moment.`;
    case 'already_exists':
      return `${toolName}: ${failure.message ?? 'already set.'}`;
    default:
      return `${toolName}: failed.`;
  }
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
  isFull?: boolean;
  onRetry: () => void;
  onSuggestion: (text: string) => void;
  disabled?: boolean;
};

export function ChatMessages({ messages, status, error, isFull, onRetry, onSuggestion, disabled }: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const lastAssistantId = lastAssistant?.id;
  const followUps = lastAssistant ? messageFollowUps(lastAssistant) : [];

  const inFlightAssistant = status === 'streaming' || status === 'submitted' ? lastAssistant : null;
  const isThinking =
    status === 'submitted' ||
    (status === 'streaming' &&
      (inFlightAssistant === null ||
        inFlightAssistant === undefined ||
        hasPendingMainTools(inFlightAssistant) ||
        visibleAssistantText(inFlightAssistant).length === 0));

  const hiddenAssistantId = isThinking ? lastAssistantId : null;

  // Gate on `ready` so a previous turn's pills aren't keyboard-reachable
  // while the next turn is in flight (Tab+Enter would still fire onSuggestion).
  const showFollowUps = status === 'ready' && !error && followUps.length > 0;
  // Skeleton pills bridge the gap between main reply finish and the
  // sequential follow-up stream landing.
  const hasVisibleAssistantText = lastAssistant !== undefined && visibleAssistantText(lastAssistant).length > 0;
  const showSkeletonFollowUps =
    !error && !showFollowUps && status === 'streaming' && !isThinking && hasVisibleAssistantText;

  const entityCache = React.useMemo(() => buildEntityCacheFromMessages(messages), [messages]);

  // Ref flag distinguishes our own programmatic scrolls from user-initiated
  // ones — otherwise clamping looks like a scroll-up and freezes auto-scroll.
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

  // ResizeObserver catches height growth (e.g. smooth-stream drip-feeding
  // chars) that doesn't trigger the layout effect. Re-runs on messages.length
  // change so new children get observed.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => runAutoScroll());
    observer.observe(el);
    for (const child of Array.from(el.children)) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, [runAutoScroll, messages.length]);

  return (
    <LayoutGroup>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-x-clip overflow-y-auto px-3 py-3">
          {messages.map(message => {
            if (message.id === hiddenAssistantId) return null;

            if (message.role === 'user') {
              const text = userText(message);
              if (!text) return null;
              return (
                <div key={message.id} data-message-id={message.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-md bg-grey-01 px-2 py-1.5 text-chat text-text">{text}</div>
                </div>
              );
            }

            const text = visibleAssistantText(message);
            const editFailures = messageEditFailures(message);
            if (!text && editFailures.length === 0) return null;
            const isStreamingThis = message.id === lastAssistantId && status === 'streaming';
            return (
              <AssistantMessage
                key={message.id}
                messageId={message.id}
                text={text}
                isStreaming={isStreamingThis}
                isLandingFromThinking={isStreamingThis}
                entityCache={entityCache}
                editFailures={editFailures}
              />
            );
          })}

          {showFollowUps ? (
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
          ) : showSkeletonFollowUps ? (
            <div className="invisible flex flex-col items-start gap-1 pt-1" aria-hidden="true">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="flex items-center justify-center rounded-full border border-grey-02 px-2 pt-2 pb-2.5 text-[16px] leading-4 tracking-[-0.35px] text-text"
                >
                  Loading…
                </div>
              ))}
            </div>
          ) : null}

          {error && !isFull && (
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
        <AnimatePresence>{isThinking && <ThinkingOverlay key="thinking" />}</AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

const SPARKLE_LAYOUT_ID = 'thinking-sparkle';

function ThinkingOverlay() {
  return (
    // Opaque cover hides layout reflow during tool execution;
    // pointer-events-auto blocks scroll through the overlay.
    <motion.div
      className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      aria-live="polite"
      aria-label="Assistant thinking"
    >
      {/* Inner div carries the pulsing keyframe so the layoutId child can
          handle pure position/size interpolation without fighting it. */}
      <motion.div
        animate={{
          opacity: [0.65, 1, 0.65],
          scale: [1, 1.12, 1],
          rotate: [0, 10, 0],
        }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="text-text"
      >
        <motion.div layoutId={SPARKLE_LAYOUT_ID} className="flex items-center justify-center">
          <AssistantSparkle size={26} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

type AssistantMessageProps = {
  messageId: string;
  text: string;
  isStreaming: boolean;
  // Only for the message just emerging from the overlay — sparkle uses
  // layoutId to animate from the thinking indicator.
  isLandingFromThinking: boolean;
  entityCache: EntityCache;
  editFailures: EditFailureNote[];
};

function AssistantMessage({
  messageId,
  text,
  isStreaming,
  isLandingFromThinking,
  entityCache,
  editFailures,
}: AssistantMessageProps) {
  const displayed = useSmoothStream(text, isStreaming);

  return (
    <div data-message-id={messageId} className="flex flex-col items-start gap-2">
      {isLandingFromThinking ? (
        <motion.div layoutId={SPARKLE_LAYOUT_ID} className="flex items-center justify-center">
          <AssistantSparkle />
        </motion.div>
      ) : (
        <AssistantSparkle />
      )}
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
      {editFailures.length > 0 ? (
        <div className="flex max-w-[90%] flex-col gap-1" role="status" aria-label="Edit failures">
          {editFailures.map((note, i) => (
            <div
              key={`${note.toolName}-${i}`}
              className="rounded-md border border-red-01 bg-red-03/40 px-2 py-1 text-chat text-red-01"
            >
              {describeEditFailure(note)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
