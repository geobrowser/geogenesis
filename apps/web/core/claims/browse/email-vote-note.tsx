'use client';

import { responsePositionLabel } from '~/core/responses/entity-response';

import type { EmailVoteOutcome } from './use-email-vote-link';

/**
 * Under the pill an email's vote link answered (GEO-3374): that the vote counted, with a way to take
 * it back, or that the side the reader already held was kept. Only while that side is still the one
 * drawn, so it goes the moment the reader presses something else.
 *
 * A side kept only on this device gets "Not counted yet · Save" instead, which `PositionRow` puts in
 * this note's place.
 */
export function EmailVoteNote({
  outcome,
  position,
  viewerPosition,
  onUndo,
}: {
  outcome: EmailVoteOutcome | null;
  /** The pill this note sits under. */
  position: boolean;
  viewerPosition: boolean | null;
  onUndo: () => void;
}) {
  if (!outcome || outcome.position !== position || viewerPosition !== position) return null;
  const side = responsePositionLabel(position);

  if (outcome.kind === 'kept') {
    return (
      <p role="status" className="mt-1 text-center text-footnote text-grey-04">
        You voted {side}
      </p>
    );
  }
  return (
    <p role="status" className="mt-1 text-center text-footnote text-grey-04">
      Vote counted ·{' '}
      <button
        type="button"
        onClick={onUndo}
        data-geo-analytics-label="email_vote_undo"
        data-geo-analytics-intent="undo"
        className="font-medium text-text underline underline-offset-2 hover:text-grey-04"
      >
        Undo
      </button>
    </p>
  );
}
