'use client';

import { responsePositionLabel } from '~/core/responses/entity-response';

import { VoteNote } from './local-vote-note';
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
  if (outcome.kind === 'kept') return <VoteNote announce>You voted {responsePositionLabel(position)}</VoteNote>;
  return (
    <VoteNote
      announce
      action={{ label: 'Undo', onPress: onUndo, analyticsLabel: 'email_vote_undo', analyticsIntent: 'undo' }}
    >
      Vote counted
    </VoteNote>
  );
}
