'use client';

import * as React from 'react';

import { AnimatePresence, motion, useIsPresent } from 'framer-motion';

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

/** The ease for hub motion the viewer is meant to follow rather than merely not notice. */
export const HUB_EASE = [0.4, 0, 0.2, 1] as const;

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
export const HUB_CARD_EXIT_TRANSITION = { duration: 0.22, ease: HUB_EASE } as const;

/**
 * One item of a set handing over to the next (the Today's claims callout, GEO-3581). The arrival and
 * the height easing around it share this, so they read as one movement after the exit.
 */
export const HUB_STEP_TRANSITION = { duration: 0.24, ease: HUB_EASE } as const;

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

const HUB_SWAP_MOTION = {
  /** Two states of the same region — skeleton to content, tab to tab. */
  fade: {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: HUB_SWAP_TRANSITION,
  },
  /**
   * The answered item goes left and the next comes in from the right, so the move reads as "next"
   * rather than as the content being swapped. Under the hub's `reducedMotion="user"` the slide drops
   * out and only the fades are left.
   */
  step: {
    initial: { opacity: 0, x: 16 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -16, transition: HUB_CARD_EXIT_TRANSITION },
    transition: HUB_STEP_TRANSITION,
  },
} as const;

/** Swaps a region's content when `activeKey` changes: the old content leaves before the new arrives. */
export function HubSwap({
  activeKey,
  variant = 'fade',
  children,
}: {
  activeKey: string;
  variant?: keyof typeof HUB_SWAP_MOTION;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <HubSwapItem key={activeKey} variant={variant}>
        {children}
      </HubSwapItem>
    </AnimatePresence>
  );
}

/**
 * A step's leaving item is inert, not just unclickable: a pill still focused on the answered card
 * would otherwise take Enter on its way out, and pressing the side you hold withdraws it.
 */
function HubSwapItem({ variant, children }: { variant: keyof typeof HUB_SWAP_MOTION; children: React.ReactNode }) {
  const isPresent = useIsPresent();
  return (
    <motion.div {...HUB_SWAP_MOTION[variant]} inert={variant === 'step' && !isPresent}>
      {children}
    </motion.div>
  );
}
