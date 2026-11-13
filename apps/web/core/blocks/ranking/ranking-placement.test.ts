import { describe, expect, it } from 'vitest';

import {
  type PlacementChoice,
  type PlacementResult,
  choosePlacement,
  expectedPlacementSteps,
  insertAt,
  nudge,
  placementComparisonIndex,
  startPlacement,
} from './ranking-placement';

/** Places a debate whose true place is `target` in a list of `length`, answering truthfully. */
function placeTruthfully(length: number, target: number) {
  let result: PlacementResult = startPlacement(length);
  const shown: number[] = [];
  while (!result.done) {
    const mid = placementComparisonIndex(result.search);
    shown.push(mid);
    const choice: PlacementChoice = target <= mid ? 'new' : 'existing';
    result = choosePlacement(result.search, choice);
  }
  return { index: result.index, choices: shown.length, shown };
}

describe('placing a debate by comparison', () => {
  it('starts in the middle of the list', () => {
    const start = startPlacement(26);
    expect(start.done).toBe(false);
    if (!start.done) expect(placementComparisonIndex(start.search)).toBe(13);
  });

  it('places in an empty list at once, at #1', () => {
    expect(startPlacement(0)).toEqual({ done: true, index: 0 });
  });

  it('halves the range with each "This one" or "That one"', () => {
    const start = startPlacement(200);
    if (start.done) throw new Error('expected a comparison');
    const better = choosePlacement(start.search, 'new');
    const worse = choosePlacement(start.search, 'existing');
    if (better.done || worse.done) throw new Error('expected another comparison');
    expect(better.search).toMatchObject({ lo: 0, hi: 100, step: 2 });
    expect(worse.search).toMatchObject({ lo: 101, hi: 200, step: 2 });
  });

  it('"About the same" places it straight below the one shown', () => {
    const start = startPlacement(10);
    if (start.done) throw new Error('expected a comparison');
    const mid = placementComparisonIndex(start.search);
    expect(choosePlacement(start.search, 'same')).toEqual({ done: true, index: mid + 1 });
  });

  it('finds every place in a 200-debate list in at most 8 choices', () => {
    expect(expectedPlacementSteps(200)).toBe(8);
    for (let target = 0; target <= 200; target++) {
      const { index, choices } = placeTruthfully(200, target);
      expect(index).toBe(target);
      expect(choices).toBeLessThanOrEqual(8);
    }
  });

  it.each([
    [10, 4],
    [50, 6],
    [1000, 10],
  ])('a %i-debate list takes at most %i choices', (length, steps) => {
    expect(expectedPlacementSteps(length)).toBe(steps);
    for (const target of [0, Math.floor(length / 3), length]) {
      expect(placeTruthfully(length, target).choices).toBeLessThanOrEqual(steps);
    }
  });

  it('never claims fewer steps than it has taken', () => {
    let result: PlacementResult = startPlacement(7);
    while (!result.done) {
      expect(result.search.expectedSteps).toBeGreaterThanOrEqual(result.search.step);
      result = choosePlacement(result.search, 'existing');
    }
    expect(result.index).toBe(7);
  });
});

describe('list edits', () => {
  it('inserts at an index, moving the entry if it was already there', () => {
    expect(insertAt(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'x', 'b', 'c']);
    expect(insertAt(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(insertAt(['a'], 'x', 9)).toEqual(['a', 'x']);
  });

  it('matches ids whatever their spelling', () => {
    const dashed = '9284477c-8fe7-4636-8698-994e2e517b32';
    const plain = '9284477c8fe746368698994e2e517b32';
    expect(insertAt([dashed, 'b'], plain, 2)).toEqual(['b', plain]);
    expect(nudge(['b', dashed], plain, -1)).toEqual([dashed, 'b']);
  });

  it('nudges one place and stops at the edges', () => {
    expect(nudge(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(nudge(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(nudge(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(nudge(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });
});
