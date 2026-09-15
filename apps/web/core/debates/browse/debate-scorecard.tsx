'use client';

import * as React from 'react';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { type TimedClaim, formatTimecode } from '~/core/debates/claim-timing';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import type { Entity } from '~/core/types';

import type { DebateTicker } from './debate-claim-ticker';

/**
 * The ask, once the video has stopped.
 *
 * During playback the claims are ambient — they float past and the icons are there if the viewer
 * feels strongly about one. This is where taking a position is the actual request, so it gets the
 * whole frame: the video is done, there is nothing left to obscure, and one claim at a time with
 * labelled buttons is a different act from tapping a thumb at a passing line.
 *
 * It does not draw the winner vote. That already lives on each debater's tile and is visible at the
 * same moment; a second copy here would be two controls publishing one vote.
 */
export function DebateScorecard({ ticker, onReplay }: { ticker: DebateTicker; onReplay: () => void }) {
  const { claims, answered, rowsByClaimId, entitiesByClaimId, speakerByClaimId, onAnswered } = ticker;

  const [skipped, setSkipped] = React.useState<ReadonlySet<string>>(() => new Set());

  const answerable = React.useMemo(() => claims.filter(claim => claim.spaceId !== null), [claims]);
  const remaining = React.useMemo(
    () => answerable.filter(claim => !answered.has(claim.id) && !skipped.has(claim.id)),
    [answerable, answered, skipped]
  );

  const skip = React.useCallback((claimId: string) => {
    setSkipped(current => new Set(current).add(claimId));
  }, []);

  // A debate with no claims has nothing to ask about, and the card would be an empty frame over
  // the replay button.
  if (answerable.length === 0) return null;

  const next = remaining[0] ?? null;

  return (
    <div className="pointer-events-auto w-full max-w-[24rem] overflow-hidden rounded-lg bg-white shadow-card">
      <header className="flex items-start justify-between gap-3 border-b border-divider px-4 py-3">
        <div className="min-w-0">
          <p className="text-smallTitle text-text">{next ? 'Where do you stand?' : 'That is all of them'}</p>
          <p className="mt-0.5 text-footnote tabular-nums text-grey-04">
            {next
              ? `${answerable.length} claims were made · ${answered.size} answered`
              : `You answered ${answered.size} of ${answerable.length}. Now say who won.`}
          </p>
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
      ) : null}
    </div>
  );
}

/**
 * One claim, with both sides spelled out.
 *
 * Labelled buttons here, unlike the floating lines: nothing is moving, the reader is being asked a
 * question directly, and Verify/Dispute versus Agree/Disagree is what tells them which kind of
 * question it is.
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
  onAnswered: (claimId: string) => void;
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

  // Advance as soon as the viewer answers, so the card walks itself rather than making them press
  // a "next" after every claim. The response is already published by the time this fires.
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (control.viewerPosition !== null && !reported.current) {
      reported.current = true;
      onAnswered(claim.id);
    }
  }, [control.viewerPosition, claim.id, onAnswered]);

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-footnote text-grey-04">
          {speaker ? `${speaker} said` : 'Said'}
          {claim.timing ? ` at ${formatTimecode(claim.timing.startMs)}` : null}
        </p>
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
      <p className="mt-1.5 text-metadataMedium leading-snug text-text">{claim.text}</p>

      {/* The claim card's own pills, not a lookalike. This is the same question the explore feed,
          the hub and the claims panel ask, and there is room here for the full control — unlike the
          floating lines, which are too narrow for it and use bare icons instead. */}
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
        <p role="alert" className="mt-2 text-footnote text-red-01">
          {control.responseError}
        </p>
      ) : null}
    </div>
  );
}
