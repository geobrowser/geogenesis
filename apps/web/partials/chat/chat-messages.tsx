'use client';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { isTextUIPart, isToolUIPart } from 'ai';

import { shouldResubmitAfterClientExecution } from '~/core/chat/client-tools';
import { buildEntityCacheFromMessages } from '~/core/chat/entity-cache';
import type { EntityCache } from '~/core/chat/entity-cache';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';
import { Spinner } from '~/design-system/spinner';

import { ChatMarkdown } from './chat-markdown';
import { ChatSourceLink } from './chat-source-pill';
import { useSmoothStream } from './use-smooth-stream';

// Off by default in dev — the per-state-flip transcript was unreadably noisy
// during long agent turns. Set NEXT_PUBLIC_CHAT_VERBOSE=1 to opt back in.
const DEBUG = process.env.NEXT_PUBLIC_CHAT_VERBOSE === '1';

function userText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map(p => p.text)
    .join('');
}

// Keep text only from pure-text step groups — drops any tool-step text and
// returns the opener + closer prose the user should see.
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
      // Dedup adjacent identical deltas the SDK emits at step transitions.
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

// True between mid-chain tool calls: at least one main tool exists and no
// text appears after the last one.
function isWaitingForCloser(message: UIMessage): boolean {
  let lastMainToolIdx = -1;
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i];
    if (!isToolUIPart(part)) continue;
    if (part.type === 'tool-suggestFollowUps') continue;
    lastMainToolIdx = i;
  }
  // No tools yet — opener / closer-only cases handled by the caller's
  // streaming branch.
  if (lastMainToolIdx === -1) return false;
  for (let i = lastMainToolIdx + 1; i < message.parts.length; i++) {
    const part = message.parts[i];
    if (isTextUIPart(part) && part.text.length > 0) return false;
  }
  return true;
}

// True once text exists after a main tool — the signal that the closer has
// started. Opener-only text doesn't qualify.
function hasPostToolText(message: UIMessage): boolean {
  let sawMainTool = false;
  for (const part of message.parts) {
    if (isToolUIPart(part)) {
      if (part.type !== 'tool-suggestFollowUps') sawMainTool = true;
      continue;
    }
    if (sawMainTool && isTextUIPart(part) && part.text.length > 0) return true;
  }
  return false;
}

function findLastUserIndex(messages: UIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

// True while a tool is mid-flight, the SDK is about to resubmit, or the
// closer hasn't started streaming yet.
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

  // Mid-tool-chain — keep the indicator alive while Sonnet runs.
  if (status === 'streaming' && isWaitingForCloser(lastAssistant)) return true;

  // While streaming, only dismiss once the closer has started — opener-only
  // text doesn't count, so the indicator stays up during the opener→executor
  // handoff and tool-less turns linger until `status` flips to `ready`.
  if (status === 'streaming') return !hasPostToolText(lastAssistant);

  return false;
}

const TOOL_LABELS: Record<string, string> = {
  'tool-searchGraph': 'Searching the graph',
  'tool-getEntity': 'Looking up an entity',
  'tool-listSpaces': 'Listing spaces',
  'tool-getSpaceTypes': 'Checking space types',
  'tool-research': 'Researching the web',
  'tool-webFetch': 'Reading a page',
  'tool-navigate': 'Navigating',
  'tool-openReviewPanel': 'Opening the review panel',
  'tool-createEntity': 'Creating an entity',
  'tool-deleteEntity': 'Deleting an entity',
  'tool-moveEntityToSpace': 'Moving an entity',
  'tool-cloneEntityToSpace': 'Cloning an entity',
  'tool-createProperty': 'Creating a property',
  'tool-deleteProperty': 'Deleting a property',
  'tool-changePropertyDataType': 'Updating a property',
  'tool-setEntityValue': 'Updating values',
  'tool-setEntityRelation': 'Updating relations',
  'tool-createBlock': 'Adding a block',
  'tool-updateBlock': 'Updating a block',
  'tool-deleteBlock': 'Deleting a block',
  'tool-moveBlock': 'Reordering blocks',
  'tool-moveRelation': 'Reordering',
  'tool-setDataBlockFilters': 'Updating filters',
  'tool-setDataBlockView': 'Updating the view',
  'tool-setDataBlockShownColumns': 'Updating columns',
  'tool-addCollectionItem': 'Adding to a block',
  'tool-createTab': 'Creating a tab',
  'tool-renameTab': 'Renaming a tab',
  'tool-toggleEditMode': 'Toggling edit mode',
};

type ThinkingLabel = { label: string; count: number };

function thinkingLabel(message: UIMessage | undefined): ThinkingLabel {
  if (!message) return { label: 'Thinking…', count: 0 };
  let count = 0;
  let inFlightType: string | null = null;
  let lastType: string | null = null;
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.type === 'tool-suggestFollowUps') continue;
    count += 1;
    lastType = part.type;
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      inFlightType = part.type;
    }
  }
  if (count === 0) return { label: 'Thinking…', count: 0 };
  const activeType = inFlightType ?? lastType;
  const verb = (activeType && TOOL_LABELS[activeType]) || 'Working';
  return { label: `${verb}…`, count };
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

