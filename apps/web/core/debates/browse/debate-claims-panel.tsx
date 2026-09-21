'use client';

import * as React from 'react';

import { ClaimSummary } from '~/core/claims/browse/claim-summary';
import type { Debate, DebateClaim } from '~/core/debates/api';
import {
  type ClaimTiming,
  formatTimecode,
  isAssertableMoment,
  sortClaimsBySpokenOrder,
} from '~/core/debates/claim-timing';
import { compareByBest, useClaimsBestOrder } from '~/core/debates/claims-best-order';
import { useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { type TranscriptClaim, claimsForParticipant, unmatchedClaims } from '~/core/debates/transcript-claims';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { useDebateClaimResponse } from './use-debate-claim-response';
import { WinnerVoteButton } from './winner-vote-button';

/** How many of a debater's claims show before "Show more". */
const COLLAPSED_CLAIM_COUNT = 3;

/**
 * "Claims" side panel opened from the browse feed's Claims button. Groups the claims extracted
 * from the debate's transcript by the debater who made them.
 *
 * Attribution comes from the *text block's* `Authors` relation rather than the claim's, and that
 * relation points at the speaker's personal space — the same `profile_space_id` these rows already
 * key on. See `core/debates/transcript-claims.ts`.
 */
export function DebateClaimsPanel({ debate, onClose }: { debate: Debate; onClose: () => void }) {
  const participants = orderedParticipants(debate);
  // Same query key as the player's hook, so voting in either place updates both.
  const votes = useDebateVotes(debate);
  // Same query key as the feed's count badge, so opening the panel doesn't refetch.
  const { claims, isLoading, error } = useDebateTranscriptClaims(debate.id, debate.claim.space_id);
  // When each claim was said. Published timecodes where they exist, matched against the transcript
  // otherwise. This drives the order as well as the timecode, so the panel waits on it — see
  // `isOrdering`.
  const { timings, isReady: timingsReady } = useClaimTimings(debate.id, claims);

  // Every claim a debate publishes lands in the debate's own space, so one lookup covers the panel.
  const claimsSpaceId = React.useMemo(
    () => claims.all.find(claim => claim.spaceId !== null)?.spaceId ?? debate.claim.space_id,
    [claims.all, debate.claim.space_id]
  );
  const claimIds = React.useMemo(() => claims.all.map(claim => claim.id), [claims.all]);
  const { rankByClaimId, isReady: rankingReady } = useClaimsBestOrder(claimIds, claimsSpaceId);

  // One lookup for every row rather than one per row. It answers the vocabulary each claim is
  // argued in — Verify/Dispute for a factual claim, Agree/Disagree otherwise — which is the whole
  // reason these rows now carry labelled pills instead of two unlabelled chevrons.
  // The graph's answer to the same question, for claims geo-chat has no row for — a space it does
  // not index has none at all, and `useDebateClaims` is disabled outright when there are no ids.
  // Without this a factual claim fell back to Agree/Disagree and published a *stance* response,
  // which is the "count one vote kind while publishing another" failure the claim page's own note
  // describes. One batch for the panel rather than a lookup per row.
  const { entities: claimEntities } = useQueryEntities({
    where: { id: { in: claimIds } },
    first: claimIds.length || 1,
    enabled: claimIds.length > 0,
  });
  const entitiesByClaimId = React.useMemo(() => {
    const map = new Map<string, Entity>();
    for (const entity of claimEntities) map.set(entity.id, entity);
    return map;
  }, [claimEntities]);

  // Grouped by each claim's own space rather than sent to one.
  //
  // `claimsSpaceId` is the first non-null space in the transcript, which is fine for the ranking it
  // was written for but wrong here: `TranscriptClaim.spaceId` is allowed to differ per claim, and a
  // debate that quotes an external claim has at least two. Asking one space about all of them means
  // every row outside it comes back empty — losing its vocabulary and its available participants,
  // silently, on the rows most likely to be interesting.
  const rowGroups = React.useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const claim of claims.all) {
      const spaceId = claim.spaceId ?? claimsSpaceId;
      const ids = bySpace.get(spaceId);
      if (ids) ids.push(claim.id);
      else bySpace.set(spaceId, [claim.id]);
    }
    return [...bySpace].map(([spaceId, ids]) => ({ spaceId, claimIds: ids }));
  }, [claims.all, claimsSpaceId]);

  const rowsQuery = useDebateClaimsBySpaces(rowGroups);
  const rowsByClaimId = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const row of rowsQuery.claims) map.set(row.claim_entity_id, row);
    return map;
  }, [rowsQuery.claims]);

  // Held back until both inputs have landed: painting one order and reordering a moment later
  // moves claims under someone already reading, and can carry one across the "Show more" fold
  // after they have looked at it. The timings matter more than the ranking now — without them
  // every claim ties, so the whole list would paint in ranking order and then rearrange itself.
  const isOrdering = isLoading || !rankingReady || !timingsReady;

  /**
   * In the order the debate said them, ranking breaking the ties.
   *
   * These rows were ordered by ranking score, which is the right answer for a feed of unrelated
   * claims and the wrong one inside a transcript: a debate is an argument, and reading its claims
   * out of sequence loses the thread. Ties are every claim of a single turn — a turn is one moment
   * as far as the resolver is concerned — and the ranking still decides those.
   */
  const inSpokenOrder = React.useCallback(
    (subset: TranscriptClaim[]) => sortClaimsBySpokenOrder(subset, timings, compareByBest(rankByClaimId)),
    [timings, rankByClaimId]
  );

  const orphaned = React.useMemo(
    () =>
      isOrdering
        ? []
        : inSpokenOrder(
            unmatchedClaims(
              claims,
              participants.map(participant => participant.profile_space_id)
            )
          ),
    [claims, participants, inSpokenOrder, isOrdering]
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-divider bg-white md:w-full">
      <header className="flex items-center justify-between px-5 py-4">
        <Text as="h2" variant="cardEntityTitle" color="text">
          Claims · {claims.totalCount}
        </Text>
        <button type="button" aria-label="Close" onClick={onClose} className="text-grey-04 hover:text-text">
          <Close />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-6">
        {participants.map(participant => (
          <article key={participant.user_id} className="rounded-lg border border-grey-02 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="block size-10 shrink-0 overflow-hidden rounded-full bg-grey-02">
                <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={40} />
              </span>
              <Text as="span" variant="smallTitle" color="text">
                {speakerLabel(participant)}
              </Text>
              <WinnerVoteButton
                className="ml-auto"
                surface="panel"
                debaterName={speakerLabel(participant)}
                sharePercent={votes.sharePercentFor(participant)}
                isMyPick={votes.isMyPick(participant)}
                disabled={votes.isVoting}
                onVote={() => votes.castVote(participant)}
              />
            </div>
            <ClaimList
              claims={
                isOrdering ? [] : inSpokenOrder(claimsForParticipant(claims, participant.profile_space_id))
              }
              rowsByClaimId={rowsByClaimId}
              entitiesByClaimId={entitiesByClaimId}
              timings={timings}
              isLoading={isOrdering}
              error={error}
            />
          </article>
        ))}
        {/* Attribution comes from the graph and the participant list from geo-chat, so the two can
            disagree. Surfacing the leftovers beats a list that silently reads as complete. */}
        {orphaned.length > 0 && (
          <article className="rounded-lg border border-grey-02 bg-white p-5">
            <Text as="span" variant="smallTitle" color="text">
              Other claims
            </Text>
            <ClaimList
              claims={orphaned}
              rowsByClaimId={rowsByClaimId}
              entitiesByClaimId={entitiesByClaimId}
              timings={timings}
              isLoading={false}
              error={null}
            />
          </article>
        )}
      </div>
    </aside>
  );
}

