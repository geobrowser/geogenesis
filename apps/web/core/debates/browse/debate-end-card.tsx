'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { ClaimResponders, ClaimSplitBar } from '~/core/claims/browse/claim-summary';
import { DebateTileChip } from '~/core/debates/debate-video-tile';
import type { ResponseSplit } from '~/core/debates/end-card';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { speakerLabel } from '~/core/debates/playback-utils';
import { CLAIM_RESPONSE_COPY, responsePositionLabel } from '~/core/responses/entity-response';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { NativeGeoImage } from '~/design-system/geo-image';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Text } from '~/design-system/text';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

import { Play } from './icons';
import { CONTROL_CIRCLE_CLASS } from './player-controls';
import type { EndCardDebater, useDebateEndCard } from './use-debate-end-card';
import type { NextDebate } from './use-next-debate';
import { useOpenDebaterProfile } from './use-open-debater-profile';

type EndCardData = ReturnType<typeof useDebateEndCard>;

/**
 * What a finished debate ends on: where the viewer stands on the claim, how each debater's claims
 * landed, and another debate to watch next.
 *
 * On the player's dark glass — the same frosted surface as the claims that pop up over the video —
 * so the card reads as part of the player rather than a page laid over it. The controls on it are
 * still the real components: the Agree/Disagree pills take a `glass` tone, and the split bar and
 * voter faces read on dark as they are.
 *
 * Laid out for the player's width, not the viewport's: the player is a feed card, an explore card
 * and a fullscreen view, and a phone layout keyed to the window would get the wide ones wrong. The
 * player carries `@container`, and below 448px the card tightens.
 *
 * No claims list. They popped up over the video as they were made; the faces beside each debater
 * open them in the claims panel, and the claims pill sits directly under the video as it always has.
 *
 * Sized to fit a feed card's player without scrolling, which is why the card carries no second
 * claims pill, and why a narrow player gets replay as a pill in the card's header rather than a
 * circle in a band above it. It still scrolls as a last resort on a player too short for it.
 */
export function DebateEndCard({
  card,
  onReplay,
  onOpenClaims,
}: {
  card: EndCardData;
  onReplay: () => void;
  /** Opens the claims panel; with a debater's space id, at that debater's claims. */
  onOpenClaims?: (participantSpaceId?: string) => void;
}) {
  const { claimResponse, debaters, countsReady, nextDebate } = card;

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
        className="absolute inset-x-4 top-16 flex max-h-[calc(100%-5rem)] flex-col overflow-y-auto overscroll-contain rounded-xl bg-[#151515]/30 p-5 text-white backdrop-blur-[44px] @max-md:inset-x-2 @max-md:top-2 @max-md:max-h-[calc(100%-1rem)] @max-md:rounded-lg @max-md:p-3.5"
      >
        <div className="flex flex-col gap-3 @max-md:gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-chatMedium text-white/60">Where do you stand?</span>
              {/* Replay on a narrow player: a pill on the question's own line rather than a circle in a
                  band above the card, which cost the card about 50px it could not spare. The claims
                  pill's shape, so it reads as one of the card's actions. */}
              <button
                type="button"
                aria-label="Replay debate"
                data-end-card-replay
                onClick={onReplay}
                className="hidden h-7 shrink-0 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-smallButton text-white/80 transition-colors hover:bg-white/20 hover:text-white @max-md:flex"
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
              tone="glass"
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

        <div className="my-3.5 h-px shrink-0 bg-white/15 @max-md:my-2" />

        {/* Side by side at every width. Two debaters is the one comparison this card exists to make,
            and stacking them on a phone turns it into two readouts that happen to be near each other.
            The Agree side on the left, under the Agree button — `useDebateEndCard` orders them. */}
        <div className="grid grid-cols-2 gap-4 @max-md:gap-3">
          {debaters.map(debater => (
            <DebaterColumn
              key={debater.participant.profile_space_id}
              debater={debater}
              countsReady={countsReady}
              onOpenClaims={onOpenClaims}
            />
          ))}
        </div>

        {nextDebate ? <NextDebateLink next={nextDebate} /> : null}
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
  summary: Pick<ResponseSplit, 'percent' | 'total'>;
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
        <span className="shrink-0 text-chat text-white/60">No votes yet</span>
      ) : null}
      {hasVotes ? (
        <ClaimSplitBar percent={summary.percent!} className={cx('min-w-8 flex-1', bar)} />
      ) : (
        <div className={cx('min-w-8 flex-1 rounded-full bg-white/15', bar)} />
      )}
      {hasVotes ? faces : null}
    </div>
  );
}

