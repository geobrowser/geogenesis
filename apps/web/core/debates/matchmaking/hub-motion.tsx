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
 * Longer than the two above, and deliberately so.
 *
 * A row leaving is the one piece of hub motion the viewer is meant to *read* rather than merely not
 * notice: it is the only one that says something happened. At 0.12s an opacity fade is a blink, and
 * a claim folding out of Explore because you just answered it (GEO-2863) looked like the list had
 * dropped it. Long enough to follow, still inside the window where it reads as a response to the
 * press rather than as an animation being played at you.
 *
 * The gap closes on {@link HUB_LAYOUT_TRANSITION} underneath, which is shorter on purpose: the rows
 * below should be settled by the time the ghost has finished going, or the list looks like it is
 * still moving after the thing that moved it has gone.
 */
export const HUB_CARD_EXIT_TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] } as const;

/**
 * `pointerEvents` is disabled on the way out so a card that is mid-fade can't take a click on a
 * button that is about to disappear.
 */
export const hubCardMotion = {
  layout: 'position',
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, pointerEvents: 'auto' },
  // Scaled as well as faded, because `popLayout` takes the row out of flow the moment it starts
  // leaving: the gap below it closes on its own, so shrinking is the only thing left that can make
  // the card read as folding away rather than as having been deleted.
  exit: { opacity: 0, scale: 0.97, pointerEvents: 'none', transition: HUB_CARD_EXIT_TRANSITION },
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
