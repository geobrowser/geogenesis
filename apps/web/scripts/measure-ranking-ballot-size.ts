/**
 * GEO-3680: how big can a ranking ballot get before publishing breaks?
 *
 * Every ballot edit re-sends the whole list (`geo.ranks.update` deletes every
 * existing vote and re-creates the new list, about 4 ops per item), so the edit
 * grows with the ballot. This publishes one ballot per size on TESTNET and times
 * each step, for both the first publish (create, ~2 ops per item) and an edit
 * of it (update, ~4 ops per item):
 *
 *   build    building the ops (for update: paging the existing votes off the API)
 *   upload   `personalSpaces.publishEdit` (the IPFS upload of the edit)
 *   send     the user operation, until its receipt
 *   index    until the app's own read (`fetchMyRankingBallot`: block listing,
 *            then the rank's votes paged) returns the new ballot in order.
 *            That is the wait a ranker sees between placements.
 *
 * It refuses to run against anything but testnet, and does nothing unless
 * DRY_RUN=0. Use a throwaway ranking block, never the live Best debates block:
 * the ballot counts toward that block's ranking.
 *
 *   RANKING_SIZE_TEST_PK=0x…            private key of a test wallet (signs the smart account)
 *   RANKING_SIZE_TEST_SPACE_ID=…        that wallet's personal space id (32 hex)
 *   RANKING_SIZE_TEST_BLOCK_ID=…        a throwaway ranking block id
 *   RANKING_SIZE_TEST_ITEM_SPACE_ID=…   a space with at least max(SIZES)+1 entities to vote on
 *   SIZES=1000,2000                     (default)
 *   INDEX_TIMEOUT_MS=900000             give up waiting on the index after this (default 15 min)
 *
 *   cd apps/web
 *   DRY_RUN=1 bun scripts/measure-ranking-ballot-size.ts   # default: fetch items, build ops, print sizes
 *   DRY_RUN=0 bun scripts/measure-ranking-ballot-size.ts   # publish and time
 *
 * Paste the printed table into the PR. Set NEXT_PUBLIC_RANKING_BALLOT_MAX_ITEMS
 * below the first size that fails (or whose publish takes too long to wait on).
 */
import { generateZeroDevAccount } from '@geogenesis/auth/account';
import { Ops } from '@geoprotocol/geo-sdk';

import { privateKeyToAccount } from 'viem/accounts';

import { fetchMyRankingBallot } from '~/core/blocks/ranking/fetch-my-ranking-ballot';
import { sameBallotOrder } from '~/core/blocks/ranking/ranking-publish-queue';
import { rankingVoteWeightFromIndex } from '~/core/blocks/ranking/ranking-vote-weights';
import { geo } from '~/core/sdk/geo-client';
import { GEO_NETWORK, IS_TESTNET } from '~/core/sdk/geo-network';

const DRY_RUN = process.env.DRY_RUN !== '0';
const SIZES = (process.env.SIZES ?? '1000,2000')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(n => Number.isInteger(n) && n > 0);
const INDEX_TIMEOUT_MS = Number(process.env.INDEX_TIMEOUT_MS ?? 15 * 60 * 1000);
const POLL_MS = 2000;

const HEX32 = /^[0-9a-f]{32}$/;

function requireEnv(name: string, pattern?: RegExp): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}`);
  if (pattern && !pattern.test(value)) throw new Error(`${name} must match ${pattern}`);
  return value;
}

const GRAPHQL_URL = `${GEO_NETWORK.apiOrigin}/graphql`;

/** The testnet API sometimes answers "upstream request timeout" as plain text; retry a few times. */
async function graphql<T>(query: string, variables: Record<string, unknown>, attempts = 4): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      const text = await response.text();
      let body: { data?: T; errors?: { message: string }[] };
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`GraphQL ${response.status}: ${text.slice(0, 120)}`);
      }
      if (!response.ok || body.errors?.length || !body.data) {
        throw new Error(`GraphQL ${response.status}: ${body.errors?.map(e => e.message).join('; ') ?? 'no data'}`);
      }
      return body.data;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

async function fetchItemIds(spaceId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  while (ids.length < count) {
    const data: {
      entitiesConnection: { nodes: { id: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    } = await graphql(
      `
        query Items($spaceId: UUID!, $after: Cursor) {
          entitiesConnection(first: 250, after: $after, spaceId: $spaceId, orderBy: [ID_ASC]) {
            nodes {
              id
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { spaceId, after }
    );
    ids.push(...data.entitiesConnection.nodes.map(n => n.id.replaceAll('-', '')));
    if (!data.entitiesConnection.pageInfo.hasNextPage || !data.entitiesConnection.pageInfo.endCursor) break;
    after = data.entitiesConnection.pageInfo.endCursor;
  }
  if (ids.length < count) throw new Error(`Space ${spaceId} has only ${ids.length} entities; need ${count}`);
  return ids.slice(0, count);
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - started) };
}

type Row = {
  size: number;
  kind: 'create' | 'update';
  ops: number;
  build?: number;
  upload?: number;
  send?: number;
  index?: number;
  error?: string;
};

