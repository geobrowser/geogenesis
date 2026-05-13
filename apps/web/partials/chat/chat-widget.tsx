'use client';

import { useChat } from '@ai-sdk/react';

import * as React from 'react';

import { DefaultChatTransport, isToolUIPart } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtom } from 'jotai';
import { useParams, usePathname, useRouter } from 'next/navigation';

import { capture } from '~/core/analytics';
import { shouldResubmitAfterClientExecution } from '~/core/chat/client-tools';
import { useEditDispatcher } from '~/core/chat/edit-dispatcher';
import { ENTITY_ID_REGEX, isHistoryFull, isHistoryFullError } from '~/core/chat/limits';
import type { NavigateOutput, OpenReviewPanelOutput } from '~/core/chat/nav-types';
import { type PreloadedEntity, usePreloadedEntity } from '~/core/chat/preload';
import { useReadDispatcher } from '~/core/chat/read-dispatcher';
import { useResearchDispatcher } from '~/core/chat/research-dispatcher';
import { useSpace } from '~/core/hooks/use-space';
import { isChatOpenAtom } from '~/core/state/chat-store';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
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

export function ChatWidget() {
  const [isOpen, setIsOpen] = useAtom(isChatOpenAtom);
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

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({ context: contextRef.current, preloadedEntity: preloadedEntityRef.current }),
      }),
    []
  );

  // Ref breaks the construction cycle: dispatchers capture it, useChat fills
  // it in. Typing erased for shared-codepath compatibility.
  const addToolResultRef = React.useRef<((args: { tool: string; toolCallId: string; output: unknown }) => void) | null>(
    null
  );

  const { messages, sendMessage, status, error, regenerate, setMessages, stop, addToolResult } = useChat({
    transport,
    // Resubmit after a client-tool result so the model reacts to its output.
    sendAutomaticallyWhen: shouldResubmitAfterClientExecution,
  });

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

  // Route to the newly created entity once the turn settles — unless the same
  // turn also adds it to a data block via `addCollectionItem`, in which case
  // the user is populating a block on the current page and shouldn't navigate
  // away. Last non-block-bound creation wins.
  React.useEffect(() => {
    if (status !== 'ready') return;
    if (shouldResubmitAfterClientExecution({ messages })) return;

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
      navigateTarget = { entityId, spaceId };
    }

    if (navigateTarget) {
      router.push(NavUtils.toEntity(navigateTarget.spaceId, navigateTarget.entityId));
    }
  }, [messages, status, router]);

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

  const isBusy = status === 'submitted' || status === 'streaming';

  const isFull = React.useMemo(() => isHistoryFull(messages) || isHistoryFullError(error), [messages, error]);

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

  const handleNewChat = () => {
    if (isBusy) stop();
    setMessages([]);
    setInput('');
    conversationIdRef.current = createTrackingId('conversation');
  };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') {
        closeAssistant('escape_key');
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
  }, [closeAssistant, isOpen, openAssistant]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isBusy || isFull) return;
    trackAssistantMessage(text, 'typed');
    sendMessage({ text });
    setInput('');
  };

  const handleSuggestion = (text: string, source: AssistantSuggestionSource) => {
    if (isBusy || isFull) return;
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
            isFull={isFull}
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            onSuggestion={handleSuggestion}
            onRetry={() => regenerate()}
            onNewChat={handleNewChat}
            onClose={() => closeAssistant('header_button')}
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
