import { describe, expect, it } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { type PersonPositionsPage, decodeVotesForTest, mergePositionPages } from './use-person-positions';

/**
 * Which side a person came down on, read off their votes (GEO-2859).
 *
 * Two fields decide it and they are easy to confuse. `voteKind` says *which
 * question* was answered — 1 is a stance on the claim, 2 is a judgement about
 * whether it is true — and `voteType` says which way. Only the stance vote
 * carries a side; measured on the reference account, `voteType` is 0 for 96
 * agrees, 1 for 83 disagrees and 2 for four that are neither.
 */
const vote = (over: Partial<{ objectId: string; voteType: number; voteKind: number }> = {}) => ({
  objectId: 'claim-1',
  voteType: 0,
  voteKind: 1,
  ...over,
});

const decode = (nodes: ReturnType<typeof vote>[]) =>
  decodeVotesForTest({ userVotesConnection: { pageInfo: { hasNextPage: false }, nodes } });

describe('the stance on a claim', () => {
  it('reads agree and disagree off the stance vote', () => {
    const page = decode([vote({ objectId: 'a', voteType: 0 }), vote({ objectId: 'b', voteType: 1 })]);

    expect(page.stanceByClaimId).toEqual({ a: 'agree', b: 'disagree' });
  });

  it('gives no side to a vote that is neither', () => {
    expect(decode([vote({ voteType: 2 })]).stanceByClaimId).toEqual({});
  });

  // The trap: a veracity vote is `voteType` 0 or 1 too, but it answers "is this
  // true", not "do I agree". Reading it as a stance would label a claim somebody
  // rated for accuracy as one they took a side on.
  it('ignores a veracity vote, whichever way it went', () => {
    expect(decode([vote({ voteKind: 2, voteType: 0 })]).stanceByClaimId).toEqual({});
    expect(decode([vote({ voteKind: 2, voteType: 1 })]).stanceByClaimId).toEqual({});
  });

  it('takes the stance from the stance vote when both kinds are present', () => {
    // Ordered newest first, and a person who did both leaves two rows for one
    // claim. The veracity row must not win just by arriving first.
    const page = decode([vote({ voteKind: 2, voteType: 0 }), vote({ voteKind: 1, voteType: 1 })]);

    // Keyed on the normalised id — dashes stripped — which is how the tile looks
    // it up. `ids` below keeps the spelling the graph was queried with.
    expect(page.stanceByClaimId).toEqual({ claim1: 'disagree' });
  });

  it('keeps the most recent stance where a claim has two', () => {
    const page = decode([vote({ voteType: 1 }), vote({ voteType: 0 })]);

    // Newest first, so the first one seen wins.
    expect(page.stanceByClaimId).toEqual({ claim1: 'disagree' });
  });
});

/**
 * Pages are merged, not concatenated.
 *
 * `decodeVotes` collapses a claim's two votes into one card among the rows it
 * was handed — twenty of them. A claim whose stance and veracity votes fall
 * either side of a page boundary escapes that entirely.
 */
describe('mergePositionPages', () => {
  const page = (ids: string[], stances: Record<string, 'agree' | 'disagree'> = {}): PersonPositionsPage => ({
    rows: ids.map(id => ({ entityId: id, spaceId: 'space' }) as ExploreFeedRow),
    stanceByClaimId: stances,
    nextCursor: null,
  });

  it('renders a claim once when its two votes straddle a page boundary', () => {
    const merged = mergePositionPages([page(['a', 'b']), page(['b', 'c'])]);

    expect(merged.rows.map(row => row.entityId)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the newest stance, which is the one seen first', () => {
    // Pages arrive newest-first, so a later page holds older votes. Merging them
    // over the top — which is what `Object.assign` did — let the older win.
    const merged = mergePositionPages([page(['a'], { a: 'disagree' }), page(['a'], { a: 'agree' })]);

    expect(merged.stanceByClaimId).toEqual({ a: 'disagree' });
  });

  it('matches rows however their ids are spelled', () => {
    const merged = mergePositionPages([
      page(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']),
      page(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']),
    ]);

    expect(merged.rows).toHaveLength(1);
  });

  it('has nothing to merge for nothing', () => {
    expect(mergePositionPages([])).toEqual({ rows: [], stanceByClaimId: {} });
  });
});

/**
 * The page marker is the server's cursor, not a running row count.
 *
 * `offset` is rejected above 1000 by the server, so paging by it capped a
 * person's record at 1000 vote rows and then threw on the page that would have
 * passed it. The cursor has no ceiling — and it has to be the *server's*, since
 * a count kept here would count claims after deduping and walk the next page
 * back over rows this one already collapsed.
 */
describe('paging', () => {
  const pageOf = (hasNextPage: boolean, endCursor: string | null) =>
    decodeVotesForTest({ userVotesConnection: { pageInfo: { hasNextPage, endCursor }, nodes: [vote()] } });

  it('carries the cursor the server handed back', () => {
    expect(pageOf(true, 'cursor-2').endCursor).toBe('cursor-2');
  });

  it('has no cursor to carry when the connection gives none', () => {
    expect(pageOf(false, null).endCursor).toBeNull();
  });

  it('reports the cursor independently of how many claims survived deduping', () => {
    // Two votes, one claim. A marker derived from the kept ids would say 1 and
    // re-read the row this page already consumed.
    const page = decodeVotesForTest({
      userVotesConnection: {
        pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
        nodes: [vote({ objectId: 'a', voteKind: 1 }), vote({ objectId: 'a', voteKind: 2 })],
      },
    });

    expect(page.ids).toEqual(['a']);
    expect(page.endCursor).toBe('cursor-2');
  });
});
