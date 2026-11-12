import { afterEach, describe, expect, it } from 'vitest';

import {
  RANKING_BALLOT_MAX_ITEMS_DEFAULT,
  enqueueRankingPublish,
  mergeBallotOrders,
  parseRankingBallotMaxItems,
  rankingBallotTooLargeMessage,
  resetRankingPublishStateForTests,
  sameBallotOrder,
} from './ranking-publish-queue';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccccccccccc';
const D = 'dddddddddddddddddddddddddddddddd';
const E = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

afterEach(() => resetRankingPublishStateForTests());

describe('mergeBallotOrders', () => {
  it('returns ours when nothing moved underneath', () => {
    expect(mergeBallotOrders({ base: [A, B], ours: [B, A, C], theirs: [A, B] })).toEqual([B, A, C]);
  });

  it('keeps a placement the edit was built without (back to back on one device)', () => {
    // Placement 1 published [A]; placement 2 was built from the empty list.
    expect(mergeBallotOrders({ base: [], ours: [B], theirs: [A] })).toEqual([B, A]);
  });

  it('keeps five placements each built from the same stale list', () => {
    let published: string[] = [];
    for (const id of [A, B, C, D, E]) {
      published = mergeBallotOrders({ base: [], ours: [id], theirs: published });
    }
    expect([...published].sort()).toEqual([A, B, C, D, E]);
  });

  it('keeps both devices’ additions, placing theirs next to its neighbour', () => {
    expect(mergeBallotOrders({ base: [A, B], ours: [A, B, C], theirs: [A, D, B] })).toEqual([A, D, B, C]);
  });

  it('honours a removal on either side', () => {
    // We removed B; they removed A and added D.
    expect(mergeBallotOrders({ base: [A, B, C], ours: [A, C], theirs: [B, C, D] })).toEqual([C, D]);
  });

  it('does not duplicate an item both sides added', () => {
    expect(mergeBallotOrders({ base: [A], ours: [A, C], theirs: [C, A] })).toEqual([A, C]);
  });

  it('compares ids in any spelling', () => {
    const dashed = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
    expect(mergeBallotOrders({ base: [dashed], ours: [A, B], theirs: [A] })).toEqual([A, B]);
    expect(sameBallotOrder([dashed, B], [A, B])).toBe(true);
    expect(sameBallotOrder([B, A], [A, B])).toBe(false);
  });
});

describe('ballot size cap', () => {
  it('defaults high and reads a positive integer override', () => {
    expect(parseRankingBallotMaxItems(undefined)).toBe(RANKING_BALLOT_MAX_ITEMS_DEFAULT);
    expect(parseRankingBallotMaxItems('abc')).toBe(RANKING_BALLOT_MAX_ITEMS_DEFAULT);
    expect(parseRankingBallotMaxItems('0')).toBe(RANKING_BALLOT_MAX_ITEMS_DEFAULT);
    expect(parseRankingBallotMaxItems(' 1500 ')).toBe(1500);
  });

  it('tells the ranker how many to remove', () => {
    expect(rankingBallotTooLargeMessage(1502, 1500)).toBe(
      'A ranking can hold up to 1,500 items. Remove 2 items to publish.'
    );
    expect(rankingBallotTooLargeMessage(11, 10)).toBe('A ranking can hold up to 10 items. Remove 1 item to publish.');
  });
});

describe('enqueueRankingPublish', () => {
  it('runs one task per ballot at a time, in order, even after a failure', async () => {
    const events: string[] = [];
    let active = 0;
    const task =
      (name: string, fail = false) =>
      async () => {
        active += 1;
        expect(active).toBe(1);
        events.push(`start ${name}`);
        await new Promise(resolve => setTimeout(resolve, 5));
        events.push(`end ${name}`);
        active -= 1;
        if (fail) throw new Error(name);
        return name;
      };

    const results = await Promise.allSettled([
      enqueueRankingPublish('k', task('1')),
      enqueueRankingPublish('k', task('2', true)),
      enqueueRankingPublish('k', task('3')),
    ]);

    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(events).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
  });
});
