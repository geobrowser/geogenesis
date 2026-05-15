'use client';

import { useChat } from '@ai-sdk/react';

import * as React from 'react';

import { DefaultChatTransport, isToolUIPart } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtom } from 'jotai';
import { useParams, usePathname, useRouter } from 'next/navigation';

import { capture } from '~/core/analytics';
import { hasPendingClientToolCall, shouldResubmitAfterClientExecution } from '~/core/chat/client-tools';
import { useEditDispatcher } from '~/core/chat/edit-dispatcher';
import { ENTITY_ID_REGEX } from '~/core/chat/limits';
import type { NavigateOutput, OpenReviewPanelOutput } from '~/core/chat/nav-types';
import { type PreloadedEntity, usePreloadedEntity } from '~/core/chat/preload';
import { useReadDispatcher } from '~/core/chat/read-dispatcher';
import { useResearchDispatcher } from '~/core/chat/research-dispatcher';
import { useWebFetchDispatcher } from '~/core/chat/web-fetch-dispatcher';
import { useSpace } from '~/core/hooks/use-space';
import { assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';
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

// Guard router.push against hallucinated id shapes.
function validId(value: string | undefined): value is string {
  return typeof value === 'string' && ENTITY_ID_REGEX.test(value);
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
  const [isOpen, setIsOpen] = useAtom(isChatOpenAtom);
  const [seed, setSeed] = useAtom(assistantSeedAtom);
  const [input, setInput] = React.useState('');

  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const { editable } = useEditable();
  const { setIsReviewOpen, bumpReviewVersion } = useDiff();
  const conversationIdRef = React.useRef(createTrackingId('conversation'));

  const currentSpaceId = typeof params?.['id'] === 'string' ? params['id'] : null;
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

  const { messages, sendMessage, status, error, regenerate, setMessages, stop, addToolResult, clearError } = useChat({
    transport,
    sendAutomaticallyWhen: state => !stoppedRef.current && shouldResubmitAfterClientExecution(state),
  });

  // Every request-level chat error (4xx/5xx from /api/chat, network failure,
  // mid-stream Anthropic error) surfaces through the global StatusBar modal —
  // the same surface publish failures use. Deduped by Error instance so
  // re-renders don't re-fire the same error.
  const reportError = useReportError();
  const reportedErrorRef = React.useRef<Error | null>(null);
  const regenerateRef = React.useRef(regenerate);
  regenerateRef.current = regenerate;
  React.useEffect(() => {
    if (!error) {
      reportedErrorRef.current = null;
      return;
    }
    if (reportedErrorRef.current === error) return;
    reportedErrorRef.current = error;
    reportError(describeChatError(error), () => regenerateRef.current());
  }, [error, reportError]);

  addToolResultRef.current = addToolResult as unknown as (args: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => void;

  // Wait for the server-side `navigate` tool to validate the target so
  // hallucinated ids don't slip through to router.push.
  const navigatedToolCallIds = React.useRef(new Set<string>());
  // Auto-navigate after a successful createEntity. Dedup by toolCallId.
  const navigatedCreatedEntityToolCallIds = React.useRef(new Set<string>());

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
    if (status !== 'ready') return;
    if (shouldResubmitAfterClientExecution({ messages })) return;
    if (routeEntityId !== null) return;

    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;

    // Status briefly hits 'ready' between steps; wait for the dispatcher's
    // pending tools so we don't navigate before addCollectionItem marks the
    // new entity as block-bound.
    const hasPendingTool = lastAssistant.parts.some(p => {
      if (!isToolUIPart(p)) return false;
      return p.state === 'input-streaming' || p.state === 'input-available';
    });
    if (hasPendingTool) return;

    const blockBoundEntityIds = new Set<string>();
    for (const part of lastAssistant.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.type !== 'tool-addCollectionItem') continue;
      if (part.state !== 'output-available') continue;
      const input = (part as { input?: { entityId?: unknown } }).input;
      if (input && typeof input.entityId === 'string') blockBoundEntityIds.add(input.entityId);
    }

    let navigateTarget: { entityId: string; spaceId: string } | null = null;
    for (const part of lastAssistant.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.type !== 'tool-createEntity') continue;
      if (part.state !== 'output-available') continue;
      if (navigatedCreatedEntityToolCallIds.current.has(part.toolCallId)) continue;
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
      // Mark only after every guard passes so a malformed create can't
      // poison the dedup set.
      navigatedCreatedEntityToolCallIds.current.add(part.toolCallId);
      if (blockBoundEntityIds.has(entityId)) continue;
      // First wins: keep the primary entity, ignore later secondary creates.
      if (navigateTarget === null) navigateTarget = { entityId, spaceId };
    }

    if (navigateTarget) {
      router.push(NavUtils.toEntity(navigateTarget.spaceId, navigateTarget.entityId));
    }
  }, [messages, status, router, routeEntityId]);

  // Dedup so re-renders don't re-open after the user dismisses.
  const openedReviewPanelToolCallIds = React.useRef(new Set<string>());
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

  const handleNewChat = () => {
    if (isBusy) stopAndScrub();
    setMessages([]);
    setInput('');
    clearError();
    modeRef.current = 'default';
    stoppedRef.current = false;
    conversationIdRef.current = createTrackingId('conversation');
  };

  // Bails while busy so a stuck seed retries once the current turn settles.
  React.useEffect(() => {
    if (!seed) return;
    if (isBusy) return;
    modeRef.current = seed.mode;
    stoppedRef.current = false;
    const text = `Please ingest this URL into this space and stage the entities: ${seed.url}`;
    trackAssistantMessage(text, 'typed');
    sendMessage({ text });
    setSeed(null);
  }, [seed, isBusy, sendMessage, setSeed, trackAssistantMessage]);

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
        if (event.isComposing) return;
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
  }, [closeAssistant, isBusy, isOpen, openAssistant, stopAndScrub]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isBusy) return;
    stoppedRef.current = false;
    trackAssistantMessage(text, 'typed');
    sendMessage({ text });
    setInput('');
  };

  const handleSuggestion = (text: string, source: AssistantSuggestionSource) => {
    if (isBusy) return;
    stoppedRef.current = false;
    trackAssistantMessage(text, 'option_click', source);
    sendMessage({ text });
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen ? (
          <ChatPanel
            key="panel"
            messages={messages}
            status={status}
            error={error}
            isBusy={isBusy}
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            onStop={stopAndScrub}
            onSuggestion={handleSuggestion}
            onNewChat={handleNewChat}
            onClose={() => closeAssistant('header_button')}
            suppressWelcome={seed !== null || (status === 'submitted' && messages.length === 0)}
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
            className="fixed right-4 bottom-4 z-1100 flex size-10 items-center justify-center rounded-full border border-grey-02 bg-white text-text shadow-lg transition-colors hover:border-text"
          >
            <AssistantSparkle size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
