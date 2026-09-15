'use client';

import * as React from 'react';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { Debate, DebateClaim, DebateParticipant } from '~/core/debates/api';
import { type TimedClaim, formatTimecode } from '~/core/debates/claim-timing';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import type { DebateVotesResult } from '~/core/debates/use-debate-votes';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import type { Entity } from '~/core/types';

import { Text } from '~/design-system/text';

import type { DebateTicker } from './debate-claim-ticker';
import { WinnerVoteButton } from './winner-vote-button';

/** How long a taken side stays on screen before the card moves on. */
const ADVANCE_DELAY_MS = 700;

/**
 * The ask, once the video has stopped.
 *
 * Taking a position on a claim is what this whole feature is for, and this is where it gets asked
 * properly: the video is done, nothing is moving, and one claim at a time gets the claim card's own
 * pills rather than anything improvised.
 *
 * It ends on the debate's own question. Having gone through every claim, the viewer has just
 * assembled their own answer to "who won" — so that vote belongs at the end of the sequence rather
 * than only on the tiles behind the dimmed backdrop.
 */
export function DebateScorecard({
  debate,
  ticker,
  votes,
  onReplay,
}: {
  debate: Debate;
  ticker: DebateTicker;
  votes: DebateVotesResult;
  onReplay: () => void;
}) {
  const { claims, answered, answers, rowsByClaimId, entitiesByClaimId, speakerByClaimId, onAnswered } = ticker;

  const [skipped, setSkipped] = React.useState<ReadonlySet<string>>(() => new Set());

  const answerable = React.useMemo(() => claims.filter(claim => claim.spaceId !== null), [claims]);
  const remaining = React.useMemo(
    () => answerable.filter(claim => !answered.has(claim.id) && !skipped.has(claim.id)),
    [answerable, answered, skipped]
  );

  const skip = React.useCallback((claimId: string) => {
    setSkipped(current => new Set(current).add(claimId));
  }, []);

  const lean = useDebateLean(debate, claims, answers, speakerByClaimId);

  // A debate with no claims has nothing to ask about, and the card would be an empty frame over
  // the replay button.
  if (answerable.length === 0) return null;

  const next = remaining[0] ?? null;

  return (
    <div className="pointer-events-auto w-full max-w-[24rem] overflow-hidden rounded-lg bg-white shadow-card">
      <header className="flex items-start justify-between gap-3 border-b border-divider px-4 py-3">
        <div className="min-w-0">
          <Text as="p" variant="smallTitle" color="text">
            {next ? 'Where do you stand?' : 'That is all of them'}
          </Text>
          <Text as="p" variant="footnote" color="grey-04" className="mt-0.5 tabular-nums">
            {next
              ? `${answerable.length} claims were made · ${answered.size} answered`
              : `You answered ${answered.size} of ${answerable.length}`}
          </Text>
        </div>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onReplay();
          }}
          className="shrink-0 text-metadata text-grey-04 transition-colors hover:text-text"
        >
          Watch again
        </button>
      </header>

      {next ? (
        <ScorecardClaim
          key={next.id}
          claim={next}
          speaker={speakerByClaimId.get(next.id) ?? null}
          row={rowsByClaimId.get(next.id) ?? null}
          entity={entitiesByClaimId.get(next.id) ?? null}
          onAnswered={onAnswered}
          onSkip={skip}
        />
      ) : (
        <DebateLean lean={lean} votes={votes} />
      )}
    </div>
  );
}

type SpeakerLean = { participant: DebateParticipant; label: string; agreed: number; answered: number };

/**
 * How the viewer's answers fell across the two debaters.
 *
 * Counted against the claims they actually answered, not against everything that debater said: "5
 * of 7" out of seven answered is a lean, while the same five out of a dozen claims they skipped
 * would read as disagreement they never expressed.
 */
function useDebateLean(
  debate: Debate,
  claims: TimedClaim[],
  answers: ReadonlyMap<string, boolean>,
  speakerByClaimId: Map<string, string>
): SpeakerLean[] {
  return React.useMemo(() => {
    const byLabel = new Map<string, SpeakerLean>();
    for (const participant of orderedParticipants(debate)) {
      const label = speakerLabel(participant);
      byLabel.set(label, { participant, label, agreed: 0, answered: 0 });
    }

    for (const claim of claims) {
      const position = answers.get(claim.id);
      if (position === undefined) continue;
      const entry = byLabel.get(speakerByClaimId.get(claim.id) ?? '');
      if (!entry) continue;
      entry.answered += 1;
      if (position) entry.agreed += 1;
    }

    return [...byLabel.values()];
  }, [debate, claims, answers, speakerByClaimId]);
}

