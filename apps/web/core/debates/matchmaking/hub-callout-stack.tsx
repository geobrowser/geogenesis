'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';

import { ResizableContainer } from '~/design-system/resizable-container';

import { hubAnalyticsAttributes } from './hub-analytics';
import { HUB_CARD_EXIT_TRANSITION, HUB_STEP_TRANSITION } from './hub-motion';

/** The surface a card is drawn on, which its edge behind the top card takes too. */
export type HubStackSurface = 'light' | 'tint' | 'dark';

export type HubStackCard = {
  /** Stable for as long as the card is in the stack: it is what the top card animates on. */
  id: string;
  surface: HubStackSurface;
  /** Names the card's edge, "Show <label>", for a viewer who can't see it. */
  label: string;
  content: React.ReactNode;
};

/** How many cards show an edge under the top one. Any more wait out of sight. */
export const HUB_STACK_MAX_EDGES = 2;

/** How far each edge drops below the one above it, and how far in from the sides it is drawn. */
const EDGE_DROP_PX = 7;
const EDGE_INSET_PX = 10;

/**
 * Each edge on its card's own surface, a shade off so two of the same kind still part. Behind a dark
 * card, a lighter dark: the same black would read as the card running on.
 */
const EDGE_CLASS_NAME: Record<HubStackSurface, string> = {
  light: 'border border-grey-02 bg-white hover:bg-grey-01',
  tint: 'bg-purple-tint brightness-95 hover:brightness-90',
  dark: 'bg-[#2b2b2b] hover:bg-[#363636]',
};

/**
 * GEO-3586. The callouts above the debates panel's tabs as a stack: the first card in full, and the
 * edges of up to {@link HUB_STACK_MAX_EDGES} more beneath it, so a live or upcoming lobby and Today's
 * claims are all in view without each taking a card's height.
 *
 * The stack only draws the cards: each one dismisses itself, and leaves `cards` when it does. The
 * top card then slides away and the next comes up in its place, the height easing between them so
 * the tabs below glide. Pressing an edge brings that card to the top, until `cards` changes order
 * on its own. One card is drawn alone, as a single callout always was.
 */
export function HubCalloutStack({ cards }: { cards: HubStackCard[] }) {
  // The card brought forward from its edge, while it is still in the stack.
  const [frontId, setFrontId] = React.useState<string | null>(null);
  const ordered = React.useMemo(() => {
    const index = frontId === null ? -1 : cards.findIndex(card => card.id === frontId);
    if (index <= 0) return cards;
    return [cards[index], ...cards.slice(0, index), ...cards.slice(index + 1)];
  }, [cards, frontId]);
  const ids = React.useMemo(() => cards.map(card => card.id), [cards]);

  const [top, ...rest] = ordered;
  const edges = rest.slice(0, HUB_STACK_MAX_EDGES);
  if (!top) return null;

  return (
    <div className="mx-4 mb-3 shrink-0" data-testid="hub-callout-stack">
      <ResizableContainer transition={HUB_STEP_TRANSITION} growOnMount={false}>
        <div
          className="relative transition-[padding] duration-200"
          style={{ paddingBottom: edges.length * EDGE_DROP_PX }}
        >
          {edges.map((card, index) => {
            const depth = index + 1;
            return (
              <button
                key={card.id}
                type="button"
                aria-label={`Show ${card.label}`}
                onClick={() => setFrontId(card.id)}
                {...hubAnalyticsAttributes('Callout stack show card')}
                className={cx(
                  'absolute top-0 rounded-lg transition-[left,right,bottom,background-color,filter] duration-200',
                  EDGE_CLASS_NAME[card.surface]
                )}
                style={{
                  left: depth * EDGE_INSET_PX,
                  right: depth * EDGE_INSET_PX,
                  bottom: (edges.length - depth) * EDGE_DROP_PX,
                  zIndex: HUB_STACK_MAX_EDGES - index,
                }}
              />
            );
          })}
          {/* `custom` reaches a leaving card: one still in the stack was sent back under, rather than
              dismissed, and sinks rather than sliding away. */}
          <AnimatePresence mode="wait" initial={false} custom={ids}>
            <StackTop key={top.id} id={top.id}>
              {top.content}
            </StackTop>
          </AnimatePresence>
        </div>
      </ResizableContainer>
    </div>
  );
}

/**
 * The card on top. Inert on its way out, as a step of the Today's claims callout is: a control still
 * focused on it would otherwise take a press it can no longer show.
 */
function StackTop({ id, children }: { id: string; children: React.ReactNode }) {
  const isPresent = useIsPresent();
  const variants = {
    initial: { opacity: 0, y: 6, scale: 0.98 },
    shown: { opacity: 1, x: 0, y: 0, scale: 1 },
    leaving: (ids: string[] | undefined) =>
      ids?.includes(id)
        ? { opacity: 0, y: 6, scale: 0.98, transition: HUB_CARD_EXIT_TRANSITION }
        : { opacity: 0, x: 24, transition: HUB_CARD_EXIT_TRANSITION },
  };

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="shown"
      exit="leaving"
      transition={HUB_STEP_TRANSITION}
      inert={!isPresent}
      className="relative z-10"
    >
      {children}
    </motion.div>
  );
}
