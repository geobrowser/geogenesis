'use client';

import * as React from 'react';

import type { ScheduledDebateRequest } from '~/core/debates/api';
import { useSetToast } from '~/core/hooks/use-toast';

import { useRespondToScheduledDebate } from '../rooms/scheduling-hooks';
import { formatDebateTime } from './scheduled-debate-format';

export type ScheduledDebateAnswer = (requestId: string, accepted: boolean, onFailure?: () => void) => void;

/**
 * GEO-3589: an acceptance that books nothing yet, because the other debater of a Geo-team match has
 * not answered. Accepting a debater's invite books it, so only an admin match is ever left pending.
 * Names who it is waiting on, mid-sentence, or null when the acceptance booked the debate.
 */
export function stillWaitingOn(request: ScheduledDebateRequest): string | null {
  if (!request.created_by_admin || request.status !== 'pending') return null;
  const waiting = request.participants.find(participant => participant.accepted === null);
  // Not `opponentName`: its stand-in starts a sentence ("Your opponent"), and this goes in one.
  return waiting ? waiting.display_name || 'the other debater' : null;
}

/** The Requests tab and the lobby give the same answer and explain the same scheduling conflicts. */
export function useScheduledDebateAnswer(surface?: 'lobby') {
  const respond = useRespondToScheduledDebate();
  const setToast = useSetToast();
  const [error, setError] = React.useState<string | null>(null);
  const answer: ScheduledDebateAnswer = (requestId, accepted, onFailure) => {
    setError(null);
    // Per-call mutate callbacks belong to the latest mutation observer. Each attempt's promise
    // still settles independently, so overlapping answers must release their own retry guards here.
    void respond.mutateAsync({ requestId, accepted, ...(surface ? { surface } : {}) }).then(
      result => {
        if (result.outcome === 'conflict') {
          onFailure?.();
          setError(`That clashes with a debate ${formatDebateTime(result.conflicting_start_at)}.`);
          return;
        }
        // Accepting reads as "it's on" unless it says otherwise: the calendar invite waits for both.
        const waitingOn = accepted ? stillWaitingOn(result) : null;
        if (waitingOn) {
          setToast(
            React.createElement('span', null, `Accepted. We’ll add it to your calendar once ${waitingOn} accepts.`)
          );
        }
      },
      (failure: unknown) => {
        onFailure?.();
        setError(failure instanceof Error ? failure.message : 'Could not answer the request. Try again.');
      }
    );
  };
  return { answer, busy: respond.isPending, error };
}
