'use client';

import * as React from 'react';

import cx from 'classnames';

import { ActionSurface } from '~/core/action-context-provider';
import type { DebateClaim } from '~/core/debates/api';
import type { StackedCard } from '~/core/debates/claim-ticker';
import { LABEL_FONT } from '~/core/debates/debate-stamps';
import { CLAIM_RESPONSE_COPY } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';

import { TargetSolid } from '~/design-system/icons/target-solid';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';

import { useDebateClaimResponse } from './use-debate-claim-response';

/** How long the "+1 claim" takes to come out of the counter and go. Matches its animations below. */
const PLUS_ONE_MS = 1_100;
/** How long the newest claim's card stays tinted after its +1, fading as it goes. */
const FRESH_MS = 3_000;
/** The pause on the video before the list opens, and after the pointer leaves before it closes. */
const OPEN_AFTER_MS = 150;
const CLOSE_AFTER_MS = 250;

/**
 * One debater's claims in an Open rounds debate (GEO-3317): a count rather than each claim's text
 * over the video.
 *
 * - The counter sits in the tile's bottom-right corner from the start, at 0.
 * - When a claim is said it goes up by one, and a "+1 claim" rises out of it and fades.
 * - Resting the pointer anywhere on the debater's video opens what they have claimed so far, newest
 *   nearest the counter, each with the vote; it closes a moment after the pointer leaves the video.
 *   A tap on the counter does the same on a touch screen, and the keyboard opens it too.
 *
 * The video keeps playing throughout. With nothing said yet, there is no list to open.
 *
 * Sizes, timings and curves are the design mockup's, sizes as shares of the player's width (`cqw`),
 * so the corner keeps its proportions from a feed card to fullscreen.
 */
