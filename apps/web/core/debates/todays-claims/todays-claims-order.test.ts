import { describe, expect, it } from 'vitest';

import { orderAgendaSpaces, orderByDebatesSinceListing } from './todays-claims-order';

const AI = '41e851610e13a19441c4d980f2f2ce6b';
const WORLD = '89bd89bf28ff8a0963faf92a8c905e20';
const UNRANKED_A = 'aaaa0000000000000000000000000000';
const UNRANKED_B = 'bbbb0000000000000000000000000000';

describe('orderAgendaSpaces', () => {
  it('puts spaces both debaters are in first, then either, then the rest by rank', () => {
    const members: Record<string, number> = { [UNRANKED_B]: 2, [WORLD]: 1 };
    expect(orderAgendaSpaces([UNRANKED_A, WORLD, AI, UNRANKED_B], id => members[id] ?? 0)).toEqual([
      UNRANKED_B,
      WORLD,
      // AI outranks an unranked space.
      AI,
      UNRANKED_A,
    ]);
  });

  it('breaks a tie by id, so both debaters see one order', () => {
    expect(orderAgendaSpaces([UNRANKED_B, UNRANKED_A], () => 0)).toEqual([UNRANKED_A, UNRANKED_B]);
  });
});

describe('orderByDebatesSinceListing', () => {
  it('keeps the undebated in the agenda’s order and sinks the debated, fewest first', () => {
    const debates: Record<string, number> = { b: 2, d: 1, e: 1 };
    expect(orderByDebatesSinceListing(['a', 'b', 'c', 'd', 'e'], id => debates[id])).toEqual(['a', 'c', 'd', 'e', 'b']);
  });

  it('reads an unknown count as undebated', () => {
    expect(orderByDebatesSinceListing(['a', 'b'], () => undefined)).toEqual(['a', 'b']);
  });
});
