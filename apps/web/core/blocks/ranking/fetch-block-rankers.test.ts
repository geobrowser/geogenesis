import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { RANK_TYPE_ID, RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { CursorPage } from '~/core/sync/collect-cursor-pages';

import type { RankBallotHead, RankBallotItem } from './block-rankers';
import {
  BLOCK_RANKERS_PAGE_SIZE,
  type BlockRankersPageFetchers,
  type BlockRankersRequest,
  createBlockRankersPageFetchers,
  decodeBallotHead,
  readBlockRankers,
} from './fetch-block-rankers';

const DEBATES = '9284477c8fe746368698994e2e517b32';
const hex = (n: number) => n.toString(16).padStart(32, '0');
const pos = (i: number) => `a${String(i).padStart(5, '0')}`;

/** Serves a list as cursor pages of the API's size; the cursor is the next offset. */
function paged<T>(items: readonly T[], after: string | undefined, size = BLOCK_RANKERS_PAGE_SIZE): CursorPage<T> {
  const start = after ? Number(after) : 0;
  const end = start + size;
  return {
    items: items.slice(start, end),
    endCursor: end < items.length ? String(end) : null,
    hasNextPage: end < items.length,
  };
}

type FakeBlock = {
  heads: RankBallotHead[];
  members: string[];
  editors: string[];
  itemsByRank: Record<string, RankBallotItem[]>;
};

function fakeFetchers(block: FakeBlock, latencyMs = 0) {
  const calls = { ballotHeads: 0, membership: 0, ballotItems: [] as string[] };
  const delay = () => (latencyMs ? new Promise(resolve => setTimeout(resolve, latencyMs)) : Promise.resolve());
  const fetchers: BlockRankersPageFetchers = {
    ballotHeads: async (_blockId, after) => {
      calls.ballotHeads++;
      await delay();
      return paged(block.heads, after);
    },
    membership: async (kind, _spaceId, after) => {
      calls.membership++;
      await delay();
      return paged(kind === 'members' ? block.members : block.editors, after);
    },
    ballotItems: async (rankEntityId, _authorSpaceId, after) => {
      calls.ballotItems.push(rankEntityId);
      await delay();
      return paged(block.itemsByRank[rankEntityId] ?? [], after);
    },
  };
  return { fetchers, calls };
}

function head(rankEntityId: string, authorSpaceId: string, createdAt: number): RankBallotHead {
  return { rankEntityId, authorSpaceId, createdAtMs: createdAt * 1000, updatedAtMs: createdAt * 1000 };
}

const debates = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({
    entityId: hex(0x100000 + offset + i),
    toSpaceId: DEBATES,
    position: pos(i),
  }));

/** `rankers` people, each with one ballot of `itemsPerBallot` debates (overlapping, shifted by 100). */
function bigBlock(rankers: number, itemsPerBallot: number): FakeBlock {
  const heads = Array.from({ length: rankers }, (_, i) => head(`rank-${i}`, hex(0xa000 + i), 100 + i));
  return {
    heads,
    members: heads.map(h => h.authorSpaceId),
    editors: [],
    itemsByRank: Object.fromEntries(heads.map((h, i) => [h.rankEntityId, debates(itemsPerBallot, i * 100)])),
  };
}

