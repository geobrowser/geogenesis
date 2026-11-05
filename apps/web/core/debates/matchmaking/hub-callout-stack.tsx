'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';

import { ResizableContainer } from '~/design-system/resizable-container';

import { hubAnalyticsAttributes } from './hub-analytics';
import { HUB_CALLOUT_SURFACE_CLASS_NAME } from './hub-callout';
import { HUB_CARD_EXIT_TRANSITION, HUB_STEP_TRANSITION } from './hub-motion';

/** The surface a card is drawn on, which its edge behind the top card takes too. */
export type HubStackSurface = 'light' | 'tint' | 'dark';

export type HubStackCard = {
  /** Stable for as long as the card is in the stack: it is what the top card animates on. No newlines. */
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
 * Taken from the stack's bottom margin (12px, as a single callout's) for the lowest edge's tap target,
 * so the tabs sit where they would without it.
 */
const EDGE_TAP_PX = 8;

/**
 * How long after a press in the stack a card leaving still counts as that press's doing: the RSVP
 * pause and an exit, with room to spare.
 */
const PRESS_FOCUS_WINDOW_MS = 2_000;

/**
 * Each edge on its card's own surface (`HUB_CALLOUT_SURFACE_CLASS_NAME`), a shade off so two of the
 * same kind still part. Behind a dark card, a lighter dark: the live card's own black would read as
 * the card running on.
 */
const EDGE_CLASS_NAME: Record<HubStackSurface, string> = {
  light: cx(HUB_CALLOUT_SURFACE_CLASS_NAME.light, 'hover:bg-grey-01'),
  tint: cx(HUB_CALLOUT_SURFACE_CLASS_NAME.tint, 'brightness-95 hover:brightness-90'),
  dark: 'bg-[#2b2b2b] hover:bg-[#363636]',
};

/**
 * GEO-3586. The callouts above the debates panel's tabs as a stack: the first card in full, and the
 * edges of up to {@link HUB_STACK_MAX_EDGES} more beneath it, so a live or upcoming lobby and Today's
 * claims are all in view without each taking a card's height.
 *
 * The stack only draws the cards: each one dismisses itself, and leaves `cards` when it does. The
 * top card then slides away and the next comes up in its place, the height easing between them so
 * the tabs below glide. Pressing an edge brings that card to the top, until `cards` changes. One
 * card is drawn alone, as a single callout always was.
 */
export function HubCalloutStack({ cards }: { cards: HubStackCard[] }) {
  const ids = React.useMemo(() => cards.map(card => card.id), [cards]);
  const order = ids.join('\n');
  // The card brought forward from its edge, and the stack's own order when it was. Any change to that
  // order — a lobby going live, a card dismissed or added — puts the stack's own first card back on
  // top, so a card brought forward can't hold a live lobby under it.
  // Cleared, not just ignored, so the order coming back (a card added, then gone again) can't put the
  // card brought forward back on top long after it was.
  const [front, setFront] = React.useState<{ id: string; order: string } | null>(null);
  if (front !== null && front.order !== order) setFront(null);
  const frontId = front?.order === order ? front.id : null;
  const ordered = React.useMemo(() => {
    const index = frontId === null ? -1 : cards.findIndex(card => card.id === frontId);
    if (index <= 0) return cards;
    return [cards[index], ...cards.slice(0, index), ...cards.slice(index + 1)];
  }, [cards, frontId]);

  // A press in the stack (an edge, a card's own X, an RSVP that sends the card on) takes the focused
  // control away with the card: focus then goes to the card that comes up, once the leaving one has
  // gone (`mode="wait"`), rather than to the page. Only for a card leaving soon after the press, so a
  // press that changed nothing can't pull focus back here when something else moves the stack later.
  const pressedAt = React.useRef<number | null>(null);
  const claimFocus = React.useRef(false);

  const [top, ...rest] = ordered;
  const edges = rest.slice(0, HUB_STACK_MAX_EDGES);

  // The last card plays its exit too, before the stack draws nothing at all.
  const [drained, setDrained] = React.useState(!top);
  if (top && drained) setDrained(false);

  const onExitComplete = () => {
    // Lost, or still on the leaving card's control: it is inert, and on its way out of the page.
    const active = document.activeElement;
    const lost =
      active === null || active === document.body || !active.isConnected || active.closest('[inert]') !== null;
    const recent = pressedAt.current !== null && Date.now() - pressedAt.current < PRESS_FOCUS_WINDOW_MS;
    claimFocus.current = recent && lost;
    pressedAt.current = null;
    if (!top) setDrained(true);
  };

  if (!top && drained) return null;

  return (
    <div
      className={cx('mx-4 shrink-0', !top ? 'mb-0' : edges.length > 0 ? 'mb-1' : 'mb-3')}
      data-testid="hub-callout-stack"
      onClickCapture={() => {
        pressedAt.current = Date.now();
      }}
    >
      <ResizableContainer transition={HUB_STEP_TRANSITION} growOnMount={false}>
        <div
          className="relative transition-[padding] duration-200"
          style={{ paddingBottom: edges.length > 0 ? edges.length * EDGE_DROP_PX + EDGE_TAP_PX : 0 }}
        >
          {/* `custom` reaches a leaving card: one still in the stack was sent back under, rather than
              dismissed, and sinks rather than sliding away. */}
          <AnimatePresence mode="wait" initial={false} custom={ids} onExitComplete={onExitComplete}>
            {top ? (
              <StackTop key={top.id} id={top.id} claimFocus={claimFocus}>
                {top.content}
              </StackTop>
            ) : null}
          </AnimatePresence>
          {/* After the top card, so it is read and tabbed to first; stacked under it by z-index. */}
          {edges.map((card, index) => {
            const depth = index + 1;
            const last = depth === edges.length;
            return (
              <button
                key={card.id}
                type="button"
                aria-label={`Show ${card.label}`}
                onClick={() => setFront({ id: card.id, order })}
                {...hubAnalyticsAttributes('Callout stack show card')}
                className={cx(
                  'absolute top-0 rounded-lg transition-[left,right,bottom,background-color,filter] duration-200',
                  EDGE_CLASS_NAME[card.surface],
                  // The lowest edge reaches on down into the gap under the stack, so its tap target
                  // is more than the sliver that shows.
                  last && 'after:absolute after:inset-x-0 after:top-full after:h-2'
                )}
                style={{
                  left: depth * EDGE_INSET_PX,
                  right: depth * EDGE_INSET_PX,
                  bottom: (edges.length - depth) * EDGE_DROP_PX + EDGE_TAP_PX,
                  zIndex: HUB_STACK_MAX_EDGES - index,
                }}
              />
            );
          })}
        </div>
      </ResizableContainer>
    </div>
  );
}

/**
 * The card on top. Inert on its way out, as a step of the Today's claims callout is: a control still
 * focused on it would otherwise take a press it can no longer show. Focused on arrival when the press
 * that brought it up took the focus with the card before it.
 */
function StackTop({
  id,
  claimFocus,
  children,
}: {
  id: string;
  claimFocus: React.RefObject<boolean>;
  children: React.ReactNode;
}) {
  const isPresent = useIsPresent();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!claimFocus.current) return;
    claimFocus.current = false;
    ref.current?.focus({ preventScroll: true });
  }, [claimFocus]);
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
      ref={ref}
      tabIndex={-1}
      className="relative z-10 outline-none"
    >
      {children}
    </motion.div>
  );
}
