'use client';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { isTextUIPart, isToolUIPart } from 'ai';
import { motion } from 'framer-motion';

import { shouldResubmitAfterClientExecution } from '~/core/chat/client-tools';
import { buildEntityCacheFromMessages } from '~/core/chat/entity-cache';
import type { EntityCache } from '~/core/chat/entity-cache';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

import { ChatMarkdown } from './chat-markdown';
import { ChatSourceLink } from './chat-source-pill';
import { useSmoothStream } from './use-smooth-stream';

const DEBUG = process.env.NODE_ENV !== 'production';

function userText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map(p => p.text)
    .join('');
}

// Step-aware text filter — the deterministic guardrail. Group parts by step
// (between step-start markers); for each step, count its non-followup tool
// calls. Drop text from any step that contains a tool call. Keep text only
// from "pure-text" steps — by construction the model's final-answer step is
// pure-text, so this returns the closing summary regardless of any
// mid-turn narration the model emitted.
function visibleAssistantText(message: UIMessage): string {
  type StepGroup = { tools: number; texts: string[] };
  const groups: StepGroup[] = [{ tools: 0, texts: [] }];
  for (const part of message.parts) {
    if (part.type === 'step-start') {
      groups.push({ tools: 0, texts: [] });
      continue;
    }
    const current = groups[groups.length - 1];
    if (isToolUIPart(part)) {
      if (part.type === 'tool-suggestFollowUps') continue;
      current.tools += 1;
      continue;
    }
    if (isTextUIPart(part)) {
      if (part.text.length === 0) continue;
      current.texts.push(part.text);
    }
  }
  const out: string[] = [];
  let prevTrimmed = '';
  for (const group of groups) {
    if (group.tools > 0) continue;
    for (const text of group.texts) {
      const trimmed = text.trim();
      if (trimmed.length === 0) continue;
      // Equality-on-trimmed dedup. The SDK occasionally emits adjacent
      // identical text-deltas during step transitions.
      if (trimmed === prevTrimmed) continue;
      prevTrimmed = trimmed;
      out.push(text);
    }
  }
  return out.join('\n\n');
}

function hasPendingMainTools(message: UIMessage): boolean {
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.type === 'tool-suggestFollowUps') continue;
    if (part.state !== 'output-available' && part.state !== 'output-error') return true;
  }
  return false;
}

// In the 3-stage pipeline (Haiku opener → Sonnet executor → Haiku closer), the
// opener emits text BEFORE any tools run. Without this check, `computeIsThinking`
// would return false the moment the opener finishes (visible text exists, no
// pending tools yet), leaving the UI looking frozen until the executor's first
// tool call lands. Returns true when the message contains at least one main
// tool call AND no text appears after it — i.e., we're between opener-end and
// closer-start (or mid-tool-chain between two tool calls).
function isWaitingForCloser(message: UIMessage): boolean {
  let lastMainToolIdx = -1;
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i];
    if (!isToolUIPart(part)) continue;
    if (part.type === 'tool-suggestFollowUps') continue;
    lastMainToolIdx = i;
  }
  if (lastMainToolIdx === -1) {
    // No main tools yet. If there's already text (the opener), the closer
    // might still be coming if the executor hasn't started; we can't tell
    // from parts alone, so leave this case to the streaming-status branch.
    return false;
  }
  for (let i = lastMainToolIdx + 1; i < message.parts.length; i++) {
    const part = message.parts[i];
    if (isTextUIPart(part) && part.text.length > 0) return false;
  }
  return true;
}

function findLastUserIndex(messages: UIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

// True when a tool is mid-flight, the SDK is about to resubmit a tool result,
// or no closing-summary text has streamed yet. Lifts the moment the
// final-step text starts arriving.
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

  if (hasPendingMainTools(lastAssistant)) return true;
  if (willResubmit) return true;

  // Bridge the gap between the opener finishing and the closer starting (or
  // between two tool calls mid-chain). Without this, the user sees just the
  // opener text and a frozen UI while Sonnet runs the tool chain.
  if (status === 'streaming' && isWaitingForCloser(lastAssistant)) return true;

  const finalText = visibleAssistantText(lastAssistant);
  if (finalText.length > 0) return false;
  return status === 'streaming';
}

