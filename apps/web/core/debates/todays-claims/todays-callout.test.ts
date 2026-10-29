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

const claim = (claimId: string, spaceId = 's'): CalloutClaim => ({
  claimId,
  spaceId,
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
  const ids = (picked: CalloutClaim[]) => picked.map(item => item.claimId);

  it('spreads the highest-ranked across spaces, each round best first, up to the daily cap', () => {
    // Space a's agenda is long and highly ranked; b and c have a few each.
    const ordered = [
      ...Array.from({ length: 12 }, (_, index) => claim(`a${index}`, 'a')),
      claim('b0', 'b'),
      claim('b1', 'b'),
      claim('c0', 'c'),
    ];
    const scores: Record<string, number> = { b0: 4, b1: 9, c0: 2 };
    const picked = pickCalloutClaims(
      ordered,
      () => false,
      claimId => scores[claimId] ?? 100 - Number(claimId.slice(1))
    );

    expect(picked).toHaveLength(CALLOUT_MAX_CLAIMS);
    // Round one: a's best, b's best (b1), c's only. Round two: a's second, b's other. Then a alone.
    expect(ids(picked)).toEqual(['a0', 'b1', 'c0', 'a1', 'b0', 'a2', 'a3', 'a4', 'a5', 'a6']);
  });

  it('gives one claim each when ten spaces have agendas, the best-ranked spaces’ claims first', () => {
    const ordered = Array.from({ length: 12 }, (_, space) => [
      claim(`s${space}x`, `s${space}`),
      claim(`s${space}y`, `s${space}`),
    ]).flat();
    const picked = pickCalloutClaims(
      ordered,
      () => false,
      claimId => (claimId.endsWith('x') ? Number(claimId.slice(1, -1)) : 50)
    );

    expect(new Set(picked.map(item => item.spaceId)).size).toBe(CALLOUT_MAX_CLAIMS);
    // Every space's top is its y (50), so the round is in Today's claims order.
    expect(ids(picked).slice(0, 3)).toEqual(['s0y', 's1y', 's2y']);
  });

  it('leaves answered claims out, and ranks unscored ones last in Today’s claims order', () => {
    const ordered = [claim('a0', 'a'), claim('a1', 'a'), claim('a2', 'a'), claim('b0', 'b')];
    const picked = pickCalloutClaims(
      ordered,
      claimId => claimId === 'a1',
      claimId => (claimId === 'a2' ? 1 : null)
    );

    expect(ids(picked)).toEqual(['a2', 'b0', 'a0']);
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
