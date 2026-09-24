'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type PersonDebatesQueryData, personDebatesRowsQueryKey } from '~/core/debates/use-person-debates';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';
import { profileFactsQueryPrefix } from '~/core/io/subgraph/fetch-profile-facts';
import { ProfileDebateHiddenToast } from '~/core/profile/profile-debate-hidden-toast';
import {
  type HiddenProfileRelation,
  buildHideDebateRelation,
  buildUnhideDebateRelations,
  debateVisibilityCounts,
} from '~/core/profile/profile-debate-visibility';
import type { ProfileFacts } from '~/core/profile/profile-facts';
import { normId } from '~/core/utils/norm-id';

/** Direct personal-space writes backing the profile card's hide/restore control. */
export function useProfileDebateVisibility(personalSpaceId: string) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [, setToast] = useToast();
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const pendingRef = React.useRef<Set<string>>(new Set());

  const setPending = React.useCallback((debateId: string, pending: boolean) => {
    const key = normId(debateId);
    if (pending) pendingRef.current.add(key);
    else pendingRef.current.delete(key);
    setPendingIds(current => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const setHidden = React.useCallback(
    async (item: ExploreFeedItem, hiddenRelations: readonly HiddenProfileRelation[], shouldHide: boolean) => {
      const debateId = normId(item.entityId);
      if (pendingRef.current.has(debateId)) return false;

      setPending(item.entityId, true);
      try {
        const created = shouldHide
          ? buildHideDebateRelation({
              personalSpaceId,
              debateId: item.entityId,
              debateName: item.title,
              debateSpaceId: item.spaceId,
            })
          : null;
        const relations = created
          ? [created.relation]
          : buildUnhideDebateRelations({
              personalSpaceId,
              debateId: item.entityId,
              debateName: item.title,
              hidden: hiddenRelations,
            });

        if (relations.length === 0) return false;

        const ok = await publishOnce(makeProposal, {
          values: [],
          relations,
          spaceId: personalSpaceId,
          name: `${shouldHide ? 'Hide' : 'Restore'} debate on profile: ${item.title || item.entityId}`,
        });

        if (!ok) return false;

        const personQueryKey = personDebatesRowsQueryKey(personalSpaceId);
        const factsQueryPrefix = profileFactsQueryPrefix(personalSpaceId);
        const pendingFacts = queryClient
          .getQueryCache()
          .findAll({ queryKey: factsQueryPrefix })
          .flatMap(query =>
            query.state.data === undefined && query.promise
              ? [{ queryKey: query.queryKey, promise: query.promise as Promise<ProfileFacts> }]
              : []
          );

        // A focus refetch may have started before the publish and still hold the
        // pre-write graph result. Cancel only caches that already have data: an
        // initial facts request has no prior value to preserve, so it is allowed
        // to finish and receives the same patch below when it resolves.
        await Promise.all([
          queryClient.cancelQueries({ queryKey: personQueryKey, exact: true }),
          queryClient.cancelQueries({
            queryKey: factsQueryPrefix,
            predicate: query => query.state.data !== undefined,
          }),
        ]);

        const nextPersonDebates = queryClient.setQueryData<PersonDebatesQueryData>(personQueryKey, current => {
          if (!current) return current;
          const next = new Map(current.hiddenRelationsByDebateId);
          if (created) next.set(debateId, [created.hidden]);
          else next.delete(debateId);
          return { ...current, hiddenRelationsByDebateId: next };
        });

        // Every hide control is rendered from this query, so it has data here.
        // Use its complete row set for an absolute count rather than applying a
        // delta twice if a pending facts promise settles during this update.
        const visibleDebates = nextPersonDebates
          ? debateVisibilityCounts(
              nextPersonDebates.allRows.map(row => row.entityId),
              [...nextPersonDebates.hiddenRelationsByDebateId.keys()]
            ).visible
          : null;
        const patchFacts = (current: ProfileFacts): ProfileFacts => ({
          ...current,
          debates: visibleDebates ?? Math.max(0, current.debates + (shouldHide ? -1 : 1)),
        });

        queryClient.setQueriesData<ProfileFacts>({ queryKey: factsQueryPrefix }, current =>
          current ? patchFacts(current) : current
        );
        for (const pending of pendingFacts) {
          void pending.promise
            .then(result => {
              queryClient.setQueryData<ProfileFacts>(pending.queryKey, current => patchFacts(current ?? result));
            })
            .catch(() => undefined);
        }
        if (shouldHide) {
          setToast(React.createElement(ProfileDebateHiddenToast, { personalSpaceId }));
        }
        // These optimistic rows are the authoritative result for this session.
        // The graph index trails a successful publish, so immediately refetching
        // can replace them with the pre-write result and make Show hidden vanish.
        // Both queries become stale normally after a minute and reconcile then.
        return true;
      } finally {
        setPending(item.entityId, false);
      }
    },
    [makeProposal, personalSpaceId, queryClient, setPending, setToast]
  );

  return { setHidden, pendingIds };
}
