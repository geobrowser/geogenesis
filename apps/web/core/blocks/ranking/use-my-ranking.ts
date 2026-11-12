'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { EntitiesOrderBy } from '~/core/gql/graphql';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { getAllEntities } from '~/core/io/queries';
import { RANK_TYPE_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';

import {
  buildMyRankingEntityFilter,
  getMyRankingOrderedEntityIds,
  pickMostRecentlyCreatedRankingEntity,
} from './my-ranking-entity';
import { sameBallotOrder } from './ranking-publish-queue';

// A ballot we just published is the ground truth regardless of what the index
// says: the list query below is filtered by the SUBMITTED_TO relation, which
// lags the publish by anywhere from a beat to tens of seconds, and everything
// derived from `mySubmission` (Share link, My ranking views, the rolling clock)
// would otherwise sit stale for that window. `recordPublishedRank` pins the
// published ballot per (author space, block); the query prefers it until the
// index reads back the pinned ballot (same rank, same order), then deletes the
// pin so indexed data takes over. TTL-bounded so an indexing failure can't pin a
// phantom ballot forever.
type PublishedRankPin = {
  rankId: string;
  orderedEntityIds: string[];
  publishedAtMs: number;
};

const publishedRankPins = new Map<string, PublishedRankPin>();
const PUBLISHED_RANK_PIN_TTL_MS = 5 * 60 * 1000;

function pinKey(personalSpaceId: string, blockId: string): string {
  return `${ID.uuidToHex(personalSpaceId)}:${ID.uuidToHex(blockId)}`;
}

export function recordPublishedRank(
  personalSpaceId: string,
  blockId: string,
  rankId: string,
  orderedEntityIds: string[]
): void {
  publishedRankPins.set(pinKey(personalSpaceId, blockId), {
    rankId,
    orderedEntityIds,
    publishedAtMs: Date.now(),
  });
}

function getFreshPublishedRankPin(personalSpaceId: string, blockId: string): PublishedRankPin | null {
  const key = pinKey(personalSpaceId, blockId);
  const pin = publishedRankPins.get(key);
  if (!pin) return null;
  if (Date.now() - pin.publishedAtMs > PUBLISHED_RANK_PIN_TTL_MS) {
    publishedRankPins.delete(key);
    return null;
  }
  return pin;
}

/** Minimal stand-in until the index returns the real entity. `createdAt` is the
 *  publish time in ms, which the rolling-submission clock parses directly. */
function syntheticRankEntity(pin: Pick<PublishedRankPin, 'rankId' | 'publishedAtMs'>): Entity {
  return {
    id: pin.rankId,
    name: null,
    description: null,
    spaces: [],
    types: [{ id: RANK_TYPE_ID, name: null }],
    relations: [],
    values: [],
    createdAt: pin.publishedAtMs,
    updatedAt: pin.publishedAtMs,
  };
}

export type MyRankingBallot = { rankEntity: Entity | null; orderedEntityIds: string[] };

/**
 * Reads the author's current ballot for a block straight from the index (no
 * pin, no cache). The publish path re-reads with this right before building an
 * edit, so the edit starts from what is published now (GEO-3680).
 */
export async function fetchMyRankingBallot(personalSpaceId: string, blockId: string): Promise<MyRankingBallot> {
  const { entities } = await Effect.runPromise(
    getAllEntities({
      spaceId: personalSpaceId,
      typeId: RANK_TYPE_ID,
      filter: buildMyRankingEntityFilter(blockId),
      orderBy: [EntitiesOrderBy.CreatedAtDesc],
      limit: 100,
    })
  );

  const rankEntity = pickMostRecentlyCreatedRankingEntity(entities);
  if (!rankEntity) return { rankEntity: null, orderedEntityIds: [] };
  return { rankEntity, orderedEntityIds: getMyRankingOrderedEntityIds(rankEntity, personalSpaceId) };
}

/**
 * The pin hands over to the index only once the index reads back the pinned
 * ballot itself: the same rank entity *and* the same order. Matching the rank
 * id alone isn't enough — an in-place edit keeps the id, so the index matched
 * it while still holding the previous order, and a placement made in that
 * window was built from the stale order and dropped the one before it
 * (GEO-3680).
 */
export function resolvePinnedBallot(
  indexed: MyRankingBallot,
  pin: Pick<PublishedRankPin, 'rankId' | 'orderedEntityIds' | 'publishedAtMs'> | null
): { ballot: MyRankingBallot; dropPin: boolean } {
  if (!pin) return { ballot: indexed, dropPin: false };
  const caughtUp =
    indexed.rankEntity !== null &&
    ID.equals(indexed.rankEntity.id, pin.rankId) &&
    sameBallotOrder(indexed.orderedEntityIds, pin.orderedEntityIds);
  if (caughtUp) return { ballot: indexed, dropPin: true };
  // The index hasn't read back the just-published ballot yet; answer from what
  // we know was published so the UI never shows the stale (or blanked
  // rolled-off) predecessor in the meantime.
  return { ballot: { rankEntity: syntheticRankEntity(pin), orderedEntityIds: pin.orderedEntityIds }, dropPin: false };
}

/** Drops the pin once the publish path has confirmed the index holds the
 *  published ballot, so a later edit from another device shows through. Only
 *  the pin for that exact publish is dropped, never a newer one. */
export function releasePublishedRankPin(
  personalSpaceId: string,
  blockId: string,
  rankId: string,
  orderedEntityIds: string[]
): void {
  const key = pinKey(personalSpaceId, blockId);
  const pin = publishedRankPins.get(key);
  if (pin && ID.equals(pin.rankId, rankId) && sameBallotOrder(pin.orderedEntityIds, orderedEntityIds)) {
    publishedRankPins.delete(key);
  }
}

export function useMyRanking(blockId: string) {
  const { personalSpaceId } = usePersonalSpaceId();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-ranking-entity', personalSpaceId, blockId],
    enabled: Boolean(personalSpaceId && blockId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!personalSpaceId) {
        return { rankEntity: null, orderedEntityIds: [] as string[] };
      }
      const indexed = await fetchMyRankingBallot(personalSpaceId, blockId);
      const pin = getFreshPublishedRankPin(personalSpaceId, blockId);
      const { ballot, dropPin } = resolvePinnedBallot(indexed, pin);
      if (dropPin) publishedRankPins.delete(pinKey(personalSpaceId, blockId));
      return ballot;
    },
  });

  const myRankEntity = data?.rankEntity ?? null;
  const orderedEntityIds = data?.orderedEntityIds ?? [];

  return {
    myRankEntity,
    orderedEntityIds,
    isLoading,
    refetchMyRanking: React.useCallback(async () => {
      const result = await refetch();
      if (result.isError) {
        throw result.error ?? new Error('Failed to refetch my ranking');
      }
      return {
        myRankEntity: result.data?.rankEntity ?? null,
        orderedEntityIds: result.data?.orderedEntityIds ?? [],
      };
    }, [refetch]),
  };
}
