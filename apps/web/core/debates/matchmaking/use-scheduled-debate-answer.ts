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
    respond.mutate(
      { requestId, accepted, ...(surface ? { surface } : {}) },
      {
        onSuccess: result => {
          if (result.outcome === 'conflict') {
            onFailure?.();
            setError(`That clashes with a debate ${formatDebateTime(result.conflicting_start_at)}.`);
          }
        },
        onError: failure => {
          onFailure?.();
          setError(failure.message);
        },
      }
    );
  };
  return { answer, busy: respond.isPending, error };
}