function ClaimList({
  claims,
  rowsByClaimId,
  entitiesByClaimId,
  timings,
  isLoading,
  error,
}: {
  claims: TranscriptClaim[];
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  timings: Map<string, ClaimTiming>;
  isLoading: boolean;
  error: Error | null;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (claims.length === 0) {
    // A debate recorded before claim extraction shipped has a transcript but no claims, which is
    // indistinguishable here from a speaker who simply made none — so the copy covers both.
    const message = isLoading
      ? 'Loading claims…'
      : error
        ? `Could not load claims: ${error.message}`
        : 'No claims from this debater.';

    return (
      <Text as="p" variant="metadata" color="grey-04" className="mt-5">
        {message}
      </Text>
    );
  }

  const hidden = claims.length - COLLAPSED_CLAIM_COUNT;
  const visible = expanded ? claims : claims.slice(0, COLLAPSED_CLAIM_COUNT);

  return (
    <>
      <ul className="mt-4 space-y-3">
        {visible.map(claim => (
          <li key={claim.id}>
            <ClaimRow
              claim={claim}
              row={rowsByClaimId.get(claim.id) ?? null}
              entity={entitiesByClaimId.get(claim.id) ?? null}
              timing={timings.get(claim.id) ?? null}
            />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(current => !current)}
          className="mt-3 text-metadata text-grey-04 transition-colors hover:text-text"
        >
          {expanded ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}

/**
 * One claim: its text linking to the claim entity, with the same controls every other claim
 * surface uses beneath it.
 *
 * These used to be `EntityRowActions` — the chevron control a data block row renders, where a claim
 * is one entity type among people and places and should look like its neighbours. Here every row
 * *is* a claim, and the chevrons named neither side: Verify/Dispute and Agree/Disagree were
 * indistinguishable in the one place a reader is watching people argue over exactly that
 * distinction.
 *
 * A claim the graph reports no space for is rendered as plain text. Both the link target and the
 * controls are space-scoped, so there is nothing correct to point either one at — better a dead row
 * than one that navigates somewhere wrong or publishes a response into the wrong space.
 */
function ClaimRow({
  claim,
  row,
  entity,
  timing,
}: {
  claim: TranscriptClaim;
  row: DebateClaim | null;
  entity: Entity | null;
  timing: ClaimTiming | null;
}) {
  if (claim.spaceId === null) {
    return (
      <Text as="p" variant="metadata" color="text">
        {claim.text}
      </Text>
    );
  }

  return (
    <>
      <Link href={NavUtils.toEntity(claim.spaceId, claim.id)} className="block hover:underline">
        <Text as="span" variant="metadata" color="text">
          {claim.text}
        </Text>
      </Link>
      <ClaimTimecode timing={timing} />
      <PanelClaimControls claimId={claim.id} spaceId={claim.spaceId} row={row} entity={entity} />
    </>
  );
}

/**
 * When this claim was said.
 *
 * Nothing is drawn for a claim whose moment is only known to the turn (`source: 'block'`, a ~30s
 * window) or not at all. A timecode reads as "here it is", and pointing at a half-minute of video
 * is a worse answer than staying quiet — the reader still has the claim text and the panel.
 */
function ClaimTimecode({ timing }: { timing: ClaimTiming | null }) {
  // The same bar the card over the video clears. This used to admit any matched claim, so a loose
  // match the live layer would not draw still printed a time to the second — and nothing about
  // "Said at 2:29" tells the reader it was inferred. A claim below the bar is still *ordered* by
  // its match; it just does not get to name a second.
  if (!isAssertableMoment(timing)) return null;

  return (
    <Text as="span" variant="footnote" color="grey-04" className="mt-1 block tabular-nums">
      Said at {formatTimecode(timing.startMs)}
    </Text>
  );
}

/**
 * The panel's compact rendition of the card's controls: the side pills and the summary, without the
 * card chrome around them.
 *
 * No space chip — every claim here belongs to the debate's own space, so naming it on every row
 * says nothing. No end slot either: the reader is already watching the debate this claim is being
 * argued in, and offering to request another one is the wrong invitation at the wrong moment.
 *
 * What remains is the vocabulary, which is the part that has to match: the same pills, publishing
 * through the same path, and the same shared summary as the hub, the topic page and the feed.
 */
function PanelClaimControls({
  claimId,
  spaceId,
  row,
  entity,
}: {
  claimId: string;
  spaceId: string;
  row: DebateClaim | null;
  entity: Entity | null;
}) {
  // The claim's row title is drawn by `ClaimRow` above, so nothing is passed for it here.
  const { responseKind, summary, control } = useDebateClaimResponse({
    claimId,
    spaceId,
    row,
    entity,
  });

  return (
    <div className="mt-2">
      <PositionRow
        positions={control.optimisticPositions}
        responseKind={responseKind}
        viewerPosition={control.viewerPosition}
        onRespond={control.respond}
        disabled={!control.canRespond}
        titleFor={control.actionTitle}
      />
      {control.responseError ? (
        <div role="alert" className="mt-1.5">
          <Text as="p" variant="footnote" color="red-01">
            {control.responseError}
          </Text>
        </div>
      ) : null}
      {summary.isLoading ? null : (
        <ClaimSummary
          entityId={claimId}
          spaceId={spaceId}
          responseKind={responseKind}
          summary={summary}
          className="mt-2"
        />
      )}
    </div>
  );
}
