'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSetToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';

import { BEST_DEBATES_BLOCK_ID, BEST_DEBATES_PUSHDOWN_SINCE, DEBATE_TYPE_ID } from './best-debates';
import {
  type MemberVoteRecord,
  fetchMemberDebateDownvotes,
  fetchMemberDownvotesOn,
  memberDebateDownvotesQueryKey,
} from './fetch-member-debate-votes';
import { type PushDownState, RANK_CLEAR_FAILED_COPY, debateOwnSpaceId } from './push-down';
import {
  type DebateVoteOverlays,
  debateVoteOverlaysQueryKey,
  mergeDownvoteOverlays,
  useDebateVoteOverlays,
  useDebateVoteWriter,
} from './use-debate-downvote';
import { pushDownStateQueryKey } from './use-push-down';
import { type RankingEntryDisplay, toRankingEntryDisplay } from './use-ranking-entry-entities';

/** `useQueryEntities` names at most this many ids in one request. */
const MAX_HYDRATED_IDS = 1000;

export type PushedDownDebate = RankingEntryDisplay & {
  /** Where a new downvote would go; null when the debate lives only in the Debates or the member's space. */
  debateSpaceId: string | null;
  /** Every space the member's downvote on it was cast in. gaia counts any of them. */
  downvotedSpaceIds: string[];
};

/** Downvote records grouped by debate, newest first, each with the spaces holding a downvote. */
export function groupDownvotesByObject(records: readonly MemberVoteRecord[]): Map<string, string[]> {
  const byObject = new Map<string, string[]>();
  for (const record of records) {
    if (record.direction !== 'negative') continue;
    const key = ID.uuidToHex(record.objectId);
    const spaces = byObject.get(key) ?? [];
    if (!spaces.some(space => ID.equals(space, record.spaceId))) spaces.push(record.spaceId);
    byObject.set(key, spaces);
  }
  return byObject;
}

/**
 * The debates the member pushed down (GEO-3679): every downvote gaia counts, meaning curation
 * downvotes on Debates cast since `BEST_DEBATES_PUSHDOWN_SINCE`, in whatever space, newest first.
 * Read from the votes themselves, narrowed to debates page by page and paged to the end, with
 * this session's unindexed writes laid over them.
 */
export function useMyPushedDownDebates({ blockId = BEST_DEBATES_BLOCK_ID }: { blockId?: string | null } = {}) {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const enabled = Boolean(blockId) && Boolean(personalSpaceId) && isRegistered;

  const query = useQuery({
    queryKey: memberDebateDownvotesQueryKey(personalSpaceId),
    queryFn: ({ signal }) =>
      fetchMemberDebateDownvotes(personalSpaceId!, { since: BEST_DEBATES_PUSHDOWN_SINCE, signal }),
    enabled,
    // This session's own writes reach the list through the overlays and a refetch once they are
    // indexed, so there is no need to re-read the history on every mount.
    staleTime: 5 * 60_000,
  });
  const overlays = useDebateVoteOverlays();

  const spacesByObject = React.useMemo(
    () => groupDownvotesByObject(mergeDownvoteOverlays(enabled ? (query.data ?? []) : [], overlays)),
    [enabled, overlays, query.data]
  );
  // Already debates only (the reader filters each page by type), so the cap below only bounds the
  // entity hydration of a member with over 1,000 pushed-down debates.
  const objectIds = React.useMemo(() => [...spacesByObject.keys()].slice(0, MAX_HYDRATED_IDS), [spacesByObject]);

  const where = React.useMemo(
    () => ({ id: { in: objectIds }, types: [{ id: { equals: DEBATE_TYPE_ID } }] }),
    [objectIds]
  );
  const { entities, isLoading: isLoadingEntities } = useQueryEntities({
    where,
    first: objectIds.length || undefined,
    enabled: enabled && objectIds.length > 0,
    placeholderData: keepPreviousData,
  });

  const debates = React.useMemo((): PushedDownDebate[] => {
    if (!enabled) return [];
    const order = new Map(objectIds.map((id, index) => [id, index]));
    return entities
      .filter(entity => order.has(ID.uuidToHex(entity.id)))
      .filter(entity => entity.types.some(type => ID.equals(type.id, DEBATE_TYPE_ID)))
      .map(entity => {
        const spaces = spacesByObject.get(ID.uuidToHex(entity.id)) ?? [];
        const debateSpaceId = debateOwnSpaceId(entity, personalSpaceId);
        return {
          ...toRankingEntryDisplay(entity, debateSpaceId ?? spaces[0] ?? ''),
          debateSpaceId,
          downvotedSpaceIds: spaces,
        };
      })
      .sort((a, b) => order.get(ID.uuidToHex(a.entityId))! - order.get(ID.uuidToHex(b.entityId))!);
  }, [enabled, entities, objectIds, personalSpaceId, spacesByObject]);

  return {
    debates,
    /** True until the member's downvotes and the debates among them have loaded. */
    isLoading: enabled && (query.isLoading || (objectIds.length > 0 && isLoadingEntities && debates.length === 0)),
    isError: query.isError,
    retry: query.refetch,
  };
}

