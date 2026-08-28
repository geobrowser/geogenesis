'use client';

import * as React from 'react';

import {
  positionSummariesFromCounts,
  viewerResponseFromDirection,
} from '~/core/claims/browse/claim-position-summaries';
import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSummary } from '~/core/claims/browse/claim-summary';
import type { Debate, DebateClaim } from '~/core/debates/api';
import { sortClaimsByBest, useClaimsBestOrder } from '~/core/debates/claims-best-order';
import { useDebateClaims } from '~/core/debates/hooks';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { type TranscriptClaim, claimsForParticipant, unmatchedClaims } from '~/core/debates/transcript-claims';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

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
  const rowsQuery = useDebateClaims(claimsSpaceId, claimIds, claimIds.length > 0);
  const rowsByClaimId = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const row of rowsQuery.data?.claims ?? []) map.set(row.claim_entity_id, row);
    return map;
  }, [rowsQuery.data]);

  // Held back the way the debate feed holds its rows back while the same ranking loads: painting
  // transcript order first and reordering a moment later moves claims under someone already
  // reading, and can carry one across the "Show more" fold after they have looked at it.
  const isOrdering = isLoading || !rankingReady;

  const orphaned = React.useMemo(
    () =>
      isOrdering
        ? []
        : sortClaimsByBest(
            unmatchedClaims(
              claims,
              participants.map(participant => participant.profile_space_id)
            ),
            rankByClaimId
          ),
    [claims, participants, rankByClaimId, isOrdering]
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
                isOrdering
                  ? []
                  : sortClaimsByBest(claimsForParticipant(claims, participant.profile_space_id), rankByClaimId)
              }
              rowsByClaimId={rowsByClaimId}
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
            <ClaimList claims={orphaned} rowsByClaimId={rowsByClaimId} isLoading={false} error={null} />
          </article>
        )}
      </div>
    </aside>
  );
}

function ClaimList({
  claims,
  rowsByClaimId,
  isLoading,
  error,
}: {
  claims: TranscriptClaim[];
  rowsByClaimId: Map<string, DebateClaim>;
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
            <ClaimRow claim={claim} row={rowsByClaimId.get(claim.id) ?? null} />
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
function ClaimRow({ claim, row }: { claim: TranscriptClaim; row: DebateClaim | null }) {
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
      <PanelClaimControls claimId={claim.id} spaceId={claim.spaceId} row={row} />
    </>
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
 * through the same path, and the same evidence-scaled summary as the hub, the topic page and the
 * feed.
 */
function PanelClaimControls({ claimId, spaceId, row }: { claimId: string; spaceId: string; row: DebateClaim | null }) {
  // geo-chat's row is the usual source of the vocabulary; a space it does not index has no row, and
  // Agree/Disagree is the right default for a claim nothing has said otherwise about.
  const responseKind = row?.response_kind ?? 'stance';
  const summary = useClaimResponseSummary(claimId, spaceId, responseKind);

  const claim = React.useMemo(
    () => ({
      id: row?.id ?? claimId,
      space_id: spaceId,
      claim_entity_id: claimId,
      claim: '',
      description: null,
    }),
    [claimId, row?.id, spaceId]
  );

  const positions = React.useMemo(
    () => positionSummariesFromCounts(summary.positive, summary.negative, responseKind, row),
    [responseKind, row, summary.negative, summary.positive]
  );

  const readiness = React.useMemo(
    () => ({
      response_kind: responseKind,
      viewer_response: row?.viewer_response ?? viewerResponseFromDirection(summary.viewerDirection, responseKind),
      viewer_debate_ready: row?.viewer_debate_ready ?? false,
      readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
    }),
    [responseKind, row, summary.viewerDirection]
  );

  const promptSignIn = usePrivySignIn();
  const control = useClaimPositionControl({ claim, positions, readiness, onRequireSignIn: promptSignIn });

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
