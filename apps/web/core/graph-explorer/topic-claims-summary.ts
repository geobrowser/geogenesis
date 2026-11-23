import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { type ClaimResponseSummaryRow, getClaimResponseSummaryPage } from '~/core/io/queries';
import {
  CLAIM_RESPONSE_SUMMARY_PAGE_SIZE,
  groupClaimResponseSummaryRows,
} from '~/core/responses/claim-response-summaries';
import { responseKindToVoteKind } from '~/core/responses/entity-response';
import type { CursorPage } from '~/core/sync/collect-cursor-pages';
import { normId } from '~/core/utils/norm-id';

import { type ClaimBand, agreePercent, claimBand } from './claim-band';
import { CLAIM_ABOUT_PROPERTY_IDS, CLAIM_TYPE_ID } from './ontology';

export type SummarisedClaim = { id: string; name: string; positive: number; negative: number; band: ClaimBand };

export type TopicClaimsSummary = {
  /** Claims about the topic with at least one response in the space, most responses first. */
  claims: SummarisedClaim[];
  bands: Record<ClaimBand, number>;
  /** The space has more responses than were read, so the counts are lower bounds. */
  truncated: boolean;
};

/** About 1.2s of reading; World affairs held 1,600 stance rows in Nov 2026. */
export const MAX_STANCE_PAGES = 5;
const CLAIM_LOOKUP_SIZE = 1000;

/** Bands and order for the topic's claims, from the space's stance rows (one per user, latest wins). */
export function summariseTopicClaims(
  rows: readonly ClaimResponseSummaryRow[],
  claims: ReadonlyArray<{ id: string; name: string }>,
  truncated = false
): TopicClaimsSummary {
  const targets = claims.map(claim => ({ entityId: claim.id, responseKind: 'stance' as const }));
  const summaries = groupClaimResponseSummaryRows(targets, [...rows], null);
  const summarised: SummarisedClaim[] = [];
  for (const claim of claims) {
    const counts = summaries.get(`${claim.id}:stance`)?.counts;
    const band = counts ? claimBand(counts.positive, counts.negative) : null;
    if (counts && band) summarised.push({ id: claim.id, name: claim.name, ...counts, band });
  }
  summarised.sort((a, b) => b.positive + b.negative - (a.positive + a.negative) || a.name.localeCompare(b.name));
  const bands = { agreed: 0, contested: 0, rejected: 0 };
  for (const claim of summarised) bands[claim.band]++;
  return { claims: summarised, bands, truncated };
}

/**
 * Up to `maxPages` pages of stance rows, ordered by claim. When more remain, the last claim's rows
 * may be cut short, so they are dropped rather than counted wrong.
 */
export async function readStanceRows(
  fetchPage: (after: string | undefined) => Promise<CursorPage<ClaimResponseSummaryRow>>,
  maxPages = MAX_STANCE_PAGES
): Promise<{ rows: ClaimResponseSummaryRow[]; truncated: boolean }> {
  const rows: ClaimResponseSummaryRow[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(after);
    rows.push(...result.items);
    if (!result.hasNextPage) return { rows, truncated: false };
    if (!result.endCursor || result.endCursor === after)
      throw new Error('Stance responses have a next page but no new cursor');
    after = result.endCursor;
  }
  const last = rows.at(-1)?.objectId;
  return { rows: rows.filter(row => row.objectId !== last), truncated: true };
}

export function summaryPercent(claim: SummarisedClaim) {
  return agreePercent(claim.positive, claim.negative);
}

type VotedClaimsResponse = { entitiesConnection: { nodes: Array<{ id: string; name: string | null }> } | null };

const votedClaimsDocument: TypedDocumentNode<VotedClaimsResponse> = parse(`
  query TopicVotedClaims($ids: [UUID!], $topicId: UUID!, $aboutPropertyIds: [UUID!], $claimTypeId: UUID!) {
    entitiesConnection(
      first: 1000
      filter: {
        id: { in: $ids }
        typeIds: { anyEqualTo: $claimTypeId }
        relations: { some: { typeId: { in: $aboutPropertyIds }, toEntityId: { is: $topicId } } }
      }
    ) {
      nodes { id name }
    }
  }
`);

/** Stance responses in `spaceId`, up to MAX_STANCE_PAGES, kept only for claims about the topic. */
export async function fetchTopicClaimsSummary(topicId: string, spaceId: string, signal?: AbortSignal) {
  const filter = {
    spaceId: { is: spaceId },
    objectType: { is: 0 },
    voteKind: { is: responseKindToVoteKind('stance') },
    voteType: { in: [0, 1] },
  };
  const { rows, truncated } = await readStanceRows(after =>
    Effect.runPromise(getClaimResponseSummaryPage(filter, CLAIM_RESPONSE_SUMMARY_PAGE_SIZE, after, signal))
  );
  const ids = [...new Set(rows.map(row => normId(row.objectId)))];
  if (ids.length === 0) return summariseTopicClaims([], [], truncated);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CLAIM_LOOKUP_SIZE) chunks.push(ids.slice(i, i + CLAIM_LOOKUP_SIZE));
  const claims = await Promise.all(
    chunks.map(chunk =>
      Effect.runPromise(
        graphql({
          query: votedClaimsDocument,
          decoder: (response: VotedClaimsResponse) =>
            (response.entitiesConnection?.nodes ?? []).flatMap(node =>
              node.name?.trim() ? [{ id: normId(node.id), name: node.name.trim() }] : []
            ),
          variables: { ids: chunk, topicId, aboutPropertyIds: CLAIM_ABOUT_PROPERTY_IDS, claimTypeId: CLAIM_TYPE_ID },
          signal,
        })
      )
    )
  );
  return summariseTopicClaims(
    rows.map(row => ({ ...row, objectId: normId(row.objectId) })),
    claims.flat(),
    truncated
  );
}
