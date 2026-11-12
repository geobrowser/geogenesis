import { describe, expect, it } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import {
  type RankBallot,
  compareBallotRecency,
  orderedBallotEntityIds,
  selectCountingBallots,
  summarizeBlockRankers,
} from './block-rankers';

const hex = (n: number) => n.toString(16).padStart(32, '0');
const dashed = (id: string) =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;

// Positions as the SDK writes them: fractional-index keys that sort as strings.
const pos = (i: number) => `a${String(i).padStart(4, '0')}`;

function ballot(
  rankEntityId: string,
  authorSpaceId: string,
  entityIds: string[],
  { createdAt, updatedAt = createdAt }: { createdAt: number; updatedAt?: number }
): RankBallot {
  return {
    rankEntityId,
    authorSpaceId,
    createdAtMs: createdAt * 1000,
    updatedAtMs: updatedAt * 1000,
    items: entityIds.map((entityId, i) => ({ entityId, position: pos(i) })),
  };
}

describe('selectCountingBallots', () => {
  it('keeps the latest ballot per author, then drops non-members', () => {
    const older = ballot('r1', 'alice', ['x'], { createdAt: 10 });
    const newer = ballot('r2', 'alice', ['y'], { createdAt: 20 });
    const outsider = ballot('r3', 'carol', ['x'], { createdAt: 30 });

    expect(selectCountingBallots([newer, older, outsider], ['alice']).map(b => b.rankEntityId)).toEqual(['r2']);
  });

  it('lets an empty latest ballot supersede an older full one, as the indexer does', () => {
    const full = ballot('r1', 'dave', ['x', 'y'], { createdAt: 10 });
    const empty = ballot('r2', 'dave', [], { createdAt: 20 });

    expect(summarizeBlockRankers([full, empty], ['dave']).rankersByEntityId.size).toBe(0);
  });

  it('matches authors and members whichever id spelling each source uses', () => {
    const author = hex(7);
    const counted = selectCountingBallots([ballot('r1', dashed(author), ['x'], { createdAt: 1 })], [author]);
    expect(counted).toHaveLength(1);
  });
});

describe('compareBallotRecency', () => {
  it('orders by creation, not by an updatedAt the indexer bumped with a backlink', () => {
    // r1 was superseded at block 20, then its Aggregated-rankings backlink was rewritten at 30.
    const superseded = ballot('r1', 'alice', [], { createdAt: 10, updatedAt: 30 });
    const current = ballot('r2', 'alice', [], { createdAt: 20, updatedAt: 25 });
    expect(compareBallotRecency(current, superseded)).toBeGreaterThan(0);
  });

  it('breaks exact ties deterministically', () => {
    const a = ballot('aa', 'alice', [], { createdAt: 10 });
    const b = ballot('bb', 'alice', [], { createdAt: 10 });
    expect(Math.sign(compareBallotRecency(a, b))).toBe(-Math.sign(compareBallotRecency(b, a)));
    expect(compareBallotRecency(a, b)).not.toBe(0);
  });
});

describe('orderedBallotEntityIds', () => {
  it('orders by position, normalizes ids and keeps the first vote for a repeated entity', () => {
    const id = hex(1);
    expect(
      orderedBallotEntityIds([
        { entityId: 'c', position: pos(2) },
        { entityId: dashed(id), position: pos(0) },
        { entityId: id, position: pos(3) },
        { entityId: 'b', position: pos(1) },
      ])
    ).toEqual([id, 'b', 'c']);
  });
});

describe('summarizeBlockRankers', () => {
  it("reports each ranker's place and ballot size, best place first", () => {
    const summary = summarizeBlockRankers(
      [ballot('r1', 'alice', ['x', 'y', 'z'], { createdAt: 1 }), ballot('r2', 'bob', ['z', 'x'], { createdAt: 2 })],
      ['alice', 'bob']
    );

    expect(summary.rankersByEntityId.get('z')).toEqual([
      { spaceId: 'bob', rankEntityId: 'r2', place: 1, ballotSize: 2 },
      { spaceId: 'alice', rankEntityId: 'r1', place: 3, ballotSize: 3 },
    ]);
    expect(summary.countingBallots).toEqual([
      { rankEntityId: 'r1', spaceId: 'alice', ballotSize: 3 },
      { rankEntityId: 'r2', spaceId: 'bob', ballotSize: 2 },
    ]);
  });
});

/**
 * The fixture block, written twice: once as the indexer stores it (`ranks.rankings` rows with the
 * update markers of the edits that wrote their votes, `ranks.ranking_items`, `ranks.members` and
 * `ranks.editors`), and once as the graph serves it to the web (entity created/updated blocks,
 * RANK_VOTES relations, member and editor lists). The two disagree exactly where the real sources
 * do: the graph's updatedAt includes backlink bumps, and ids come dashed or not.
 */
