'use client';

import * as React from 'react';

import cx from 'classnames';

import { ActionSurface, ActionSurfaceDiv } from '~/core/action-context-provider';
import type { DebateClaim, DebateParticipant } from '~/core/debates/api';
import type { StackedCard } from '~/core/debates/claim-ticker';
import { speakerLabel } from '~/core/debates/playback-utils';
import { CLAIM_RESPONSE_COPY } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { Warning } from '~/design-system/icons/warning';

import { ClaimIconButton } from './debate-claim-ticker';
import { PLAYER_GLASS_CLASS, PLAYER_LABEL_FONT } from './player-overlay-styles';
import { useDebateClaimResponse } from './use-debate-claim-response';

/** The pause on the video before the list opens, and after the pointer leaves before it closes. */
const OPEN_AFTER_MS = 150;
const CLOSE_AFTER_MS = 250;
const LIST_EXIT_MS = 180;

/**
 * One debater's claims in an Open rounds debate (GEO-3317): a count rather than each claim's text
 * over the video.
 *
 * - The counter sits in the tile's bottom-right corner from the start, at 0.
 * - When a claim is said the count goes up without animation.
 * - Resting the pointer on the counter opens what this debater has claimed so far, newest nearest
 *   the counter, each with the vote. The list is part of the counter's box, so moving up into it
 *   keeps it open; it closes a moment after the pointer leaves both. A tap on the counter does the
 *   same on a touch screen, and the keyboard opens it too.
 *
 * The video keeps playing throughout. With nothing said yet, there is no list to open.
 *
 * Sizes, timings and curves are the design mockup's, sizes as shares of the player's width (`cqw`),
 * so the corner keeps its proportions from a feed card to fullscreen.
 */
