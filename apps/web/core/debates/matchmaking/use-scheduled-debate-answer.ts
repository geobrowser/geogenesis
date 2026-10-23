'use client';

import * as React from 'react';

import { useRespondToScheduledDebate } from '../rooms/scheduling-hooks';
import { formatDebateTime } from './scheduled-debate-format';

export type ScheduledDebateAnswer = (requestId: string, accepted: boolean, onFailure?: () => void) => void;

/** The Requests tab and the lobby give the same answer and explain the same scheduling conflicts. */
export function useScheduledDebateAnswer(surface?: 'lobby') {
  const respond = useRespondToScheduledDebate();
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
