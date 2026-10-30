import { describe, expect, it } from 'vitest';

import { agendaRow } from './debate-agenda-fixtures';
import { buildDebateAgendas } from './debate-agendas';
import {
  orderAgendaSpaces,
  orderByDebatesSinceListing,
  orderedAgendaSections,
  todaysSectionKey,
} from './todays-claims-order';

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

describe('orderedAgendaSections', () => {
  it('walks spaces by weight, sections in agenda order, debated claims last in each', () => {
    const rows = [
      agendaRow({ spaceId: UNRANKED_A, sectionId: 'a-1', entityId: 'c1' }),
      agendaRow({ spaceId: UNRANKED_A, sectionId: 'a-1', entityId: 'c2' }),
      agendaRow({ spaceId: UNRANKED_A, sectionId: 'a-2', entityId: 'c3' }),
      agendaRow({ spaceId: UNRANKED_B, sectionId: 'b-1', entityId: 'c4' }),
    ];
    const agendas = buildDebateAgendas(rows, new Set(['c1', 'c2', 'c3', 'c4']));
    const walked = orderedAgendaSections(
      agendas,
      spaceId => (spaceId === UNRANKED_B ? 1 : 0),
      claimId => (claimId === 'c1' ? 1 : 0)
    );
    expect(walked.map(({ section, claimIds }) => [section.id, claimIds])).toEqual([
      ['b-1', ['c4']],
      ['a-1', ['c2', 'c1']],
      ['a-2', ['c3']],
    ]);
  });
});

describe('todaysSectionKey', () => {
  it('is the same key for any spelling of the space and block', () => {
    expect(todaysSectionKey('AAAA0000-0000-0000-0000-000000000000', 'b-1')).toBe(todaysSectionKey(UNRANKED_A, 'b-1'));
  });
});