// Deduped pill row across every `tool-research` call this turn, capped at 5.
type WebSource = { url: string; title: string | null; hostname: string };

const MAX_WEB_SOURCES = 5;

function hostnameOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Restrict to http(s) so tool-controlled `javascript:`/`file:` URLs can't
    // reach the DOM.
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
    if (part.type !== 'tool-research' && part.type !== 'tool-webFetch') continue;
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
  onSuggestion: (text: string) => void;
  disabled?: boolean;
};

export function ChatMessages({ messages, status, error, onSuggestion, disabled }: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const lastAssistantId = lastAssistant?.id;
  const followUps = lastAssistant ? messageFollowUps(lastAssistant) : [];

  const willResubmit = shouldResubmitAfterClientExecution({ messages });
  const lastUserIdx = findLastUserIndex(messages);
  const isThinking = computeIsThinking({ messages, status, willResubmit, lastUserIdx });
  const currentThinkingLabel = thinkingLabel(lastAssistant);

  useChatDebugLogger({ messages, status, willResubmit, isThinking, lastAssistant });

  // Drip the latest assistant's text. Lifted here so showFollowUps can gate on
  // "drip done" — otherwise pills land before the closer text finishes typing.
  // Only animate while the turn is live; otherwise re-opening the panel would
  // re-drip already-read content.
  const latestRawText = lastAssistant ? visibleAssistantText(lastAssistant) : '';
  const isTurnLive = status === 'submitted' || status === 'streaming';
  const latestDisplayed = useSmoothStream(latestRawText, isTurnLive);
  const isLatestDripping = lastAssistant !== undefined && latestDisplayed !== latestRawText;

  // Placeholder row while we've submitted but no assistant message exists yet.
  const lastAssistantIdx = lastAssistant ? messages.lastIndexOf(lastAssistant) : -1;
  const showStandaloneThinking = isThinking && (lastAssistantIdx === -1 || lastAssistantIdx < lastUserIdx);

  // Gate on `ready` so prior pills aren't Tab+Enter-reachable mid-turn, and on
  // `!isLatestDripping` so they don't pop in mid-stream.
  const showFollowUps = status === 'ready' && !error && followUps.length > 0 && !isLatestDripping;
  // Skeleton bridges the gap between closer finish and follow-ups landing.
  const hasVisibleAssistantText = latestRawText.length > 0;
  const showSkeletonFollowUps =
    !error && !showFollowUps && !isThinking && hasVisibleAssistantText && (status === 'streaming' || isLatestDripping);

  const entityCache = React.useMemo(() => buildEntityCacheFromMessages(messages), [messages]);

  // stuck-state tracks scroll direction: programmatic scrolls only move
  // forward, so any scrollTop decrease is a user gesture.
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
          // Inline thinking belongs on the *current-turn* assistant only —
          // otherwise a follow-up user message double-fires (here + standalone).
          const showInlineThinking = isLatest && isThinking && lastAssistantIdx > lastUserIdx;
          // Only the latest message participates in the drip animation.
          const displayed = isLatest ? latestDisplayed : text;
          if (!text && !showInlineThinking) return null;

          const sources = messageWebSources(message);
          // Pills appear only once the message is fully settled. The
          // `!isThinking` gate covers the moments the SDK briefly flips to
          // `ready` between a resolved tool and an auto-resubmit. Prior
          // messages keep their pills so a follow-up turn doesn't wipe them.
          const showSources = sources.length > 0 && (!isLatest || (status === 'ready' && !error && !isThinking));

          return (
            <div key={message.id} className="flex flex-col items-start gap-2">
              <AssistantMessage
                messageId={message.id}
                text={text}
                displayed={displayed}
                showThinking={showInlineThinking}
                thinkingLabel={currentThinkingLabel}
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
      </div>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className="flex flex-col items-start gap-2">
      <AssistantSparkle />
      <ThinkingIndicator />
    </div>
  );
}

function ThinkingIndicator({ label = 'Thinking…', count = 0 }: { label?: string; count?: number }) {
  return (
    <div
      className="flex items-center gap-1.5 text-chat text-text"
      aria-live="polite"
      aria-label={count > 0 ? `${label} (${count})` : label}
    >
      <Spinner />
      <span>{label}</span>
      {count > 0 ? (
        <span className="inline-flex items-center rounded-[4px] bg-grey-01 px-1 py-px text-footnote text-grey-04 tabular-nums">
          {count}
        </span>
      ) : null}
    </div>
  );
}

type AssistantMessageProps = {
  messageId: string;
  text: string;
  displayed: string;
  showThinking: boolean;
  thinkingLabel: ThinkingLabel;
  entityCache: EntityCache;
};

function AssistantMessage({
  messageId,
  text,
  displayed,
  showThinking,
  thinkingLabel,
  entityCache,
}: AssistantMessageProps) {
  const isDripping = displayed !== text;

  return (
    <div data-message-id={messageId} className="flex flex-col items-start gap-2">
      <AssistantSparkle />
      {text ? (
        <div
          className="prose-chat w-full text-chat text-text"
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
      {showThinking && !isDripping ? (
        <ThinkingIndicator label={thinkingLabel.label} count={thinkingLabel.count} />
      ) : null}
    </div>
  );
}