describe('fixture block: counts match the indexer', () => {
  const debate = { d1: hex(0xd1), d2: hex(0xd2), d3: hex(0xd3), d4: hex(0xd4), d5: hex(0xd5) };
  const space = {
    alice: hex(0xa1),
    bob: hex(0xb0),
    carol: hex(0xc0),
    dave: hex(0xda),
    erin: hex(0xe0),
    frank: hex(0xf0),
  };

  const members = [space.alice, space.dave, space.erin, space.frank];
  const editors = [space.bob, space.frank];

  type IndexerRanking = {
    id: string;
    spaceId: string;
    updatedAtBlock: number;
    updateIndex: number;
    items: string[];
  };

  // What `ranks.*` holds for the block.
  const indexerRankings: IndexerRanking[] = [
    // alice: a first ballot, then a newer one she later edited in place (d2 dropped).
    { id: 'a1', spaceId: space.alice, updatedAtBlock: 10, updateIndex: 0, items: [debate.d1, debate.d2, debate.d3] },
    { id: 'a2', spaceId: space.alice, updatedAtBlock: 25, updateIndex: 3, items: [debate.d3, debate.d1] },
    // bob: editor only; voted d2 twice in one ballot.
    { id: 'b1', spaceId: space.bob, updatedAtBlock: 15, updateIndex: 0, items: [debate.d2, debate.d4] },
    // carol: not a member or editor.
    { id: 'c1', spaceId: space.carol, updatedAtBlock: 12, updateIndex: 0, items: [debate.d1, debate.d5] },
    // dave: an old ballot, superseded by an empty one.
    { id: 'd1', spaceId: space.dave, updatedAtBlock: 5, updateIndex: 0, items: [debate.d1] },
    { id: 'd2', spaceId: space.dave, updatedAtBlock: 40, updateIndex: 0, items: [] },
    // erin: published with dashed ids.
    { id: 'e1', spaceId: space.erin, updatedAtBlock: 18, updateIndex: 1, items: [debate.d1] },
    // frank: both member and editor.
    { id: 'f1', spaceId: space.frank, updatedAtBlock: 22, updateIndex: 0, items: [debate.d4] },
  ];

  /** `recompute_block` steps 1–2 plus a per-entity ballot count, ported line for line. */
  function indexerBallotCounts(): Map<string, number> {
    // dedup.rs: latest (updated_at_block, update_index) per (block, space).
    const latest = new Map<string, IndexerRanking>();
    for (const r of indexerRankings) {
      const existing = latest.get(r.spaceId);
      const newer =
        !existing ||
        r.updatedAtBlock > existing.updatedAtBlock ||
        (r.updatedAtBlock === existing.updatedAtBlock && r.updateIndex > existing.updateIndex);
      if (newer) latest.set(r.spaceId, r);
    }
    // eligibility.rs: DAO space, members ∪ editors (no window: the block has no dates).
    const eligible = new Set([...members, ...editors]);
    const counts = new Map<string, number>();
    for (const r of latest.values()) {
      if (!eligible.has(r.spaceId)) continue;
      // ranking_items is keyed (ranking_id, entity_id, space_id): one row per entity per ballot.
      for (const entityId of new Set(r.items)) counts.set(entityId, (counts.get(entityId) ?? 0) + 1);
    }
    return counts;
  }

  // The same ballots as the graph serves them.
  const graphBallots: RankBallot[] = [
    // a1's Aggregated-rankings backlink was rewritten when a2 replaced it, bumping its updatedAt.
    ballot('a1', space.alice, [debate.d1, debate.d2, debate.d3], { createdAt: 10, updatedAt: 26 }),
    ballot('a2', space.alice, [debate.d3, debate.d1], { createdAt: 20, updatedAt: 25 }),
    ballot('b1', space.bob, [debate.d2, debate.d4, debate.d2], { createdAt: 15 }),
    ballot('c1', space.carol, [debate.d1, debate.d5], { createdAt: 12 }),
    ballot('d1', space.dave, [debate.d1], { createdAt: 5 }),
    ballot('d2', space.dave, [], { createdAt: 40 }),
    ballot('e1', dashed(space.erin), [dashed(debate.d1)], { createdAt: 18 }),
    ballot('f1', space.frank, [debate.d4], { createdAt: 22 }),
  ];

  const graphEligible = [...members.map(dashed), ...editors];

  it('gives every debate the indexer’s ballot count', () => {
    const expected = indexerBallotCounts();
    const { rankersByEntityId } = summarizeBlockRankers(graphBallots, graphEligible);

    for (const id of Object.values(debate)) {
      expect({ debate: id, count: rankersByEntityId.get(normId(id))?.length ?? 0 }).toEqual({
        debate: id,
        count: expected.get(id) ?? 0,
      });
    }
  });

  it('pins the fixture’s counts, so a change to both sides at once still fails', () => {
    const { rankersByEntityId } = summarizeBlockRankers(graphBallots, graphEligible);
    const count = (id: string) => rankersByEntityId.get(id)?.length ?? 0;

    expect([debate.d1, debate.d2, debate.d3, debate.d4, debate.d5].map(count)).toEqual([2, 1, 1, 2, 0]);
    expect(rankersByEntityId.get(debate.d1)?.map(r => r.spaceId)).toEqual([space.erin, space.alice]);
  });
});
