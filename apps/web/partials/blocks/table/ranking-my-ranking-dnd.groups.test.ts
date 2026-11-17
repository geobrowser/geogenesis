import { describe, expect, it } from 'vitest';

import { regroupAfterDrag } from './ranking-my-ranking-dnd';

const H = (key: string) => `__ranking-group:${key}`;
const groups = [{ key: 'A' }, { key: 'B' }, { key: 'C' }];

describe('regroupAfterDrag (GEO-3729 tiers)', () => {
  it('gives each entry the group of the header above it', () => {
    expect(regroupAfterDrag([H('A'), 'a1', H('B'), 'b1', 'a2', H('C'), 'c1'], groups)).toEqual([
      { key: 'A', entityIds: ['a1'] },
      { key: 'B', entityIds: ['b1', 'a2'] },
      { key: 'C', entityIds: ['c1'] },
    ]);
  });

  it('puts an entry dragged above the first header in the first group', () => {
    expect(regroupAfterDrag(['b1', H('A'), H('B'), H('C')], groups)[0]).toEqual({ key: 'A', entityIds: ['b1'] });
  });

  it('keeps empty groups', () => {
    expect(regroupAfterDrag([H('A'), H('B'), 'x', H('C')], groups)).toEqual([
      { key: 'A', entityIds: [] },
      { key: 'B', entityIds: ['x'] },
      { key: 'C', entityIds: [] },
    ]);
  });
});