describe('readBlockRankers', () => {
  it('reads a 2,000-item ballot past the 1,000-row page cap', async () => {
    const block = bigBlock(1, 2000);
    const { fetchers, calls } = fakeFetchers(block);

    const summary = await readBlockRankers({ blockId: 'block', spaceId: 'space' }, fetchers);

    expect(calls.ballotItems).toEqual(['rank-0', 'rank-0']);
    expect(summary.rankersByEntityId.size).toBe(2000);
    expect(summary.rankersByEntityId.get(block.itemsByRank['rank-0'][1999].entityId)?.[0]?.place).toBe(2000);
  });

  it('reads past 1,000 members and ballot heads too', async () => {
    const block = bigBlock(1200, 1);
    const { fetchers } = fakeFetchers(block);

    const summary = await readBlockRankers({ blockId: 'block', spaceId: 'space' }, fetchers);

    expect(summary.countingBallots).toHaveLength(1200);
  });

  it("never reads the items of a ballot that doesn't count", async () => {
    const member = hex(1);
    const outsider = hex(2);
    const { fetchers, calls } = fakeFetchers({
      heads: [head('old', member, 1), head('new', member, 2), head('outsider', outsider, 3)],
      members: [],
      editors: [member],
      itemsByRank: { old: debates(3), new: debates(2), outsider: debates(5) },
    });

    const summary = await readBlockRankers({ blockId: 'block', spaceId: 'space' }, fetchers);

    expect(calls.ballotItems).toEqual(['new']);
    expect(summary.countingBallots).toEqual([{ rankEntityId: 'new', spaceId: member, ballotSize: 2 }]);
  });

  it('fails rather than undercount when a cursor chain breaks', async () => {
    const block = bigBlock(1, 1500);
    const { fetchers } = fakeFetchers(block);
    const broken: BlockRankersPageFetchers = {
      ...fetchers,
      ballotItems: async () => ({ items: debates(1000), endCursor: null, hasNextPage: true }),
    };

    await expect(readBlockRankers({ blockId: 'block', spaceId: 'space' }, broken)).rejects.toThrow(/end cursor/);
  });

  it('loads 5 rankers x 2,000 items with the reads on a short critical path', async () => {
    // Measurement for GEO-3686's "loads in a reasonable time". Each simulated page waits LATENCY_MS,
    // so wall time ≈ (pages on the critical path) x latency + compute. The critical path is one
    // ballot-heads page alongside one page per membership list, then each ballot's 2 item pages in
    // parallel: 3 round trips.
    const LATENCY_MS = 50;
    const block = bigBlock(5, 2000);
    const { fetchers, calls } = fakeFetchers(block, LATENCY_MS);

    const started = performance.now();
    const summary = await readBlockRankers({ blockId: 'block', spaceId: 'space' }, fetchers);
    const elapsedMs = performance.now() - started;

    expect(calls.ballotItems).toHaveLength(10);
    expect(summary.countingBallots).toHaveLength(5);
    // Ballots overlap by all but 100 shifted debates each: 2,000 + 4 x 100 distinct.
    expect(summary.rankersByEntityId.size).toBe(2400);
    expect(summary.rankersByEntityId.get(block.itemsByRank['rank-4'][1999].entityId)?.length).toBe(1);
    expect(summary.rankersByEntityId.get(block.itemsByRank['rank-0'][1999].entityId)?.length).toBe(5);

    console.info(`[block-rankers] 5 x 2,000 items: ${elapsedMs.toFixed(0)} ms at ${LATENCY_MS} ms/page`);
    expect(elapsedMs).toBeLessThan(3 * LATENCY_MS + 1000);
  });
});

describe('decodeBallotHead', () => {
  const node = (typeIds: string[]) => ({
    fromEntityId: 'rank',
    spaceId: 'author',
    fromEntity: { typeIds, createdAt: '1793875856', updatedAt: null },
  });

  it('reads unix-second times', () => {
    expect(decodeBallotHead(node([RANK_TYPE_ID]))).toEqual({
      rankEntityId: 'rank',
      authorSpaceId: 'author',
      createdAtMs: 1793875856000,
      updatedAtMs: 0,
    });
  });

  it('skips a SUBMITTED_TO relation from something other than a Rank', () => {
    expect(decodeBallotHead(node(['someothertype']))).toBeNull();
  });
});

/**
 * The documents and variables the real page fetchers send, through a mocked transport. The
 * queries are hand-written (codegen can't check them), so this pins every filter that decides
 * what is counted.
 */
