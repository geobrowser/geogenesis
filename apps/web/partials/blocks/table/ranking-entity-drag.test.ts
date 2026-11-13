import { describe, expect, it } from 'vitest';

import { dropIndexFromPointer } from './ranking-entity-drag';

describe('dropIndexFromPointer', () => {
  it('drops before the first row whose middle is below the pointer', () => {
    expect(dropIndexFromPointer([10, 30, 50], 0)).toBe(0);
    expect(dropIndexFromPointer([10, 30, 50], 20)).toBe(1);
    expect(dropIndexFromPointer([10, 30, 50], 49)).toBe(2);
    expect(dropIndexFromPointer([10, 30, 50], 60)).toBe(3);
    expect(dropIndexFromPointer([], 60)).toBe(0);
  });
});
