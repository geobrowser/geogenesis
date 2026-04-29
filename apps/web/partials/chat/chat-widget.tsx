'use client';

import { useChat } from '@ai-sdk/react';

import * as React from 'react';

import { DefaultChatTransport, isToolUIPart } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtom } from 'jotai';
import { useParams, usePathname, useRouter } from 'next/navigation';

import { useEditDispatcher } from '~/core/chat/edit-dispatcher';
import { ENTITY_ID_REGEX, isHistoryFull, isHistoryFullError } from '~/core/chat/limits';
import type { NavigateOutput, OpenReviewPanelOutput } from '~/core/chat/nav-types';
import { useSpace } from '~/core/hooks/use-space';
import { isChatOpenAtom } from '~/core/state/chat-store';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
import { NavUtils } from '~/core/utils/utils';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

import { ChatPanel } from './chat-panel';

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

export function ChatWidget() {
  const [isOpen, setIsOpen] = useAtom(isChatOpenAtom);
  const [input, setInput] = React.useState('');

  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const { editable } = useEditable();
  const { setIsReviewOpen, bumpReviewVersion } = useDiff();

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

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({ context: contextRef.current }),
      }),
    []
  );

  const { messages, sendMessage, status, error, regenerate, setMessages, stop } = useChat({
    transport,
  });

  // Navigate only after the server-side `navigate` tool validates the target.
  // Acting on the raw tool call would fire before getSpace runs, which lets
  // hallucinated / topic-entity ids slip through to router.push and 404.
  const navigatedToolCallIds = React.useRef(new Set<string>());
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

  useEditDispatcher(messages);

  const isBusy = status === 'submitted' || status === 'streaming';

  // "Full" = locally over the threshold OR server returned a 413 history-full error.
  const isFull = React.useMemo(() => isHistoryFull(messages) || isHistoryFullError(error), [messages, error]);

  const handleNewChat = () => {
    if (isBusy) stop();
    setMessages([]);
    setInput('');
  };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        // Don't hijack the shortcut mid-IME composition — the user is typing a
        // character, not firing a command, and preventDefault would swallow
        // the commit.
        if (event.isComposing) return;
        event.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setIsOpen]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isBusy || isFull) return;
    sendMessage({ text });
    setInput('');
  };

  const handleSuggestion = (text: string) => {
    if (isBusy || isFull) return;
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
          />
        ) : (
          <motion.button
            type="button"
            key="fab"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsOpen(true)}
            aria-label="Open assistant"
            className="fixed right-4 bottom-4 z-100 flex size-10 items-center justify-center rounded-full border border-grey-02 bg-white text-text shadow-lg transition-colors hover:border-text"
          >
            <AssistantSparkle size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
