import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { graphql } from '~/core/io/graphql-client';
import { devLog } from '~/core/utils/dev-log';

/**
 * Claims carrying a given curation tag — a `Tags` relation pointing at one entity.
 *
 * GEO-2683 for `Featured`, GEO-2771 for `Debate`. The tag is what gets asked for, rather than the
 * claims and then their tags: a tagged set is a few hundred out of three hundred thousand, so a
 * filter applied to pages of claims would page for a very long time before it found one. That ratio
 * is also why these lists do not go through geo-chat at all — the graph owns tags, so it can answer
 * *which* claims, leaving geo-chat to answer about them.
 *
 * The relation carries the space it was written in, which is the space the claim was tagged *in* —
 * a better answer than ranking the claim's spaces after the fact, and the one every caller uses to
 * group its geo-chat lookups.
 *
 * `rankingScore` rides along so the list can be ordered the way Explore's "Best" sort and geo-chat
 * both order theirs. Unordered, this connection comes back by relation id, and those are random
 * v4s — a fixed shuffle with no relationship to anything a reader would recognise.
 */
const TAGGED_CLAIMS_SOURCE = /* GraphQL */ `
  query TaggedClaims(
    $tagPropertyId: UUID!
    $tagId: UUID!
    $typesPropertyId: UUID!
    $claimTypeId: UUID!
    $first: Int!
    $after: Cursor
  ) {
    relationsConnection(
      first: $first
      after: $after
      filter: {
        typeId: { is: $tagPropertyId }
        toEntityId: { is: $tagId }
        fromEntity: { relations: { some: { typeId: { is: $typesPropertyId }, toEntityId: { is: $claimTypeId } } } }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
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

type TaggedClaimsQuery = {
  relationsConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
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

type TaggedClaimsVariables = {
  tagPropertyId: string;
  tagId: string;
  typesPropertyId: string;
  claimTypeId: string;
  first: number;
  after: string | null;
};

const taggedClaimsDocument = parse(TAGGED_CLAIMS_SOURCE) as TypedDocumentNode<TaggedClaimsQuery, TaggedClaimsVariables>;

/** Rows per request. The whole tagged set is what both callers filter and show, so it is paged
 * through to exhaustion rather than sampled — a single capped request would decide what to keep by
 * relation id, which is a random v4 and so has no relationship to the order this list is shown in. */
const TAGGED_CLAIMS_PAGE_SIZE = 500;

/**
 * A runaway guard, not a product limit: a few hundred claims are tagged today, so this is an order
 * of magnitude of headroom, and reaching it means a mis-tagging has pointed the whole corpus at
 * the tag. If curation ever legitimately grows past it, the answer is a ranked server-side
 * endpoint rather than a bigger number here — the client is already sorting the entire set.
 */
export const TAGGED_CLAIMS_LIMIT = 5_000;

/** A claim a curator has tagged, and the space they tagged it in. */
export type TaggedClaim = {
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
export function compareTaggedClaims(a: TaggedClaim, z: TaggedClaim): number {
  if (a.rankingScore !== z.rankingScore) {
    if (a.rankingScore === null) return 1;
    if (z.rankingScore === null) return -1;
    return z.rankingScore - a.rankingScore;
  }
  return z.claimEntityId.localeCompare(a.claimEntityId);
}

/**
 * One claim per id, keeping the first entry.
 *
 * Deliberately not done while decoding. A claim can be tagged in several spaces, and which of those
 * a viewer may be shown is a question only the callers can answer — deduplicating first would make
 * an arbitrary space authoritative and drop the claim entirely when that one happens to be outside
 * the viewer's allowlist, even though it is tagged in a space they can see. So every tag survives
 * the fetch and the callers collapse them *after* filtering.
 */
export function dedupeTaggedClaims(claims: TaggedClaim[]): TaggedClaim[] {
  const seen = new Set<string>();
  return claims.filter(claim => {
    if (seen.has(claim.claimEntityId)) return false;
    seen.add(claim.claimEntityId);
    return true;
  });
}

type TaggedClaimsPage = { claims: TaggedClaim[]; endCursor: string | null; hasNextPage: boolean };

function decodeTaggedClaimsPage(data: TaggedClaimsQuery): TaggedClaimsPage {
  const claims: TaggedClaim[] = [];

  for (const node of data.relationsConnection?.nodes ?? []) {
    // A claim with no name has nothing to render, and one whose tag carries no space can't be
    // grouped for the geo-chat lookups or tested against the viewer's spaces.
    if (!node?.fromEntity?.name || !node.spaceId) continue;
    claims.push({
      claimEntityId: node.fromEntity.id,
      spaceId: node.spaceId,
      name: node.fromEntity.name,
      description: node.fromEntity.description,
      rankingScore: node.fromEntity.rankingScore === null ? null : Number(node.fromEntity.rankingScore),
    });
  }

  return {
    claims,
    endCursor: data.relationsConnection?.pageInfo?.endCursor ?? null,
    hasNextPage: data.relationsConnection?.pageInfo?.hasNextPage ?? false,
  };
}

/**
 * Every claim carrying `tagId`, ranked. `truncated` says the guard below stopped the paging, so a
 * caller can say so rather than quietly showing a slice of an unknown whole.
 */
export type TaggedClaimsResult = { claims: TaggedClaim[]; truncated: boolean };

export async function fetchTaggedClaims(tagId: string, signal?: AbortSignal): Promise<TaggedClaimsResult> {
  const claims: TaggedClaim[] = [];
  let after: string | null = null;

  // Paged to exhaustion. Sorting can only happen once every page is in — the score belongs to the
  // claim on the other end of the relation, so the connection can't order by it, and a partial set
  // would be ranked against itself rather than against the whole tagged corpus.
  while (claims.length < TAGGED_CLAIMS_LIMIT) {
    const page: TaggedClaimsPage = await Effect.runPromise(
      graphql({
        query: taggedClaimsDocument,
        decoder: decodeTaggedClaimsPage,
        variables: {
          tagPropertyId: TAG_PROPERTY_ID,
          tagId,
          typesPropertyId: SystemIds.TYPES_PROPERTY,
          claimTypeId: CLAIM_TYPE_ID,
          first: TAGGED_CLAIMS_PAGE_SIZE,
          after,
        },
        signal,
      })
    );

    claims.push(...page.claims);
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }

  const truncated = claims.length >= TAGGED_CLAIMS_LIMIT;
  if (truncated) {
    devLog(`[tagged-claims] stopped at the ${TAGGED_CLAIMS_LIMIT}-row guard for ${tagId}; the list is truncated.`);
  }

  return { claims: claims.sort(compareTaggedClaims), truncated };
}

/**
 * Deliberately not under `'debates'`, for the same reason as the claim picker's key: that root is
 * what the gateway reconciles and refetches on every (re)connect, and these rows come from the
 * knowledge graph rather than geo-chat, so a socket event says nothing about them.
 */
export const taggedClaimsQueryKey = (tagId: string) => ['tagged-claims', 'claims', tagId] as const;

const NO_TAGGED_CLAIMS: TaggedClaim[] = [];

/**
 * Every claim carrying `tagId`, in Explore's "Best" order and unfiltered. Callers narrow it to the
 * spaces they may show — the viewer's allowlist and the acceptor's editor spaces — because which
 * spaces those are is a different question in the hub than it is in the rematch picker. Narrowing
 * preserves the order, so what survives is still ranked.
 *
 * Curation moves at human speed, so this stays fresh for a good while; every caller asking for the
 * same tag shares one request.
 */
export function useTaggedClaims(tagId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: taggedClaimsQueryKey(tagId),
    queryFn: ({ signal }) => fetchTaggedClaims(tagId, signal),
    staleTime: 5 * 60_000,
    enabled,
  });

  const claims = query.data?.claims ?? NO_TAGGED_CLAIMS;
  const claimIds = React.useMemo(() => claims.map(claim => claim.claimEntityId), [claims]);

  return {
    claims,
    claimIds,
    /** The guard stopped the paging, so this list is a slice of an unknown whole. */
    truncated: query.data?.truncated ?? false,
    // `enabled: false` leaves react-query pending forever, which a caller waiting on this would
    // read as "still looking" and never show its empty state.
    isLoading: enabled && query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** The tagged claims grouped for geo-chat's per-space `debate-claims` lookup, in a stable order. */
export function taggedClaimIdsBySpace(claims: TaggedClaim[]): Array<{ spaceId: string; claimIds: string[] }> {
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
