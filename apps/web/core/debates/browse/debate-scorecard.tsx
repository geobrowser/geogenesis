'use client';

import * as React from 'react';

import { formatTimecode } from '~/core/debates/claim-timing';

import { Text } from '~/design-system/text';

import type { DebateTicker } from './debate-claim-ticker';
import { DebateClaimTickerCard } from './debate-claim-ticker';

/**
 * What the viewer is left with when the video stops.
 *
 * The end of playback already had a moment — a replay button and the winner vote — with nothing in
 * it about what the viewer just did. This fills that in: how many claims they took a position on,
 * and the ones they let go by, one at a time, so the claims they missed are a few taps rather than
 * a trip to the panel.
 *
 * It does not draw the winner vote. That already lives on each debater's tile and is visible at
 * the same moment; a second copy here would be two controls publishing the same vote.
 */
export function DebateScorecard({ ticker, onReplay }: { ticker: DebateTicker; onReplay: () => void }) {
  const { claims, answered, rowsByClaimId, entitiesByClaimId, onAnswered } = ticker;

  const [skipped, setSkipped] = React.useState<ReadonlySet<string>>(() => new Set());

  const remaining = React.useMemo(
    () => claims.filter(claim => !answered.has(claim.id) && !skipped.has(claim.id) && claim.spaceId !== null),
    [claims, answered, skipped]
  );

  const skip = React.useCallback((claimId: string) => {
    setSkipped(current => new Set(current).add(claimId));
  }, []);

  // Nothing to say about a debate with no claims — the card would be an empty frame over the
  // replay button.
  if (claims.length === 0) return null;

  const next = remaining[0] ?? null;

  return (
    <div className="pointer-events-auto w-full max-w-[26rem] rounded-lg bg-white p-4 shadow-card">
      <Text as="p" variant="smallTitle" color="text">
        {answered.size === 0
          ? 'You watched without taking a position'
          : `You took a position on ${answered.size} of ${claims.length} claims`}
      </Text>

      {next ? (
        <>
          <Text as="p" variant="footnote" color="grey-04" className="mt-1">
            {remaining.length === 1 ? 'One you skipped' : `${remaining.length} you skipped`}
            {next.timing ? ` · said at ${formatTimecode(next.timing.startMs)}` : null}
          </Text>
          <div className="mt-3">
            <DebateClaimTickerCard
              key={next.id}
              window={{ claim: next, startMs: 0, endMs: 0 }}
              row={rowsByClaimId.get(next.id) ?? null}
              entity={entitiesByClaimId.get(next.id) ?? null}
              onAnswered={onAnswered}
            />
          </div>
          {/* The live card has no dismiss — it fades on its own. Here nothing is going to take the
              claim away, so passing on it has to be a thing the reader can say. */}
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              skip(next.id);
            }}
            className="mt-2 text-metadata text-grey-04 transition-colors hover:text-text"
          >
            Skip this one
          </button>
        </>
      ) : (
        <Text as="p" variant="footnote" color="grey-04" className="mt-1">
          That is every claim from this debate. Now say who won.
        </Text>
      )}

      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onReplay();
        }}
        className="mt-3 text-metadata text-grey-04 transition-colors hover:text-text"
      >
        Watch again
      </button>
    </div>
  );
}
