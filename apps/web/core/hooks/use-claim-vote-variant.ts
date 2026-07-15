'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { CLAIM_TYPE_ID, IS_FACTUAL_PROPERTY_ID } from '~/core/claims/ontology';
import { getBatchEntities } from '~/core/io/queries';
import { useEntityTypes } from '~/core/state/entity-page-store/entity-store';
import { useValue } from '~/core/sync/use-store';

/**
 * Which vote UI a given entity renders:
 * - `default`: non-claim entities — unchanged up/down arrows + net score.
 * - `thumbs`: a Claim whose `Is factual?` is unset or false — thumbs up/down + upvote %.
 * - `factual`: a Claim whose `Is factual?` is true — check / x + upvote %.
 *
 * A single data block can render a mix of these, so the variant is resolved
 * per-entity rather than per-block.
 */
export type ClaimVoteVariant = 'default' | 'thumbs' | 'factual';

const normalizeId = (id: string) => id.replace(/-/g, '').toLowerCase();

const CLAIM_TYPE = normalizeId(CLAIM_TYPE_ID);
const IS_FACTUAL_PROPERTY = normalizeId(IS_FACTUAL_PROPERTY_ID);

type ProvidedType = { id: string };

export function useClaimVoteVariant(
  entityId: string,
  spaceId: string,
  providedTypes?: ProvidedType[]
): { variant: ClaimVoteVariant } {
  const syncTypes = useEntityTypes(entityId);
  const localTypes = providedTypes ?? (syncTypes.length > 0 ? syncTypes : null);
  const typesKnownLocally = localTypes !== null;
  const isClaimLocal = typesKnownLocally && localTypes.some(type => normalizeId(type.id) === CLAIM_TYPE);

  const needsFetch = !typesKnownLocally || isClaimLocal;

  const { data: fetched } = useQuery({
    queryKey: ['claim-vote-meta', entityId, spaceId],
    queryFn: () => Effect.runPromise(getBatchEntities([entityId], spaceId)).then(entities => entities[0] ?? null),
    enabled: needsFetch,
    staleTime: 5 * 60_000,
  });

  const types = localTypes ?? fetched?.types ?? [];
  const isClaim = types.some(type => normalizeId(type.id) === CLAIM_TYPE);

  const syncFactualValue = useValue({
    selector: value => value.entity.id === entityId && normalizeId(value.property.id) === IS_FACTUAL_PROPERTY,
  });
  const fetchedFactualRaw = fetched?.values.find(
    value => normalizeId(value.property.id) === IS_FACTUAL_PROPERTY
  )?.value;
  const factualRaw = syncFactualValue?.value ?? fetchedFactualRaw ?? null;
  const isFactual = factualRaw === '1';

  if (!isClaim) {
    return { variant: 'default' };
  }

  return { variant: isFactual ? 'factual' : 'thumbs' };
}
