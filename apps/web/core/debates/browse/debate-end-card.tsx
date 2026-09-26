'use client';

import * as React from 'react';

import { CLAIM_RESPONSE_OBJECT_TYPE, type ClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSplitBar } from '~/core/claims/browse/claim-summary';
import { DebateTileChip } from '~/core/debates/debate-video-tile';
import { type ClaimVsArguments, type ResponseSplit, claimVsArgumentsReading } from '~/core/debates/end-card';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { type ResponseKind, responsePositionLabel } from '~/core/responses/entity-response';

import { Avatar } from '~/design-system/avatar';
import { Warning } from '~/design-system/icons/warning';
import { Text } from '~/design-system/text';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';
import { ClaimResponderAvatars } from '~/partials/entity-page/claim-voter-avatars';
import { RespondersPopover } from '~/partials/entity-page/entity-vote-buttons';

import { PillAction } from './debate-interaction-bar';
import type { EndCardDebater, useDebateEndCard } from './use-debate-end-card';

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
 * player carries `@container`, and below 448px the card tightens and the comparison drops its line.
 *
 * No claims list. They popped up over the video as they were made; the card offers the way back to
 * them — the faces beside each debater, and the pill at the foot — rather than repeating them.
 */
export function DebateEndCard({
  card,
  replay,
  onOpenClaims,
}: {
  card: EndCardData;
  /** The replay control, drawn in the corner the pause control held for the whole debate. */
  replay: React.ReactNode;
  /** Opens the claims panel; with a debater's space id, at that debater's claims. */
  onOpenClaims?: (participantSpaceId?: string) => void;
}) {
  const { claimResponse, debaters, agreeSide, disagreeSide, comparison, countsReady } = card;

  return (
    <div data-debate-end-card className="absolute inset-0 z-40">
      <div aria-hidden className="absolute inset-0 bg-black/55" />
      {/* The corner the pause control sat in during playback. Inside this layer rather than left on
          the tile, which the card sits above.

          On a narrow player the corner costs the card a 60px band it cannot spare, so replay moves
          into the card's own top-right corner, a size down and ringed so a white circle still reads
          against the white card. One control either way — it is placed, not duplicated. */}
      <div className="absolute top-3 left-3 z-10 @max-md:top-3.5 @max-md:right-3.5 @max-md:left-auto @max-md:[&>button]:size-9 @max-md:[&>button]:ring-1 @max-md:[&>button]:ring-grey-02">
        {replay}
      </div>

      <section
        aria-label="Debate results"
        className="absolute inset-x-4 top-16 bottom-3.5 flex flex-col overflow-y-auto overscroll-contain rounded-xl bg-white p-5 text-text shadow-card @max-md:inset-x-2 @max-md:top-2 @max-md:bottom-2 @max-md:rounded-lg @max-md:p-3.5"
      >
        <div className="flex flex-col gap-3.5 @max-md:gap-2.5">
          {/* Clear of the replay control, which sits over this corner on a narrow player. */}
          <div className="flex flex-col gap-1.5 @max-md:gap-1 @max-md:pr-10">
            <span className="text-chatMedium text-grey-04">Where do you stand?</span>
            {/* Two lines at most on a narrow player: the feed prints the claim in full directly above
                the video, so here it only has to say which claim the question is about. */}
            <p className="text-cardEntityTitle text-balance @max-md:line-clamp-2 @max-md:text-[0.9375rem] @max-md:leading-5">
              {card.claimText}
            </p>
          </div>

          <VoteRow
            summary={claimResponse.summary}
            countsReady={claimResponse.summary.hasCounts}
            barClassName="h-2 @max-md:h-1.5"
            faces={
              <ClaimVoters
                claimId={card.claimId}
                spaceId={card.spaceId}
                responseKind={claimResponse.responseKind}
                summary={claimResponse.summary}
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

        <div className="mt-[1.125rem] mb-4 h-px shrink-0 bg-divider @max-md:my-2.5" />

        {/* Side by side at every width. Two debaters is the one comparison this card exists to make,
            and stacking them on a phone turns it into two readouts that happen to be near each other. */}
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

        <div className="min-h-3 flex-1" />

        {/* Not on a narrow player, where the same pill sits directly under the video and the card
            needs the height more than a second copy of it. */}
        {onOpenClaims && card.totalClaims > 0 ? (
          <div className="flex justify-center @max-md:hidden">
            <PillAction
              label={`View ${card.totalClaims} ${card.totalClaims === 1 ? 'claim' : 'claims'}`}
              icon={<Warning />}
              onClick={() => onOpenClaims()}
              ariaLabel={`View all ${card.totalClaims} claims from this debate`}
              actionKind="claims"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * A share on the left, the split between, the people on the right — the claim's row and each
 * debater's, drawn by one component so the two cannot drift.
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
  barClassName,
  compactLabel = false,
}: {
  summary: Pick<ResponseSplit, 'percent' | 'total'>;
  countsReady: boolean;
  faces: React.ReactNode;
  barClassName: string;
  /** Drop "agree" below the container breakpoint, where a debater's column cannot spare the width. */
  compactLabel?: boolean;
}) {
  const hasVotes = countsReady && summary.percent !== null;

  return (
    <div className="flex items-center gap-3 @max-md:gap-2">
      {hasVotes ? (
        <span className="shrink-0 text-metadataMedium tabular-nums @max-md:text-chatMedium">
          {summary.percent}%<span className={compactLabel ? '@max-md:hidden' : undefined}> agree</span>
        </span>
      ) : countsReady ? (
        <span className="shrink-0 text-chat text-grey-04">No votes yet</span>
      ) : null}
      {hasVotes ? (
        <ClaimSplitBar percent={summary.percent!} className={`min-w-8 flex-1 ${barClassName}`} />
      ) : (
        <div className={`min-w-8 flex-1 rounded-full bg-grey-01 ${barClassName}`} />
      )}
      {hasVotes ? faces : null}
    </div>
  );
}

/**
 * The people who voted on the claim, opening the list every claim opens: sectioned by side, each row
 * a link to the person.
 */
function ClaimVoters({
  claimId,
  spaceId,
  responseKind,
  summary,
}: {
  claimId: string;
  spaceId: string;
  responseKind: ResponseKind;
  summary: ClaimResponseSummary;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <RespondersPopover
      open={open}
      onOpenChange={setOpen}
      entityId={claimId}
      spaceId={spaceId}
      responseKind={responseKind}
      align="end"
      trigger={
        <button
          type="button"
          aria-label={`${summary.total} ${summary.total === 1 ? 'person' : 'people'} voted on this claim — see who`}
          className="flex shrink-0 cursor-pointer items-center rounded"
        >
          <ClaimResponderAvatars
            entityId={claimId}
            spaceId={spaceId}
            objectType={CLAIM_RESPONSE_OBJECT_TYPE}
            responseKind={responseKind}
            totalResponders={summary.total}
            viewerSpaceId={summary.viewerSpaceId}
            optimisticViewerResponse={summary.viewerDirection}
            size={20}
          />
        </button>
      }
    />
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

  // Across one debater's claims the same person can agree with some and disagree with others, so a
  // single list split by side would misfile them. The faces open the claims panel at this debater's
  // card instead, where every claim carries its own split and its own voters.
  const faces = (
    <RankingAggregatedSubmitterAvatars
      submitterSpaceIds={responderSpaceIds}
      totalCount={responderSpaceIds.length}
      size={12}
    />
  );

  return (
    <div data-end-card-debater={participant.profile_space_id} className="flex min-w-0 flex-col gap-2.5 @max-md:gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-grey-02 @max-md:size-[1.125rem]">
          <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={20} />
        </span>
        <span className="truncate text-metadataMedium @max-md:text-chatMedium">{name}</span>
        <DebateTileChip className="shrink-0 bg-divider text-text @max-md:hidden">{side}</DebateTileChip>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-largeTitle leading-none tabular-nums @max-md:text-[1.5rem]">{claimCount}</span>
        <span className="text-metadata text-grey-04 @max-md:text-chat">
          {claimCount === 1 ? 'claim' : 'claims'}
          <span className="hidden @max-md:inline"> · {side}</span>
        </span>
      </div>

      <VoteRow
        summary={split}
        countsReady={countsReady}
        barClassName="h-1.5"
        compactLabel
        faces={
          onOpenClaims ? (
            <button
              type="button"
              aria-label={`${responderSpaceIds.length} ${
                responderSpaceIds.length === 1 ? 'person' : 'people'
              } voted on ${name}'s claims — open the claims`}
              onClick={() => onOpenClaims(participant.profile_space_id)}
              className="flex shrink-0 cursor-pointer items-center rounded"
            >
              {faces}
            </button>
          ) : (
            <span className="flex shrink-0 items-center">{faces}</span>
          )
        }
      />
    </div>
  );
}

/**
 * The vote on the claim against the claims people agreed with, on one line.
 *
 * The line needs width the two markers cannot get on a narrow player without landing on each
 * other, so below the breakpoint it gives way to the gap and the sentence, which carry the finding
 * on their own.
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
  const ends = (
    <div className="flex justify-between gap-2 text-[0.75rem] leading-[0.875rem] text-grey-04">
      <span className="truncate">Disagree · {disagreeName}</span>
      <span className="truncate">{agreeName} · Agree</span>
    </div>
  );

  if (comparison.status === 'waiting') {
    return (
      <div
        data-end-card-comparison="waiting"
        className="mt-4 flex flex-col gap-2.5 rounded-lg bg-grey-01 px-4 py-3.5 @max-md:mt-3 @max-md:px-3 @max-md:py-2.5"
      >
        <span className="text-chatMedium">Claim vs. arguments</span>
        <div className="flex flex-col gap-1 @max-md:hidden">
          <div className="my-2.5 h-1 rounded-full bg-grey-02" />
          {ends}
        </div>
        <p className="text-metadata text-grey-04 @max-md:text-chat">
          Shows once the claim and each debater&rsquo;s claims have a few votes.
        </p>
      </div>
    );
  }

  const reading = claimVsArgumentsReading(comparison, { agreeName, disagreeName });
  const low = Math.min(comparison.claimPercent, comparison.argumentsPercent);
  const high = Math.max(comparison.claimPercent, comparison.argumentsPercent);
  // Keep a marker's label on the line even where the marker sits at an end of it.
  const labelAt = (percent: number) => `${Math.min(90, Math.max(10, percent))}%`;

  return (
    <div
      data-end-card-comparison="ready"
      className="mt-4 flex flex-col gap-2.5 rounded-lg bg-grey-01 px-4 py-3.5 @max-md:mt-3 @max-md:flex-row @max-md:items-center @max-md:px-3 @max-md:py-2.5"
    >
      <div className="flex items-baseline justify-between @max-md:hidden">
        <span className="text-chatMedium">Claim vs. arguments</span>
        <span className="text-chatMedium text-ctaPrimary tabular-nums">{comparison.gap} pts apart</span>
      </div>
      <span className="hidden shrink-0 text-[1.3125rem] leading-none font-semibold text-ctaPrimary tabular-nums @max-md:block">
        {comparison.gap}
        <span className="text-[0.75rem] font-medium"> pts</span>
      </span>

      <div
        role="img"
        aria-label={`${comparison.claimPercent}% agree with the claim; agreement with the debaters' claims sits at ${comparison.argumentsPercent}% toward the Agree side.`}
        className="flex flex-col gap-1 @max-md:hidden"
      >
        <div className="relative h-[3.375rem]">
          <span
            className="absolute top-0 -translate-x-1/2 text-[0.75rem] leading-[0.875rem] whitespace-nowrap text-grey-04"
            style={{ left: labelAt(comparison.claimPercent) }}
          >
            Claim
          </span>
          <div className="absolute inset-x-0 top-[1.5625rem] h-1 rounded-full bg-grey-02" />
          <div
            className="absolute top-[1.5625rem] h-1 bg-ctaPrimary"
            style={{ left: `${low}%`, width: `${high - low}%` }}
          />
          <span
            data-marker="claim"
            className="absolute top-[1.3125rem] size-3 -translate-x-1/2 rounded-full bg-text ring-2 ring-grey-01"
            style={{ left: `${comparison.claimPercent}%` }}
          />
          <span
            data-marker="arguments"
            className="absolute top-[1.3125rem] size-3 -translate-x-1/2 rounded-full border-2 border-text bg-grey-01"
            style={{ left: `${comparison.argumentsPercent}%` }}
          />
          <span
            className="absolute top-10 -translate-x-1/2 text-[0.75rem] leading-[0.875rem] whitespace-nowrap text-grey-04"
            style={{ left: labelAt(comparison.argumentsPercent) }}
          >
            Arguments
          </span>
        </div>
        {ends}
      </div>

      <p className="text-metadata @max-md:text-chat">{reading}</p>
    </div>
  );
}
