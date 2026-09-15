'use client';

import * as React from 'react';

import cx from 'classnames';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { type TimedClaim, formatTimecode } from '~/core/debates/claim-timing';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
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
      <header className="border-b border-divider px-4 py-3">
        <p className="text-smallTitle text-text">{next ? 'Where do you stand?' : 'That is all of them'}</p>
        <p className="mt-0.5 text-footnote tabular-nums text-grey-04">
          {next
            ? `${answerable.length} claims were made · ${answered.size} answered`
            : `You answered ${answered.size} of ${answerable.length}. Now say who won.`}
        </p>
      </header>

      {next ? (
        <ScorecardClaim
          key={next.id}
          claim={next}
          speaker={speakerByClaimId.get(next.id) ?? null}
          row={rowsByClaimId.get(next.id) ?? null}
          entity={entitiesByClaimId.get(next.id) ?? null}
          onAnswered={onAnswered}
        />
      ) : null}

      <footer className="flex items-center justify-between gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onReplay();
          }}
          className="text-metadata text-grey-04 transition-colors hover:text-text"
        >
          Watch again
        </button>
        {next ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              skip(next.id);
            }}
            className="text-metadata text-grey-04 transition-colors hover:text-text"
          >
            Skip
          </button>
        ) : null}
      </footer>
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
}: {
  claim: TimedClaim;
  speaker: string | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string) => void;
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

  const copy = ENTITY_RESPONSE_COPY[responseKind];

  return (
    <div className="px-4 py-3.5">
      <p className="text-footnote text-grey-04">
        {speaker ? `${speaker} said` : 'Said'}
        {claim.timing ? ` at ${formatTimecode(claim.timing.startMs)}` : null}
      </p>
      <p className="mt-1.5 text-metadataMedium leading-snug text-text">{claim.text}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <SideButton
          label={copy.positiveAction}
          tone="positive"
          disabled={!control.canRespond}
          title={control.actionTitle(true)}
          onClick={() => control.respond(true)}
        />
        <SideButton
          label={copy.negativeAction}
          tone="negative"
          disabled={!control.canRespond}
          title={control.actionTitle(false)}
          onClick={() => control.respond(false)}
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

function SideButton({
  label,
  tone,
  disabled,
  title,
  onClick,
}: {
  label: string;
  tone: 'positive' | 'negative';
  disabled: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title || undefined}
      disabled={disabled}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className={cx(
        'rounded-md border border-grey-02 px-3 py-2 text-metadataMedium text-text transition-colors disabled:cursor-default disabled:opacity-50',
        tone === 'positive'
          ? 'hover:border-green hover:bg-successTertiary'
          : 'hover:border-red-01 hover:bg-errorTertiary'
      )}
    >
      {label}
    </button>
  );
}
