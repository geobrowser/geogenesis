'use client';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_RESPONSE_OBJECT_TYPE, type ClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSplitBar } from '~/core/claims/browse/claim-summary';
import { DebateTileChip } from '~/core/debates/debate-video-tile';
import { type ClaimVsArguments, type ResponseSplit, claimVsArgumentsReading } from '~/core/debates/end-card';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { type ResponseKind, responsePositionLabel } from '~/core/responses/entity-response';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';
import { ClaimResponderAvatars } from '~/partials/entity-page/claim-voter-avatars';
import { RespondersPopover } from '~/partials/entity-page/entity-vote-buttons';

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
 * No claims list. They popped up over the video as they were made; the faces beside each debater
 * open them in the claims panel, and the claims pill sits directly under the video as it always has.
 *
 * Sized to fit a feed card's player without scrolling. That is why replay lives in the card's own
 * header rather than in a band above it, and why the card carries no second claims pill: each was a
 * row of height the content needed. It still scrolls as a last resort on a player too short for it.
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
      {/* The corner the pause control sat in for the whole debate, now starting it again. Inside this
          layer rather than left on the tile, which the card sits above. */}
      <div className="absolute top-3 left-3 @max-md:top-2.5 @max-md:left-2.5 @max-md:[&>button]:size-9">{replay}</div>

      {/* As tall as its content rather than the player: a card stretched to the bottom edge left a
          band of blank white under the comparison that read as something missing. Capped at the
          player, and scrolls as a last resort on one too short for it. */}
      <section
        aria-label="Debate results"
        className="absolute inset-x-4 top-16 flex max-h-[calc(100%-5rem)] flex-col overflow-y-auto overscroll-contain rounded-xl bg-white p-5 text-text shadow-card @max-md:inset-x-2 @max-md:top-14 @max-md:max-h-[calc(100%-4rem)] @max-md:rounded-lg @max-md:p-3.5"
      >
        <div className="flex flex-col gap-3 @max-md:gap-2.5">
          <div className="flex flex-col gap-1">
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
            variant="claim"
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

        <div className="my-3.5 h-px shrink-0 bg-divider @max-md:my-2.5" />

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
  variant,
  leading,
}: {
  summary: Pick<ResponseSplit, 'percent' | 'total'>;
  countsReady: boolean;
  faces: React.ReactNode;
  /**
   * `claim` is the full row under the claim: "62% agree", the thicker bar. `debater` is the same row
   * at a column's width, sharing its line with the claim count — so it drops the verb, which the
   * claim's row directly above has already established, rather than squeezing the bar to nothing.
   */
  variant: 'claim' | 'debater';
  /** Drawn before the share, on the same line. */
  leading?: React.ReactNode;
}) {
  const hasVotes = countsReady && summary.percent !== null;
  const isClaim = variant === 'claim';
  const bar = isClaim ? 'h-2 @max-md:h-1.5' : 'h-1.5';

  return (
    <div className={cx('flex items-center', isClaim ? 'gap-3 @max-md:gap-2' : 'gap-2 @max-md:gap-1.5')}>
      {leading}
      {hasVotes ? (
        <span
          className={cx(
            'shrink-0 tabular-nums',
            isClaim ? 'text-metadataMedium @max-md:text-chatMedium' : 'text-chatMedium'
          )}
        >
          {summary.percent}%{isClaim ? ' agree' : null}
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
  const countLabel = `${claimCount} ${claimCount === 1 ? 'claim' : 'claims'}`;

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
    <div data-end-card-debater={participant.profile_space_id} className="flex min-w-0 flex-col gap-2 @max-md:gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-grey-02 @max-md:size-[1.125rem]">
          <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={20} />
        </span>
        <span className="truncate text-metadataMedium @max-md:text-chatMedium">{name}</span>
        <DebateTileChip className="shrink-0 bg-divider text-text @max-md:hidden">{side}</DebateTileChip>
      </div>

      {/* On a narrow player the count and the side take their own line: the vote row below has no
          width to spare for them, and the side chip is dropped from the name's row there. */}
      <span className="hidden text-chat text-grey-04 tabular-nums @max-md:block">
        {countLabel} · {side}
      </span>

      <VoteRow
        summary={split}
        countsReady={countsReady}
        variant="debater"
        // Wider players fold the count into this row rather than giving it one of its own: a
        // number and a word left most of a line empty, and the card needed that height.
        leading={<span className="shrink-0 text-chat text-grey-04 tabular-nums @max-md:hidden">{countLabel} ·</span>}
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
  // The line's two ends, named inline beside it rather than on a row of their own. Just the sides:
  // which debater argued which is already on the card, directly above.
  const endLabel = 'shrink-0 text-[0.75rem] leading-[0.875rem] text-grey-04';

  if (comparison.status === 'waiting') {
    return (
      <div
        data-end-card-comparison="waiting"
        className="mt-3.5 flex flex-col gap-2 rounded-lg bg-grey-01 px-3.5 py-3 @max-md:mt-3 @max-md:px-3 @max-md:py-2.5"
      >
        <span className="text-chatMedium">Claim vs. arguments</span>
        <div className="flex items-center gap-2.5 py-1 @max-md:hidden">
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
      className="mt-3.5 flex flex-col gap-2 rounded-lg bg-grey-01 px-3.5 py-3 @max-md:mt-3 @max-md:flex-row @max-md:items-center @max-md:px-3 @max-md:py-2.5"
    >
      <div className="flex items-baseline justify-between @max-md:hidden">
        <span className="text-chatMedium">Claim vs. arguments</span>
        <span className="text-chatMedium text-purple tabular-nums">{comparison.gap} pts apart</span>
      </div>
      <span className="hidden shrink-0 text-[1.3125rem] leading-none font-semibold text-purple tabular-nums @max-md:block">
        {comparison.gap}
        <span className="text-[0.75rem] font-medium"> pts</span>
      </span>

      <div
        role="img"
        aria-label={`${comparison.claimPercent}% agree with the claim; agreement with the debaters' claims sits at ${comparison.argumentsPercent}% toward the Agree side.`}
        className="flex items-center gap-2.5 @max-md:hidden"
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
