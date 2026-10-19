/**
 * Runs the app's claim response summary read on testnet over every answered claim in one space and
 * compares its totals with the graph's row count.
 *
 * Usage: bun scripts/check-claim-response-summaries.ts [spaceId] (default: the busiest space)
 */
import { print } from 'graphql';

import { claimResponseSummariesQuery } from '../core/io/query-fragments';
import { fetchClaimResponseSummaries } from '../core/responses/claim-response-summaries';
import { CLAIM_RESPONSE_KIND, responseKindToVoteKind } from '../core/responses/entity-response';

const API = 'https://api-testnet.geobrowser.io/graphql';
const VOTE_KIND = responseKindToVoteKind(CLAIM_RESPONSE_KIND);

async function post<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) throw new Error(body.errors.map(error => error.message).join('; '));
  return body.data as T;
}

type Row = { spaceId: string; objectId: string };

/** Every active stance response on a claim, across all spaces, by cursor. */
async function allActiveStanceRows() {
  const query = /* GraphQL */ `
    query ($filter: UserVoteFilter!, $after: Cursor) {
      userVotesConnection(filter: $filter, first: 1000, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          spaceId
          objectId
        }
      }
    }
  `;
  const filter = { objectType: { is: 0 }, voteType: { in: [0, 1] }, voteKind: { is: VOTE_KIND } };
  const rows: Row[] = [];
  let after: string | null = null;
  for (;;) {
    const data: {
      userVotesConnection: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Row[] };
    } = await post(query, { filter, after });
    rows.push(...data.userVotesConnection.nodes);
    if (!data.userVotesConnection.pageInfo.hasNextPage) return rows;
    after = data.userVotesConnection.pageInfo.endCursor;
  }
}

const summaryQuery = print(claimResponseSummariesQuery);

const rows = await allActiveStanceRows();
const rowsBySpace = new Map<string, Row[]>();
for (const row of rows) rowsBySpace.set(row.spaceId, [...(rowsBySpace.get(row.spaceId) ?? []), row]);

const spaceId =
  process.argv[2]?.replaceAll('-', '') ?? [...rowsBySpace].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
if (!spaceId) throw new Error('No claim responses on testnet');

const spaceRows = rowsBySpace.get(spaceId) ?? [];
const claimIds = [...new Set(spaceRows.map(row => row.objectId))];
console.log(`space ${spaceId}: ${spaceRows.length} active stance rows on ${claimIds.length} claims`);

let requests = 0;
try {
  const summaries = await fetchClaimResponseSummaries({
    spaceId,
    targets: claimIds.map(entityId => ({ entityId, responseKind: CLAIM_RESPONSE_KIND })),
    personalSpaceId: null,
    fetchPage: async ({ filter, first, after }) => {
      requests++;
      const data = await post<{
        userVotesConnection: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{ userId: string; objectId: string; voteType: number; voteKind: number }>;
        } | null;
      }>(summaryQuery, { filter, first, after });
      const connection = data.userVotesConnection;
      return {
        items: (connection?.nodes ?? []).map(vote => ({
          ...vote,
          userId: String(vote.userId),
          objectId: String(vote.objectId),
        })),
        endCursor: connection?.pageInfo.endCursor ?? null,
        hasNextPage: connection?.pageInfo.hasNextPage ?? false,
      };
    },
  });
  let positive = 0;
  let negative = 0;
  for (const summary of summaries.values()) {
    positive += summary.counts.positive;
    negative += summary.counts.negative;
  }
  console.log(
    `summary read: ${positive + negative} responses (${positive} agree, ${negative} disagree) in ${requests} requests`
  );
  console.log(positive + negative === spaceRows.length ? 'MATCH' : `MISMATCH: graph holds ${spaceRows.length}`);
} catch (error) {
  console.log(`summary read FAILED after ${requests} requests: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
