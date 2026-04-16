'use client';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { motion } from 'framer-motion';
import { useAtom, useSetAtom } from 'jotai';

import { chatSizeAtom, isChatOpenAtom } from '~/core/state/chat-store';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';
import { CreateSmall } from '~/design-system/icons/create-small';

import { ChatInput } from './chat-input';
import { ChatMessages } from './chat-messages';
import { ChatWelcome } from './chat-welcome';

type Props = {
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error?: Error;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onSuggestion: (text: string) => void;
  onRetry: () => void;
  onNewChat: () => void;
};

export function ChatPanel({
  messages,
  status,
  error,
  input,
  onInputChange,
  onSend,
  onSuggestion,
  onRetry,
  onNewChat,
}: Props) {
  const setIsOpen = useSetAtom(isChatOpenAtom);
  const [size, setSize] = useAtom(chatSizeAtom);

  const isBusy = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;
  const isExpanded = size === 'expanded';

  return (
    <motion.div
      role="region"
      aria-label="Geo assistant"
      initial={{ opacity: 0, y: 16, scale: 0.96, width: isExpanded ? 480 : 320, height: isExpanded ? 600 : 400 }}
      animate={{ opacity: 1, y: 0, scale: 1, width: isExpanded ? 480 : 320, height: isExpanded ? 600 : 400 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      style={{ transformOrigin: 'bottom right' }}
      className="fixed right-4 bottom-4 z-100 flex flex-col overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-grey-02 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <AssistantSparkle />
          <div className="text-chatMedium text-text">Assistant</div>
        </div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onNewChat}
              aria-label="New chat"
              className="text-grey-03 transition-colors hover:text-text"
            >
              <CreateSmall />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSize(isExpanded ? 'default' : 'expanded')}
            aria-label={isExpanded ? 'Shrink assistant' : 'Expand assistant'}
            className="text-grey-03 transition-colors hover:text-text"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              {isExpanded ? (
                <>
                  <path d="M13.5 6H10V2.5" stroke="currentColor" />
                  <path d="M10 6L14 2" stroke="currentColor" />
                  <path d="M2.5 10H6V13.5" stroke="currentColor" />
                  <path d="M6 10L2 14" stroke="currentColor" />
                </>
              ) : (
                <>
                  <path d="M11 1.5H14.5V5" stroke="currentColor" />
                  <path d="M14.5002 1.5L10 6" stroke="currentColor" />
                  <path d="M5 14.5L1.5 14.5L1.5 11" stroke="currentColor" />
                  <path d="M6 10L1.5 14.5" stroke="currentColor" />
                </>
              )}
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close assistant"
            className="text-grey-03 transition-colors hover:text-text"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 14L14 2" stroke="currentColor" />
              <path d="M2 2L14 14" stroke="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {hasMessages ? (
        <ChatMessages
          messages={messages}
          status={status}
          error={error}
          onRetry={onRetry}
          onSuggestion={onSuggestion}
          disabled={isBusy}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <ChatWelcome onSuggestion={onSuggestion} disabled={isBusy} />
        </div>
      )}

      <ChatInput
        value={input}
        onChange={onInputChange}
        onSubmit={onSend}
        disabled={isBusy}
        placeholder={hasMessages ? 'Ask anything...' : 'What are you trying to do?'}
      />
    </motion.div>
  );
}