function DebaterColumn({
  debater,
  countsReady,
  onOpenClaims,
}: {
  debater: EndCardDebater;
  countsReady: boolean;
  onOpenClaims?: (participantSpaceId?: string) => void;
}) {
  const { participant, name, claimCount, split, responderSpaceIds } = debater;
  const side = responsePositionLabel(participant.position);
  const openProfile = useOpenDebaterProfile(participant, { interactionSurface: 'debate_end_card' });
  // Nothing rather than "0 claims" while the transcript is still saying which claims are theirs.
  const countLabel = claimCount === null ? null : `${claimCount} ${claimCount === 1 ? 'claim' : 'claims'}`;

  // Across one debater's claims the same person can agree with some and disagree with others, so a
  // single list split by side would misfile them. The row — count, share and faces — opens the claims
  // panel at this debater's card instead, where every claim carries its own split and its own voters.
  const faces = (
    <RankingAggregatedSubmitterAvatars
      submitterSpaceIds={responderSpaceIds}
      totalCount={responderSpaceIds.length}
      size={12}
    />
  );
  // Nothing until the counts are an answer, as on the claim's row: "No votes yet" off a query still
  // in flight would be a fact about the network presented as one about the debate.
  const hasVotes = countsReady && split.percent !== null;
  const share = !countsReady ? null : hasVotes ? `${split.percent}% agree` : 'No votes yet';

  // The count, the share and the voters, and nothing drawn between them: a bar per debater repeated
  // the claim's own bar directly above at a size too small to read. Wraps rather than squeezes, so a
  // narrow column puts the faces under the numbers instead of clipping them.
  //
  // A narrow player has no room for the side chip beside the name, so the side leads this block
  // instead, sharing its first line with the count ("Agree · 9 claims"), and a break puts the share
  // and faces on the next. One count, moved by the layout, rather than one per width.
  //
  // The break is a line of its own, so it is the break that spaces the two lines, not the row gap:
  // with a gap as well, it took one above it and one below, and the share sat twice as far from the
  // count as the count sat from the name. `h-1.5` is the column's own gap on a narrow player.
  const stats = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-chat text-white/60 tabular-nums @max-md:gap-y-0">
      <span className="hidden @max-md:inline">{side}</span>
      {countLabel ? (
        <>
          <span aria-hidden className="hidden @max-md:inline">
            ·
          </span>
          <span>{countLabel}</span>
        </>
      ) : null}
      <span aria-hidden className="hidden h-1.5 basis-full @max-md:block" />
      {countLabel && share ? (
        <span aria-hidden className="@max-md:hidden">
          ·
        </span>
      ) : null}
      {share ? <span className={hasVotes ? 'text-chatMedium text-white' : undefined}>{share}</span> : null}
      {hasVotes ? <span className="flex items-center">{faces}</span> : null}
    </span>
  );

  return (
    <div data-end-card-debater={participant.profile_space_id} className="flex min-w-0 flex-col gap-2 @max-md:gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* The same link to the person as their name on the tile and on each claim they made: their
            profile, in the side panel. An anchor, as the thread's speaker names are, rather than the
            tile's button. The tile's name sits on the video's play/pause surface, which has no
            address to honour; the card is not on it, so Cmd-click, middle-click and "copy link"
            reach the person's space — the hook lets those through. The side chip stays outside the
            link, as it does on the tile. */}
        <a
          href={NavUtils.toSpace(normId(participant.profile_space_id))}
          onClick={openProfile}
          className="flex min-w-0 items-center gap-1.5 no-underline hover:underline"
        >
          <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-white/15 @max-md:size-[1.125rem]">
            <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={20} />
          </span>
          <span className="truncate text-metadataMedium @max-md:text-chatMedium">{name}</span>
        </a>
        <DebateTileChip className="shrink-0 bg-white/15 text-white @max-md:hidden">{side}</DebateTileChip>
      </div>

      {onOpenClaims ? (
        <button
          type="button"
          aria-label={`${[countLabel, share].filter(Boolean).join(', ') || 'Claims'} — open ${name}'s claims`}
          onClick={() => onOpenClaims(participant.profile_space_id)}
          className="-mx-1 flex cursor-pointer self-start rounded px-1 text-left transition-colors hover:bg-white/10"
        >
          {stats}
        </button>
      ) : (
        stats
      )}
    </div>
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
      className="mt-3.5 flex shrink-0 items-center gap-3 rounded-lg bg-white/10 p-2.5 text-white no-underline transition-colors hover:bg-white/15 @max-md:mt-2.5 @max-md:gap-2.5 @max-md:p-2"
    >
      {/* The key frame's own shape: the media job renders it 540×820, both debaters stacked, so a
          landscape box cropped it down to a strip across the middle of the two. */}
      <span className="relative aspect-[27/41] w-12 shrink-0 overflow-hidden rounded-md bg-white/15 @max-md:w-10">
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
        <span className="text-[0.75rem] leading-[0.875rem] text-white/60">
          {next.related ? 'Watch a related debate' : 'Watch another debate'}
        </span>
        <span className="line-clamp-2 text-chatMedium @max-md:text-[0.8125rem] @max-md:leading-[1.125rem]">
          {next.claimName}
        </span>
        {next.participants.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[0.75rem] leading-[0.875rem] text-white/60">
            <span className="flex shrink-0 -space-x-1">
              {next.participants.map(participant => (
                <span
                  key={participant.profile_space_id}
                  className="block size-4 overflow-hidden rounded-full bg-white/15 ring-1 ring-black/30"
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
