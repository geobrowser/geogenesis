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
  query TaggedClaims($tagPropertyId: UUID!, $tagId: UUID!, $claimTypeId: UUID!, $first: Int!, $after: Cursor) {
    entitiesConnection(
      first: $first
      after: $after
      orderBy: [RANKING_SCORE_DESC]
      typeIds: { in: [$claimTypeId] }
      filter: { relations: { some: { typeId: { is: $tagPropertyId }, toEntityId: { is: $tagId } } } }
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        description
        rankingScore
        # The tag relation itself, for the space it was written in — the space the claim was tagged
        # *in*, which is what groups the geo-chat lookups and what the allowlist is tested against.
        # Asked for by the same two ids the filter uses, so a claim tagged in several spaces returns
        # each one and the callers collapse them after filtering, as they always have.
        relationsList(filter: { typeId: { is: $tagPropertyId }, toEntityId: { is: $tagId } }) {
          spaceId
        }
      }
    }
  }
`;

type TaggedClaimsQuery = {
  entitiesConnection: {
    totalCount: number | null;
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
    nodes: Array<{
      id: string;
      name: string | null;
      description: string | null;
      // `BigFloat`, so it arrives as a string.
      rankingScore: string | null;
      relationsList: Array<{ spaceId: string | null } | null> | null;
    } | null> | null;
  } | null;
};

type TaggedClaimsVariables = {
  tagPropertyId: string;
  tagId: string;
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

type TaggedClaimsPage = {
  claims: TaggedClaim[];
  endCursor: string | null;
  hasNextPage: boolean;
  /** How many tagged claims exist, whatever this page holds. Null where the server omits it. */
  totalCount: number | null;
};

function decodeTaggedClaimsPage(data: TaggedClaimsQuery): TaggedClaimsPage {
  const claims: TaggedClaim[] = [];

  for (const node of data.entitiesConnection?.nodes ?? []) {
    // A claim with no name has nothing to render.
    if (!node?.name) continue;
    const rankingScore = node.rankingScore === null ? null : Number(node.rankingScore);

    // One row per space the claim is tagged in, which is the shape the callers already expect: a
    // claim tagged in three spaces arrives three times and is collapsed after filtering, so a tag
    // in a space the viewer cannot see never stands for one in a space they can. A tag with no
    // space can be neither grouped for the geo-chat lookups nor tested against the allowlist.
    for (const relation of node.relationsList ?? []) {
      if (!relation?.spaceId) continue;
      claims.push({
        claimEntityId: node.id,
        spaceId: relation.spaceId,
        name: node.name,
        description: node.description,
        rankingScore,
      });
    }
  }

  return {
    claims,
    endCursor: data.entitiesConnection?.pageInfo?.endCursor ?? null,
    hasNextPage: data.entitiesConnection?.pageInfo?.hasNextPage ?? false,
    totalCount: data.entitiesConnection?.totalCount ?? null,
  };
}

/**
 * Every claim carrying `tagId`, ranked.
 *
 * `total` is the server's own count of the tagged set, so `truncated` is a comparison rather than a
 * guess: the guard stopping the loop and the corpus happening to end on the guard are the same
 * shape from the inside, and only the count can tell them apart.
 */
export type TaggedClaimsResult = { claims: TaggedClaim[]; truncated: boolean; total: number | null };

export async function fetchTaggedClaims(tagId: string, signal?: AbortSignal): Promise<TaggedClaimsResult> {
  const claims: TaggedClaim[] = [];
  let after: string | null = null;

  let total: number | null = null;

  // Paged to exhaustion, and ranked by the server on the way (`RANKING_SCORE_DESC`).
  //
  // This asks `entitiesConnection` for claims carrying the tag, rather than `relationsConnection`
  // for the tags themselves. The score lives on the claim, so the entity connection can order by
  // it — the relation connection could not, and the whole set had to arrive before it could be
  // sorted client-side. Pages now arrive in rank order, which is what a paged read would need if
  // this ever outgrows fetching the lot.
  while (claims.length < TAGGED_CLAIMS_LIMIT) {
    const page: TaggedClaimsPage = await Effect.runPromise(
      graphql({
        query: taggedClaimsDocument,
        decoder: decodeTaggedClaimsPage,
        variables: {
          tagPropertyId: TAG_PROPERTY_ID,
          tagId,
          claimTypeId: CLAIM_TYPE_ID,
          first: TAGGED_CLAIMS_PAGE_SIZE,
          after,
        },
        signal,
      })
    );

    claims.push(...page.claims);
    total = page.totalCount ?? total;
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }

  // Measured against the server's count, not against the guard. A corpus of exactly the guard's
  // size is complete; one row more is a slice, and without `total` those are indistinguishable —
  // which is how a truncated list came to look identical to a whole one.
  const truncated = total === null ? claims.length >= TAGGED_CLAIMS_LIMIT : total > claims.length;
  if (truncated) {
    devLog(`[tagged-claims] ${claims.length} of ${total ?? 'unknown'} rows for ${tagId}; the list is truncated.`);
  }

  // Sorted here as well as by the server: a claim tagged in several spaces arrives once per tag, and
  // `rankingScore` ties between those rows are broken by id so the duplicates sit together rather
  // than being interleaved with their neighbours by page order.
  return { claims: claims.sort(compareTaggedClaims), truncated, total };
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
