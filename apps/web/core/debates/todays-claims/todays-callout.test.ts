import { describe, expect, it } from 'vitest';

import type { DebateAgendas } from './debate-agendas';
import {
  CALLOUT_MAX_CLAIMS,
  type CalloutClaim,
  calloutStep,
  pickCalloutClaims,
  todaysClaimsInOrder,
} from './todays-callout';

const agendas = (spaces: Array<{ spaceId: string; sections: Array<{ id: string; claimIds: string[] }> }>) =>
  ({
    spaces: spaces.map(space => ({
      spaceId: space.spaceId,
      listedOn: '2026-10-29',
      sections: space.sections.map(section => ({
        ...section,
        agendaId: `agenda-${space.spaceId}`,
        spaceId: space.spaceId,
        name: section.id,
        listedAt: '2026-10-29T00:00:00-04:00',
      })),
    })),
    earlier: [],
    newestDay: '2026-10-29',
    listedAtByClaim: new Map(),
  }) satisfies DebateAgendas;

const claim = (claimId: string): CalloutClaim => ({
  claimId,
  spaceId: 's',
  agendaId: 'a',
  sectionId: 'b',
  listedAt: '2026-10-29',
});

describe('todaysClaimsInOrder', () => {
  it('walks spaces in the given order, sections in agenda order, undebated claims first', () => {
    const ordered = todaysClaimsInOrder(
      agendas([
        { spaceId: 'other', sections: [{ id: 'o1', claimIds: ['x'] }] },
        {
          spaceId: 'member',
          sections: [
            { id: 'm1', claimIds: ['a', 'b', 'c'] },
            { id: 'm2', claimIds: ['d'] },
          ],
        },
      ]),
      ['member', 'other'],
      claimId => (claimId === 'a' ? 2 : claimId === 'b' ? 1 : undefined)
    );

    expect(ordered.map(item => item.claimId)).toEqual(['c', 'b', 'a', 'd', 'x']);
    expect(ordered[0]).toMatchObject({ spaceId: 'member', agendaId: 'agenda-member', sectionId: 'm1' });
    expect(ordered[1]?.debatesSinceListing).toBe(1);
    expect(ordered[0]).not.toHaveProperty('debatesSinceListing');
  });

  it('lists a claim on two agendas once, at its first place', () => {
    const ordered = todaysClaimsInOrder(
      agendas([
        { spaceId: 'one', sections: [{ id: 'a1', claimIds: ['shared'] }] },
        { spaceId: 'two', sections: [{ id: 'b1', claimIds: ['shared', 'own'] }] },
      ]),
      ['two', 'one'],
      () => undefined
    );

    expect(ordered.map(item => [item.claimId, item.spaceId])).toEqual([
      ['shared', 'two'],
      ['own', 'two'],
    ]);
  });
});

describe('pickCalloutClaims', () => {
  it('takes the first unanswered claims, up to the daily cap', () => {
    const ordered = Array.from({ length: 14 }, (_, index) => claim(`c${index}`));
    const picked = pickCalloutClaims(ordered, claimId => claimId === 'c0' || claimId === 'c3');

    expect(picked).toHaveLength(CALLOUT_MAX_CLAIMS);
    expect(picked.map(item => item.claimId)).toEqual(['c1', 'c2', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11']);
  });
});

describe('calloutStep', () => {
  const day = { claims: [claim('a'), claim('b'), claim('c')], answered: [] as string[], skipped: [] as string[] };

  it('asks about the first claim neither answered nor skipped', () => {
    const step = calloutStep({ ...day, answered: ['a'], skipped: ['b'] }, () => false);

    expect(step.current?.claimId).toBe('c');
    expect(step.currentIndex).toBe(2);
    expect(step.done).toEqual([true, false, false]);
    expect(step.allAnswered).toBe(false);
  });

  it('counts a side taken elsewhere as answered', () => {
    const step = calloutStep(day, claimId => claimId === 'a');

    expect(step.current?.claimId).toBe('b');
    expect(step.done).toEqual([true, false, false]);
  });

  it('has nothing left to ask once every claim is answered or skipped', () => {
    expect(calloutStep({ ...day, answered: ['a', 'b', 'c'] }, () => false)).toMatchObject({
      current: null,
      allAnswered: true,
    });
    expect(calloutStep({ ...day, answered: ['a'], skipped: ['b', 'c'] }, () => false)).toMatchObject({
      current: null,
      allAnswered: false,
    });
  });
});
