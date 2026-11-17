import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

import { DEBATE_TYPE_ID } from './best-debates';
import type { PeriodDebate } from './best-debates-views';

/**
 * The Debate entities published in a time range, in Explore's Best order (GEO-3677).
 *
 * Best is gaia's `rankingScore`, the order Explore's Best sort reads through the same
 * `entitiesRankedForFeedByType` connection (`core/explore/explore-best-by-type-document.ts`).
 * `createdAfter` / `createdBefore` are applied inside the function, before the per-type cap, so a
 * range read is exact as long as `maxPerType` covers the range (about 150 debates a week on
 * testnet, against a cap of 2,000).
 *
 * A debate is listed once it has a score, which gaia gives it a few minutes after it's published.
 */

/** The API's per-request cap. A week of debates is well under it. */
export const BEST_DEBATES_WINDOW_LIMIT = 1000;
const MAX_PER_TYPE = 2000;

const SOURCE = /* GraphQL */ `
  query BestDebatesWindow(
    $typeIds: [UUID!]
    $createdAfter: String
    $createdBefore: String
    $maxPerType: Int
    $first: Int
  ) {
    entitiesRankedForFeedByType(
      typeIds: $typeIds
      createdAfter: $createdAfter
      createdBefore: $createdBefore
      maxPerType: $maxPerType
      first: $first
    ) {
      id
      name
      createdAt
    }
  }
`;

type WindowQuery = {
  entitiesRankedForFeedByType: Array<{
    id: string | null;
    name: string | null;
    createdAt: string | null;
  } | null> | null;
};

type WindowVariables = {
  typeIds: string[];
  createdAfter: string;
  createdBefore: string;
  maxPerType: number;
  first: number;
};

const document = parse(SOURCE) as TypedDocumentNode<WindowQuery, WindowVariables>;

export type BestDebatesWindowRequest = (variables: WindowVariables) => Promise<WindowQuery>;

const appRequest: BestDebatesWindowRequest = variables =>
  Effect.runPromise(graphql({ query: document, variables, decoder: data => data }));

/** Debates published in [fromMs, toMs), Best first. */
export async function fetchBestDebatesWindow(
  { fromMs, toMs }: { fromMs: number; toMs: number },
  request: BestDebatesWindowRequest = appRequest
): Promise<PeriodDebate[]> {
  const data = await request({
    typeIds: [DEBATE_TYPE_ID],
    createdAfter: String(Math.floor(fromMs / 1000)),
    createdBefore: String(Math.floor(toMs / 1000)),
    maxPerType: MAX_PER_TYPE,
    first: BEST_DEBATES_WINDOW_LIMIT,
  });

  const debates: PeriodDebate[] = [];
  for (const node of data.entitiesRankedForFeedByType ?? []) {
    if (!node?.id || node.createdAt == null) continue;
    const createdAtSeconds = Number(node.createdAt);
    if (!Number.isFinite(createdAtSeconds)) continue;
    const createdAtMs = createdAtSeconds * 1000;
    // The range is applied server side; this keeps the read exact at its edges either way.
    if (createdAtMs < fromMs || createdAtMs >= toMs) continue;
    debates.push({ id: normId(node.id), name: node.name, createdAtMs });
  }
  return debates;
}
