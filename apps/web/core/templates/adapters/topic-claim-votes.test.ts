import { describe, expect, it, vi } from 'vitest';

import {
  CLAIM_STANCE_VOTE_KIND,
  type ClaimVoteRow,
  activeStanceVotes,
  aggregateClaimVotes,
  baselineVoteFor,
  fetchMultiSpaceClaimVoteRows,
} from './topic-claim-votes';

const CLAIM = 'aaaaaaaa-0000-4000-8000-000000000001';
const SPACE_X = 'bbbbbbbb-0000-4000-8000-000000000001';
const SPACE_Y = 'cccccccc-0000-4000-8000-000000000002';
const VIEWER = 'dddddddd-0000-4000-8000-000000000003';
const OTHER = 'eeeeeeee-0000-4000-8000-000000000004';
const hex = (id: string) => id.replace(/-/g, '');

describe('topic claim votes', () => {
  // The viewer agreed in Y; someone else agreed in X. The row votes in X.
  const byClaim = aggregateClaimVotes(
    [
      { objectHex: hex(CLAIM), spaceHex: hex(SPACE_Y), userId: VIEWER, isPositive: true },
      { objectHex: hex(CLAIM), spaceHex: hex(SPACE_X), userId: OTHER, isPositive: true },
    ],
    VIEWER
  );

  it('totals every space, and still knows the viewer voted somewhere', () => {
    expect(byClaim.get(hex(CLAIM))).toMatchObject({ totalPositive: 2, totalNegative: 0, viewerVote: 'agree' });
  });

  it("gives no baseline in a space the viewer didn't vote in, so their vote elsewhere isn't subtracted", () => {
    expect(baselineVoteFor(byClaim, CLAIM, SPACE_X)).toBeNull();
  });

  it("gives the viewer's own side in the space they voted in, whatever the id spelling", () => {
    expect(baselineVoteFor(byClaim, CLAIM.toUpperCase(), SPACE_Y)).toBe('agree');
    expect(baselineVoteFor(byClaim, hex(CLAIM), hex(SPACE_Y))).toBe('agree');
  });

  it('gives no baseline before the votes load or when signed out', () => {
    expect(baselineVoteFor(undefined, CLAIM, SPACE_Y)).toBeNull();
    const signedOut = aggregateClaimVotes(
      [{ objectHex: hex(CLAIM), spaceHex: hex(SPACE_Y), userId: VIEWER, isPositive: false }],
      null
    );
    expect(baselineVoteFor(signedOut, CLAIM, SPACE_Y)).toBeNull();
  });
});

describe('activeStanceVotes', () => {
  // The testnet rows for "Bitcoin is a better store of value than gold" (QA, GEO-3819): one upvote
  // (vote kind 0) beside three Agree / Disagree votes. The Claim page reads 1 agree / 2 disagree.
  const claim = 'd93135c85a7c414e8bb8919b359d9754';
  const space = 'c9f267dcb0d270718c2a3c45a64afd32';
  const rows = [
    { userId: '4cd9cca5530b69056aead853c8088e7e', objectId: claim, spaceId: space, voteType: 0, voteKind: 0 },
    { userId: '952badee5fbd4dc3a691159a67a9291b', objectId: claim, spaceId: space, voteType: 0, voteKind: 1 },
    { userId: 'd034abce49b07859234384a5a66decbd', objectId: claim, spaceId: space, voteType: 1, voteKind: 1 },
    { userId: 'f3dab79cb5a3d9d1759656dd5361d1c6', objectId: claim, spaceId: space, voteType: 1, voteKind: 1 },
  ];

  it('counts Agree / Disagree only, as the Claim page does', () => {
    const agg = aggregateClaimVotes(activeStanceVotes(rows), null).get(claim)!;
    expect([agg.totalPositive, agg.totalNegative]).toEqual([1, 2]);
  });

  it("does not take the viewer's upvote or retired Verify for their side", () => {
    const viewer = '4cd9cca5530b69056aead853c8088e7e';
    const withRetired = [...rows, { userId: viewer, objectId: claim, spaceId: space, voteType: 0, voteKind: 2 }];
    const byClaim = aggregateClaimVotes(activeStanceVotes(withRetired), viewer);
    expect(baselineVoteFor(byClaim, claim, space)).toBeNull();
  });

  it('keeps one vote per voter per space, and a voter in two spaces counts in each', () => {
    const other = 'aaaaaaaaaaaa4000800000000000000f';
    const votes = activeStanceVotes([
      ...rows,
      { userId: '952badee5fbd4dc3a691159a67a9291b', objectId: claim, spaceId: space, voteType: 0, voteKind: 1 },
      { userId: '952badee5fbd4dc3a691159a67a9291b', objectId: claim, spaceId: other, voteType: 0, voteKind: 1 },
    ]);
    const agg = aggregateClaimVotes(votes, null).get(claim)!;
    expect([agg.totalPositive, agg.totalNegative]).toEqual([2, 2]);
  });
});

describe('fetchMultiSpaceClaimVoteRows', () => {
  // 2,500 voters: 1,800 agree and 700 disagree, served 1,000 rows a page. The viewer is last.
  const rows: ClaimVoteRow[] = Array.from({ length: 2_500 }, (_, index) => ({
    userId: index === 2_499 ? VIEWER : `voter-${index}`,
    objectId: CLAIM,
    spaceId: SPACE_X,
    voteType: index < 1_800 ? 0 : 1,
    voteKind: CLAIM_STANCE_VOTE_KIND,
  }));
  const fetchPage = vi.fn(async ({ first, after }: { first: number; after: string | undefined }) => {
    const start = after ? Number(after) : 0;
    const end = Math.min(start + first, rows.length);
    return { items: rows.slice(start, end), endCursor: String(end), hasNextPage: end < rows.length };
  });

  it('counts every vote past the first 1,000, and the viewer baseline in the last page', async () => {
    const fetched = await fetchMultiSpaceClaimVoteRows({ objectIds: [hex(CLAIM)], fetchPage });

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([args]) => args.after)).toEqual([undefined, '1000', '2000']);
    const byClaim = aggregateClaimVotes(activeStanceVotes(fetched), VIEWER);
    expect(byClaim.get(hex(CLAIM))).toMatchObject({ totalPositive: 1_800, totalNegative: 700, viewerVote: 'disagree' });
    expect(baselineVoteFor(byClaim, CLAIM, SPACE_X)).toBe('disagree');
  });

  it('asks for nothing without claims', async () => {
    const empty = vi.fn();
    await expect(fetchMultiSpaceClaimVoteRows({ objectIds: [], fetchPage: empty })).resolves.toEqual([]);
    expect(empty).not.toHaveBeenCalled();
  });
});
