'use client';

import { useChat } from '@ai-sdk/react';

import * as React from 'react';

import { DefaultChatTransport, type UIMessage, isTextUIPart, isToolUIPart } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

import { capture } from '~/core/analytics';
import { applyInjectOpsToStore } from '~/core/chat/apply-inject-ops';
import { hasPendingClientToolCall, shouldResubmitAfterClientExecution } from '~/core/chat/client-tools';
import { useEditDispatcher } from '~/core/chat/edit-dispatcher';
import type { InjectType } from '~/core/chat/inject-types';
import {
  COMPACT_AT_INPUT_TOKENS,
  CONTEXT_USAGE_DATA_TYPE,
  type ContextUsageData,
  ENTITY_ID_REGEX,
} from '~/core/chat/limits';
import type { NavigateOutput, OpenReviewPanelOutput } from '~/core/chat/nav-types';
import { type PreloadedEntity, usePreloadedEntity } from '~/core/chat/preload';
import { useReadDispatcher } from '~/core/chat/read-dispatcher';
import { useResearchDispatcher } from '~/core/chat/research-dispatcher';
import { useSearchImagesDispatcher } from '~/core/chat/search-images-dispatcher';
import { useWebFetchDispatcher } from '~/core/chat/web-fetch-dispatcher';
import { ROOT_SPACE } from '~/core/constants';
import { useInjectJob } from '~/core/hooks/use-inject-job';
import { useSpace } from '~/core/hooks/use-space';
import {
  HISTORY_CAP,
  type PersistedChat,
  assistantSeedAtom,
  chatHistoryAtom,
  currentChatAtom,
  injectInlineAtom,
  isChatOpenAtom,
  updateChatHistorySafely,
} from '~/core/state/chat-store';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
import { useReportError } from '~/core/state/status-bar-store';
import { describeError } from '~/core/utils/error-diagnostics';
import { NavUtils } from '~/core/utils/utils';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

import { ChatPanel } from './chat-panel';

type AssistantSuggestionSource = 'welcome' | 'follow_up';
type AssistantPanelAction = 'opened' | 'closed';
type AssistantMessageSource = 'typed' | 'option_click';

const FULLSCREEN_CHILD_ROUTE_SUFFIXES = ['/ranking-compose'] as const;

function isFullscreenChildRoute(pathname: string): boolean {
  return FULLSCREEN_CHILD_ROUTE_SUFFIXES.some(suffix => pathname.endsWith(suffix));
}

// Guard router.push against hallucinated id shapes.
function validId(value: string | undefined): value is string {
  return typeof value === 'string' && ENTITY_ID_REGEX.test(value);
}

// Walk every assistant message's tool parts in `output-available` state and
// return their toolCallIds. Used on hydration so the navigate / review-panel
// effects don't re-fire one-shot side effects from a restored chat.
function collectResolvedToolCallIds(messages: UIMessage[], toolType: string): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.type !== toolType) continue;
      if (part.state !== 'output-available') continue;
      ids.push(part.toolCallId);
    }
  }
  return ids;
}

function firstUserMessageText(messages: UIMessage[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = message.parts
      .filter(isTextUIPart)
      .map(part => part.text)
      .join('')
      .trim();
    if (text) return text;
  }
  return '';
}

function fallbackTitleFromMessages(messages: UIMessage[]): string {
  const first = firstUserMessageText(messages);
  if (!first) return 'Untitled chat';
  const oneLine = first.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 60) return oneLine;
  return `${oneLine.slice(0, 59).trimEnd()}…`;
}

const TITLE_REQUEST_TIMEOUT_MS = 3_000;

async function generateChatTitle(messages: UIMessage[]): Promise<string> {
  const fallback = fallbackTitleFromMessages(messages);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TITLE_REQUEST_TIMEOUT_MS);
    const res = await fetch('/api/chat/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    const body = (await res.json()) as { title?: unknown };
    if (typeof body.title === 'string' && body.title.trim().length > 0) {
      return body.title.trim();
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function resolveNavigateHref(output: NavigateOutput): string | null {
  if (!output.ok) return null;
  switch (output.target) {
    case 'root':
      return NavUtils.toRoot();
    case 'explore':
      return NavUtils.toExplore();
    case 'personalHome':
      return NavUtils.toHome();
    case 'personalSpace':
      return validId(output.spaceId) ? NavUtils.toSpace(output.spaceId) : null;
    case 'space':
      return validId(output.spaceId) ? NavUtils.toSpace(output.spaceId) : null;
    case 'entity':
      return validId(output.spaceId) && validId(output.entityId)
        ? NavUtils.toEntity(output.spaceId, output.entityId)
        : null;
    default:
      return null;
  }
}

function createTrackingId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}:${random}`;
}

// Tool call ids are sent to Anthropic, which requires `^[a-zA-Z0-9_-]+$`, so
// they can't use the colon separator that `createTrackingId` uses for analytics.
function createToolCallId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${random}`;
}