function printTable(rows: Row[]) {
  const s = (ms?: number) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
  console.log('\n| Items | Edit | Ops | Build | Upload | Send | Index | Result |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.size} | ${r.kind} | ${r.ops || '—'} | ${s(r.build)} | ${s(r.upload)} | ${s(r.send)} | ${s(r.index)} | ${
        r.error ? `failed: ${r.error}` : 'ok'
      } |`
    );
  }
}

async function main() {
  if (!IS_TESTNET || GEO_NETWORK.id !== 'TESTNET') {
    throw new Error('Refusing to run: this build does not target testnet (check NEXT_PUBLIC_CHAIN_ID).');
  }
  if (SIZES.length === 0) throw new Error('SIZES is empty');

  const personalSpaceId = requireEnv('RANKING_SIZE_TEST_SPACE_ID', HEX32);
  const blockId = requireEnv('RANKING_SIZE_TEST_BLOCK_ID', HEX32);
  const itemSpaceId = requireEnv('RANKING_SIZE_TEST_ITEM_SPACE_ID', HEX32);
  const privateKey = DRY_RUN ? null : (requireEnv('RANKING_SIZE_TEST_PK', /^0x[0-9a-fA-F]{64}$/) as `0x${string}`);

  const maxSize = Math.max(...SIZES);
  console.log(`GEO-3680 ballot size: sizes ${SIZES.join(', ')} on ${GRAPHQL_URL}${DRY_RUN ? '  [DRY RUN]' : ''}`);
  const items = await fetchItemIds(itemSpaceId, maxSize + 1);
  console.log(`Fetched ${items.length} item ids from space ${itemSpaceId}`);

  const smartAccount = privateKey
    ? await generateZeroDevAccount({ signer: privateKeyToAccount(privateKey), network: GEO_NETWORK })
    : null;

  const rows: Row[] = [];

  const publish = async (row: Row, ops: unknown[], rankId: string, expectedIds: string[], size: number) => {
    row.ops = ops.length;
    if (!smartAccount) {
      console.log(`  [dry run] ${row.kind} ${size}: ${ops.length} ops`);
      return;
    }
    const upload = await timed(() =>
      geo.personalSpaces.publishEdit({
        name: `GEO-3680 size test: ${row.kind} ${size}`,
        spaceId: personalSpaceId,
        ops: ops as never,
        author: personalSpaceId,
      })
    );
    row.upload = upload.ms;
    const send = await timed(async () => {
      const hash = await smartAccount.sendUserOperation({
        calls: [{ to: upload.value.to, value: 0n, data: upload.value.calldata }],
      });
      return smartAccount.waitForUserOperationReceipt({ hash });
    });
    row.send = send.ms;
    console.log(`  ${row.kind} ${size}: sent (${ops.length} ops), waiting for the index…`);
    const index = await timed(async () => {
      const started = Date.now();
      for (;;) {
        try {
          // The app's own read: the block listing, then the rank's votes paged
          // in full. The ballot counts as indexed once it returns this rank in
          // exactly this order, as the publish path's poll decides.
          const readBack = await fetchMyRankingBallot(personalSpaceId, blockId);
          if (
            readBack.rankEntity?.id.replaceAll('-', '') === rankId.replaceAll('-', '') &&
            sameBallotOrder(readBack.orderedEntityIds, expectedIds)
          )
            return;
        } catch (error) {
          console.warn(`    poll: ${String(error)}`);
        }
        if (Date.now() - started > INDEX_TIMEOUT_MS) throw new Error(`not indexed after ${INDEX_TIMEOUT_MS} ms`);
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
      }
    });
    row.index = index.ms;
  };

  for (const size of SIZES) {
    const createItems = items.slice(0, size);
    // The edit reverses the list and swaps the last item for one the first
    // ballot didn't have, so the index read can tell the two apart.
    const updateItems = [items[size], ...createItems.slice(0, size - 1).reverse()];
    const toVotes = (ids: string[]) =>
      ids.map((entityId, index) => ({ entityId, spaceId: itemSpaceId, value: rankingVoteWeightFromIndex(index) }));

    console.log(`\n=== ${size} items`);
    const createRow: Row = { size, kind: 'create', ops: 0 };
    rows.push(createRow);
    let rankId: string | null = null;
    try {
      const built = await timed(async () =>
        Ops.ranks.create({
          name: `GEO-3680 size test ${size}`,
          rankType: 'WEIGHTED',
          blockId,
          votes: toVotes(createItems),
        })
      );
      createRow.build = built.ms;
      rankId = built.value.id;
      await publish(createRow, built.value.ops, rankId, createItems, size);
    } catch (error) {
      createRow.error = String(error instanceof Error ? error.message : error);
      console.error(`  create ${size} failed:`, error);
      continue;
    }

    const updateRow: Row = { size, kind: 'update', ops: 0 };
    rows.push(updateRow);
    if (DRY_RUN) {
      // The rank doesn't exist, so an update can't read its votes. An update is
      // the new votes plus a relation delete and an entity delete per old vote.
      updateRow.ops = createRow.ops + 2 * size;
      console.log(`  [dry run] update ${size}: ~${updateRow.ops} ops`);
      continue;
    }
    try {
      const built = await timed(() =>
        geo.ranks.update({ rankId: rankId!, rankType: 'WEIGHTED', votes: toVotes(updateItems) })
      );
      updateRow.build = built.ms;
      await publish(updateRow, built.value.ops, rankId, updateItems, size);
    } catch (error) {
      updateRow.error = String(error instanceof Error ? error.message : error);
      console.error(`  update ${size} failed:`, error);
    }
  }

  printTable(rows);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