export function DebateClaimCounter({
  history,
  name,
  speaker = null,
  rowsByClaimId,
  entitiesByClaimId,
  onAnswered,
  onActiveChange,
}: {
  /** What this debater has claimed so far, oldest first. */
  history: StackedCard[];
  /** Fallback name for a claim card whose speaker is unavailable. */
  name: string;
  speaker?: DebateParticipant | null;
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  onAnswered: (claimId: string, position: boolean | null) => void;
  /** Whether the list is open or a keyboard is inside it, so the player keeps the corner visible. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [pointerOver, setPointerOver] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [keyboardInside, setKeyboardInside] = React.useState(false);
  // Closed by its own button while the pointer or keyboard is still there: stays closed until both
  // have left, so "Hide" is not undone by the hover that is still resting on it.
  const [dismissed, setDismissed] = React.useState(false);
  // Hover intent: open once the pointer has rested on the counter a moment, close a moment after it
  // leaves the counter and the list, so passing across the corner does not flash the list.
  React.useEffect(() => {
    const timer = setTimeout(() => setHovered(pointerOver), pointerOver ? OPEN_AFTER_MS : CLOSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pointerOver]);
  // Focus that follows a press is the pointer's, not the keyboard's: a click on a vote button must
  // not hold the list open after the pointer leaves, where a keyboard user's focus must.
  const pressing = React.useRef(false);

  const count = history.length;
  const open = !dismissed && (hovered || pinned || keyboardInside) && count > 0;
  const [listPresent, setListPresent] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setListPresent(true);
      return;
    }
    const timer = setTimeout(() => setListPresent(false), LIST_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);
  const active = open || keyboardInside;
  React.useEffect(() => onActiveChange?.(active), [active, onActiveChange]);

  // Escape closes the list wherever focus is, as content shown on hover must be dismissible without
  // moving the pointer or focus (WCAG 1.4.13). It stays closed until both have left, like Hide. A
  // keyboard user on one of its controls is put back on the counter rather than lost.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const countRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPinned(false);
      setDismissed(true);
      const focused = document.activeElement;
      if (focused !== countRef.current && rootRef.current?.contains(focused)) countRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // A closed list lets go of its dismissal once the pointer and focus have both left, and drops the
  // hover that was still running out its close delay with it: otherwise the list it closed would
  // come back for that last moment.
  const releaseDismissal = () => {
    if (dismissed) setHovered(false);
    setDismissed(false);
  };

  const toggle = () => {
    if (open) {
      setPinned(false);
      setDismissed(true);
    } else {
      setDismissed(false);
      setPinned(true);
    }
  };

  return (
    <div
      ref={rootRef}
      data-claim-counter
      className="pointer-events-auto flex flex-col items-end gap-[0.7cqw]"
      // A real mouse only: a touch browser synthesises these from a tap, which would open the list
      // on every tap that pauses the video. The counter's own press is the way in on touch. Leaving
      // also lets go of a pin and a dismissal, so the corner never stays stuck open or shut behind
      // a mouse that has moved on.
      onPointerEnter={event => event.pointerType === 'mouse' && setPointerOver(true)}
      onPointerLeave={event => {
        // A press dragged off and released outside never reaches `onPointerUp` here.
        pressing.current = false;
        if (event.pointerType !== 'mouse') return;
        setPointerOver(false);
        setPinned(false);
        if (!keyboardInside) releaseDismissal();
      }}
      onPointerDown={() => {
        pressing.current = true;
      }}
      onPointerUp={() => {
        pressing.current = false;
      }}
      onPointerCancel={() => {
        pressing.current = false;
      }}
      // Keyboard focus anywhere inside (the counter or a vote) holds the list open, so the
      // control a keyboard user is on is never unmounted under them. It lets go when focus leaves.
      onFocus={() => {
        if (!pressing.current) setKeyboardInside(true);
      }}
      onBlur={event => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        // A keyboard user tabbing away takes their pin with them; a touch pin stays until tapped.
        if (keyboardInside) setPinned(false);
        setKeyboardInside(false);
        if (!pointerOver) releaseDismissal();
      }}
    >
      {(open || listPresent) && count > 0 && (
        <div
          data-claim-list-presence={open ? 'open' : 'closed'}
          inert={!open}
          aria-hidden={!open || undefined}
          className={cx(
            'transition-[opacity,translate] duration-180 ease-out motion-reduce:transition-none starting:opacity-0 motion-safe:starting:translate-y-[0.8cqw]',
            open
              ? 'opacity-100 motion-safe:translate-y-0'
              : 'pointer-events-none opacity-0 motion-safe:translate-y-[0.8cqw]'
          )}
        >
          <ClaimList
            active={open}
            history={history}
            name={name}
            speaker={speaker}
            rowsByClaimId={rowsByClaimId}
            entitiesByClaimId={entitiesByClaimId}
            onAnswered={onAnswered}
          />
        </div>
      )}
      <span className="relative inline-flex">
        <button
          ref={countRef}
          type="button"
          data-claim-count={count}
          aria-expanded={open}
          aria-label={`${count} ${count === 1 ? 'claim' : 'claims'} so far. ${open ? 'Hide' : 'Show'} them`}
          onClick={toggle}
          className="relative z-[1] inline-flex cursor-pointer"
        >
          <ClaimCount count={count} />
        </button>
      </span>
    </div>
  );
}

/**
 * The count beside the classic circled exclamation icon, on the player's glass pill.
 *
 * The icon sits inline on the number's baseline and drops by 0.17em, which puts its middle on the
 * middle of the digits in every browser. Centring with flexbox centres the
 * digits' line box instead, whose descender space leaves them sitting high; trimming that box with
 * `text-box` is not supported everywhere. Measured off the rendered pixels in the design mockup.
 */
function ClaimCount({ count }: { count: number }) {
  return (
    <span
      className={cx(PLAYER_GLASS_CLASS, 'inline-block text-[2.6cqw] text-white tabular-nums')}
      style={PLAYER_LABEL_FONT}
    >
      <span aria-hidden className="mr-[0.4em] inline-block align-[-0.17em] [&>svg]:size-[1.05em]">
        <Warning />
      </span>
      {count}
    </span>
  );
}

function ClaimList({
  active,
  history,
  name,
  speaker,
  rowsByClaimId,
  entitiesByClaimId,
  onAnswered,
}: {
  active: boolean;
  history: StackedCard[];
  name: string;
  speaker: DebateParticipant | null;
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  onAnswered: (claimId: string, position: boolean | null) => void;
}) {
  // Newest first in the document, laid out bottom-up: the newest sits nearest the counter, and a
  // list taller than its cap opens scrolled to it, older claims above.
  const newestFirst = [...history].reverse();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fades = history.length > 2;
  const paint = React.useCallback(() => {
    if (scrollRef.current) paintTopFade(scrollRef.current, fades);
  }, [fades]);
  // On every layout of the list and on every scroll.
  React.useLayoutEffect(paint);

  return (
    <div data-claim-list className="w-[76cqw]">
      {/* Never more than about two and a half cards tall: older claims scroll, fading at the top,
          and the list stays clear of the round tag and timer at the tile's top. */}
      <div
        ref={scrollRef}
        onScroll={paint}
        className="flex max-h-[38cqw] [scrollbar-width:none] flex-col-reverse gap-[1.2cqw] overflow-y-auto"
      >
        {newestFirst.map(card => (
          <ClaimListCard
            active={active}
            key={card.window.claim.id}
            card={card}
            name={name}
            speaker={speaker}
            row={rowsByClaimId.get(card.window.claim.id) ?? null}
            entity={entitiesByClaimId.get(card.window.claim.id) ?? null}
            onAnswered={onAnswered}
          />
        ))}
      </div>
    </div>
  );
}

/** The fade at the top of a scrolling list, from 15% to full over its first 6cqw, as the mockup draws it. */
const FADE_FROM_ALPHA = 0.15;
const FADE_CQW = 6;
/** The list's width in `cqw` (`w-[76cqw]`), which turns the fade's `cqw` into the list's own px. */
const LIST_CQW = 76;

/**
 * Fades the top of the list, card by card: each card carries the slice of the ramp that falls across
 * it, through `--claim-ramp`. Not one mask on the scroll box: a mask makes its element a backdrop
 * root, and the cards' blur would stop seeing the video behind the list. A card's own mask does not
 * blind its own blur. The live claim ticker solves it the same way (`debate-claim-ticker.tsx`); its
 * version is not shared because it measures a list laid out top-down, and it serves fixed formats,
 * which this PR leaves alone.
 */
function paintTopFade(list: HTMLElement, fades: boolean) {
  const top = list.getBoundingClientRect().top;
  const rampPx = (list.clientWidth * FADE_CQW) / LIST_CQW;
  for (const card of Array.from(list.children) as HTMLElement[]) {
    const fromTop = card.getBoundingClientRect().top - top;
    const reached = fades && fromTop < rampPx && fromTop + card.offsetHeight > 0;
    card.style.setProperty(
      '--claim-ramp',
      reached
        ? `linear-gradient(to bottom, rgba(0,0,0,${FADE_FROM_ALPHA}) ${-fromTop}px, #000 ${rampPx - fromTop}px)`
        : 'none'
    );
  }
}

function ClaimListCard({
  active,
  ...props
}: {
  active: boolean;
  card: StackedCard;
  name: string;
  speaker: DebateParticipant | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean | null) => void;
}) {
  const claim = props.card.window.claim;
  if (!claim.spaceId) return null;
  return (
    // The same surface as the live claim card it replaces, so votes stay comparable across the two.
    <ActionSurface
      asChild
      trackImpression={active}
      value={{ component: 'debate_claim_ticker', target_id: claim.id, target_type: 'claim' }}
    >
      <ClaimListCardBody {...props} spaceId={claim.spaceId} />
    </ActionSurface>
  );
}

/**
 * The classic card: debater, agreement percentage and thumbs in a header above the claim.
 * The share only shows once a claim has votes; the outlined thumbs keep a 24px minimum target.
 */
function ClaimListCardBody({
  card,
  name,
  speaker,
  row,
  entity,
  onAnswered,
  spaceId,
}: {
  card: StackedCard;
  name: string;
  speaker: DebateParticipant | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean | null) => void;
  spaceId: string;
}) {
  const claim = card.window.claim;
  const { responseKind, summary, control } = useDebateClaimResponse({ claimId: claim.id, spaceId, row, entity });
  const position = control.viewerPosition;
  // The session's answers feed the end-of-debate scorecard, as the live card's always have.
  React.useEffect(() => {
    onAnswered(claim.id, position);
  }, [claim.id, onAnswered, position]);

  const vote = (side: boolean) => {
    const label = side ? CLAIM_RESPONSE_COPY.positiveAction : CLAIM_RESPONSE_COPY.negativeAction;
    return (
      <ClaimIconButton
        responseKind={responseKind}
        position={side}
        label={label}
        selected={position === side}
        disabled={!control.canRespond}
        title={control.actionTitle(side) || label}
        onClick={() => control.respond(side)}
        tone="glass"
        layout="header"
      />
    );
  };

  return (
    // The surface's measurement root, as the live card's is: with `asChild`, `ActionSurface` only
    // measures (and so reports an impression) through an `ActionSurfaceDiv` beneath it.
    <ActionSurfaceDiv
      data-claim-list-card={claim.id}
      className="grid gap-[1.2cqw] rounded-[8px] bg-[#151515]/55 [mask-image:var(--claim-ramp,none)] p-[2.4cqw] text-left text-white backdrop-blur-[22px] [-webkit-mask-image:var(--claim-ramp,none)]"
    >
      <div
        data-claim-list-header
        className="flex items-center gap-[1.2cqw] text-[2.7cqw] leading-none whitespace-nowrap"
      >
        <span className="block size-[3.4cqw] shrink-0 overflow-hidden rounded-full bg-white [&>svg]:size-full">
          <Avatar avatarUrl={speaker?.avatar_cid} value={speaker?.profile_space_id ?? name} size={16} />
        </span>
        <span className="min-w-0 truncate">{speaker ? speakerLabel(speaker) : name}</span>
        {summary.percent !== null && <span className="shrink-0 text-white/70">· {summary.percent}% agree</span>}
        <span className="ml-auto flex shrink-0 gap-[1.6cqw]">
          {vote(true)}
          {vote(false)}
        </span>
      </div>
      <div className="line-clamp-2 text-[3.3cqw] leading-[1.25]">{claim.text}</div>
    </ActionSurfaceDiv>
  );
}