describe('createBlockRankersPageFetchers', () => {
  type Sent = { query: string; variables: Record<string, unknown> };
  /** Whitespace- and comma-free, so a check doesn't depend on how `print` lays the query out. */
  const squash = (text: string) => text.replace(/[\s,]+/g, '');

  function transport(respond: (sent: Sent) => unknown) {
    const sent: Sent[] = [];
    const request: BlockRankersRequest = async (document, variables) => {
      const call = { query: squash(print(document)), variables };
      sent.push(call);
      return respond(call) as never;
    };
    return { sent, fetchers: createBlockRankersPageFetchers(request) };
  }

  const pageInfo = (endCursor: string | null) => ({ hasNextPage: endCursor !== null, endCursor });

  it('asks for SUBMITTED_TO relations into the block, following the cursor', async () => {
    const { sent, fetchers } = transport(() => ({
      relationsConnection: {
        nodes: [
          {
            fromEntityId: 'rank',
            spaceId: 'author',
            fromEntity: { typeIds: [RANK_TYPE_ID], createdAt: '1793875856', updatedAt: '1793875900' },
          },
        ],
        pageInfo: pageInfo('cursor-2'),
      },
    }));

    const page = await fetchers.ballotHeads('block-id', 'cursor-1');

    expect(sent[0].query).toContain(squash('filter: { typeId: { is: $typeId }, toEntityId: { is: $blockId } }'));
    expect(sent[0].variables).toEqual({
      blockId: 'block-id',
      typeId: SUBMITTED_TO_PROPERTY_ID,
      first: BLOCK_RANKERS_PAGE_SIZE,
      after: 'cursor-1',
    });
    expect(page).toEqual({
      items: [
        { rankEntityId: 'rank', authorSpaceId: 'author', createdAtMs: 1793875856000, updatedAtMs: 1793875900000 },
      ],
      endCursor: 'cursor-2',
      hasNextPage: true,
    });
  });

  it('reads members and editors of the space from their own connections', async () => {
    const { sent, fetchers } = transport(({ query }) => {
      const key = query.includes('membersConnection') ? 'membersConnection' : 'editorsConnection';
      return { [key]: { nodes: [{ memberSpaceId: key }], pageInfo: pageInfo(null) } };
    });

    expect((await fetchers.membership('members', 'space-id', undefined)).items).toEqual(['membersConnection']);
    expect((await fetchers.membership('editors', 'space-id', 'c')).items).toEqual(['editorsConnection']);
    expect(sent[0].query).toContain(
      squash('membersConnection(first: $first, after: $after, filter: { spaceId: { is: $spaceId } })')
    );
    expect(sent[1].query).toContain(
      squash('editorsConnection(first: $first, after: $after, filter: { spaceId: { is: $spaceId } })')
    );
    expect(sent.map(call => call.variables)).toEqual([
      { spaceId: 'space-id', first: BLOCK_RANKERS_PAGE_SIZE, after: null },
      { spaceId: 'space-id', first: BLOCK_RANKERS_PAGE_SIZE, after: 'c' },
    ]);
  });

  it("reads one ballot's RANK_VOTES in the author's space, with each vote's to_space", async () => {
    const { sent, fetchers } = transport(() => ({
      relationsConnection: {
        nodes: [
          { toEntityId: 'debate', toSpaceId: DEBATES, position: 'a0' },
          { toEntityId: 'other', toSpaceId: null, position: 'a1' },
          null,
        ],
        pageInfo: pageInfo(null),
      },
    }));

    const page = await fetchers.ballotItems('rank-id', 'author-space', undefined);

    expect(sent[0].query).toContain(
      squash('filter: { fromEntityId: { is: $rankEntityId }, spaceId: { is: $spaceId }, typeId: { is: $typeId } }')
    );
    expect(sent[0].query).toContain(squash('nodes { toEntityId toSpaceId position }'));
    expect(sent[0].variables).toEqual({
      rankEntityId: 'rank-id',
      spaceId: 'author-space',
      typeId: RANK_VOTES_RELATION_TYPE_ID,
      first: BLOCK_RANKERS_PAGE_SIZE,
      after: null,
    });
    expect(page.items).toEqual([
      { entityId: 'debate', toSpaceId: DEBATES, position: 'a0' },
      { entityId: 'other', toSpaceId: null, position: 'a1' },
    ]);
  });
});
