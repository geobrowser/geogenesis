import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { FEATURED_TAG_ID, TAG_PROPERTY_ID } from '~/core/constants';
import { graphql } from '~/core/io/graphql-client';

/**
 * GEO-2683. A claim is featured when a curator tags it — a `Tags` relation pointing at the
 * `Featured` entity — and the tag is what this asks for, rather than the claims and then their
 * tags: featured claims are a few hundred out of three hundred thousand, so a filter applied to
 * pages of claims would page for a very long time before it found one.
 *
 * The relation carries the space it was written in, which is the space the claim was featured
 * *in* — a better answer than ranking the claim's spaces after the fact, and the one both callers
 * use to group their geo-chat lookups.
 *
 * `rankingScore` rides along so the list can be ordered the way Explore's "Best" sort and geo-chat
 * both order theirs. Unordered, this connection comes back by relation id, and those are random
 * v4s — a fixed shuffle with no relationship to anything a reader would recognise.
 */
const FEATURED_CLAIMS_SOURCE = /* GraphQL */ `
  query FeaturedClaims(
    $tagPropertyId: UUID!
    $featuredTagId: UUID!
    $typesPropertyId: UUID!
    $claimTypeId: UUID!
    $first: Int!
  ) {
    relationsConnection(
      first: $first
      filter: {
        typeId: { is: $tagPropertyId }
        toEntityId: { is: $featuredTagId }
        fromEntity: { relations: { some: { typeId: { is: $typesPropertyId }, toEntityId: { is: $claimTypeId } } } }
      }
    ) {
      nodes {
        spaceId
        fromEntity {
          id
          name
          description
          rankingScore
        }
      }
    }
  }
`;

type FeaturedClaimsQuery = {
  relationsConnection: {
    nodes: Array<{
      spaceId: string | null;
      fromEntity: {
        id: string;
        name: string | null;
        description: string | null;
        // `BigFloat`, so it arrives as a string.
        rankingScore: string | null;
      } | null;
    } | null> | null;
  } | null;
};

type FeaturedClaimsVariables = {
  tagPropertyId: string;
  featuredTagId: string;
  typesPropertyId: string;
  claimTypeId: string;
  first: number;
};

const featuredClaimsDocument = parse(FEATURED_CLAIMS_SOURCE) as TypedDocumentNode<
  FeaturedClaimsQuery,
  FeaturedClaimsVariables
>;

/**
 * A ceiling rather than a page size: the whole featured set is what both callers filter and show,
 * so it is fetched in one request. Set well above the current few hundred so growth doesn't
 * silently truncate the list, and low enough that a tagging mistake can't fetch the corpus.
 */
export const FEATURED_CLAIMS_LIMIT = 500;

/** A claim a curator has tagged Featured, and the space they tagged it in. */
export type FeaturedClaim = {
  claimEntityId: string;
  spaceId: string;
  name: string;
  description: string | null;
  /** `null` for a claim the ranking feed has never scored. */
  rankingScore: number | null;
};

/**
 * Explore's "Best" order, which is `entities_ranked_for_feed`'s own
 * `ORDER BY ranking_score DESC, entity_id DESC` — the tiebreak included, so two claims on the same
 * score land the same way here as they do there.
 *
 * A claim the feed has never scored isn't in that table at all, so there is no place in the order
 * for it. It goes last rather than being dropped: a curator tagged it deliberately, and leaving it
 * out would quietly overrule them.
 */
export function compareFeaturedClaims(a: FeaturedClaim, z: FeaturedClaim): number {
  if (a.rankingScore !== z.rankingScore) {
    if (a.rankingScore === null) return 1;
    if (z.rankingScore === null) return -1;
    return z.rankingScore - a.rankingScore;
  }
  return z.claimEntityId.localeCompare(a.claimEntityId);
}

function decodeFeaturedClaims(data: FeaturedClaimsQuery): FeaturedClaim[] {
  const claims: FeaturedClaim[] = [];
  const seen = new Set<string>();

  for (const node of data.relationsConnection?.nodes ?? []) {
    // A claim with no name has nothing to render, and one whose tag carries no space can't be
    // grouped for the geo-chat lookups or tested against the viewer's spaces.
    if (!node?.fromEntity?.name || !node.spaceId) continue;
    // The same claim can be tagged in more than one space. First tag wins: the alternative is
    // listing the claim twice, and the card is keyed on the claim, not the tag.
    if (seen.has(node.fromEntity.id)) continue;
    seen.add(node.fromEntity.id);
    claims.push({
      claimEntityId: node.fromEntity.id,
      spaceId: node.spaceId,
      name: node.fromEntity.name,
      description: node.fromEntity.description,
      rankingScore: node.fromEntity.rankingScore === null ? null : Number(node.fromEntity.rankingScore),
    });
  }

  // Sorted here rather than in the query: the connection can only order by its own columns, and the
  // score belongs to the claim on the other end of the relation.
  return claims.sort(compareFeaturedClaims);
}

export function fetchFeaturedClaims(signal?: AbortSignal): Promise<FeaturedClaim[]> {
  return Effect.runPromise(
    graphql({
      query: featuredClaimsDocument,
      decoder: decodeFeaturedClaims,
      variables: {
        tagPropertyId: TAG_PROPERTY_ID,
        featuredTagId: FEATURED_TAG_ID,
        typesPropertyId: SystemIds.TYPES_PROPERTY,
        claimTypeId: CLAIM_TYPE_ID,
        first: FEATURED_CLAIMS_LIMIT,
      },
      signal,
    })
  );
}

/**
 * Deliberately not under `'debates'`, for the same reason as the claim picker's key: that root is
 * what the gateway reconciles and refetches on every (re)connect, and these rows come from the
 * knowledge graph rather than geo-chat, so a socket event says nothing about them.
 */
export const featuredClaimsQueryKey = ['featured-claims', 'claims'] as const;

const NO_FEATURED_CLAIMS: FeaturedClaim[] = [];

/**
 * Every claim tagged Featured, in Explore's "Best" order and unfiltered. Callers narrow it to the
 * spaces they may show — the viewer's allowlist and the acceptor's editor spaces — because which
 * spaces those are is a different question in the hub than it is in the rematch picker. Narrowing
 * preserves the order, so what survives is still ranked.
 *
 * Curation moves at human speed, so this stays fresh for a good while; both callers ask for the
 * same key and share the one request.
 */
export function useFeaturedClaims(enabled: boolean) {
  const query = useQuery({
    queryKey: featuredClaimsQueryKey,
    queryFn: ({ signal }) => fetchFeaturedClaims(signal),
    staleTime: 5 * 60_000,
    enabled,
  });

  const claims = query.data ?? NO_FEATURED_CLAIMS;
  const claimIds = React.useMemo(() => claims.map(claim => claim.claimEntityId), [claims]);

  return {
    claims,
    claimIds,
    // `enabled: false` leaves react-query pending forever, which a caller waiting on this would
    // read as "still looking" and never show its empty state.
    isLoading: enabled && query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** The featured claims grouped for geo-chat's per-space `debate-claims` lookup, in a stable order. */
export function featuredClaimIdsBySpace(claims: FeaturedClaim[]): Array<{ spaceId: string; claimIds: string[] }> {
  const bySpace = new Map<string, string[]>();
  for (const claim of claims) {
    const existing = bySpace.get(claim.spaceId);
    if (existing) existing.push(claim.claimEntityId);
    else bySpace.set(claim.spaceId, [claim.claimEntityId]);
  }

  return [...bySpace.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([spaceId, claimIds]) => ({ spaceId, claimIds }));
}
