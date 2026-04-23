'use client';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { isTextUIPart } from 'ai';
import { motion } from 'framer-motion';
import { useAtom, useSetAtom } from 'jotai';

import {
  DEFAULT_CHAT_SIZE,
  EXPANDED_CHAT_SIZE,
  MIN_CHAT_HEIGHT,
  MIN_CHAT_WIDTH,
  chatSizeAtom,
  isChatOpenAtom,
} from '~/core/state/chat-store';

import { ChevronDown } from '~/design-system/icons/chevron-down';
import { Context } from '~/design-system/icons/context';
import { Menu, MenuItem } from '~/design-system/menu';

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

type ResizeAxis = 'x' | 'y' | 'xy';

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
  const [menuOpen, setMenuOpen] = React.useState(false);

  const isBusy = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;
  // "Expand" only appears at the default size. Any other size — the expanded
  // preset or a custom drag-resized one — shows "Collapse" so the user always
  // has a one-click path back to the small default.
  const isAtDefault = size.width === DEFAULT_CHAT_SIZE.width && size.height === DEFAULT_CHAT_SIZE.height;

  const togglePreset = () => setSize(isAtDefault ? EXPANDED_CHAT_SIZE : DEFAULT_CHAT_SIZE);

  const handleCopyChat = async () => {
    const transcript = formatTranscript(messages);
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
    } catch {
      // Clipboard API unavailable; silently no-op.
    }
  };

  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    axis: ResizeAxis;
  } | null>(null);

  const startResize = (axis: ResizeAxis) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startW: size.width,
      startH: size.height,
      axis,
    };
  };

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // On very narrow viewports innerWidth may fall below MIN_CHAT_WIDTH, which
    // would invert the clamp bounds. Keep the minimum as the floor.
    const maxW = Math.max(MIN_CHAT_WIDTH, window.innerWidth - 16);
    const maxH = Math.max(MIN_CHAT_HEIGHT, window.innerHeight - 16);
    const dx = drag.startX - event.clientX;
    const dy = drag.startY - event.clientY;
    const nextW = drag.axis !== 'y' ? clamp(drag.startW + dx, MIN_CHAT_WIDTH, maxW) : drag.startW;
    const nextH = drag.axis !== 'x' ? clamp(drag.startH + dy, MIN_CHAT_HEIGHT, maxH) : drag.startH;
    setSize({ width: nextW, height: nextH });
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if ((event.currentTarget as HTMLElement).hasPointerCapture?.(event.pointerId)) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
  };

  return (
    <motion.div
      role="region"
      aria-label="Geo assistant"
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      style={{ transformOrigin: 'bottom right', width: size.width, height: size.height }}
      className="fixed right-4 bottom-4 z-100 flex flex-col overflow-hidden rounded-[20px] border border-grey-02 bg-white shadow-[0px_20px_20px_0px_rgba(0,0,0,0.04)]"
    >
      <ResizeHandle
        className="absolute inset-y-2 left-0 w-1 cursor-ew-resize"
        onStart={startResize('x')}
        onMove={onResizeMove}
        onEnd={endResize}
      />
      <ResizeHandle
        className="absolute inset-x-2 top-0 h-1 cursor-ns-resize"
        onStart={startResize('y')}
        onMove={onResizeMove}
        onEnd={endResize}
      />
      <ResizeHandle
        className="absolute top-0 left-0 size-3 cursor-nwse-resize"
        onStart={startResize('xy')}
        onMove={onResizeMove}
        onEnd={endResize}
      />

      <div className="flex shrink-0 items-center justify-between p-4">
        <div className="text-[16px] leading-4 tracking-[-0.35px] text-text">Assistant</div>
        <div className="flex items-center gap-5 text-text">
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            className="max-w-[180px]"
            side="bottom"
            align="end"
            asChild
            trigger={
              <button
                type="button"
                aria-label="Assistant actions"
                className="flex size-4 items-center justify-center text-text transition-colors hover:text-grey-04"
              >
                <Context />
              </button>
            }
          >
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onNewChat();
              }}
            >
              New chat
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                void handleCopyChat();
              }}
            >
              Copy chat
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                togglePreset();
              }}
            >
              {isAtDefault ? 'Expand' : 'Collapse'}
            </MenuItem>
          </Menu>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close assistant"
            className="flex size-4 items-center justify-center text-text transition-colors hover:text-grey-04"
          >
            <ChevronDown />
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
        <ChatWelcome onSuggestion={onSuggestion} disabled={isBusy} />
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

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function formatTranscript(messages: UIMessage[]): string {
  const turns = messages
    .map(message => {
      const text = message.parts
        .filter(isTextUIPart)
        .map(part => part.text)
        .join('')
        .trim();
      if (!text) return null;
      const label = message.role === 'user' ? 'You' : 'Assistant';
      return `**${label}:** ${text}`;
    })
    .filter((turn): turn is string => turn !== null);
  return turns.join('\n\n');
}

type ResizeHandleProps = {
  className: string;
  onStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
};

function ResizeHandle({ className, onStart, onMove, onEnd }: ResizeHandleProps) {
  return (
    <div
      className={`${className} z-10 touch-none select-none`}
      onPointerDown={onStart}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
    />
  );
}
