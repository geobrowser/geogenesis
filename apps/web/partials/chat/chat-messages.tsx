'use client';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { isTextUIPart, isToolUIPart } from 'ai';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

import { shouldResubmitAfterClientExecution } from '~/core/chat/client-tools';
import type { EditToolFailure } from '~/core/chat/edit-types';
import { isEditToolPartType } from '~/core/chat/edit-types';
import { buildEntityCacheFromMessages } from '~/core/chat/entity-cache';
import type { EntityCache } from '~/core/chat/entity-cache';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

import { ChatMarkdown } from './chat-markdown';
import { useSmoothStream } from './use-smooth-stream';

const DEBUG = process.env.NODE_ENV !== 'production';

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

// True iff a non-followup tool already resolved in this turn. Used to skip
// the leading-text grace period — once we're past the tools, the model
// can't emit a preamble that retroactively forces the cover back up.
function hasResolvedMainToolInTurn(messages: UIMessage[], lastUserIdx: number): boolean {
  for (let i = lastUserIdx + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    for (const p of m.parts) {
      if (!isToolUIPart(p)) continue;
      if (p.type === 'tool-suggestFollowUps') continue;
      if (p.state === 'output-available' || p.state === 'output-error') return true;
    }
  }
  return false;
}

// Last 'user' message index in O(messages.length); shared by the grace hook
// and the main render so we don't scan twice.
function findLastUserIndex(messages: UIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
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
    case 'apply_failed':
      return `${toolName}: ${failure.message ?? "couldn't apply that change."}`;
    default:
      return `${toolName}: failed.`;
  }
}

// Cover stays on while we're truly thinking: a tool is mid-flight, the SDK
// is about to resubmit a tool result, or no text has streamed yet. Once the
// closing-summary text starts streaming and no main tool is pending, the
// cover lifts and the user sees the answer live — same UX whether the turn
// chained through tools first or was pure-text from the start.
function computeIsThinking({
  messages,
  status,
  willResubmit,
  lastUserIdx,
}: {
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  willResubmit: boolean;
  lastUserIdx: number;
}): boolean {
  if (status === 'error') return false;
  if (lastUserIdx === -1) return false;

  if (status === 'submitted') return true;

  let lastAssistant: UIMessage | null = null;
  for (let i = messages.length - 1; i > lastUserIdx; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistant = messages[i];
      break;
    }
  }
  if (!lastAssistant) return true;

  // A pending main tool or queued resubmit means more model work is coming;
  // keep the cover up.
  if (hasPendingMainTools(lastAssistant)) return true;
  if (willResubmit) return true;

  // No tools pending. Lift as soon as visible text starts streaming;
  // otherwise wait for the first token (so we don't show an empty panel
  // mid-stream before the model commits to text vs. another tool call).
  const finalText = visibleAssistantText(lastAssistant);
  if (finalText.length > 0) return false;
  return status === 'streaming';
}

// Brief grace period after the cover would lift due to leading text — gives
// the model a moment to commit to a tool call instead. If a tool appears
// inside the window, `hasPendingMainTools` flips the raw value back to true
// and the timer is cleared, so the leading text never flashes. Post-tool
// text skips the grace entirely (we're already past the flash window).
const LEADING_TEXT_GRACE_MS = 350;

function useGracedIsThinking({
  rawIsThinking,
  hasResolvedTool,
}: {
  rawIsThinking: boolean;
  hasResolvedTool: boolean;
}): boolean {
  const [debounced, setDebounced] = React.useState(rawIsThinking);

  React.useEffect(() => {
    if (rawIsThinking) {
      setDebounced(true);
      return;
    }
    if (hasResolvedTool) {
      setDebounced(false);
      return;
    }
    const handle = setTimeout(() => setDebounced(false), LEADING_TEXT_GRACE_MS);
    return () => clearTimeout(handle);
  }, [rawIsThinking, hasResolvedTool]);

  return debounced;
}

