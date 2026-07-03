'use client';

import { useDataChannel } from '@livekit/components-react';

import * as React from 'react';

import { AnimatePresence, motion } from 'framer-motion';

const EMOJIS = ['👍', '❤️', '😂', '🎉', '👏'];
const REACTIONS_TOPIC = 'reactions';
const REACTION_TTL_MS = 3000;

type Floater = { id: string; emoji: string; left: number };

/** Floating emoji reactions over the call grid — LiveKit's unreliable data channel, lossy by design. */
export function useReactions() {
  const [floaters, setFloaters] = React.useState<Floater[]>([]);

  const addFloater = React.useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setFloaters(prev => [...prev, { id, emoji, left: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloaters(prev => prev.filter(f => f.id !== id)), REACTION_TTL_MS);
  }, []);

  const { send } = useDataChannel(REACTIONS_TOPIC, msg => {
    try {
      const decoded = JSON.parse(new TextDecoder().decode(msg.payload));
      if (typeof decoded?.emoji === 'string') addFloater(decoded.emoji);
    } catch {
      // ignore malformed payloads
    }
  });

  const sendReaction = React.useCallback(
    (emoji: string) => {
      addFloater(emoji);
      send(new TextEncoder().encode(JSON.stringify({ emoji })), { reliable: false });
    },
    [send, addFloater]
  );

  return { floaters, sendReaction };
}

export function ReactionsOverlay({ floaters }: { floaters: Floater[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {floaters.map(f => (
          <motion.span
            key={f.id}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -160 }}
            exit={{ opacity: 0 }}
            transition={{ duration: REACTION_TTL_MS / 1000, ease: 'easeOut' }}
            className="absolute bottom-16 text-3xl"
            style={{ left: `${f.left}%` }}
          >
            {f.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ReactionsButton({ onSend }: { onSend: (emoji: string) => void }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Send a reaction"
        className="flex size-8 items-center justify-center rounded-md bg-grey-01 text-grey-04"
      >
        🙂
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 flex gap-1 rounded-md border border-grey-02 bg-white p-1 shadow-lg">
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSend(emoji);
                setOpen(false);
              }}
              className="rounded p-1 text-lg hover:bg-grey-01"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