// The AI SDK throws `new Error(responseBodyText)` on a non-2xx response, so the
// route's JSON body (`{ "error": "..." }`) lands as `error.message`. Unwrap it
// to the plain string; fall back to the cause-chain walk for non-JSON errors
// (network failure, mid-stream abort).
function describeChatError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Not a JSON body — fall through.
  }
  return describeError(error);
}

type ChatMode = 'default' | 'ingestion';

export function ChatWidget() {
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useAtom(isChatOpenAtom);
  const [seed, setSeed] = useAtom(assistantSeedAtom);
  const setInjectInline = useSetAtom(injectInlineAtom);
  const [input, setInput] = React.useState('');

  const [persistedCurrent, setPersistedCurrent] = useAtom(currentChatAtom);
  const history = useAtomValue(chatHistoryAtom);
  const setHistory = useSetAtom(chatHistoryAtom);

  // Stable id for the in-flight chat. Lazy: assigned the first time we
  // actually have something to persist.
  const currentChatIdRef = React.useRef<string | null>(persistedCurrent?.id ?? null);

  const pathname = usePathname() ?? '';
  const hideAssistantOnRoute = isFullscreenChildRoute(pathname);
  const params = useParams();

  React.useLayoutEffect(() => {
    setPortalTarget(document.body);
  }, []);
  const router = useRouter();
  const { editable } = useEditable();
  const { setIsReviewOpen, bumpReviewVersion } = useDiff();
  const conversationIdRef = React.useRef(createTrackingId('conversation'));

  // `/root` is a static route that proxies to the space layout with `ROOT_SPACE`
  // hardcoded server-side, so `useParams()` doesn't expose an `id` — resolve it
  // explicitly here so inject jobs and other context know which space we're on.
  const currentSpaceId = typeof params?.['id'] === 'string' ? params['id'] : pathname === '/root' ? ROOT_SPACE : null;
  const routeEntityId = typeof params?.['entityId'] === 'string' ? params['entityId'] : null;

  // Space home page has no `entityId` route param; resolve to the home
  // entity (or topicId for topic spaces) so "this entity" works there.
  const { space } = useSpace(routeEntityId === null ? (currentSpaceId ?? undefined) : undefined);
  const spaceHomeEntityId = space?.topicId || space?.entity?.id || null;
  const currentEntityId =
    routeEntityId ?? (spaceHomeEntityId && ENTITY_ID_REGEX.test(spaceHomeEntityId) ? spaceHomeEntityId : null);

  // Keep transport stable across renders; context flows through a ref.
  const contextRef = React.useRef({
    currentSpaceId,
    currentEntityId,
    currentPath: pathname,
    isEditMode: editable,
  });
  contextRef.current = {
    currentSpaceId,
    currentEntityId,
    currentPath: pathname,
    isEditMode: editable,
  };

  // Pre-fetch on open so turn 1 can answer "this entity" without a round-trip.
  const preloadedEntity = usePreloadedEntity(isOpen, currentEntityId, currentSpaceId);
  const preloadedEntityRef = React.useRef<PreloadedEntity | null>(preloadedEntity);
  preloadedEntityRef.current = preloadedEntity;

  // Persists across follow-up turns; reset by `handleNewChat`.
  const modeRef = React.useRef<ChatMode>('default');

  // Inject pipeline: when the seed signals an inject route, we hold its jobId
  // here and let `useInjectJob` drive the polling + status. The assistant
  // message id is stable so the polling effect can update its text in place.
  const [injectJob, setInjectJob] = React.useState<{
    jobId: string;
    spaceId: string;
    url: string;
    injectType: InjectType;
    assistantMessageId: string;
    applied: boolean;
  } | null>(null);
  const injectState = useInjectJob({ jobId: injectJob?.jobId ?? null, enabled: injectJob !== null });

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({
          context: contextRef.current,
          preloadedEntity: preloadedEntityRef.current,
          mode: modeRef.current,
        }),
      }),
    []
  );

  // Ref breaks the construction cycle: dispatchers capture it, useChat fills
  // it in. Typing erased for shared-codepath compatibility.
  const addToolResultRef = React.useRef<((args: { tool: string; toolCallId: string; output: unknown }) => void) | null>(
    null
  );

  // After Esc / stop, any unacked client-tool result would otherwise trigger an
  // immediate auto-resubmit and the spinner would never settle. Block resubmits
  // until the user takes a new action (send, suggestion click, new chat, seed).
  const stoppedRef = React.useRef(false);

  // Last turn's executor input-token count, pushed by the route as a transient
  // data part. Drives auto-compaction: we only compact once the context window
  // is genuinely filling up, not at an arbitrary message count.
  const [contextTokens, setContextTokens] = React.useState(0);

  const { messages, sendMessage, status, error, regenerate, setMessages, stop, addToolResult, clearError } = useChat({
    transport,
    sendAutomaticallyWhen: state => !stoppedRef.current && shouldResubmitAfterClientExecution(state),
    onData: dataPart => {
      if (dataPart.type !== `data-${CONTEXT_USAGE_DATA_TYPE}`) return;
      const data = dataPart.data as ContextUsageData;
      if (typeof data?.inputTokens === 'number') setContextTokens(data.inputTokens);
    },
  });

  // Every request-level chat error (4xx/5xx from /api/chat, network failure,
  // mid-stream Anthropic error) surfaces through the global StatusBar modal —
  // the same surface publish failures use. Deduped by Error instance so
  // re-renders don't re-fire the same error.
  const reportError = useReportError();
  const reportedErrorRef = React.useRef<Error | null>(null);
  const regenerateRef = React.useRef(regenerate);
  regenerateRef.current = regenerate;
  const sendMessageRef = React.useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  React.useEffect(() => {
    if (!error) {
      reportedErrorRef.current = null;
      return;
    }
    if (reportedErrorRef.current === error) return;
    reportedErrorRef.current = error;
    reportError(describeChatError(error), () => {
      stoppedRef.current = false;
      regenerateRef.current();
    });
  }, [error, reportError]);

  addToolResultRef.current = addToolResult as unknown as (args: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => void;

  // Wait for the server-side `navigate` tool to validate the target so
  // hallucinated ids don't slip through to router.push.
  const navigatedToolCallIds = React.useRef(new Set<string>());
  const openedReviewPanelToolCallIds = React.useRef(new Set<string>());
  // Auto-navigate to the MAIN (first) entity created during a turn, exactly
  // once, after the turn settles — so the user lands on the primary entity
  // instead of bouncing to whichever entity was created last. The assistant
  // message id is stable across the turn's continuation requests, so it keys
  // "we've already routed for this turn".
  const navigatedCreatedEntityForMessageId = React.useRef<string | null>(null);

  // Hydrate the persisted current chat exactly once on mount. Seed the
  // navigate / review-panel dedup sets *before* the message-watching effects
  // run, otherwise a reload would re-route the user or re-open the review
  // panel from a restored tool call. useLayoutEffect runs synchronously after
  // the first commit, before useEffect-driven side effects fire. The flag is
  // also read by the persist effect to skip the first-render fire (which
  // would otherwise wipe the restored chat with status='ready', messages=[]).
  const hydratedRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (hydratedRef.current) return;
    const persisted = persistedCurrent;
    if (persisted && persisted.messages.length > 0) {
      for (const id of collectResolvedToolCallIds(persisted.messages, 'tool-navigate')) {
        navigatedToolCallIds.current.add(id);
      }
      for (const id of collectResolvedToolCallIds(persisted.messages, 'tool-openReviewPanel')) {
        openedReviewPanelToolCallIds.current.add(id);
      }
      // Mark the restored turn as already-routed so a reload doesn't re-navigate
      // to its created entity.
      const lastAssistantId = [...persisted.messages].reverse().find(m => m.role === 'assistant')?.id ?? null;
      navigatedCreatedEntityForMessageId.current = lastAssistantId;
      currentChatIdRef.current = persisted.id;
      setMessages(persisted.messages);
    }
    hydratedRef.current = true;
  }, []);

  React.useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.type !== 'tool-navigate') continue;
        if (part.state !== 'output-available') continue;
        if (navigatedToolCallIds.current.has(part.toolCallId)) continue;
        navigatedToolCallIds.current.add(part.toolCallId);
        const href = resolveNavigateHref(part.output as NavigateOutput);
        if (href) router.push(href);
      }
    }
  }, [messages, router]);

  // Route to the newly created entity once the turn settles — but ONLY when
  // the user is on a non-entity surface (space root, /home). If they're on a
  // specific entity page, anything the agent creates is supporting work for
  // that entity and we must not yank them off it. Explicit asks ("take me to
  // the new page") go through the `navigate` tool, which has its own handler.
  React.useEffect(() => {
    // Navigation is END-OF-TURN ONLY. These three guards together mean the turn
    // is fully settled — never mid-flight — so the agent can create as many
    // entities as it wants without ever yanking the user mid-turn:
    //   1. the stream isn't running,
    //   2. no client tool result is waiting to trigger a resubmit (more steps),
    //   3. no client tool call is still in flight.
    // Combined with the per-turn lock below, this fires exactly once, at the end.
    if (status !== 'ready') return;
    if (shouldResubmitAfterClientExecution({ messages })) return;
    if (hasPendingClientToolCall(messages)) return;
    if (routeEntityId !== null) return;

    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;

    // Belt-and-braces: a tool call on the latest message that hasn't resolved
    // (e.g. addCollectionItem still marking the new entity block-bound) also
    // means the turn isn't done.
    const hasPendingTool = lastAssistant.parts.some(p => {
      if (!isToolUIPart(p)) return false;
      return p.state === 'input-streaming' || p.state === 'input-available';
    });
    if (hasPendingTool) return;

    // Navigate at most once per turn. The assistant message id is stable across
    // the turn's continuation requests, so once we've routed for it we never
    // route again — that's what stops the bounce between successive creates.
    if (navigatedCreatedEntityForMessageId.current === lastAssistant.id) return;

    const blockBoundEntityIds = new Set<string>();
    for (const part of lastAssistant.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.type !== 'tool-addCollectionItem') continue;
      if (part.state !== 'output-available') continue;
      const input = (part as { input?: { entityId?: unknown } }).input;
      if (input && typeof input.entityId === 'string') blockBoundEntityIds.add(input.entityId);
    }

    // First successful create in the turn wins — that's the main entity. Later
    // creates are supporting work and must not steal the navigation.
    let navigateTarget: { entityId: string; spaceId: string } | null = null;
    for (const part of lastAssistant.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.type !== 'tool-createEntity') continue;
      if (part.state !== 'output-available') continue;
      const output = part.output as {
        ok?: unknown;
        intent?: { kind?: unknown; entityId?: unknown; spaceId?: unknown };
      };
      if (output?.ok !== true) continue;
      const intent = output.intent;
      if (!intent || intent.kind !== 'createEntity') continue;
      const entityId = intent.entityId;
      const spaceId = intent.spaceId;
      if (typeof entityId !== 'string' || typeof spaceId !== 'string') continue;
      if (!validId(entityId) || !validId(spaceId)) continue;
      if (blockBoundEntityIds.has(entityId)) continue;
      navigateTarget = { entityId, spaceId };
      break;
    }

    // Lock the turn the moment it settles, whether or not a target was found,
    // so a re-render can't re-scan and re-route the same turn.
    navigatedCreatedEntityForMessageId.current = lastAssistant.id;
    if (navigateTarget) {
      router.push(NavUtils.toEntity(navigateTarget.spaceId, navigateTarget.entityId));
    }
  }, [messages, status, router, routeEntityId]);

  // Dedup by toolCallId so re-renders don't re-open after user dismisses.
  // bumpReviewVersion recomputes the diff from current staged state.
  React.useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.type !== 'tool-openReviewPanel') continue;
        if (part.state !== 'output-available') continue;
        if (openedReviewPanelToolCallIds.current.has(part.toolCallId)) continue;
        openedReviewPanelToolCallIds.current.add(part.toolCallId);
        const output = part.output as OpenReviewPanelOutput;
        if (!output.ok) continue;
        bumpReviewVersion();
        setIsReviewOpen(true);
      }
    }
  }, [messages, setIsReviewOpen, bumpReviewVersion]);

  // Order matters: edits must enqueue before reads so same-step reads see
  // post-apply state.
  useEditDispatcher(messages, addToolResultRef);
  useReadDispatcher(messages, addToolResultRef);
  useResearchDispatcher(messages, addToolResultRef);
  useWebFetchDispatcher(messages, addToolResultRef);
  useSearchImagesDispatcher(messages, addToolResultRef);

  // Bridge the gap between status='ready' and the SDK's auto-resubmit firing —
  // otherwise the input flips back to "send" between successive tool calls.
  // Gated on `stoppedRef` to match `sendAutomaticallyWhen`: after stop, a late
  // dispatcher result can still flip `shouldResubmit` to true, and we don't
  // want a stuck stop button when there's nothing to stop.
  const isBusy =
    !stoppedRef.current &&
    (status === 'submitted' ||
      status === 'streaming' ||
      hasPendingClientToolCall(messages) ||
      shouldResubmitAfterClientExecution({ messages }));

  const assistantContextProperties = React.useCallback(
    () => ({
      conversation_id: conversationIdRef.current,
      page_path: pathname,
      space_id: currentSpaceId,
      entity_id: currentEntityId,
      is_edit_mode: editable,
    }),
    [currentEntityId, currentSpaceId, editable, pathname]
  );

  const trackAssistantPanel = React.useCallback(
    (action: AssistantPanelAction, trigger: string) => {
      capture('element_clicked', {
        ...assistantContextProperties(),
        source: 'assistant',
        element_action: action,
        interaction_trigger: trigger,
      });
    },
    [assistantContextProperties]
  );

  const openAssistant = React.useCallback(
    (trigger: string) => {
      trackAssistantPanel('opened', trigger);
      setIsOpen(true);
    },
    [setIsOpen, trackAssistantPanel]
  );

  const closeAssistant = React.useCallback(
    (trigger: string) => {
      trackAssistantPanel('closed', trigger);
      setIsOpen(false);
    },
    [setIsOpen, trackAssistantPanel]
  );

  React.useEffect(() => {
    if (hideAssistantOnRoute && isOpen) {
      closeAssistant('fullscreen_route');
    }
  }, [hideAssistantOnRoute, isOpen, closeAssistant]);

  const trackAssistantMessage = React.useCallback(
    (text: string, source: AssistantMessageSource, suggestionSource?: AssistantSuggestionSource) => {
      capture('ai_assistant_message_sent', {
        ...assistantContextProperties(),
        message_id: createTrackingId('message'),
        message_source: source,
        option_source: suggestionSource,
        option_label: source === 'option_click' ? text : undefined,
        user_message: text,
        query_length: text.length,
      });
    },
    [assistantContextProperties]
  );

  // stop() aborts the fetch but leaves any in-flight tool parts pinned in
  // 'input-available' state, which keeps the thinking indicator alive forever.
  // Scrub those so the UI actually settles, and block the next auto-resubmit.
  const stopAndScrub = React.useCallback(() => {
    stoppedRef.current = true;
    stop();
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== 'assistant') return prev;
      const cleaned = last.parts.filter(p => {
        if (!isToolUIPart(p)) return true;
        return p.state === 'output-available' || p.state === 'output-error';
      });
      if (cleaned.length === last.parts.length) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...last, parts: cleaned };
      return next;
    });
  }, [stop, setMessages]);

  // Persist the in-flight chat only on settled turns. Writing mid-stream
  // serializes partial parts and thrashes localStorage; a closed-tab mid-stream
  // restores from the last `ready` snapshot, which is acceptable.
  // Gate on `hydratedRef` so the first-render firing (status='ready',
  // messages=[]) doesn't wipe the restored chat before useLayoutEffect's
  // setMessages commit has propagated through.
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    if (status !== 'ready') return;
    if (messages.length === 0) {
      // Cleared after archive — drop the persisted current too.
      if (persistedCurrent !== null) setPersistedCurrent(null);
      return;
    }
    if (!currentChatIdRef.current) {
      currentChatIdRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `chat-${Date.now()}`;
    }
    const next: PersistedChat = {
      id: currentChatIdRef.current,
      title: persistedCurrent?.title ?? '',
      messages,
      updatedAt: Date.now(),
    };
    try {
      setPersistedCurrent(next);
    } catch {
      // QuotaExceededError — auto-compaction normally keeps a single chat
      // well under localStorage's budget. Surrender; in-memory state still works.
    }
  }, [messages, status]);

  // Refs read inside async handlers so we don't tear when the component
  // re-renders between archive start and history write.
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;
  const persistedCurrentRef = React.useRef(persistedCurrent);
  persistedCurrentRef.current = persistedCurrent;

  // Archive the in-flight chat into history. Writes synchronously with a
  // fallback title so closing the tab mid-fetch can't lose the chat, then
  // upgrades the title in place when the Haiku request returns. If the chat
  // was popped (e.g., the user switched into it again) before the title
  // resolves, the upgrade is a no-op.
  const archiveCurrentChat = React.useCallback((): void => {
    const snapshot = messagesRef.current;
    if (snapshot.length === 0) return;
    const id = currentChatIdRef.current ?? crypto.randomUUID();
    currentChatIdRef.current = id;

    const existingTitle = persistedCurrentRef.current?.title?.trim() ?? '';
    const initialTitle = existingTitle || fallbackTitleFromMessages(snapshot);

    const archived: PersistedChat = {
      id,
      title: initialTitle,
      messages: snapshot,
      updatedAt: Date.now(),
    };

    updateChatHistorySafely(setHistory, prev => {
      const filtered = prev.filter(entry => entry.id !== archived.id);
      return [archived, ...filtered].slice(0, HISTORY_CAP);
    });

    if (existingTitle) return;

    void generateChatTitle(snapshot).then(generated => {
      const trimmed = generated.trim();
      if (!trimmed || trimmed === initialTitle) return;
      updateChatHistorySafely(setHistory, prev => {
        const idx = prev.findIndex(entry => entry.id === id);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], title: trimmed };
        return updated;
      });
    });
  }, [setHistory]);

  // Reset both the dedup ref sets and the in-flight chat id. Called whenever
  // we swap to a different chat (new chat, switch chat) so the next chat
  // starts clean.
  const resetForChatSwap = React.useCallback(() => {
    navigatedToolCallIds.current.clear();
    openedReviewPanelToolCallIds.current.clear();
    navigatedCreatedEntityForMessageId.current = null;
    currentChatIdRef.current = null;
  }, []);

  const handleNewChat = React.useCallback(() => {
    if (isBusy) stopAndScrub();
    archiveCurrentChat();
    resetForChatSwap();
    setPersistedCurrent(null);
    setMessages([]);
    setInput('');
    // useChat doesn't auto-clear error on setMessages; without this a stale
    // error from the prior chat would resurface on the fresh one.
    clearError();
    modeRef.current = 'default';
    stoppedRef.current = false;
    setInjectJob(null);
    setInjectInline(null);
    conversationIdRef.current = createTrackingId('conversation');
  }, [
    isBusy,
    stopAndScrub,
    archiveCurrentChat,
    resetForChatSwap,
    setPersistedCurrent,
    setMessages,
    clearError,
    setInjectInline,
  ]);

  // Background auto-compaction. When the last turn's executor input crosses
  // COMPACT_AT_INPUT_TOKENS, replace the transcript with a Haiku-summarized
  // [user, assistant] pair in place. Same chat id is preserved so the entry in
  // history stays intact; the chatHistoryAtom archive is unaffected. Dedup
  // ref sets are cleared because the prior tool calls are gone — any
  // nav/review-panel actions they implied have already happened.
  const [isCompacting, setIsCompacting] = React.useState(false);
  const runCompact = React.useCallback(async () => {
    if (isCompacting) return;
    setIsCompacting(true);
    try {
      const res = await fetch('/api/chat/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message = typeof body?.error === 'string' ? body.error : 'Compaction failed.';
        reportError(message);
        return;
      }
      const body = (await res.json()) as { summary?: unknown };
      if (typeof body.summary !== 'string' || body.summary.trim().length === 0) {
        reportError('Compaction failed.');
        return;
      }
      const newId = () =>
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `msg-${Date.now()}-${Math.random()}`;
      const compacted: UIMessage[] = [
        {
          id: newId(),
          role: 'user',
          parts: [{ type: 'text', text: 'Summarize our conversation so far so we can continue.' }],
        },
        {
          id: newId(),
          role: 'assistant',
          parts: [{ type: 'text', text: body.summary.trim() }],
        },
      ];
      // Archive the full pre-compaction chat into history, then start a fresh
      // chat seeded with the compacted summary. The old transcript stays
      // reachable from "Previous chats" so users can revisit it.
      archiveCurrentChat();
      resetForChatSwap();
      setPersistedCurrent(null);
      setMessages(compacted);
      setInput('');
      clearError();
      modeRef.current = 'default';
      stoppedRef.current = false;
      setInjectJob(null);
      setInjectInline(null);
      conversationIdRef.current = createTrackingId('conversation');
      // The two-message summary is tiny; drop the stale high reading so the
      // effect doesn't immediately re-fire before the next turn reports anew.
      setContextTokens(0);
    } catch (err) {
      console.error('[chat] compaction failed', err);
      reportError('Compaction failed.');
    } finally {
      setIsCompacting(false);
    }
  }, [
    isCompacting,
    messages,
    setMessages,
    setInput,
    clearError,
    reportError,
    archiveCurrentChat,
    resetForChatSwap,
    setPersistedCurrent,
    setInjectInline,
  ]);

  // Fires once per threshold-cross: when the chat is idle AND the last turn's
  // executor input crossed the token threshold AND we're not already
  // compacting, kick off the background summarization. After it lands
  // contextTokens resets to 0, so the effect won't re-fire until the next
  // turn reports a reading back over the threshold.
  React.useEffect(() => {
    if (status !== 'ready') return;
    if (isCompacting) return;
    if (contextTokens < COMPACT_AT_INPUT_TOKENS) return;
    void runCompact();
  }, [status, contextTokens, isCompacting, runCompact]);

  const handleSwitchChat = React.useCallback(
    (id: string) => {
      const target = history.find(entry => entry.id === id);
      if (!target) return;
      if (isBusy) stop();
      // Archive the chat we're switching away from (prepended via functional
      // update), then pop the selected entry from history in a second
      // functional update so both reads operate on the freshest state.
      archiveCurrentChat();
      updateChatHistorySafely(setHistory, prev => prev.filter(entry => entry.id !== id));
      resetForChatSwap();
      currentChatIdRef.current = target.id;
      for (const tid of collectResolvedToolCallIds(target.messages, 'tool-navigate')) {
        navigatedToolCallIds.current.add(tid);
      }
      for (const tid of collectResolvedToolCallIds(target.messages, 'tool-openReviewPanel')) {
        openedReviewPanelToolCallIds.current.add(tid);
      }
      // Mark the swapped-in chat's latest turn as already-routed so selecting it
      // doesn't re-navigate to an entity it created earlier.
      navigatedCreatedEntityForMessageId.current =
        [...target.messages].reverse().find(m => m.role === 'assistant')?.id ?? null;
      try {
        setPersistedCurrent(target);
      } catch {
        // ignore
      }
      setMessages(target.messages);
      setInput('');
      clearError();
      modeRef.current = 'default';
      stoppedRef.current = false;
      setInjectJob(null);
      setInjectInline(null);
      conversationIdRef.current = createTrackingId('conversation');
    },
    [
      isBusy,
      stop,
      history,
      archiveCurrentChat,
      resetForChatSwap,
      setHistory,
      setPersistedCurrent,
      setMessages,
      clearError,
      setInjectInline,
    ]
  );

  // "Clear history" wipes both the archived list AND the current chat: users
  // expect a clean slate, not a "the old conversation is still here" surprise.
  // We skip archiveCurrentChat — clearing past chats and then re-archiving the
  // current one into that just-cleared list is incoherent.
  const handleClearHistory = React.useCallback(() => {
    if (isBusy) stop();
    setHistory([]);
    resetForChatSwap();
    setPersistedCurrent(null);
    setMessages([]);
    setInput('');
    clearError();
    modeRef.current = 'default';
    stoppedRef.current = false;
    setInjectJob(null);
    setInjectInline(null);
    conversationIdRef.current = createTrackingId('conversation');
  }, [isBusy, stop, setHistory, resetForChatSwap, setPersistedCurrent, setMessages, clearError, setInjectInline]);

  // Bails while busy so a stuck seed retries once the current turn settles.
  React.useEffect(() => {
    if (!seed) return;
    if (isBusy) return;

    // Every Add Data import starts a fresh chat. If a conversation already
    // exists, reset to a clean slate first (archiving the old chat) and let the
    // effect re-run against the now-empty transcript — path B's `sendMessage`
    // reads the live message list synchronously, so clearing in this same tick
    // wouldn't take effect. The reset also drops the prior inject job/inline
    // state so a second import can't inherit the first import's summary.
    if (messages.length > 0) {
      handleNewChat();
      return;
    }

    stoppedRef.current = false;
    // Drop any stale error so the StatusBar retry doesn't regenerate the previous failed turn.
    clearError();

    if (seed.mode === 'inject') {
      // Push a synthetic user + empty-assistant pair. The assistant slot is
      // claimed by `InjectInlineProgress` (via injectInlineAtom) while polling;
      // its text is filled in with the summary once the job completes.
      const assistantMessageId = createTrackingId('inject-msg');
      const userText = `Importing from \`${seed.url}\``;
      modeRef.current = 'ingestion'; // unused for inject path but keeps default in sync
      setMessages(prev => [
        ...prev,
        { id: createTrackingId('inject-user'), role: 'user', parts: [{ type: 'text', text: userText }] },
        { id: assistantMessageId, role: 'assistant', parts: [{ type: 'text', text: '' }] },
      ]);
      setInjectInline({ assistantMessageId, status: 'pending', startedAt: Date.now() });
      setInjectJob({
        jobId: seed.jobId,
        spaceId: currentSpaceId ?? '',
        url: seed.url,
        injectType: seed.injectType,
        assistantMessageId,
        applied: false,
      });
      setSeed(null);
      return;
    }

    modeRef.current = seed.mode;
    // Backtick-wrap the URL so markdown doesn't mangle special chars.
    const text = `Please ingest this URL into this space and stage the entities: \`${seed.url}\``;
    trackAssistantMessage(text, 'typed');
    sendMessageRef.current({ text });
    setSeed(null);
  }, [
    seed,
    isBusy,
    messages.length,
    handleNewChat,
    clearError,
    setSeed,
    trackAssistantMessage,
    currentSpaceId,
    setMessages,
  ]);

  // Fetch next-step suggestions for a completed inject and append them to the
  // synthetic assistant message as a tool-suggestFollowUps part, so the same
  // pill renderer the chat-driven flow uses surfaces them. Best-effort.
  const appendInjectFollowUps = React.useCallback(
    async (assistantMessageId: string, name: string, injectType: InjectType) => {
      let suggestions: string[] = [];
      try {
        const res = await fetch('/api/chat/inject-followups', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type: injectType }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { suggestions?: unknown };
        if (Array.isArray(body.suggestions)) {
          suggestions = body.suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
        }
      } catch {
        return;
      }
      if (suggestions.length === 0) return;

      const followUpPart = {
        type: 'tool-suggestFollowUps',
        // Must match Anthropic's tool_use.id pattern (^[a-zA-Z0-9_-]+$) — it's
        // replayed in the transcript once the user sends a follow-up message.
        toolCallId: createToolCallId('inject-followups'),
        state: 'output-available',
        input: { suggestions },
        output: { suggestions },
      } as unknown as UIMessage['parts'][number];

      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === assistantMessageId);
        if (idx === -1) return prev;
        const message = prev[idx];
        if (message.parts.some(p => p.type === 'tool-suggestFollowUps')) return prev;
        const next = [...prev];
        next[idx] = { ...message, parts: [...message.parts, followUpPart] };
        return next;
      });
    },
    [setMessages]
  );

  // On a terminal inject state, apply the decoded ops to the local store, write
  // the summary into the synthetic assistant message, and navigate to the new
  // article. On failure, fall back to the standard chat-driven ingestion flow.
  React.useEffect(() => {
    if (!injectJob) return;

    const updateAssistantText = (text: string) => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === injectJob.assistantMessageId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...prev[idx], parts: [{ type: 'text', text }] };
        return next;
      });
    };

    // During pending: `InjectInlineProgress` (driven by `injectInlineAtom`)
    // owns the assistant slot and animates its own label + bar. Nothing to do.
    if (injectState.status === 'pending') return;

    if (injectState.status === 'completed' && injectState.ops && !injectJob.applied) {
      if (!injectJob.spaceId) {
        updateAssistantText("Couldn't import: no active space.");
        setInjectInline(null);
        setInjectJob(null);
        return;
      }
      const result = applyInjectOpsToStore(injectState.ops, injectJob.spaceId);
      const primaryPill =
        result.primaryEntityId && result.primaryEntityName
          ? `[${result.primaryEntityName.replace(/[\[\]]/g, '')}](geo://entity/${result.primaryEntityId}?space=${injectJob.spaceId})`
          : null;
      const supportingCount = Math.max(0, result.entitiesCreated - (primaryPill ? 1 : 0));
      const supportingClause =
        supportingCount > 0
          ? ` and ${supportingCount} supporting ${supportingCount === 1 ? 'entity' : 'entities'}`
          : '';
      const summary = primaryPill
        ? `Imported ${primaryPill}${supportingClause}. Review and publish when ready.`
        : `Imported ${result.entitiesCreated} ${result.entitiesCreated === 1 ? 'entity' : 'entities'}. Review and publish when ready.`;
      updateAssistantText(summary);
      setInjectInline(null);
      // The inject path bypasses /api/chat, so it never runs the route's Stage D
      // follow-ups. Fetch equivalent next-step suggestions and append them as a
      // tool-suggestFollowUps part so the existing pill renderer picks them up.
      // Best-effort: failures just mean no pills.
      const followUpName = result.primaryEntityName ?? injectState.name ?? '';
      void appendInjectFollowUps(injectJob.assistantMessageId, followUpName, injectJob.injectType);
      // A clicked follow-up is a normal edit request, not an ingestion turn.
      modeRef.current = 'default';
      // Navigate straight to the imported article. The staged edits stay in the
      // store for the user to review + publish from the article page when ready.
      if (result.primaryEntityId) {
        router.push(NavUtils.toEntity(injectJob.spaceId, result.primaryEntityId));
      }
      setInjectJob({ ...injectJob, applied: true });
      return;
    }

    if (injectState.status === 'failed') {
      const reason = injectState.error ?? 'Inject failed';
      updateAssistantText(`News pipeline didn't return results (${reason}) — falling back to the standard import.`);
      setInjectInline(null);
      modeRef.current = 'ingestion';
      const fallbackText = `Please ingest this URL into this space and stage the entities: \`${injectJob.url}\``;
      trackAssistantMessage(fallbackText, 'typed');
      sendMessageRef.current({ text: fallbackText });
      setInjectJob(null);
    }
  }, [injectJob, injectState, setMessages, setInjectInline, trackAssistantMessage, router, appendInjectFollowUps]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') {
        // First Esc while busy stops the agent; a second Esc closes the panel.
        if (isBusy) {
          stopAndScrub();
        } else {
          closeAssistant('escape_key');
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        // Don't hijack the shortcut mid-IME composition.
        if (event.isComposing || hideAssistantOnRoute) return;
        event.preventDefault();
        if (isOpen) {
          closeAssistant('keyboard_shortcut');
        } else {
          openAssistant('keyboard_shortcut');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeAssistant, hideAssistantOnRoute, isBusy, isOpen, openAssistant, stopAndScrub]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isBusy || isCompacting) return;
    stoppedRef.current = false;
    trackAssistantMessage(text, 'typed');
    sendMessage({ text });
    setInput('');
  };

  const handleSuggestion = (text: string, source: AssistantSuggestionSource) => {
    if (isBusy || isCompacting) return;
    stoppedRef.current = false;
    trackAssistantMessage(text, 'option_click', source);
    sendMessage({ text });
  };

  if (!portalTarget) {
    return null;
  }

  const ui = hideAssistantOnRoute ? null : (
    <AnimatePresence mode="wait">
      {isOpen ? (
        <ChatPanel
          key="panel"
          messages={messages}
          status={status}
          error={error}
          isBusy={isBusy}
          isCompacting={isCompacting}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={stopAndScrub}
          onSuggestion={handleSuggestion}
          onNewChat={handleNewChat}
          onClose={() => closeAssistant('header_button')}
          suppressWelcome={seed !== null || (status === 'submitted' && messages.length === 0)}
          history={history}
          onSwitchChat={handleSwitchChat}
          onClearHistory={handleClearHistory}
        />
      ) : (
        <motion.button
          type="button"
          key="fab"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          onClick={() => openAssistant('fab')}
          aria-label="Open assistant"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-1100 flex size-10 items-center justify-center rounded-full border border-grey-02 bg-white text-text shadow-lg transition-colors hover:border-text"
        >
          <AssistantSparkle size={20} />
        </motion.button>
      )}
    </AnimatePresence>
  );

  return createPortal(ui, portalTarget);
}
