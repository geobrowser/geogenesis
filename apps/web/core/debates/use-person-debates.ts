'use client';

import { useQuery } from '@tanstack/react-query';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { ID } from '~/core/id';
import { fetchPersonDebates, personDebatesQueryKey } from '~/core/io/subgraph/fetch-person-debates';
import type { PersonDebate } from '~/core/io/subgraph/fetch-person-debates';
import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import type { HiddenProfileRelation } from '~/core/profile/profile-debate-visibility';
import { normId } from '~/core/utils/norm-id';

export type PersonDebatesQueryData = {
  allRows: ExploreFeedRow[];
  sideByDebateId: Map<string, PersonDebate['side']>;
  hiddenRelationsByDebateId: Map<string, HiddenProfileRelation[]>;
};

export function personDebatesRowsQueryKey(spaceId: string) {
  return [...personDebatesQueryKey(spaceId), 'explore-rows'] as const;
}

/**
 * Every debate a person argued, as explore cards (GEO-2859).
 *
 * The graph is the only source that can answer this. A debate names its sides
 * with a relation pointed at the arguer's personal space, and geo-chat — which
 * would otherwise be the obvious place to ask — indexes DAO spaces only, so
 * `list_space_debates` on a personal space answers `space_not_found`.
 *
 * Nothing is hydrated from geo-chat here. `DebateExploreFeedCard` does that
 * itself, viewport-gated, and falls back to the generic card when a debate
 * cannot actually be watched — so a record of ten debates makes no video
 * requests until the reader scrolls to one.
 *
 * Unpaged: the most active debater in the graph has eleven, and the relation
 * query takes the lot in one request.
 */
export function usePersonDebates(spaceId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: personDebatesRowsQueryKey(spaceId),
    queryFn: async ({ signal }) => {
      const listed = await fetchPersonDebates(spaceId);

      // The relation says which space each debate lives in, and that is the one
      // its card should read — see `fetchExploreRowsByIds`.
      const spaceByDebateId = new Map(
        listed
          .filter((debate): debate is typeof debate & { spaceId: string } => debate.spaceId !== null)
          .map(debate => [ID.uuidToHex(debate.id), [debate.spaceId]])
      );

      const allRows = await fetchExploreRowsByIds(
        listed.map(debate => debate.id),
        signal,
        spaceByDebateId
      );

      return {
        allRows,
        // Which side this person argued, by debate. Kept even though no card
        // renders it yet: it comes off the relation and nothing downstream can
        // recover it, so dropping it here would mean re-querying to add the
        // badge later.
        sideByDebateId: new Map<string, PersonDebate['side']>(
          listed.map(debate => [ID.uuidToHex(debate.id), debate.side])
        ),
        hiddenRelationsByDebateId: new Map(
          listed
            .filter(debate => debate.hiddenRelations.length > 0)
            .map(debate => [normId(debate.id), debate.hiddenRelations])
        ),
      } satisfies PersonDebatesQueryData;
    },
    enabled: enabled && spaceId !== '',
    staleTime: 60_000,
  });

  const rows = query.data?.allRows ?? [];
  const hiddenRelations = query.data?.hiddenRelationsByDebateId ?? new Map<string, HiddenProfileRelation[]>();

  return {
    rows: rows.filter(row => !hiddenRelations.has(normId(row.entityId))),
    hiddenRows: rows.filter(row => hiddenRelations.has(normId(row.entityId))),
    hiddenRelationsByDebateId: hiddenRelations,
    sideByDebateId: query.data?.sideByDebateId ?? new Map<string, PersonDebate['side']>(),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
