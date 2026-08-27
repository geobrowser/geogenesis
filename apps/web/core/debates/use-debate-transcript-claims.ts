'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { ID } from '~/core/id';
import { getDebateTranscriptClaims } from '~/core/io/queries';

import { type DebateTranscriptClaims, EMPTY_TRANSCRIPT_CLAIMS } from './transcript-claims';

export const debateTranscriptClaimsQueryKey = (debateEntityId: string) =>
  ['debate-transcript-claims', debateEntityId] as const;

export type DebateTranscriptClaimsResult = {
  claims: DebateTranscriptClaims;
  isLoading: boolean;
  error: Error | null;
};

/**
 * The claims extracted from a debate's transcript, grouped by the debater who made them.
 *
 * Keyed on the debate entity id alone so the feed's count badge and the Claims panel share one
 * cache entry — the same arrangement `useComments` has with the comments panel, and the reason
 * opening the panel doesn't refetch what the badge already loaded.
 *
 * Returns an empty grouping rather than throwing for debates with no transcript: recording
 * predates claim extraction for a chunk of the corpus, and "no claims yet" is a real state.
 */
export function useDebateTranscriptClaims(debateId: string | null, enabled = true): DebateTranscriptClaimsResult {
  // A Debate entity's id is its geo-chat debate id, so the transcript hangs off it without a lookup.
  const debateEntityId = debateId ? ID.uuidToHex(debateId) : '';

  const { data, isLoading, error } = useQuery({
    queryKey: debateTranscriptClaimsQueryKey(debateEntityId),
    queryFn: ({ signal }) => Effect.runPromise(getDebateTranscriptClaims(debateEntityId, signal)),
    enabled: enabled && debateEntityId !== '',
  });

  return {
    claims: data ?? EMPTY_TRANSCRIPT_CLAIMS,
    isLoading,
    error: (error as Error | null) ?? null,
  };
}
