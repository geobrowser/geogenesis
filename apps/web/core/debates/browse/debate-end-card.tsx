'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimResponders, ClaimSplitBar } from '~/core/claims/browse/claim-summary';
import { DebateTileChip } from '~/core/debates/debate-video-tile';
import { type ClaimVsArguments, type ResponseSplit, claimVsArgumentsReading } from '~/core/debates/end-card';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { CLAIM_RESPONSE_COPY, responsePositionLabel } from '~/core/responses/entity-response';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Text } from '~/design-system/text';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

import { CONTROL_CIRCLE_CLASS } from './player-controls';
import type { EndCardDebater, useDebateEndCard } from './use-debate-end-card';
import { useOpenDebaterProfile } from './use-open-debater-profile';

type EndCardData = ReturnType<typeof useDebateEndCard>;

/**
 * What a finished debate ends on: where the viewer stands on the claim, how each debater's claims
 * landed, and whether those two agree.
 *
 * Geo's own light card over the dimmed last frame rather than the player's dark glass. Every control
 * on it — the Agree/Disagree pills, the split bars, the voter faces and their list — is the real
 * component, and those are built for light surfaces; on the glass each one would have to be a
 * re-tinted copy of itself.
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
  const { claimResponse, debaters, agreeSide, disagreeSide, comparison, countsReady } = card;

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
          band of blank white under the comparison that read as something missing. Capped at the
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

        <div className="my-3.5 h-px shrink-0 bg-divider @max-md:my-2" />

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

        {comparison && agreeSide && disagreeSide && countsReady && claimResponse.summary.hasCounts ? (
          <ComparisonBox comparison={comparison} agreeName={agreeSide.name} disagreeName={disagreeSide.name} />
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
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-chat text-grey-04 tabular-nums @max-md:gap-y-0">
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
      {share ? <span className={hasVotes ? 'text-chatMedium text-text' : undefined}>{share}</span> : null}
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
          <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-grey-02 @max-md:size-[1.125rem]">
            <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={20} />
          </span>
          <span className="truncate text-metadataMedium @max-md:text-chatMedium">{name}</span>
        </a>
        <DebateTileChip className="shrink-0 bg-divider text-text @max-md:hidden">{side}</DebateTileChip>
      </div>

      {onOpenClaims ? (
        <button
          type="button"
          aria-label={`${[countLabel, share].filter(Boolean).join(', ') || 'Claims'} — open ${name}'s claims`}
          onClick={() => onOpenClaims(participant.profile_space_id)}
          className="-mx-1 flex cursor-pointer self-start rounded px-1 text-left transition-colors hover:bg-divider"
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
 * The vote on the claim against the claims people agreed with, on one line.
 *
 * The same at every width. A narrow player once got only the gap and the sentence, which kept the
 * finding but lost the picture of it — and the picture is what makes the gap mean something.
 */
function ComparisonBox({
  comparison,
  agreeName,
  disagreeName,
}: {
  comparison: ClaimVsArguments;
  agreeName: string;
  disagreeName: string;
}) {
  // The line's two ends, named inline beside it rather than on a row of their own. Just the sides:
  // which debater argued which is already on the card, directly above.
  const endLabel = 'shrink-0 text-[0.75rem] leading-[0.875rem] text-grey-04';

  if (comparison.status === 'waiting') {
    return (
      <div
        data-end-card-comparison="waiting"
        className="mt-3.5 flex flex-col gap-2 rounded-lg bg-grey-01 px-3.5 py-3 @max-md:mt-2.5 @max-md:px-3 @max-md:py-2.5"
      >
        <span className="text-chatMedium">Claim vs. arguments</span>
        <div className="flex items-center gap-2.5 py-1 @max-md:gap-2">
          <span className={endLabel}>Agree</span>
          <div className="h-1 flex-1 rounded-full bg-grey-02" />
          <span className={endLabel}>Disagree</span>
        </div>
        <p className="text-metadata text-grey-04 @max-md:text-chat">
          Shows once the claim and each debater&rsquo;s claims have a few votes.
        </p>
      </div>
    );
  }

  const reading = claimVsArgumentsReading(comparison, { agreeName, disagreeName });
  // Agree runs from the left, like the Agree button and the green end of every split bar on the card,
  // so a share of agreement is measured in from the left edge: 62% agree sits 38% of the way along.
  const along = (agreePercent: number) => 100 - agreePercent;
  const claimAt = along(comparison.claimPercent);
  const argumentsAt = along(comparison.argumentsPercent);
  const low = Math.min(claimAt, argumentsAt);
  const high = Math.max(claimAt, argumentsAt);
  // Keep a marker's label on the line even where the marker sits at an end of it.
  const labelAt = (position: number) => `${Math.min(90, Math.max(10, position))}%`;

  return (
    <div
      data-end-card-comparison="ready"
      className="mt-3.5 flex flex-col gap-2 rounded-lg bg-grey-01 px-3.5 py-3 @max-md:mt-2.5 @max-md:px-3 @max-md:py-2.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-chatMedium">Claim vs. arguments</span>
        <span className="shrink-0 text-chatMedium text-purple tabular-nums">{comparison.gap} pts apart</span>
      </div>

      <div
        role="img"
        aria-label={`${comparison.claimPercent}% agree with the claim; agreement with the debaters' claims sits at ${comparison.argumentsPercent}% toward the Agree side.`}
        className="flex items-center gap-2.5 @max-md:gap-2"
      >
        <span className={endLabel}>Agree</span>
        <div className="relative h-11 flex-1">
          <span
            className="absolute top-0 -translate-x-1/2 text-[0.75rem] leading-[0.875rem] whitespace-nowrap text-grey-04"
            style={{ left: labelAt(claimAt) }}
          >
            Claim
          </span>
          {/* Centred in the box, so the end labels beside it sit level with the line itself. */}
          <div className="absolute inset-x-0 top-5 h-1 rounded-full bg-grey-02" />
          <div className="absolute top-5 h-1 bg-purple" style={{ left: `${low}%`, width: `${high - low}%` }} />
          <span
            data-marker="claim"
            className="absolute top-4 size-3 -translate-x-1/2 rounded-full bg-text ring-2 ring-grey-01"
            style={{ left: `${claimAt}%` }}
          />
          <span
            data-marker="arguments"
            className="absolute top-4 size-3 -translate-x-1/2 rounded-full border-2 border-text bg-grey-01"
            style={{ left: `${argumentsAt}%` }}
          />
          <span
            className="absolute top-[1.875rem] -translate-x-1/2 text-[0.75rem] leading-[0.875rem] whitespace-nowrap text-grey-04"
            style={{ left: labelAt(argumentsAt) }}
          >
            Arguments
          </span>
        </div>
        <span className={endLabel}>Disagree</span>
      </div>

      <p className="text-metadata @max-md:text-chat">{reading}</p>
    </div>
  );
}
