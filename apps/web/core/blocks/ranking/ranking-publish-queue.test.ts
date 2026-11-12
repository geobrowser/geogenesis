import { afterEach, describe, expect, it } from 'vitest';

import {
  RANKING_BALLOT_MAX_ITEMS_DEFAULT,
  classifyReadBack,
  enqueueRankingPublish,
  foldOvertakenPublish,
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

const merge = (args: { base: string[]; ours: string[]; theirs: string[] }) => mergeBallotOrders(args).ids;

describe('mergeBallotOrders', () => {
  it('returns ours when nothing moved underneath', () => {
    expect(merge({ base: [A, B], ours: [B, A, C], theirs: [A, B] })).toEqual([B, A, C]);
  });

  it('keeps a placement the edit was built without (back to back on one device)', () => {
    // Placement 1 published [A]; placement 2 was built from the empty list.
    expect(merge({ base: [], ours: [B], theirs: [A] })).toEqual([A, B]);
  });

  it('keeps five placements each built from the same stale list, in the order they were made', () => {
    let published: string[] = [];
    for (const id of [A, B, C, D, E]) {
      published = merge({ base: [], ours: [id], theirs: published });
    }
    expect(published).toEqual([A, B, C, D, E]);
  });

  it('keeps the other device’s reorder when this edit only removed an item', () => {
    // Phone reordered [A, B, C] to [C, B, A]; the laptop, still on [A, B, C], removed B.
    expect(mergeBallotOrders({ base: [A, B, C], ours: [A, C], theirs: [C, B, A] })).toEqual({
      ids: [C, A],
      overrodeTheirOrder: false,
    });
  });

  it('keeps the other device’s reorder when this edit only added, placing the addition by its neighbour', () => {
    // Laptop inserted D after A in [A, B, C]; the phone had reordered to [C, A, B].
    expect(merge({ base: [A, B, C], ours: [A, D, B, C], theirs: [C, A, B] })).toEqual([C, A, D, B]);
  });

  it('lets our order win when only this edit reordered', () => {
    expect(mergeBallotOrders({ base: [A, B, C], ours: [C, B, A], theirs: [A, B, C, D] })).toEqual({
      // D was added after C, and stays after C.
      ids: [C, D, B, A],
      overrodeTheirOrder: false,
    });
  });

  it('says so when both edits reordered and ours won', () => {
    expect(mergeBallotOrders({ base: [A, B, C], ours: [C, B, A], theirs: [B, A, C] })).toEqual({
      ids: [C, B, A],
      overrodeTheirOrder: true,
    });
  });

  it('keeps additions both sides made after the same item in the order they landed', () => {
    expect(merge({ base: [A], ours: [A, C], theirs: [A, B] })).toEqual([A, B, C]);
  });

  it('keeps both devices’ additions', () => {
    expect(merge({ base: [A, B], ours: [A, B, C], theirs: [A, D, B] })).toEqual([A, D, B, C]);
  });

  it('honours a removal on either side', () => {
    // We removed B; they removed A and added D.
    expect(merge({ base: [A, B, C], ours: [A, C], theirs: [B, C, D] })).toEqual([C, D]);
  });

  it('can leave nothing when each side removed what the other kept', () => {
    expect(merge({ base: [A, B], ours: [A], theirs: [B] })).toEqual([]);
  });

  it('does not duplicate an item both sides added', () => {
    expect(merge({ base: [A], ours: [A, C], theirs: [C, A] })).toEqual([C, A]);
  });

  it('compares ids in any spelling', () => {
    const dashed = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
    expect(merge({ base: [dashed], ours: [A, B], theirs: [A] })).toEqual([A, B]);
    expect(sameBallotOrder([dashed, B], [A, B])).toBe(true);
    expect(sameBallotOrder([B, A], [A, B])).toBe(false);
  });
});

describe('classifyReadBack', () => {
  const own = { rankId: E, orderedEntityIds: [A, B], baseline: { rankId: E, orderedEntityIds: [A] } };

  it('is ours once the index holds our ballot', () => {
    expect(classifyReadBack({ rankId: E, orderedEntityIds: [A, B] }, own)).toBe('ours');
  });

  it('is pending while the index still holds the ballot we replaced', () => {
    expect(classifyReadBack({ rankId: E, orderedEntityIds: [A] }, own)).toBe('pending');
  });

  it('is superseded once the index holds anything else', () => {
    expect(classifyReadBack({ rankId: E, orderedEntityIds: [A, C] }, own)).toBe('superseded');
    expect(classifyReadBack({ rankId: D, orderedEntityIds: [A] }, own)).toBe('superseded');
  });

  it('treats a read older than the baseline as pending, not as another device’s edit', () => {
    const timed = { ...own, baseline: { ...own.baseline, updatedAtMs: 2_000, createdAtMs: 1_000 } };
    // Same rank, an older state of it.
    expect(classifyReadBack({ rankId: E, orderedEntityIds: [], updatedAtMs: 1_500 }, timed)).toBe('pending');
    // An older rank than the one we built on.
    expect(classifyReadBack({ rankId: D, orderedEntityIds: [A], createdAtMs: 500 }, timed)).toBe('pending');
    // Nothing at all, where there was a ballot.
    expect(classifyReadBack({ rankId: null, orderedEntityIds: [] }, timed)).toBe('pending');
    // A newer state that isn't ours is another device's.
    expect(classifyReadBack({ rankId: E, orderedEntityIds: [A, C], updatedAtMs: 3_000 }, timed)).toBe('superseded');
  });

  it('treats a first ballot as pending until it surfaces', () => {
    const first = { rankId: E, orderedEntityIds: [A], baseline: { rankId: null, orderedEntityIds: [] } };
    expect(classifyReadBack({ rankId: null, orderedEntityIds: [] }, first)).toBe('pending');
    expect(classifyReadBack({ rankId: E, orderedEntityIds: [A] }, first)).toBe('ours');
  });
});

describe('foldOvertakenPublish', () => {
  it('adds an overtaken edit back onto the ballot that replaced it', () => {
    const own = { rankId: E, orderedEntityIds: [A, B], baseline: { rankId: E, orderedEntityIds: [A] } };
    expect(foldOvertakenPublish(own, [A, D]).ids).toEqual([A, D, B]);
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
