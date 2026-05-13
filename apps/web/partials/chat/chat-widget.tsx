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

// The model can hallucinate id shapes. Guard router.push so a bad tool call
// can't shove us onto a malformed URL.
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
      // The server-side tool resolves personalSpaceId from its context and
      // echoes it back as output.spaceId; no need to re-read client context.
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

  // On a space home page (`/space/{id}`) there's no `entityId` route param, but
  // the page renders the space's home entity (either `space.entity.id` or
  // `space.topicId` for topic spaces). Without this, the assistant's
  // `getEntity(spaceId)` call looks up the governance space, not the entity
  // whose blocks / values are on screen.
  const { space } = useSpace(routeEntityId === null ? (currentSpaceId ?? undefined) : undefined);
  const spaceHomeEntityId = space?.topicId || space?.entity?.id || null;
  const currentEntityId =
    routeEntityId ?? (spaceHomeEntityId && ENTITY_ID_REGEX.test(spaceHomeEntityId) ? spaceHomeEntityId : null);

  // Ref keeps context current without re-creating the transport instance on
  // every render.
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

  // Pre-fetch the current entity on panel open so the model can answer
  // "this entity"-style questions on turn 1 without a getEntity round-trip.
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

  // The dispatcher needs `addToolResult` to write outputs back, but useChat
  // returns it after construction. A ref breaks the cycle: the dispatcher
  // captures the ref, the ref is filled in after useChat returns.
  // Typing erased to `string` for `tool` because the dispatcher is shared
  // with non-UI codepaths; the cast at the assignment site is safe — at
  // runtime the function only looks at tool/toolCallId/output and forwards
  // them.
  const addToolResultRef = React.useRef<((args: { tool: string; toolCallId: string; output: unknown }) => void) | null>(
    null
  );

  const { messages, sendMessage, status, error, regenerate, setMessages, stop, addToolResult } = useChat({
    transport,
    // After the dispatcher writes a client-tool result, this returns true and
    // the SDK fires a fresh request so the model can react to the data — same
    // multi-step behavior server-executed tools get inside one stream.
    sendAutomaticallyWhen: shouldResubmitAfterClientExecution,
  });

  addToolResultRef.current = addToolResult as unknown as (args: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => void;

  // Navigate only after the server-side `navigate` tool validates the target.
  // Acting on the raw tool call would fire before getSpace runs, which lets
  // hallucinated / topic-entity ids slip through to router.push and 404.
  const navigatedToolCallIds = React.useRef(new Set<string>());
  // Auto-navigate to the newly minted entity after a successful createEntity
  // so the user can see what was staged. Same dedup pattern as the navigate /
  // review-panel watchers — toolCallId tracks "we've already routed for this
  // call" across re-renders.
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

  // After createEntity stages a new entity, route the user to its page so
  // they can see what was made — UNLESS the same turn also feeds that entity
  // into a data block via `addCollectionItem`, in which case the user is
  // populating a block on the current page and shouldn't be thrashed away
  // from it. Defer the decision until the turn settles (status === 'ready',
  // no client-tool resubmit pending, AND no client tool still in-flight on
  // the dispatcher), then check the latest assistant message for matching
  // `tool-addCollectionItem` calls. Last non-block-bound creation wins.
  React.useEffect(() => {
    if (status !== 'ready') return;
    if (shouldResubmitAfterClientExecution({ messages })) return;

    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;

    // Status briefly hits 'ready' between steps before the SDK resubmits, and
    // the client dispatcher may still be processing an `input-available` tool
    // call (e.g. addCollectionItem queued behind a resolved createEntity).
    // shouldResubmitAfterClientExecution returns false in that window because
    // not every tool in the *last step* is resolved yet — but acting now
    // would navigate before the upcoming addCollectionItem can mark the new
    // entity as block-bound.
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
      // Mark only after every guard passes — keeps the dedup set semantically
      // "tool calls we considered AND would navigate for", so a non-create or
      // invalid create can't poison the ref.
      navigatedCreatedEntityToolCallIds.current.add(part.toolCallId);
      if (blockBoundEntityIds.has(entityId)) continue;
      navigateTarget = { entityId, spaceId };
    }

    if (navigateTarget) {
      router.push(NavUtils.toEntity(navigateTarget.spaceId, navigateTarget.entityId));
    }
  }, [messages, status, router]);

  // Dedup by toolCallId so re-renders don't re-open after user dismisses.
  // bumpReviewVersion recomputes the diff from current staged state.
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

  // Order matters: edit-dispatcher's effect must enqueue apply tasks before
  // read-dispatcher's effect enqueues read tasks, so reads in the same step
  // observe the post-apply store.
  useEditDispatcher(messages, addToolResultRef);
  useReadDispatcher(messages, addToolResultRef);
  useResearchDispatcher(messages, addToolResultRef);

  const isBusy = status === 'submitted' || status === 'streaming';

  // "Full" = locally over the threshold OR server returned a 413 history-full error.
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
        // Don't hijack the shortcut mid-IME composition — the user is typing a
        // character, not firing a command, and preventDefault would swallow
        // the commit.
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