/**
 * Where the viewer landed, and then the debate's own question.
 *
 * The lean is stated rather than scored, because the interesting part is not the arithmetic: a
 * viewer who agreed with one debater's claims more often might still think the other argued the
 * better debate. The winner vote sits right under it so they can say so.
 */
function DebateLean({ lean, votes }: { lean: SpeakerLean[]; votes: DebateVotesResult }) {
  const answeredAny = lean.some(entry => entry.answered > 0);
  const ranked = [...lean].sort((a, b) => b.agreed - a.agreed);
  const leader = ranked[0];
  const runnerUp = ranked[1];
  const tied = Boolean(leader && runnerUp && leader.agreed === runnerUp.agreed);

  return (
    <div className="px-4 py-3.5">
      {answeredAny ? (
        <>
          <Text as="p" variant="metadataMedium" color="text">
            {tied ? 'You split evenly between them' : `You agreed with ${leader.label} most`}
          </Text>
          <div className="mt-2 flex flex-col gap-1">
            {lean.map(entry => (
              <div key={entry.label} className="flex items-baseline justify-between gap-3">
                <Text as="span" variant="footnote" color="grey-04" className="truncate">
                  {entry.label}
                </Text>
                <Text as="span" variant="footnote" color="grey-04" className="shrink-0 tabular-nums">
                  {entry.answered === 0 ? 'none answered' : `agreed with ${entry.agreed} of ${entry.answered}`}
                </Text>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Text as="p" variant="metadataMedium" color="text">
          You skipped every claim
        </Text>
      )}

      <Text as="p" variant="footnote" color="grey-04" className="mt-3.5">
        So who won the debate?
      </Text>
      {/* The same control as the tiles, driven by the same hook, so a vote cast here shows there
          too rather than the two disagreeing. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {lean.map(entry => (
          <WinnerVoteButton
            key={entry.label}
            surface="panel"
            debaterName={entry.label}
            sharePercent={votes.sharePercentFor(entry.participant)}
            isMyPick={votes.isMyPick(entry.participant)}
            disabled={votes.isVoting}
            onVote={() => votes.castVote(entry.participant)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One claim, with both sides spelled out.
 *
 * The claim card's own pills, not a lookalike: this is the same question the explore feed, the hub
 * and the claims panel ask, and there is room here for the full control.
 */
function ScorecardClaim({
  claim,
  speaker,
  row,
  entity,
  onAnswered,
  onSkip,
}: {
  claim: TimedClaim;
  speaker: string | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean) => void;
  onSkip: (claimId: string) => void;
}) {
  const promptSignIn = usePrivySignIn();
  // Narrowed by the caller, which only passes claims that have a space to publish into.
  const spaceId = claim.spaceId as string;
  const {
    responseKind,
    isResponseKindResolved,
    isViewerResponseResolved,
    responseBlockedReason,
    claim: claimSummary,
    positions,
    readiness,
  } = useClaimResponseState({ claimId: claim.id, spaceId, row, entity });

  const control = useClaimPositionControl({
    claim: claimSummary,
    positions,
    readiness,
    answersReady: isResponseKindResolved && isViewerResponseResolved,
    responseBlockedReason,
    onRequireSignIn: promptSignIn,
    offersDebate: false,
  });

  const position = control.viewerPosition;

  // Held for a beat before moving on. Advancing the instant the response lands swaps the card out
  // from under the press, so the pill never gets to show as taken and there is no way to tell the
  // tap registered. The response itself is already published by then; this delays the card, not
  // the write.
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (position === null || reported.current) return;
    reported.current = true;

    const timer = setTimeout(() => onAnswered(claim.id, position), ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [position, claim.id, onAnswered]);

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <Text as="p" variant="footnote" color="grey-04" className="min-w-0 truncate">
          {speaker ? `${speaker} said` : 'Said'}
          {claim.timing ? ` at ${formatTimecode(claim.timing.startMs)}` : null}
        </Text>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onSkip(claim.id);
          }}
          className="shrink-0 text-metadata text-grey-04 transition-colors hover:text-text"
        >
          Skip
        </button>
      </div>
      <Text as="p" variant="metadataMedium" color="text" className="mt-1.5 leading-snug">
        {claim.text}
      </Text>

      <div className="mt-3">
        <PositionRow
          positions={control.optimisticPositions}
          responseKind={responseKind}
          viewerPosition={control.viewerPosition}
          onRespond={control.respond}
          disabled={!control.canRespond}
          titleFor={control.actionTitle}
        />
      </div>

      {control.responseError ? (
        <div role="alert" className="mt-2">
          <Text as="p" variant="footnote" color="red-01">
            {control.responseError}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