// One-line digest of an assistant message's parts for the debug logger.
// Format: "step|tool:setEntityValue=output-available|text(42)|tool:searchGraph=input-streaming"
// Dev-only: gated through the DEBUG constant so prod bundles tree-shake it.
function digestParts(message: UIMessage | undefined): string {
  if (!message) return '<no-assistant>';
  return message.parts
    .map(p => {
      if (p.type === 'step-start') return 'step';
      if (isTextUIPart(p)) return `text(${p.text.length})`;
      if (isToolUIPart(p)) {
        const name = p.type.replace(/^tool-/, '');
        return `tool:${name}=${p.state}`;
      }
      return p.type;
    })
    .join('|');
}

function useChatDebugLogger({
  messages,
  status,
  willResubmit,
  isThinking,
  lastAssistant,
}: {
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  willResubmit: boolean;
  isThinking: boolean;
  lastAssistant: UIMessage | undefined;
}) {
  const prevRef = React.useRef<{ status: string; willResubmit: boolean; isThinking: boolean; digest: string } | null>(
    null
  );
  const t0Ref = React.useRef<number | null>(null);
  if (!DEBUG) return;
  if (t0Ref.current == null) t0Ref.current = performance.now();

  const digest = digestParts(lastAssistant);
  const prev = prevRef.current;
  const changed =
    !prev ||
    prev.status !== status ||
    prev.willResubmit !== willResubmit ||
    prev.isThinking !== isThinking ||
    prev.digest !== digest;

  if (changed) {
    const t = Math.round(performance.now() - (t0Ref.current ?? 0));
    const flips: string[] = [];
    if (prev) {
      if (prev.status !== status) flips.push(`status ${prev.status}→${status}`);
      if (prev.willResubmit !== willResubmit) flips.push(`willResubmit ${prev.willResubmit}→${willResubmit}`);
      if (prev.isThinking !== isThinking) flips.push(`isThinking ${prev.isThinking}→${isThinking}`);
    }
    console.log(
      `[chat ${t}ms]`,
      flips.length ? flips.join(', ') : 'init',
      `| msgs=${messages.length} status=${status} willResubmit=${willResubmit} isThinking=${isThinking}`,
      `| parts: ${digest}`
    );
    prevRef.current = { status, willResubmit, isThinking, digest };
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

  // Cover lifts as soon as visible closing-summary text starts streaming. A
  // small grace period (useGracedIsThinking) hides any leading preamble that
  // the model might emit before its first tool call — if a tool lands inside
  // the window, the cover never lifted in the first place.
  const willResubmit = shouldResubmitAfterClientExecution({ messages });
  const lastUserIdx = findLastUserIndex(messages);
  const rawIsThinking = computeIsThinking({ messages, status, willResubmit, lastUserIdx });
  const hasResolvedTool = hasResolvedMainToolInTurn(messages, lastUserIdx);
  const isThinking = useGracedIsThinking({ rawIsThinking, hasResolvedTool });

  useChatDebugLogger({ messages, status, willResubmit, isThinking, lastAssistant });

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

  // stuck-state is driven by scrollTop direction, not distance-from-bottom.
  // Programmatic scrolls only ever move forward (`scrollForwardTo` enforces
  // this), so a scrollTop *decrease* in onScroll is unambiguously a user
  // gesture (wheel up, scrollbar drag up, keyboard PageUp, etc.). The old
  // distance-based check was unreliable: with the iconLimit clamp leaving
  // distance > NEAR_BOTTOM, any stray scroll event flipped stuck off and
  // froze auto-follow mid-stream.
  const stuckToBottomRef = React.useRef(true);
  const lastScrollTopRef = React.useRef(0);
  const NEAR_BOTTOM = 48;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const newTop = el.scrollTop;
      const oldTop = lastScrollTopRef.current;
      lastScrollTopRef.current = newTop;
      if (newTop < oldTop) {
        // User pulled up. Stop auto-follow so we don't yank them back down.
        stuckToBottomRef.current = false;
        return;
      }
      // Scrolled (or back-scrolled) to near-bottom — resume auto-follow.
      const distance = el.scrollHeight - (newTop + el.clientHeight);
      if (distance <= NEAR_BOTTOM) stuckToBottomRef.current = true;
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

    // Auto-scroll only moves forward. If the user scrolls past our clamp to
    // follow streaming tokens themselves, we must not yank them back up.
    const scrollForwardTo = (top: number) => {
      const before = el.scrollTop;
      if (top <= before) {
        if (DEBUG) {
          console.log(
            `[scroll] noop target=${Math.round(top)} <= scrollTop=${Math.round(before)} (sH=${el.scrollHeight} cH=${el.clientHeight})`
          );
        }
        return;
      }
      el.scrollTop = top;
      lastScrollTopRef.current = el.scrollTop;
      if (DEBUG) {
        console.log(
          `[scroll] move ${Math.round(before)}→${Math.round(top)} (sH=${el.scrollHeight} cH=${el.clientHeight})`
        );
      }
    };

    if (last.role === 'user') {
      stuckToBottomRef.current = true;
      const before = el.scrollTop;
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
      if (DEBUG) {
        console.log(
          `[scroll] user-submit force ${Math.round(before)}→${Math.round(el.scrollTop)} (sH=${el.scrollHeight} cH=${el.clientHeight})`
        );
      }
      return;
    }

    if (!stuckToBottomRef.current) {
      if (DEBUG) {
        console.log(`[scroll] skip (not stuck-bottom) scrollTop=${Math.round(el.scrollTop)} sH=${el.scrollHeight}`);
      }
      return;
    }

    const bottom = Math.max(0, el.scrollHeight - el.clientHeight);
    const node = el.querySelector<HTMLElement>(`[data-message-id="${last.id}"]`);
    if (!node) {
      if (DEBUG) {
        console.log(`[scroll] no node for last=${last.id} → bottom=${Math.round(bottom)}`);
      }
      scrollForwardTo(bottom);
      return;
    }

    // Clamp to keep the latest message's sparkle icon on screen — never let
    // scrollTop push it above the top edge. For tall messages this means
    // we stop scrolling at iconLimit and the bottom of the message extends
    // below the viewport; the user can scroll the rest themselves. The
    // stuck-state is robust against the resulting `distance > NEAR_BOTTOM`
    // because onScroll uses scrollTop-decrease (not distance) to decide
    // when auto-follow should stop.
    const elRect = el.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const nodeTop = nodeRect.top - elRect.top + el.scrollTop;
    const ICON_PEEK = 8;
    const iconLimit = Math.max(0, nodeTop - ICON_PEEK);
    const target = Math.min(bottom, iconLimit);
    if (DEBUG) {
      console.log(
        `[scroll] target=${Math.round(target)} (bottom=${Math.round(bottom)} iconLimit=${Math.round(iconLimit)} scrollTop=${Math.round(el.scrollTop)} sH=${el.scrollHeight} cH=${el.clientHeight})`
      );
    }
    scrollForwardTo(target);
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
            // The latest assistant message animates: it mounts post-cover-lift
            // with `text` already at the full final reply, and useSmoothStream
            // drips it in from empty. Older messages render statically.
            const isLatest = message.id === lastAssistantId;
            return (
              <AssistantMessage
                key={message.id}
                messageId={message.id}
                text={text}
                isStreaming={isLatest}
                isLandingFromThinking={isLatest}
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
  // Bottom-fade only while the drip is still catching up to target. Without
  // this gate the mask sticks around forever on the latest message because
  // `isStreaming` (= `isLatest`) doesn't clear once the reply has fully
  // dripped in.
  const isDripping = displayed !== text;

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
          isDripping
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
