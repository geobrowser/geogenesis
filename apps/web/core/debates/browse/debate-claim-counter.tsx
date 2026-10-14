'use client';

import * as React from 'react';

import cx from 'classnames';

import { ActionSurface } from '~/core/action-context-provider';
import type { DebateClaim } from '~/core/debates/api';
import type { StackedCard } from '~/core/debates/claim-ticker';
import { CLAIM_RESPONSE_COPY } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';

import { TargetSolid } from '~/design-system/icons/target-solid';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';

import { LABEL_FONT } from './debate-break-cues';
import { useDebateClaimResponse } from './use-debate-claim-response';

/** How long the "+1 claim" takes to rise out of the counter and go. Matches its class below. */
const PLUS_ONE_MS = 1_100;
/** How long the newest claim's card stays tinted after its +1. */
const FRESH_MS = 3_000;
/** The pause on the counter before the list opens, and after the pointer leaves before it closes. */
const OPEN_AFTER_MS = 150;
const CLOSE_AFTER_MS = 250;

/**
 * One debater's claims in an Open rounds debate (GEO-3317): a count rather than each claim's text
 * over the video.
 *
 * - The counter sits in the tile's bottom-right corner from the start, at 0.
 * - When a claim is said it goes up by one, and a "+1 claim" rises out of it and fades.
 * - Resting on it opens what this debater has claimed so far, newest nearest the counter, each with
 *   the vote. Crossing from the counter into the list keeps it open; it closes a moment after the
 *   pointer leaves both. A tap does the same on a touch screen, and the keyboard opens it too.
 *
 * The video keeps playing throughout. With nothing said yet, there is no list to open.
 */
export function DebateClaimCounter({
  history,
  playheadMs,
  name,
  rowsByClaimId,
  entitiesByClaimId,
  onAnswered,
  onSeeAll,
}: {
  /** What this debater has claimed so far, oldest first. */
  history: StackedCard[];
  playheadMs: number;
  /** The debater's first name, for the list's header. */
  name: string;
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  onAnswered: (claimId: string, position: boolean | null) => void;
  /** Opens the debate's Claims panel. Without it, the list has no "See all". */
  onSeeAll?: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const settle = (next: boolean) => {
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setHovered(next), next ? OPEN_AFTER_MS : CLOSE_AFTER_MS);
  };

  const count = history.length;
  const newest = history.at(-1);
  const newestAgeMs = newest ? playheadMs - newest.window.startMs : Number.POSITIVE_INFINITY;
  const popping = newest !== undefined && newestAgeMs >= 0 && newestAgeMs < PLUS_ONE_MS;
  const open = (hovered || pinned) && count > 0;

  return (
    <div
      data-claim-counter
      className="pointer-events-auto flex flex-col items-end gap-1"
      // A real mouse only: a touch browser synthesises these from a tap, which would open the list
      // on every tap that pauses the video. The counter's own press is the way in on touch.
      onPointerEnter={event => event.pointerType === 'mouse' && settle(true)}
      onPointerLeave={event => event.pointerType === 'mouse' && settle(false)}
    >
      {open && (
        <ClaimList
          history={history}
          name={name}
          freshClaimId={newest && newestAgeMs < FRESH_MS ? newest.window.claim.id : null}
          freshness={Math.max(0, 1 - newestAgeMs / FRESH_MS)}
          rowsByClaimId={rowsByClaimId}
          entitiesByClaimId={entitiesByClaimId}
          onAnswered={onAnswered}
          onSeeAll={onSeeAll}
        />
      )}
      <span className="relative inline-flex">
        {popping && (
          <span
            key={newest.window.claim.id}
            aria-hidden
            data-claim-plus-one
            className="pointer-events-none absolute right-0 bottom-0 z-0 origin-bottom-right motion-safe:animate-[claimPlusOne_1100ms_ease-out_both] motion-reduce:hidden"
          >
            <ClaimStamp>+1 claim</ClaimStamp>
          </span>
        )}
        <button
          type="button"
          data-claim-count={count}
          aria-expanded={open}
          aria-label={`${count} ${count === 1 ? 'claim' : 'claims'} so far. ${open ? 'Hide' : 'Show'} them`}
          onClick={() => setPinned(current => !current)}
          className="relative z-[1] cursor-pointer"
        >
          <span
            key={popping ? newest.window.claim.id : 'still'}
            className="block motion-safe:animate-[claimCounterBump_450ms_ease-out]"
          >
            <ClaimCount count={count} />
          </span>
        </button>
      </span>
    </div>
  );
}

/**
 * The count, beside the target icon, on the round tag's purple.
 *
 * The icon sits inline on the number's baseline and drops by 0.17em, which puts its middle on the
 * middle of the digits (Geist's cap height) in every browser. Centring with flexbox centres the
 * digits' line box instead, whose descender space leaves them sitting high; trimming that box with
 * `text-box` is not supported everywhere. Measured off the rendered pixels in the design mockup.
 */
function ClaimCount({ count }: { count: number }) {
  return (
    <span
      className="inline-block rounded-[2px] bg-purple px-1.5 py-1 text-[0.75rem] leading-none whitespace-nowrap text-white tabular-nums"
      style={LABEL_FONT}
    >
      <span className="mr-[0.4em] inline-block align-[-0.17em]">
        <TargetSolid />
      </span>
      {count}
    </span>
  );
}

