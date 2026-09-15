'use client';

import { useQueries, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getDebate } from '~/core/debates/api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '~/core/debates/hooks';
import { fetchPersonDebates, personDebatesQueryKey } from '~/core/io/subgraph/fetch-person-debates';

import type { Debate } from '~/core/debates/api';

/**
 * Every debate a person argued, playable (GEO-2859).
 *
 * Two sources, because neither can answer alone. **The graph knows which
 * debates** — a debate names its participants with a relation, and that is the
 * only record of it that covers personal spaces. **geo-chat knows how to play
 * one** — the video, the timings, the participants — and it indexes DAO spaces
 * only, so `list_space_debates` on a personal space answers `space_not_found`.
 *
 * What makes the pair work is that `getDebate` is addressed by debate id rather
 * than by space. So the graph supplies the list and geo-chat hydrates each one,
 * and neither is asked a question it cannot answer.
 *
 * The cost is one request per debate. Acceptable at this size — the most active
 * debater in the graph has eleven — and they share `debateQueryKeys.debate`, so
 * a debate already fetched by the room or the browse feed is already warm.
 */
export function usePersonDebates(spaceId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  const listQuery = useQuery({
    queryKey: personDebatesQueryKey(spaceId),
    queryFn: () => fetchPersonDebates(spaceId),
    enabled: enabled && spaceId !== '',
    staleTime: 60_000,
  });

  const listed = React.useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const hydrated = useQueries({
    queries: listed.map(debate => ({
      ...debateQueryNetworkOptions,
      queryKey: debateQueryKeys.debate(debate.id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getDebate(
          debate.id,
          authenticated ? getPrivyIdentityToken : undefined,
          authenticated ? accountKey : null,
          signal
        ),
      enabled: enabled && listed.length > 0,
    })),
  });

  const debates = React.useMemo(
    () => hydrated.map(query => query.data).filter((debate): debate is Debate => debate != null),
    [hydrated]
  );

  // Which side this person argued, by debate, for the badge the record shows.
  // It is the point of the row here rather than incidental to it.
  const sideByDebateId = React.useMemo(
    () => new Map(listed.map(debate => [debate.id, debate.side])),
    [listed]
  );

  // The space each debate lives in, for the space filter. It comes off the
  // relation rather than the debate: geo-chat's record has no space on it.
  const spaceByDebateId = React.useMemo(
    () => new Map(listed.map(debate => [debate.id, debate.spaceId])),
    [listed]
  );

  // Held while the list is resolving *or* while any debate is still arriving —
  // a partially hydrated feed would paint, then reorder under the reader.
  const isLoading = listQuery.isLoading || hydrated.some(query => query.isLoading);

  return {
    debates,
    sideByDebateId,
    spaceByDebateId,
    isLoading,
    isError: listQuery.isError,
    /** The list resolved and this person has never been in a debate. */
    isEmpty: !listQuery.isLoading && listed.length === 0,
  };
}
