import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse, print } from 'graphql';
import https from 'node:https';
import { describe, expect, it } from 'vitest';

import { AGGREGATED_RANKINGS_PROPERTY_ID } from '~/core/ranking-block-ids';
import { collectCursorPages } from '~/core/sync/collect-cursor-pages';
import { normId } from '~/core/utils/norm-id';

import { type BlockRankersRequest, createBlockRankersPageFetchers, readBlockRankers } from './fetch-block-rankers';

/**
 * Opt-in check of the reader against a real block (GEO-3686): the ballots it counts must be the
 * ones the indexer projected as the block's `Aggregated rankings`. Skipped unless asked for:
 *
 *   BLOCK_RANKERS_LIVE_BLOCK=<block id> BLOCK_RANKERS_LIVE_SPACE=<block's space id> \
 *     [BLOCK_RANKERS_LIVE_API=https://api-testnet.geobrowser.io/graphql] vitest run block-rankers.live
 *
 * Read-only. Tests refuse `fetch` (vitest.setup.ts), so this talks HTTPS directly.
 */
const BLOCK_ID = process.env.BLOCK_RANKERS_LIVE_BLOCK;
const SPACE_ID = process.env.BLOCK_RANKERS_LIVE_SPACE;
const API = process.env.BLOCK_RANKERS_LIVE_API ?? 'https://api-testnet.geobrowser.io/graphql';

function post(query: string, variables: unknown): Promise<unknown> {
  const body = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    const req = https.request(
      API,
      { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      res => {
        let text = '';
        res.on('data', chunk => (text += chunk));
        res.on('end', () => {
          const json = JSON.parse(text) as { data?: unknown; errors?: unknown };
          if (json.errors) reject(new Error(JSON.stringify(json.errors)));
          else resolve(json.data);
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

const request: BlockRankersRequest = (document, variables) => post(print(document), variables) as never;

const aggregatedDocument = parse(/* GraphQL */ `
  query BlockRankersLiveAggregated($blockId: UUID!, $typeId: UUID!, $after: Cursor) {
    relationsConnection(
      first: 1000
      after: $after
      filter: { fromEntityId: { is: $blockId }, typeId: { is: $typeId } }
    ) {
      nodes {
        toEntityId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`) as TypedDocumentNode<
  {
    relationsConnection: {
      nodes: Array<{ toEntityId: string }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  },
  { blockId: string; typeId: string; after: string | null }
>;

describe.skipIf(!BLOCK_ID || !SPACE_ID)('block rankers against a live block', () => {
  it('counts the ballots the indexer aggregated', async () => {
    const started = performance.now();
    const summary = await readBlockRankers(
      { blockId: BLOCK_ID!, spaceId: SPACE_ID! },
      createBlockRankersPageFetchers(request)
    );
    const elapsedMs = Math.round(performance.now() - started);

    const aggregated = await collectCursorPages(async after => {
      const { relationsConnection } = await request(aggregatedDocument, {
        blockId: BLOCK_ID!,
        typeId: AGGREGATED_RANKINGS_PROPERTY_ID,
        after: after ?? null,
      });
      return {
        items: relationsConnection.nodes.map(node => normId(node.toEntityId)),
        endCursor: relationsConnection.pageInfo.endCursor,
        hasNextPage: relationsConnection.pageInfo.hasNextPage,
      };
    });

    const counted = summary.countingBallots.map(ballot => normId(ballot.rankEntityId));
    console.info(
      JSON.stringify({
        elapsedMs,
        countingBallots: counted.length,
        aggregatedRankings: aggregated.length,
        rankedEntities: summary.rankersByEntityId.size,
        largestBallot: Math.max(0, ...summary.countingBallots.map(ballot => ballot.ballotSize)),
      })
    );
    expect(new Set(counted)).toEqual(new Set(aggregated));
  }, 120_000);
});
