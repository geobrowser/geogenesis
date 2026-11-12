'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSetToast } from '~/core/hooks/use-toast';
import { useUserVotedEntityIds } from '~/core/hooks/use-user-voted-entity-ids';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';

import { BEST_DEBATES_BLOCK_ID, DEBATE_TYPE_ID } from './best-debates';
import { debateOwnSpaceId } from './push-down';
import { useDebateDownvoteWriter } from './use-debate-downvote';
import { type RankingEntryDisplay, toRankingEntryDisplay } from './use-ranking-entry-entities';

/** Curation votes are kind 0; anything else on the Downvoted list is a stance, not a push-down. */
const CURATION_VOTE_KIND = 0;

/**
 * How many pages of the member's downvotes (50 each, every entity type) to walk for debates.
 * Downvotes come newest first, so this bounds an old history, not recent push-downs.
 */
const MAX_DOWNVOTE_PAGES = 10;

export type PushedDownDebate = RankingEntryDisplay & {
  /** The debate's own space: where the downvote was recorded and is cleared. */
  debateSpaceId: string;
};

/**
 * The debates the member pushed down (GEO-3679): their curation downvotes on Debate entities,
 * newest first. Read from the same Downvoted list the profile tabs use, so a push-down from this
 * session shows at once through its pending overrides, and an Undo drops out at once.
 */
export function useMyPushedDownDebates({ blockId = BEST_DEBATES_BLOCK_ID }: { blockId?: string | null } = {}) {
  const enabled = Boolean(blockId);
  const { personalSpaceId } = usePersonalSpaceId();
  const { ids, voteKindById, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage, isError, refetch } =
    useUserVotedEntityIds('down', enabled);

  const pagesFetched = React.useRef(1);
  React.useEffect(() => {
    if (!enabled || !hasNextPage || isFetchingNextPage || isError) return;
    if (pagesFetched.current >= MAX_DOWNVOTE_PAGES) return;
    pagesFetched.current += 1;
    void fetchNextPage();
  }, [enabled, fetchNextPage, hasNextPage, isError, isFetchingNextPage]);

  const curationIds = React.useMemo(
    () => ids.filter(id => (voteKindById.get(ID.uuidToHex(id)) ?? CURATION_VOTE_KIND) === CURATION_VOTE_KIND),
    [ids, voteKindById]
  );

  const where = React.useMemo(
    () => ({ id: { in: curationIds }, types: [{ id: { equals: DEBATE_TYPE_ID } }] }),
    [curationIds]
  );
  const { entities, isLoading: isLoadingEntities } = useQueryEntities({
    where,
    first: curationIds.length || undefined,
    enabled: enabled && curationIds.length > 0,
    placeholderData: keepPreviousData,
  });

  const debates = React.useMemo((): PushedDownDebate[] => {
    if (!enabled) return [];
    const order = new Map(curationIds.map((id, index) => [ID.uuidToHex(id), index]));
    return entities
      .filter(entity => order.has(ID.uuidToHex(entity.id)))
      .filter(entity => entity.types.some(type => ID.equals(type.id, DEBATE_TYPE_ID)))
      .flatMap(entity => {
        const debateSpaceId = debateOwnSpaceId(entity, personalSpaceId);
        if (!debateSpaceId) return [];
        return [{ ...toRankingEntryDisplay(entity, debateSpaceId), debateSpaceId }];
      })
      .sort((a, b) => order.get(ID.uuidToHex(a.entityId))! - order.get(ID.uuidToHex(b.entityId))!);
  }, [curationIds, enabled, entities, personalSpaceId]);

  return {
    debates,
    isLoading: enabled && (isLoading || (curationIds.length > 0 && isLoadingEntities && debates.length === 0)),
    isError,
    retry: refetch,
  };
}

/**
 * Before the ranking screen publishes a ballot holding debates the member pushed down, clear each
 * of those downvotes, one after another, and only then let the publish go: ranked and pushed down
 * are exclusive per member, and the two writes must not race for the smart-account nonce. Resolves
 * false (and says why) when a clear fails, so the publish doesn't run.
 */
export function useClearPushedDownBeforeRanking(debates: readonly PushedDownDebate[]) {
  const sendVote = useDebateDownvoteWriter();
  const setToast = useSetToast();

  return React.useCallback(
    async (draftEntityIds: readonly string[]): Promise<boolean> => {
      const toClear = debates.filter(debate => draftEntityIds.some(id => ID.equals(id, debate.entityId)));
      for (const debate of toClear) {
        const cleared = await sendVote({
          debateId: debate.entityId,
          spaceId: debate.debateSpaceId,
          direction: 'clear',
          analyticsAction: 'undo_push_down',
          previousResponse: 'negative',
        });
        if (!cleared.ok) {
          setToast(React.createElement('span', null, `${debate.name}: ${cleared.message}`));
          return false;
        }
      }
      return true;
    },
    [debates, sendVote, setToast]
  );
}
