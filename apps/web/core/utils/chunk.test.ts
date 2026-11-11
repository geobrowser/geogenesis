import { describe, expect, it } from 'vitest';

import { chunk } from './chunk';

describe('chunk', () => {
  it('returns no batches for an empty list', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('splits an exact multiple into equal full batches with no trailing empty', () => {
    expect(chunk(['a', 'b', 'c', 'd'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('leaves the remainder in a shorter final batch', () => {
    expect(chunk(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('keeps everything in one batch when the size exceeds the list', () => {
    expect(chunk(['a', 'b'], 5)).toEqual([['a', 'b']]);
  });

  it('preserves input order and works on any element type', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it('refuses a size that is not a positive whole number', () => {
    expect(() => chunk(['a', 'b', 'c'], 1.5)).toThrow(RangeError);
    expect(() => chunk(['a'], 0)).toThrow(RangeError);
    expect(() => chunk(['a'], -1)).toThrow(RangeError);
  });
});