// One-line digest of an assistant message's parts for the debug logger.
function digestParts(message: UIMessage | undefined): string {
  if (!message) return '<no-assistant>';
  return message.parts
    .map(p => {
      if (p.type === 'step-start') return 'step';
      if (isTextUIPart(p)) return `text(${p.text.length})`;
      if (isToolUIPart(p)) {
        const isDynamic = p.type === 'dynamic-tool';
        const name = isDynamic
          ? `${(p as { toolName?: string }).toolName ?? '?'}@dynamic`
          : p.type.replace(/^tool-/, '');
        const providerExec = (p as { providerExecuted?: boolean }).providerExecuted ? '!srv' : '';
        const hasErr = 'errorText' in p && p.errorText ? '!err' : '';
        return `tool:${name}=${p.state}${providerExec}${hasErr}`;
      }
      return p.type;
    })
    .join('|');
}

function dumpDeepParts(message: UIMessage | undefined) {
  if (!DEBUG || !message) return;
  for (const p of message.parts) {
    if (!isToolUIPart(p)) continue;
    const anyP = p as Record<string, unknown>;
    console.log(`[chat:part] ${p.type} state=${p.state}`, {
      toolCallId: anyP.toolCallId,
      toolName: anyP.toolName,
      providerExecuted: anyP.providerExecuted,
      input: anyP.input,
      output: anyP.output,
      errorText: anyP.errorText,
      callProviderMetadata: anyP.callProviderMetadata,
      resultProviderMetadata: anyP.resultProviderMetadata,
    });
  }
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
    if (prev?.digest !== digest) dumpDeepParts(lastAssistant);
    prevRef.current = { status, willResubmit, isThinking, digest };
  }
}

// `tool-research` parts carry `{ summary, sources: [{ url, title }] }`. We
// surface every research call's sources in a deduped pill row capped at 5 so
// the row stays scannable even on multi-research turns.
type WebSource = { url: string; title: string | null; hostname: string };

const MAX_WEB_SOURCES = 5;

function hostnameOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Source URLs ultimately render as clickable hrefs; restrict to http(s)
    // so a tool-controlled `ftp:`, `file:`, or other scheme never reaches
    // the DOM. (`javascript:` etc. already fall out because their parsed
    // hostname is empty, but be explicit.)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function messageWebSources(message: UIMessage): WebSource[] {
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.type !== 'tool-research') continue;
    if (part.state !== 'output-available') continue;
    const output = (part as { output?: unknown }).output;
    if (!output || typeof output !== 'object') continue;
    const sourcesField = (output as { sources?: unknown }).sources;
    if (!Array.isArray(sourcesField)) continue;
    for (const raw of sourcesField) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      if (typeof r.url !== 'string') continue;
      if (seen.has(r.url)) continue;
      const hostname = hostnameOf(r.url);
      if (!hostname) continue;
      seen.add(r.url);
      sources.push({
        url: r.url,
        title: typeof r.title === 'string' && r.title.length > 0 ? r.title : null,
        hostname,
      });
      if (sources.length >= MAX_WEB_SOURCES) return sources;
    }
  }
  return sources;
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

  const willResubmit = shouldResubmitAfterClientExecution({ messages });
  const lastUserIdx = findLastUserIndex(messages);
  const isThinking = computeIsThinking({ messages, status, willResubmit, lastUserIdx });

  useChatDebugLogger({ messages, status, willResubmit, isThinking, lastAssistant });

  // Synthetic thinking row: when we've just submitted but the SDK hasn't
  // mounted an assistant message yet, render a placeholder so the user gets
  // immediate feedback. Once the assistant message arrives, this disappears
  // and the inline thinking indicator on the assistant message takes over.
  const lastAssistantIdx = lastAssistant ? messages.lastIndexOf(lastAssistant) : -1;
  const showStandaloneThinking = isThinking && (lastAssistantIdx === -1 || lastAssistantIdx < lastUserIdx);

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
  // Programmatic scrolls only ever move forward, so a scrollTop *decrease* in
  // onScroll is unambiguously a user gesture.
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
        stuckToBottomRef.current = false;
        return;
      }
      const distance = el.scrollHeight - (newTop + el.clientHeight);
      if (distance <= NEAR_BOTTOM) stuckToBottomRef.current = true;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const runAutoScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (!last) return;

    const scrollForwardTo = (top: number) => {
      const before = el.scrollTop;
      if (top <= before) return;
      el.scrollTop = top;
      lastScrollTopRef.current = el.scrollTop;
    };

    if (last.role === 'user') {
      stuckToBottomRef.current = true;
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
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
    const ICON_PEEK = 8;
    const iconLimit = Math.max(0, nodeTop - ICON_PEEK);
    const target = Math.min(bottom, iconLimit);
    scrollForwardTo(target);
  }, [messages]);

  React.useLayoutEffect(() => {
    runAutoScroll();
  }, [runAutoScroll, status, isThinking]);

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
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-x-clip overflow-y-auto px-3 py-3">
        {messages.map(message => {
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
          const isLatest = message.id === lastAssistantId;
          const showInlineThinking = isLatest && isThinking;
          if (!text && !showInlineThinking) return null;

          const sources = messageWebSources(message);
          // Show pills only once the message is fully settled. For the latest
          // message that's `status === 'ready'` AND `!isThinking` — the second
          // condition closes the gap where the SDK briefly flips status to
          // 'ready' between a resolved research tool-call and the auto-
          // resubmit, which would otherwise flash References under the still-
          // active thinking shimmer (willResubmit / pending-tool cases are
          // both encompassed by isThinking). For prior messages we always
          // render their sources so they persist when the next turn begins —
          // without this carryover, sending a follow-up question wipes the
          // references on the prior answer.
          const showSources = sources.length > 0 && (!isLatest || (status === 'ready' && !error && !isThinking));

          return (
            <div key={message.id} className="flex flex-col items-start gap-2">
              <AssistantMessage
                messageId={message.id}
                text={text}
                // Keep the drip alive until useSmoothStream catches up — it
                // self-stops once displayed === target. Gating on status
                // would snap to full text mid-drip when the closer's stream
                // ends, defeating the smoothing and producing a visible pop.
                isStreaming={isLatest}
                showThinking={showInlineThinking}
                entityCache={entityCache}
              />
              {showSources ? (
                <section className="flex flex-col gap-0.5 pt-1" aria-labelledby={`references-${message.id}`}>
                  <div id={`references-${message.id}`} className="text-footnote text-grey-04">
                    References
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {sources.map(source => (
                      <ChatSourceLink
                        key={source.url}
                        url={source.url}
                        hostname={source.hostname}
                        title={source.title}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          );
        })}

        {showStandaloneThinking ? <ThinkingRow /> : null}

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
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className="flex flex-col items-start gap-2">
      <AssistantSparkle />
      <ThinkingShimmer />
    </div>
  );
}

// Shimmer sweeps a darker band across light-grey text (background-clip: text
// + animated background-position). The whole "Thinking…" reads as alive,
// not just a punctuation flicker.
function ThinkingShimmer() {
  return (
    <motion.div
      className="text-chat"
      style={{
        backgroundImage: 'linear-gradient(90deg, #B6B6B6 0%, #B6B6B6 35%, #202020 50%, #B6B6B6 65%, #B6B6B6 100%)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
      animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
      aria-live="polite"
      aria-label="Assistant thinking"
    >
      Thinking…
    </motion.div>
  );
}

type AssistantMessageProps = {
  messageId: string;
  text: string;
  isStreaming: boolean;
  showThinking: boolean;
  entityCache: EntityCache;
};

function AssistantMessage({ messageId, text, isStreaming, showThinking, entityCache }: AssistantMessageProps) {
  // Drip-feed only while text is actively streaming. Settled (older) messages
  // render in full.
  const displayed = useSmoothStream(text, isStreaming);
  const isDripping = displayed !== text;

  return (
    <div data-message-id={messageId} className="flex flex-col items-start gap-2">
      <AssistantSparkle />
      {text ? (
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
      ) : null}
      {showThinking && !isDripping ? <ThinkingShimmer /> : null}
    </div>
  );
}