/** The +1's face: the breaks' stamp, small. */
function ClaimStamp({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block -rotate-2 rounded-[2px] border-[0.07em] border-current bg-white px-[0.4em] pt-[0.12em] pb-[0.1em] text-[0.75rem] leading-[0.9] font-bold tracking-[0.02em] whitespace-nowrap text-purple uppercase shadow-[0_0.12em_0.45em_rgba(0,0,0,0.28)]"
      style={{ fontFamily: 'var(--font-geist-bold)' }}
    >
      {children}
    </span>
  );
}

function ClaimList({
  history,
  name,
  freshClaimId,
  freshness,
  rowsByClaimId,
  entitiesByClaimId,
  onAnswered,
  onSeeAll,
}: {
  history: StackedCard[];
  name: string;
  freshClaimId: string | null;
  freshness: number;
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  onAnswered: (claimId: string, position: boolean | null) => void;
  onSeeAll?: () => void;
}) {
  // Newest first in the document, laid out bottom-up: the newest sits nearest the counter, and a
  // list taller than its cap opens scrolled to it, older claims above.
  const newestFirst = [...history].reverse();

  return (
    <div data-claim-list className="grid w-[76cqw] max-w-[24rem] gap-1.5">
      <div
        className="flex items-baseline justify-between gap-3 px-0.5 text-[0.75rem] leading-none font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
        style={LABEL_FONT}
      >
        <span className="truncate">
          {name}’s claims · {history.length}
        </span>
        {onSeeAll && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onSeeAll();
            }}
            className="shrink-0 text-white/80 underline underline-offset-[0.3em] hover:text-white"
          >
            See all
          </button>
        )}
      </div>
      {/* Never more than about two and a half cards tall: older claims scroll, fading at the top,
          and the list stays clear of the round tag and timer at the tile's top. */}
      <div
        className={cx(
          'flex max-h-[38cqw] [scrollbar-width:none] flex-col-reverse gap-1.5 overflow-y-auto',
          history.length > 2 && '[mask-image:linear-gradient(rgba(0,0,0,0.15),#000_1.5rem)]'
        )}
      >
        {newestFirst.map(card => (
          <ClaimListCard
            key={card.window.claim.id}
            card={card}
            freshness={card.window.claim.id === freshClaimId ? freshness : 0}
            row={rowsByClaimId.get(card.window.claim.id) ?? null}
            entity={entitiesByClaimId.get(card.window.claim.id) ?? null}
            onAnswered={onAnswered}
          />
        ))}
      </div>
    </div>
  );
}

function ClaimListCard(props: {
  card: StackedCard;
  freshness: number;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean | null) => void;
}) {
  const claim = props.card.window.claim;
  if (!claim.spaceId) return null;
  return (
    // The same surface as the live claim card it replaces, so votes stay comparable across the two.
    <ActionSurface asChild value={{ component: 'debate_claim_ticker', target_id: claim.id, target_type: 'claim' }}>
      <ClaimListCardBody {...props} spaceId={claim.spaceId} />
    </ActionSurface>
  );
}

/**
 * A claim and its vote column: Agree, the share who agree, Disagree. The share only shows once a
 * claim has a vote. Thumbs are solid, so they read at this size, with a 24px target each.
 */
function ClaimListCardBody({
  card,
  freshness,
  row,
  entity,
  onAnswered,
  spaceId,
}: {
  card: StackedCard;
  freshness: number;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean | null) => void;
  spaceId: string;
}) {
  const claim = card.window.claim;
  const { summary, control } = useDebateClaimResponse({ claimId: claim.id, spaceId, row, entity });
  const position = control.viewerPosition;
  // The session's answers feed the end-of-debate scorecard, as the live card's always have.
  React.useEffect(() => {
    onAnswered(claim.id, position);
  }, [claim.id, onAnswered, position]);

  const vote = (side: boolean) => {
    const selected = position === side;
    const label = side ? CLAIM_RESPONSE_COPY.positiveAction : CLAIM_RESPONSE_COPY.negativeAction;
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        title={control.actionTitle(side) || label}
        disabled={!control.canRespond}
        onClick={event => {
          event.stopPropagation();
          control.respond(side);
        }}
        className={cx(
          '-my-1 grid size-6 place-items-center rounded-full transition-colors disabled:cursor-default',
          selected
            ? cx('bg-white/15', side ? 'text-green' : 'text-red-01')
            : 'text-white/70 hover:bg-white/15 hover:text-white disabled:hover:bg-transparent'
        )}
      >
        {side ? <ThumbUp filled /> : <ThumbDown filled />}
      </button>
    );
  };

  return (
    <div
      data-claim-list-card={claim.id}
      className={cx(
        'grid grid-cols-[1fr_auto] items-center gap-x-2.5 rounded-[4px] py-2 pr-1.5 pl-3 text-white backdrop-blur-[22px] transition-colors duration-700',
        freshness > 0 ? 'bg-purple/45 ring-1 ring-purple' : 'bg-[#151515]/55'
      )}
    >
      <span className="line-clamp-3 text-[0.8125rem] leading-[1.25]">{claim.text}</span>
      <span className="grid justify-items-center" style={LABEL_FONT}>
        {vote(true)}
        {summary.percent === null ? (
          <span aria-hidden className="h-2" />
        ) : (
          <span
            className="py-1 text-[0.625rem] leading-none font-medium tabular-nums"
            title={`${summary.percent}% agree`}
          >
            {summary.percent}%
          </span>
        )}
        {vote(false)}
      </span>
    </div>
  );
}
