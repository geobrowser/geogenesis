'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { COMMENT_REPLY_TO_ID } from '~/core/comment-ids';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

import { type ClaimActivityCount, countActivityForNode } from './claim-activity-fields';

export { CLAIM_ACTIVITY_COUNT_FIELDS, countActivityForNode } from './claim-activity-fields';
export type { ClaimActivityCount } from './claim-activity-fields';

/**
 * Activity totals for a set of claims, in one request.
 *
 * Explore cards get this for free — their own selection carries the fields, and what the number
 * means lives in `claim-activity-fields.ts`. This is for surfaces holding a claim id with no card
 * behind it, the claim page's own heading above all.
 *
 * Batched because the cost is per request rather than per claim, and a feed asking once per row is
 * what makes a number on a row expensive: 20 active claims answer together in 0.69s and 17 KB.
 */
const CLAIM_ACTIVITY_COUNTS_SOURCE = /* GraphQL */ `
  query ClaimActivityCounts(
    $ids: [UUID!]
    $claimsPropertyId: UUID!
    $sourcesPropertyId: UUID!
    $replyToTypeId: UUID!
    $debateTypeId: UUID!
    $claimTypeId: UUID!
  ) {
    entities(filter: { id: { in: $ids } }) {
      id
      comments: backlinks(filter: { typeId: { is: $replyToTypeId } }) {
        totalCount
      }
      debates: backlinksList(
        filter: { typeId: { is: $claimsPropertyId }, fromEntity: { typeIds: { overlaps: [$debateTypeId] } } }
      ) {
        fromEntity {
          id
          comments: backlinks(filter: { typeId: { is: $replyToTypeId } }) {
            totalCount
          }
          extracted: backlinksList(
            filter: { typeId: { is: $sourcesPropertyId }, fromEntity: { typeIds: { overlaps: [$claimTypeId] } } }
          ) {
            fromEntity {
              id
              comments: backlinks(filter: { typeId: { is: $replyToTypeId } }) {
                totalCount
              }
            }
          }
        }
      }
    }
  }
`;

const claimActivityCountsDocument = parse(CLAIM_ACTIVITY_COUNTS_SOURCE) as TypedDocumentNode<any, any>;

// Only `id` is read here by name; the counting fields are whatever `countActivityForNode`
// recognises, so the shape stays open rather than restating them in two places.
type CountsResponse = { entities?: Array<({ id?: string | null } & Record<string, unknown>) | null> | null };

const EMPTY_COUNTS = new Map<string, ClaimActivityCount>();

export function decodeClaimActivityCounts(data: CountsResponse): Map<string, ClaimActivityCount> {
  const counts = new Map<string, ClaimActivityCount>();

  for (const claim of data.entities ?? []) {
    if (!claim?.id) continue;
    counts.set(uuidToHex(claim.id), countActivityForNode(claim));
  }

  return counts;
}

export const claimActivityCountsQueryKey = (ids: string[]) => ['claim-activity-counts', ids] as const;

/**
 * Activity totals keyed by canonical claim id.
 *
 * An absent entry means "not answered yet", not "nothing" — a caller showing a number should hold
 * whatever it already had rather than flashing a zero it invented.
 */
export function useClaimActivityCounts(claimIds: string[], enabled = true): Map<string, ClaimActivityCount> {
  // Sorted and deduped, so the same claims in a different order are the same query.
  const ids = React.useMemo(() => [...new Set(claimIds.filter(Boolean).map(uuidToHex))].sort(), [claimIds]);

  const { data } = useQuery({
    queryKey: claimActivityCountsQueryKey(ids),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: claimActivityCountsDocument,
          decoder: decodeClaimActivityCounts,
          variables: {
            ids,
            claimsPropertyId: DEBATE_CLAIMS_PROPERTY_ID,
            sourcesPropertyId: SOURCES_PROPERTY_ID,
            replyToTypeId: COMMENT_REPLY_TO_ID,
            debateTypeId: DEBATE_TYPE_ID,
            claimTypeId: CLAIM_TYPE_ID,
          },
          signal,
        })
      ),
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
  });

  return data ?? EMPTY_COUNTS;
}
