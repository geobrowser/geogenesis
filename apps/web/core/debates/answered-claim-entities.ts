'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import { type ClaimPickerEntity, useClaimEntitiesByIds, useClaimEntitiesVotedBy } from './claim-picker-page';

const NO_IDS: string[] = [];

/**
 * The claim entities behind one participant's positions, for the rematch picker (GEO-2656).
 *
 * Two sources, and the order they can start in is the point:
 *
 * - **By person** (`votedBy`), which needs nothing but the participant's space id and so runs
 *   alongside the positions query rather than after it. This is the ordinary answer.
 * - **By id**, for whatever the positions query names that the first answer does not: a response
 *   newer than that answer, the viewer's own in-flight one, or — if the `votedBy` read failed — all
 *   of them, which is the lookup this used to be.
 *
 * `answeredIds` is the positions query's list, and it stays the one that decides which rows exist:
 * the caller walks it and joins each id to an entity here. So an entity this returns that positions
 * does not name is never listed, and a position whose entity is still being topped up is simply not
 * listed *yet* — the list and its count move together because the count is taken from the list.
 *
 * `isLoading` is the `votedBy` read, not the top-up. On a first load the two sets are the same
 * (identical on the five busiest testnet voters), so the only ids the top-up ever sees at that
 * moment are ones that are not claims at all, which the by-id lookup then drops too. Gating on it
 * would put back the dependent round trip this exists to remove, for an answer that adds nothing.
 * When the `votedBy` read has failed, the by-id lookup is the whole answer, and is waited for.
 */
export function useAnsweredClaimEntities(
  profileSpaceId: string | null,
  answeredIds: string[]
): { entities: ClaimPickerEntity[]; isLoading: boolean; error: Error | null } {
  const votedBy = useClaimEntitiesVotedBy(profileSpaceId);
  const votedByFailed = votedBy.error !== null && votedBy.entities === undefined;

  const missingIds = React.useMemo(() => {
    if (votedBy.entities === undefined) return votedByFailed ? answeredIds : NO_IDS;
    const have = new Set(votedBy.entities.map(entity => normId(entity.id)));
    const missing = answeredIds.filter(id => !have.has(normId(id)));
    return missing.length === 0 ? NO_IDS : missing;
  }, [answeredIds, votedBy.entities, votedByFailed]);

  const byId = useClaimEntitiesByIds(missingIds);

  const entities = React.useMemo(() => {
    const fromVotedBy = votedBy.entities ?? [];
    if (byId.entities.length === 0) return fromVotedBy;
    if (fromVotedBy.length === 0) return byId.entities;
    return [...fromVotedBy, ...byId.entities];
  }, [byId.entities, votedBy.entities]);

  return {
    entities,
    isLoading: votedBy.isLoading || (votedByFailed && byId.isLoading),
    // The `votedBy` failure on its own is not reported: the by-id lookup has taken over, and only
    // if that fails too is there nothing to show.
    error: byId.error,
  };
}
