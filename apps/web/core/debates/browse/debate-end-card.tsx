'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { ClaimResponders, ClaimSplitBar } from '~/core/claims/browse/claim-summary';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { speakerLabel } from '~/core/debates/playback-utils';
import { CLAIM_RESPONSE_COPY } from '~/core/responses/entity-response';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { NativeGeoImage } from '~/design-system/geo-image';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Text } from '~/design-system/text';

import { DebateClaimTickerCard } from './debate-claim-ticker';
import { Play } from './icons';
import { CONTROL_CIRCLE_CLASS } from './player-controls';
import type { EndCardClaims, useDebateEndCard } from './use-debate-end-card';
import type { NextDebate } from './use-next-debate';

type EndCardData = ReturnType<typeof useDebateEndCard>;

/**
 * What a finished debate ends on: where the viewer stands on the claim, the claims the debate
 * extracted to vote on, and another debate to watch next.
 *
 * Geo's own light card over the dimmed last frame rather than the player's dark glass. Every control
 * on it — the Agree/Disagree pills, the split bar, the voter faces and their list — is the real
 * component, and those are built for light surfaces. The claim cards in the carousel take their
 * `light` tone for the same reason.
 *
 * Laid out for the player's width, not the viewport's: the player is a feed card, an explore card
 * and a fullscreen view, and a phone layout keyed to the window would get the wide ones wrong. The
 * player carries `@container`, and below 448px the card tightens.
 *
 * The claims run sideways, as a carousel of the same cards that rose over the video as each was
 * said, so a viewer who let them go by can go back and vote. Sideways rather than a list because
 * the card is sized to fit a feed card's player without scrolling: a list would be one more
 * vertical thing to scroll inside a feed that already scrolls vertically.
 *
 * A narrow player gets replay as a pill in the card's header rather than a circle in a band above
 * it. The card still scrolls vertically as a last resort on a player too short for it.
 */
