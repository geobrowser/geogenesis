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

const claim = (claimId: string, spaceId = 's', topic = `topic-${claimId}`): CalloutClaim => ({
  claimId,
  spaceId,
  agendaId: 'a',
  sectionId: 'b',
  topic,
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
    expect(ordered[0]).toMatchObject({ spaceId: 'member', agendaId: 'agenda-member', sectionId: 'm1', topic: 'm1' });
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
  const scored = (scores: Record<string, number>) => (claimId: string) => scores[claimId];

  it('takes the highest-ranked first, at most 3 from one topic and 4 from one space', () => {
    const ordered = [
      // Space a: five claims on one story, then two others, all ranked high.
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map(id => claim(id, 'a', 'Election')),
      claim('a6', 'a', 'Economy'),
      claim('a7', 'a', 'AI'),
      claim('b1', 'b', 'Health'),
      claim('b2', 'b', 'Health'),
      claim('c1', 'c', 'Crypto'),
      claim('d1', 'd', 'Sport'),
      claim('d2', 'd', 'Sport'),
      claim('e1', 'e', 'Music'),
    ];
    const picked = pickCalloutClaims(
      ordered,
      () => false,
      scored({ a1: 99, a2: 98, a3: 97, a4: 96, a5: 95, a6: 94, a7: 93, b1: 50, b2: 49, c1: 40, d1: 30, d2: 29, e1: 1 })
    );

    // a3 fills Election's three, a6 is a's fourth; a4, a5 and a7 wait for the caps.
    expect(ids(picked)).toEqual(['a1', 'a2', 'a3', 'a6', 'b1', 'b2', 'c1', 'd1', 'd2', 'e1']);
  });

  it('counts a story listed in two spaces as one topic', () => {
    const ordered = [
      claim('a1', 'a', 'Election'),
      claim('a2', 'a', 'Election'),
      claim('b1', 'b', 'election '),
      claim('b2', 'b', 'Election'),
      ...Array.from({ length: 8 }, (_, index) => claim(`z${index}`, `z${index}`)),
    ];
    const picked = pickCalloutClaims(ordered, () => false, scored({ a1: 9, a2: 8, b1: 7, b2: 6 }));

    expect(ids(picked).slice(0, 3)).toEqual(['a1', 'a2', 'b1']);
    expect(ids(picked)).not.toContain('b2');
    expect(picked).toHaveLength(CALLOUT_MAX_CLAIMS);
  });

  it('relaxes the caps, the space cap first, when the agendas can’t fill ten otherwise', () => {
    const ordered = [
      ...Array.from({ length: 8 }, (_, index) => claim(`a${index}`, 'a', `topic-${index % 4}`)),
      ...Array.from({ length: 4 }, (_, index) => claim(`b${index}`, 'b', 'Same')),
    ];
    const picked = pickCalloutClaims(
      ordered,
      () => false,
      () => null
    );

    expect(picked).toHaveLength(CALLOUT_MAX_CLAIMS);
    // Within the caps: a0–a3 and b0–b2. Space cap off: a4–a6. b3 only with every cap off, and not needed.
    expect(ids(picked)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b0', 'b1', 'b2']);
  });

  it('leaves answered claims out, and ranks unscored ones last in Today’s claims order', () => {
    const ordered = [claim('a0', 'a'), claim('a1', 'a'), claim('a2', 'a'), claim('b0', 'b')];
    const picked = pickCalloutClaims(
      ordered,
      claimId => claimId === 'a1',
      claimId => (claimId === 'a2' ? 1 : null)
    );

    expect(ids(picked)).toEqual(['a2', 'a0', 'b0']);
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