/**
 * The ranking screen's Publish (GEO-3679). Ranked and pushed down are exclusive per member, so a
 * ballot holding debates the member pushed down has to clear those downvotes too:
 *
 * 1. `readDraftDownvotes` before publishing: a fresh read of the member's counted downvotes on the
 *    ballot's debates, so a Publish never runs on a list that hasn't loaded. Null when it can't be
 *    read: don't publish.
 * 2. Publish the ballot.
 * 3. `clearDraftDownvotes` once it has published: one clear per downvote record, one after
 *    another. A debate whose clear fails is left ranked and pushed down, never neither, and its
 *    pushed-down row offers Retry.
 */
export function useRankingPublishDownvotes() {
  const queryClient = useQueryClient();
  const { personalSpaceId } = usePersonalSpaceId();
  const sendVote = useDebateVoteWriter();

  const readDraftDownvotes = React.useCallback(
    async (draftIds: readonly string[]): Promise<Map<string, MemberVoteRecord[]> | null> => {
      if (!personalSpaceId) return new Map();
      let server: MemberVoteRecord[];
      try {
        // Only the ballot's own debates: one request, not a walk through the history.
        server = await fetchMemberDownvotesOn(personalSpaceId, draftIds, { since: BEST_DEBATES_PUSHDOWN_SINCE });
      } catch {
        return null;
      }
      const merged = mergeDownvoteOverlays(
        server,
        queryClient.getQueryData<DebateVoteOverlays>(debateVoteOverlaysQueryKey(personalSpaceId))
      );
      const draft = new Set(draftIds.map(id => ID.uuidToHex(id)));
      const byDebate = new Map<string, MemberVoteRecord[]>();
      for (const record of merged) {
        const key = ID.uuidToHex(record.objectId);
        if (!draft.has(key)) continue;
        byDebate.set(key, [...(byDebate.get(key) ?? []), record]);
      }
      return byDebate;
    },
    [personalSpaceId, queryClient]
  );

  /** Resolves with the debates whose downvote could not be cleared. */
  const clearDraftDownvotes = React.useCallback(
    async (downvotes: ReadonlyMap<string, MemberVoteRecord[]>): Promise<string[]> => {
      const failed: string[] = [];
      for (const [debateId, initial] of downvotes) {
        let records = initial;
        for (const spaceId of [...new Set(initial.map(record => record.spaceId))]) {
          const result = await sendVote({
            debateId,
            spaceId,
            direction: 'clear',
            analyticsAction: 'undo_push_down',
            records,
          });
          if (!result.ok) {
            failed.push(debateId);
            const failedState: PushDownState = {
              status: 'failed',
              action: 'rank',
              step: 'vote',
              partly: true,
              message: RANK_CLEAR_FAILED_COPY,
            };
            queryClient.setQueryData<PushDownState>(pushDownStateQueryKey(personalSpaceId, debateId), failedState);
            break;
          }
          records = result.records;
        }
      }
      return failed;
    },
    [personalSpaceId, queryClient, sendVote]
  );

  return { readDraftDownvotes, clearDraftDownvotes };
}

export type BallotPublishResult<T> = { published: T; failedClears: number };

/**
 * Publishes a Best debates ballot from the ranking screen in the order that never leaves a debate
 * neither ranked nor pushed down (see `useRankingPublishDownvotes`), and says so when a clear is
 * left over. One publish at a time: a second press while one runs does nothing, and `isPublishing`
 * stays true across the whole sequence, not just the ballot write.
 */
export function useBestDebatesBallotPublisher() {
  const { readDraftDownvotes, clearDraftDownvotes } = useRankingPublishDownvotes();
  const setToast = useSetToast();
  const [isPublishing, setIsPublishing] = React.useState(false);
  const inFlight = React.useRef(false);

  const publish = React.useCallback(
    async <T extends { orderedEntityIds: readonly string[] }>(
      ids: readonly string[],
      save: () => Promise<T | null>
    ): Promise<BallotPublishResult<T> | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setIsPublishing(true);
      try {
        const downvotes = await readDraftDownvotes(ids);
        if (!downvotes) {
          setToast(React.createElement('span', null, BALLOT_DOWNVOTE_CHECK_FAILED_COPY));
          return null;
        }
        const published = await save();
        if (!published) return null;
        // Clear only what the published ballot holds. The publish path merges onto the ballot the
        // index holds now (GEO-3680), so a debate this device sent can be dropped there (another
        // device pushed it down meanwhile); clearing its downvote would leave it neither ranked nor
        // pushed down.
        const onBallot = new Set(published.orderedEntityIds.map(id => ID.uuidToHex(id)));
        const toClear = new Map([...downvotes].filter(([debateId]) => onBallot.has(ID.uuidToHex(debateId))));
        const failedClears = (await clearDraftDownvotes(toClear)).length;
        if (failedClears > 0) setToast(React.createElement('span', null, ballotClearsLeftCopy(failedClears)));
        return { published, failedClears };
      } finally {
        inFlight.current = false;
        setIsPublishing(false);
      }
    },
    [clearDraftDownvotes, readDraftDownvotes, setToast]
  );

  return { publish, isPublishing };
}

export const BALLOT_DOWNVOTE_CHECK_FAILED_COPY =
  'Couldn’t check which debates you pushed down, so your ranking didn’t publish. Try again.';

export function ballotClearsLeftCopy(count: number): string {
  return `Ranking published, but ${count === 1 ? '1 debate still carries' : `${count} debates still carry`} your downvote. Retry under “You pushed down”.`;
}
