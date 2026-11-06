'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';

import { ResizableContainer } from '~/design-system/resizable-container';

import { hubAnalyticsAttributes } from './hub-analytics';
import { HUB_CALLOUT_SURFACE_CLASS_NAME } from './hub-callout';
import { HUB_CARD_EXIT_TRANSITION, HUB_EASE, HUB_STEP_TRANSITION } from './hub-motion';

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
 * Taken from the stack's bottom spacing (12px, as a single callout's) for the lowest edge's tap
 * target, so the tabs sit where they would without it.
 */
const EDGE_TAP_PX = 8;

/** How long the stack's height takes to ease to nothing once the last card has gone. */
const DRAIN_MS = HUB_STEP_TRANSITION.duration * 1000 + 40;

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
 * top card then slides off to the left over the next, which is already drawn in full underneath
 * and rises into its place from its edge, the height easing between them so the tabs below glide. Pressing an edge brings that card to the top, until `cards` changes. One
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

  const [top, ...rest] = ordered;
  const edges = rest.slice(0, HUB_STACK_MAX_EDGES);
  const topId = top?.id ?? null;

  // A card leaving keeps its room until it has slid off. `popLayout` lifts it out of the flow, so
  // the box would otherwise ease to the card coming up, or to nothing, and the clip would cut the
  // leaving card off part way. Held at the height from before it left; let go once it has gone.
  const box = React.useRef<HTMLDivElement>(null);
  const settledHeight = React.useRef(0);
  const [shownTopId, setShownTopId] = React.useState(topId);
  const [heldHeight, setHeldHeight] = React.useState<number | null>(null);
  if (shownTopId !== topId) {
    setShownTopId(topId);
    if (shownTopId !== null && heldHeight === null) setHeldHeight(settledHeight.current);
  }
  // Measured after every commit while nothing is held, so the height from before a change is to hand.
  React.useLayoutEffect(() => {
    if (heldHeight === null && box.current) settledHeight.current = box.current.offsetHeight;
  });

  // The last card plays its exit too, and the height eases to nothing, before the stack draws
  // nothing at all.
  const [drained, setDrained] = React.useState(!top);
  if (top && drained) setDrained(false);
  const drainTimer = React.useRef<number | null>(null);
  React.useEffect(() => () => window.clearTimeout(drainTimer.current ?? undefined), []);

  // A press in the stack (an edge, a card's own X, an RSVP that sends the card on) takes the focused
  // control away with the card: focus then goes to the card that came up, rather than to the page.
  // Only while focus was in the stack: it counts as out once it moves to anything outside, or the
  // viewer presses outside, but not when the focused control is merely removed or made inert.
  const root = React.useRef<HTMLDivElement>(null);
  const focusInside = React.useRef(false);
  const topElement = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const pressedOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !root.current?.contains(event.target)) focusInside.current = false;
    };
    document.addEventListener('pointerdown', pressedOutside, true);
    return () => document.removeEventListener('pointerdown', pressedOutside, true);
  }, []);

  const onExitComplete = () => {
    // Lost, or still on the leaving card's control: it is inert, and on its way out of the page.
    const active = document.activeElement;
    const lost =
      active === null || active === document.body || !active.isConnected || active.closest('[inert]') !== null;
    if (focusInside.current && lost) topElement.current?.focus({ preventScroll: true });
    setHeldHeight(null);
    if (!top) drainTimer.current = window.setTimeout(() => setDrained(true), DRAIN_MS);
  };

  if (!top && drained) return null;

  return (
    // The spacing above and below sits inside the clip, eased with the height rather than jumping,
    // and the space above gives a dismissed card room to tilt without its corner being cut off;
    // the negative margin keeps the stack where its first card would be.
    <div
      ref={root}
      className="-mt-3 shrink-0"
      data-testid="hub-callout-stack"
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={event => {
        const next = event.relatedTarget;
        if (next instanceof Node && !root.current?.contains(next)) focusInside.current = false;
      }}
    >
      {/* The gutters inside the clip too, so a dismissed card slides out to the panel's edge instead
          of being cut off at the card's. */}
      <ResizableContainer
        transition={HUB_STEP_TRANSITION}
        growOnMount={false}
        className={cx('px-4 pt-3', !top ? 'pb-0' : edges.length > 0 ? 'pb-1' : 'pb-3')}
      >
        {/* The room is held around the stack, not on it: the edges hang from the stack's own height,
            which is the card that came up, and would stretch to the held height with it. */}
        <div style={{ minHeight: heldHeight ?? undefined }} data-testid="hub-callout-stack-room">
          <div
            ref={box}
            className="relative transition-[padding] duration-200"
            style={{ paddingBottom: edges.length > 0 ? edges.length * EDGE_DROP_PX + EDGE_TAP_PX : 0 }}
          >
            {/* `popLayout`: the leaving card is lifted out of the flow as it starts to go, so the next
              is drawn underneath it straight away. `custom` reaches a leaving card: one still in the
              stack was sent back under, rather than dismissed, and sinks rather than sliding away. */}
            <AnimatePresence mode="popLayout" initial={false} custom={ids} onExitComplete={onExitComplete}>
              {top ? (
                <StackTop key={top.id} id={top.id} topElement={topElement}>
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
        </div>
      </ResizableContainer>
    </div>
  );
}

/**
 * The card on top. Inert on its way out, as a step of the Today's claims callout is: a control still
 * focused on it would otherwise take a press it can no longer show.
 *
 * Dismissed, it slides off to the left over the card that came up, fading only as it nears the edge,
 * like a card flicked off a pile. That one starts where its edge was, a little smaller and lower,
 * and rises into place. One sent back under instead sinks behind the card brought forward.
 */
function StackTop({
  id,
  topElement,
  ref: forwardedRef,
  children,
}: {
  id: string;
  /** Points at the card while it is the one on top, for focus to go to. */
  topElement: React.RefObject<HTMLDivElement | null>;
  /** `AnimatePresence`'s, which measures a leaving card to lift it out of the flow. */
  ref?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const isPresent = useIsPresent();
  const element = React.useRef<HTMLDivElement | null>(null);
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );
  React.useEffect(() => {
    if (isPresent) topElement.current = element.current;
  }, [isPresent, topElement]);

  const variants = {
    // Under the leaving card from the first frame: it is still at 10 until its exit lifts it to 20.
    rising: { opacity: 1, y: EDGE_DROP_PX, scale: 0.95, zIndex: 1 },
    shown: { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, zIndex: 10 },
    leaving: (ids: string[] | undefined) =>
      ids?.includes(id)
        ? { opacity: 0, y: EDGE_DROP_PX, scale: 0.95, zIndex: 0, transition: HUB_CARD_EXIT_TRANSITION }
        : {
            x: '-110%',
            rotate: -3,
            opacity: 0,
            zIndex: 20,
            transition: {
              x: HUB_CARD_DISMISS_TRANSITION,
              rotate: HUB_CARD_DISMISS_TRANSITION,
              opacity: { ...HUB_CARD_DISMISS_TRANSITION, ease: 'easeIn' as const },
            },
          },
  };

  return (
    <motion.div
      ref={ref}
      variants={variants}
      initial="rising"
      animate="shown"
      exit="leaving"
      transition={HUB_CARD_RISE_TRANSITION}
      inert={!isPresent}
      tabIndex={-1}
      style={{ transformOrigin: '50% 100%' }}
      className="relative outline-none"
    >
      {children}
    </motion.div>
  );
}

/**
 * A dismissed card's slide off the stack: long enough to follow, and eased in and out so it travels
 * the whole way rather than snapping off in the first frames.
 */
const HUB_CARD_DISMISS_TRANSITION = { duration: 0.4, ease: HUB_EASE } as const;

/** The card underneath rising into place while the dismissed one slides off it. */
const HUB_CARD_RISE_TRANSITION = { duration: 0.32, ease: HUB_EASE } as const;
