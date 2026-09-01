'use client';

import * as React from 'react';

import { AnimatePresence, motion } from 'framer-motion';

/**
 * Shared motion vocabulary for the hub, matching what the rest of the app already uses:
 * `duration: 0.15` for layout shifts and `0.1` for swapping content.
 *
 * Cards use `layout="position"` rather than bare `layout` deliberately — card height changes when
 * an error or a footer button appears, and bare `layout` animates size by scaling, which smears
 * every plain (non-motion) child inside the card.
 */
export const HUB_LAYOUT_TRANSITION = { duration: 0.15 } as const;
export const HUB_SWAP_TRANSITION = { duration: 0.1 } as const;

/**
 * `pointerEvents` is disabled on the way out so a card that is mid-fade can't take a click on a
 * button that is about to disappear.
 */
export const hubCardMotion = {
  layout: 'position',
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, pointerEvents: 'auto' },
  exit: { opacity: 0, pointerEvents: 'none', transition: { duration: 0.12 } },
  transition: HUB_LAYOUT_TRANSITION,
} as const;

/**
 * A list whose rows reorder, arrive, and leave. `popLayout` pops an exiting row out of flow at
 * once, so the rows above it close the gap while it is still fading rather than after.
 */
export function HubCardList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className ?? 'flex flex-col gap-2'}>
      <AnimatePresence initial={false} mode="popLayout">
        {children}
      </AnimatePresence>
    </div>
  );
}

/**
 * The slot pinned above a tab's filters, holding at most one card — today the request you've sent.
 */
export function HubPinnedSlot({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.div
          key="hub-pinned-slot"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={HUB_LAYOUT_TRANSITION}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export const hubRowMotion = {
  layout: true,
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: HUB_LAYOUT_TRANSITION,
} as const;

/** Cross-fades between two states of the same region — skeleton to content, tab to tab. */
export function HubSwap({ activeKey, children }: { activeKey: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={HUB_SWAP_TRANSITION}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