export function DebateClaimCounter({
  history,
  playheadMs,
  tileHovered,
  name,
  rowsByClaimId,
  entitiesByClaimId,
  onAnswered,
  onSeeAll,
}: {
  /** What this debater has claimed so far, oldest first. */
  history: StackedCard[];
  playheadMs: number;
  /** Whether a mouse pointer is over this debater's video, which opens the list after a moment. */
  tileHovered: boolean;
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
  // Hover intent: open once the pointer has rested on the video a moment, close a moment after it
  // leaves, so passing across a tile does not flash the list.
  React.useEffect(() => {
    const timer = setTimeout(() => setHovered(tileHovered), tileHovered ? OPEN_AFTER_MS : CLOSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [tileHovered]);

  const count = history.length;
  const newest = history.at(-1);
  const newestAgeMs = newest ? playheadMs - newest.window.startMs : Number.POSITIVE_INFINITY;
  const popping = newest !== undefined && newestAgeMs >= 0 && newestAgeMs < PLUS_ONE_MS;
  const fresh = newest !== undefined && newestAgeMs >= 0 && newestAgeMs < FRESH_MS;
  const open = (hovered || pinned) && count > 0;

  return (
    <div data-claim-counter className="pointer-events-auto flex flex-col items-end gap-[0.7cqw]">
      {open && (
        <ClaimList
          history={history}
          name={name}
          freshClaimId={fresh ? newest.window.claim.id : null}
          freshness={fresh ? 1 - newestAgeMs / FRESH_MS : 0}
          rowsByClaimId={rowsByClaimId}
          entitiesByClaimId={entitiesByClaimId}
          onAnswered={onAnswered}
          onSeeAll={onSeeAll}
        />
      )}
      <span className="relative inline-flex">
        {popping && (
          // Three layers, three motions, as the mockup moves it: rising its own height and a gap out
          // of the counter (500 ms), growing from half size (350 ms), and fading in by 88 ms and out
          // over its last 300 ms. It starts behind the counter, anchored to its right edge.
          <span
            key={newest.window.claim.id}
            aria-hidden
            data-claim-plus-one
            className="pointer-events-none absolute right-0 bottom-0 z-0 motion-safe:animate-[claimPlusRise_500ms_cubic-bezier(0.33,1,0.68,1)_both] motion-reduce:hidden"
          >
            <span className="block origin-bottom-right motion-safe:animate-[claimPlusGrow_350ms_cubic-bezier(0.33,1,0.68,1)_both]">
              <span className="block motion-safe:animate-[claimPlusFade_1100ms_linear_both]">
                <ClaimStamp>+1 claim</ClaimStamp>
              </span>
            </span>
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
          {/* The bump as the +1 leaves: a half sine up to 1.22x and back, from the right edge. */}
          <span
            key={popping ? newest.window.claim.id : 'still'}
            className={cx('block origin-right', popping && 'motion-safe:animate-[claimCounterBump_450ms_linear]')}
          >
            <ClaimCount count={count} />
          </span>
        </button>
      </span>
    </div>
  );
}

/**
 * The count beside the target icon, on the round tag's purple, at the mockup's size.
 *
 * The icon sits inline on the number's baseline and drops by 0.17em, which puts its middle on the
 * middle of the digits (Geist's cap height) in every browser. Centring with flexbox centres the
 * digits' line box instead, whose descender space leaves them sitting high; trimming that box with
 * `text-box` is not supported everywhere. Measured off the rendered pixels in the design mockup.
 */
function ClaimCount({ count }: { count: number }) {
  return (
    <span
      className="inline-block rounded-[2px] bg-purple px-[1.8cqw] py-[1cqw] text-[2.6cqw] leading-none font-medium tracking-[0.04em] whitespace-nowrap text-white tabular-nums"
      style={LABEL_FONT}
    >
      <span className="mr-[0.4em] inline-block align-[-0.17em]">
        <TargetSolid />
      </span>
      {count}
    </span>
  );
}

/** The +1's face: the breaks' stamp at 3.6cqw, leaning a little. */
function ClaimStamp({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block rotate-[-1.6deg] rounded-[2px] border-[0.07em] border-current bg-white px-[0.4em] pt-[0.12em] pb-[0.1em] text-[3.6cqw] leading-[0.9] font-bold tracking-[0.02em] whitespace-nowrap text-purple uppercase shadow-[0_0.12em_0.45em_rgba(0,0,0,0.28)]"
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
    <div data-claim-list className="grid w-[76cqw] gap-[1.2cqw]">
      <div
        className="flex items-baseline justify-between gap-[2cqw] px-[0.4cqw] text-[2.8cqw] leading-none font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
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
          'flex max-h-[38cqw] [scrollbar-width:none] flex-col-reverse gap-[1.2cqw] overflow-y-auto',
          history.length > 2 && '[mask-image:linear-gradient(rgba(0,0,0,0.15),#000_6cqw)]'
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
 * claim has a vote. Thumbs are solid so they read at this size, each with a 24px target.
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
        // 6cqw, overlapping the column's gaps, and never under a 24px target.
        className={cx(
          '-my-[1cqw] grid size-[6cqw] min-h-6 min-w-6 place-items-center rounded-full transition-colors disabled:cursor-default [&>svg]:size-[3.6cqw]',
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
      data-fresh={freshness > 0 || undefined}
      className="grid grid-cols-[1fr_auto] items-center gap-x-[2.4cqw] rounded-[4px] py-[1.4cqw] pr-[1.2cqw] pl-[2.6cqw] text-white backdrop-blur-[22px] transition-[background-color,box-shadow] duration-300"
      // The newest claim's tint fades over its first three seconds, as in the mockup.
      style={
        freshness > 0
          ? {
              backgroundColor: `rgba(104, 51, 255, ${0.18 + 0.25 * freshness})`,
              boxShadow: `inset 0 0 0 0.3cqw rgba(160, 130, 255, ${freshness})`,
            }
          : { backgroundColor: 'rgba(21, 21, 21, 0.55)' }
      }
    >
      <span className="line-clamp-3 text-[3.3cqw] leading-[1.25]">{claim.text}</span>
      <span className="grid min-w-[7cqw] content-center justify-items-center" style={LABEL_FONT}>
        {vote(true)}
        {summary.percent === null ? (
          <span aria-hidden className="h-[2.4cqw]" />
        ) : (
          <span
            className="py-[0.6cqw] text-[2.6cqw] leading-none font-semibold tabular-nums"
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
