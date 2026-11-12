'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { RANK_TYPE_ID } from '~/core/ranking-block-ids';
import { reportError as reportTelemetryError } from '~/core/telemetry/logger';
import type { Entity } from '~/core/types';

import {
  type MyRankingBallot,
  ballotSnapshot,
  fetchMyRankingBallot,
  isRankingBallotUnreadableError,
} from './fetch-my-ranking-ballot';
import { type OwnPublishShape, classifyReadBack } from './ranking-publish-queue';

export { type MyRankingBallot, RankingBallotUnreadableError, fetchMyRankingBallot } from './fetch-my-ranking-ballot';

// A ballot we just published is the ground truth regardless of what the index
// says: the list query below is filtered by the SUBMITTED_TO relation, which
// lags the publish by anywhere from a beat to tens of seconds, and everything
// derived from `mySubmission` (Share link, My ranking views, the rolling clock)
// would otherwise sit stale for that window. `recordPublishedRank` pins the
// published ballot per (author space, block); the query prefers it until the
// index reads back the pinned ballot (same rank, same order) or moves past it to
// another device's edit, then deletes the pin so indexed data takes over.
// TTL-bounded so an indexing failure can't pin a phantom ballot forever.
type PublishedRankPin = OwnPublishShape & {
  publishedAtMs: number;
};

const publishedRankPins = new Map<string, PublishedRankPin>();
const PUBLISHED_RANK_PIN_TTL_MS = 5 * 60 * 1000;

export function resetPublishedRankPinsForTests(): void {
  publishedRankPins.clear();
}

function pinKey(personalSpaceId: string, blockId: string): string {
  return `${ID.uuidToHex(personalSpaceId)}:${ID.uuidToHex(blockId)}`;
}

export function recordPublishedRank(
  personalSpaceId: string,
  blockId: string,
  rankId: string,
  orderedEntityIds: string[],
  /** The published ballot this publish replaced, so a read still showing it
   *  can be told apart from one showing another device's edit. */
  baseline: OwnPublishShape['baseline']
): void {
  publishedRankPins.set(pinKey(personalSpaceId, blockId), {
    rankId,
    orderedEntityIds,
    baseline,
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

/** Minimal stand-in until the index returns the real entity. `createdAt` drives
 *  the rolling-submission clock: for an edit to an existing rank it is that
 *  rank's own creation time (an in-place edit doesn't restart the window); for
 *  a new rank it is the publish time in ms. */
function syntheticRankEntity(pin: Pick<PublishedRankPin, 'rankId' | 'publishedAtMs' | 'baseline'>): Entity {
  const editedInPlace = pin.baseline.rankId !== null && ID.equals(pin.baseline.rankId, pin.rankId);
  const createdAt = editedInPlace && pin.baseline.createdAtMs ? pin.baseline.createdAtMs : pin.publishedAtMs;
  return {
    id: pin.rankId,
    name: null,
    description: null,
    spaces: [],
    types: [{ id: RANK_TYPE_ID, name: null }],
    relations: [],
    values: [],
    createdAt,
    updatedAt: pin.publishedAtMs,
  };
}

/**
 * The pin hands over to the index once the index reads back the pinned ballot
 * itself (the same rank entity *and* the same order), or moves past it to a
 * ballot that is neither ours nor the one we replaced (another device's edit).
 * Matching the rank id alone isn't enough: an in-place edit keeps the id, so
 * the index matched it while still holding the previous order, and a placement
 * made in that window was built from the stale order and dropped the one
 * before it (GEO-3680).
 */
export function resolvePinnedBallot(
  indexed: MyRankingBallot,
  pin: Pick<PublishedRankPin, 'rankId' | 'orderedEntityIds' | 'baseline' | 'publishedAtMs'> | null
): { ballot: MyRankingBallot; dropPin: boolean } {
  if (!pin) return { ballot: indexed, dropPin: false };
  const standing = classifyReadBack(ballotSnapshot(indexed), pin);
  if (standing !== 'pending') return { ballot: indexed, dropPin: true };
  // The index still holds the ballot we replaced; answer from what we know was
  // published so the UI never shows the stale (or blanked rolled-off)
  // predecessor in the meantime.
  return { ballot: { rankEntity: syntheticRankEntity(pin), orderedEntityIds: pin.orderedEntityIds }, dropPin: false };
}

/** Drops the pin once the publish path has seen the index settle past this
 *  publish (ours or superseded), so a later edit from another device shows
 *  through. Only the pin for that exact publish is dropped, never a newer one. */
export function releasePublishedRankPin(personalSpaceId: string, blockId: string, rankId: string): void {
  const key = pinKey(personalSpaceId, blockId);
  const pin = publishedRankPins.get(key);
  if (pin && ID.equals(pin.rankId, rankId)) publishedRankPins.delete(key);
}

export function useMyRanking(blockId: string) {
  const { personalSpaceId } = usePersonalSpaceId();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-ranking-entity', personalSpaceId, blockId],
    enabled: Boolean(personalSpaceId && blockId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!personalSpaceId) {
        return { rankEntity: null, orderedEntityIds: [] as string[] };
      }
      let indexed: MyRankingBallot;
      try {
        indexed = await fetchMyRankingBallot(personalSpaceId, blockId);
      } catch (error) {
        if (isRankingBallotUnreadableError(error)) {
          // Permanent until someone looks at the stored rank: report it with its id.
          reportTelemetryError(error, { tags: { rank_id: error.rankId } });
        }
        throw error;
      }
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
    /** Set when the ballot exists but can't be read whole. The screens show
     *  it instead of treating the ranker as having no ballot. */
    readError: isRankingBallotUnreadableError(error) ? error : null,
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