export function DebateEndCard({
  card,
  onReplay,
  onOpenClaims,
}: {
  card: EndCardData;
  onReplay: () => void;
  /** Opens the claims panel. */
  onOpenClaims?: (participantSpaceId?: string) => void;
}) {
  const { claimResponse, carousel, nextDebate } = card;

  return (
    <div data-debate-end-card className="absolute inset-0 z-40">
      <div aria-hidden className="absolute inset-0 bg-black/55" />
      {/* The corner the pause control sat in for the whole debate, and the same circle, now starting
          it again. Inside this layer rather than left on the tile, which the card sits above. A
          narrow player draws the pill in the card's header instead — see below. */}
      <button
        type="button"
        aria-label="Replay debate"
        data-end-card-replay
        onClick={onReplay}
        className={cx(CONTROL_CIRCLE_CLASS, 'absolute top-3 left-3 @max-md:hidden')}
      >
        <RetrySmall />
      </button>

      {/* As tall as its content rather than the player: a card stretched to the bottom edge left a
          band of blank white under the last section that read as something missing. Capped at the
          player, and scrolls as a last resort on one too short for it. */}
      <section
        aria-label="Debate results"
        className="absolute inset-x-4 top-16 flex max-h-[calc(100%-5rem)] flex-col overflow-y-auto overscroll-contain rounded-xl bg-white p-5 text-text shadow-card @max-md:inset-x-2 @max-md:top-2 @max-md:max-h-[calc(100%-1rem)] @max-md:rounded-lg @max-md:p-3.5"
      >
        <div className="flex flex-col gap-3 @max-md:gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-chatMedium text-grey-04">Where do you stand?</span>
              {/* Replay on a narrow player: a pill on the question's own line rather than a circle in a
                  band above the card, which cost the card about 50px it could not spare. The claims
                  pill's shape, so it reads as one of the card's actions. */}
              <button
                type="button"
                aria-label="Replay debate"
                data-end-card-replay
                onClick={onReplay}
                className="hidden h-7 shrink-0 items-center gap-1 rounded-full border border-grey-02 bg-white px-2.5 text-smallButton text-grey-04 shadow-light transition-colors hover:text-text @max-md:flex"
              >
                <RetrySmall />
                Replay
              </button>
            </div>
            {/* Two lines at most on a narrow player: the feed prints the claim in full directly above
                the video, so here it only has to say which claim the question is about. */}
            {/* `text-pretty`, not balanced: balancing evened the two lines out by breaking the first
                one early, which left a ragged block of white down the right of the card. */}
            <p className="text-cardEntityTitle text-pretty @max-md:line-clamp-2 @max-md:text-[1.0625rem] @max-md:leading-[1.375rem]">
              {card.claimText}
            </p>
          </div>

          <VoteRow
            summary={claimResponse.summary}
            countsReady={claimResponse.summary.hasCounts}
            faces={
              // Geo's own faces-to-voters control, as the claim page and every claim card draw it:
              // the list sectioned by side, portalled above the hub and the side panel, warmed on
              // hover so it does not open on a spinner.
              <ClaimResponders
                entityId={card.claimId}
                spaceId={card.spaceId}
                responseKind={claimResponse.responseKind}
                summary={claimResponse.summary}
                label={CLAIM_RESPONSE_COPY.viewResponders}
              />
            }
          />

          {/* The claim's own control, publishing through the same path the claims panel does. The
              ready-to-debate faces stay out of the pills: the row above already shows who voted,
              and a second face stack meaning something else would read as the same people. */}
          <div>
            <PositionRow
              positions={claimResponse.control.optimisticPositions}
              responseKind={claimResponse.responseKind}
              viewerPosition={claimResponse.control.viewerPosition}
              onRespond={claimResponse.control.respond}
              disabled={!claimResponse.control.canRespond}
              pending={claimResponse.control.isResponsePending}
              titleFor={claimResponse.control.actionTitle}
              showParticipants={false}
            />
            {claimResponse.control.responseError ? (
              <div role="alert" className="mt-1.5">
                <Text as="p" variant="footnote" color="red-01">
                  {claimResponse.control.responseError}
                </Text>
              </div>
            ) : null}
          </div>
        </div>

        {nextDebate ? <NextDebateLink next={nextDebate} /> : null}

        {/* Below the next debate rather than above it: the suggestion is the card's one way onward,
            and the carousel is the longer, optional thing to do before taking it. */}
        {carousel.claims.length > 0 ? (
          <div className="mt-3.5 @max-md:mt-2.5">
            <ClaimsCarousel carousel={carousel} onOpenClaims={onOpenClaims} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * The claim's row: its share on the left, the split between, the people on the right.
 *
 * The share is shown at any count, which is Geo's rule on every claim surface (`claimSummaryTier`):
 * the faces beside it say how many people it is a share *of*, so it does not have to hedge. Nothing
 * is asserted before the counts are an answer — "No votes yet" off a query still in flight would be
 * a fact about the network presented as one about the debate.
 */
function VoteRow({
  summary,
  countsReady,
  faces,
}: {
  summary: { percent: number | null; total: number };
  countsReady: boolean;
  faces: React.ReactNode;
}) {
  const hasVotes = countsReady && summary.percent !== null;
  const bar = 'h-2 @max-md:h-1.5';

  return (
    <div className="flex items-center gap-3 @max-md:gap-2">
      {hasVotes ? (
        <span className="shrink-0 text-metadataMedium tabular-nums @max-md:text-chatMedium">
          {summary.percent}% agree
        </span>
      ) : countsReady ? (
        <span className="shrink-0 text-chat text-grey-04">No votes yet</span>
      ) : null}
      {hasVotes ? (
        <ClaimSplitBar percent={summary.percent!} className={cx('min-w-8 flex-1', bar)} />
      ) : (
        <div className={cx('min-w-8 flex-1 rounded-full bg-grey-01', bar)} />
      )}
      {hasVotes ? faces : null}
    </div>
  );
}

/** The live cards report each answer to the ticker's tally; the end card keeps no tally of its own. */
const IGNORE_ANSWER = () => {};

/**
 * Every claim the debate extracted, side by side, each one votable.
 *
 * The cards are the live ones — the same speaker, share and thumbs, publishing through the same
 * path — so a claim looks and answers the same whether it is caught as it is said or here after.
 * In spoken order, which is the order the viewer heard them in.
 *
 * Snaps a card at a time. Scrolls by trackpad, touch or the arrows; the arrows are there because a
 * mouse wheel scrolls vertically, and without them a mouse user sees one or two cards and no way to
 * the rest. They step a card at a time and hide on a narrow player, which is a touch screen more
 * often than not and has no room to spare in the header.
 *
 * The strip bleeds to the card's edges, so a card scrolled half out of view reads as "there is more
 * this way" rather than as clipped.
 */
function ClaimsCarousel({
  carousel,
  onOpenClaims,
}: {
  carousel: EndCardClaims;
  onOpenClaims?: (participantSpaceId?: string) => void;
}) {
  const { claims, speakerByClaimId, entitiesByClaimId } = carousel;
  const stripRef = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ atStart: true, atEnd: false });

  const readEdges = React.useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    // A pixel of slack: fractional scroll positions on high-density screens never land exactly.
    const atStart = strip.scrollLeft <= 1;
    const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
    setEdges(current => (current.atStart === atStart && current.atEnd === atEnd ? current : { atStart, atEnd }));
  }, []);

  React.useLayoutEffect(() => {
    readEdges();
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(readEdges);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [readEdges, claims.length]);

  const step = (direction: 1 | -1) => {
    const strip = stripRef.current;
    const first = strip?.firstElementChild as HTMLElement | null;
    if (!strip || !first) return;
    // One card and the gap after it, so each press lands the next card on the snap point.
    const gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0;
    strip.scrollBy({ left: direction * (first.offsetWidth + gap), behavior: 'smooth' });
  };

  const arrow =
    'grid size-6 place-items-center rounded-full text-grey-04 transition-colors hover:bg-divider hover:text-text disabled:pointer-events-none disabled:opacity-30';

  return (
    <section aria-label="Claims from this debate" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-chatMedium text-grey-04">
          Vote on the claims <span className="text-grey-03 tabular-nums">· {claims.length}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {onOpenClaims ? (
            <button
              type="button"
              onClick={() => onOpenClaims()}
              className="mr-1 rounded px-1 text-smallButton text-grey-04 transition-colors hover:bg-divider hover:text-text"
            >
              See all
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Previous claims"
            onClick={() => step(-1)}
            disabled={edges.atStart}
            className={cx(arrow, '@max-md:hidden')}
          >
            <span className="rotate-180">
              <ChevronRight />
            </span>
          </button>
          <button
            type="button"
            aria-label="More claims"
            onClick={() => step(1)}
            disabled={edges.atEnd}
            className={cx(arrow, '@max-md:hidden')}
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div
        ref={stripRef}
        onScroll={readEdges}
        data-end-card-claims
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain px-5 @max-md:-mx-3.5 @max-md:scroll-px-3.5 @max-md:px-3.5 [&::-webkit-scrollbar]:hidden"
      >
        {claims.map(claim => (
          // The card is the full width of whatever holds it, so the width is set here. Short enough
          // that the next card always shows its edge, which is the only sign the strip scrolls.
          <div
            key={claim.id}
            data-end-card-claim={claim.id}
            className="flex w-[16.5rem] shrink-0 snap-start @max-md:w-[14rem] [&>*]:h-full"
          >
            <DebateClaimTickerCard
              window={{ claim, startMs: 0, endMs: 0 }}
              speaker={speakerByClaimId.get(claim.id) ?? null}
              row={null}
              entity={entitiesByClaimId.get(claim.id) ?? null}
              onAnswered={IGNORE_ANSWER}
              tone="light"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Another debate to watch, as a link to its page: the key frame, the claim it argued and who argued
 * it. Which one, and why, is `pickNextDebate`'s.
 *
 * A link rather than a button that swaps the player, so it has an address — Cmd-click opens it in a
 * tab, and the feed card this sits on keeps showing the debate its title and header describe.
 *
 * The heading says which tier it came from: "related" only when it argues a related claim, so the
 * card never calls an unrelated debate related.
 */
function NextDebateLink({ next }: { next: NextDebate }) {
  const names = next.participants.map(speakerLabel).join(' vs. ');

  return (
    <Link
      href={NavUtils.toEntity(next.spaceId, next.debateId)}
      data-end-card-next-debate={next.related ? 'related' : 'space'}
      className="mt-3.5 flex shrink-0 items-center gap-3 rounded-lg bg-grey-01 p-2.5 text-text no-underline transition-colors hover:bg-divider @max-md:mt-2.5 @max-md:gap-2.5 @max-md:p-2"
    >
      {/* The key frame's own shape: the media job renders it 540×820, both debaters stacked, so a
          landscape box cropped it down to a strip across the middle of the two. */}
      <span className="relative aspect-[27/41] w-12 shrink-0 overflow-hidden rounded-md bg-grey-02 @max-md:w-10">
        {next.keyFrame ? (
          <NativeGeoImage value={next.keyFrame} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white @max-md:size-5"
        >
          <Play size={10} />
        </span>
      </span>

      <span className="flex min-w-0 flex-col gap-1 @max-md:gap-0.5">
        <span className="text-[0.75rem] leading-[0.875rem] text-grey-04">
          {next.related ? 'Watch a related debate' : 'Watch another debate'}
        </span>
        <span className="line-clamp-2 text-chatMedium @max-md:text-[0.8125rem] @max-md:leading-[1.125rem]">
          {next.claimName}
        </span>
        {next.participants.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[0.75rem] leading-[0.875rem] text-grey-04">
            <span className="flex shrink-0 -space-x-1">
              {next.participants.map(participant => (
                <span
                  key={participant.profile_space_id}
                  className="block size-4 overflow-hidden rounded-full bg-grey-02 ring-1 ring-grey-01"
                >
                  <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={16} />
                </span>
              ))}
            </span>
            <span className="truncate">{names}</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}
