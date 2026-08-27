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

// A ballot we just published is the ground truth regardless of what the index
// says: the list query below is filtered by the SUBMITTED_TO relation, which
// lags the publish by anywhere from a beat to tens of seconds, and everything
// derived from `mySubmission` (Share link, My ranking views, the rolling clock)
// would otherwise sit stale for that window. `recordPublishedRank` pins the
// published ballot per (author space, block); the query prefers it until the
// index catches up, then deletes the pin so indexed data takes over. TTL-bounded
// so an indexing failure can't pin a phantom ballot forever.
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
function syntheticRankEntity(pin: PublishedRankPin): Entity {
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

      const pin = getFreshPublishedRankPin(personalSpaceId, blockId);
      if (pin) {
        if (rankEntity && ID.equals(rankEntity.id, pin.rankId)) {
          // The index caught up with the published ballot — it takes over.
          publishedRankPins.delete(pinKey(personalSpaceId, blockId));
        } else {
          // The list hasn't surfaced the just-published ballot yet; answer from
          // what we know was published so the UI never shows the stale (or
          // blanked rolled-off) predecessor in the meantime.
          return { rankEntity: syntheticRankEntity(pin), orderedEntityIds: pin.orderedEntityIds };
        }
      }

      if (!rankEntity) {
        return { rankEntity: null, orderedEntityIds: [] as string[] };
      }

      return {
        rankEntity,
        orderedEntityIds: getMyRankingOrderedEntityIds(rankEntity, personalSpaceId),
      };
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
