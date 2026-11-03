import { describe, expect, it } from 'vitest';

import { type DebateAgendas, UNNAMED_AGENDA_SECTION } from './debate-agendas';
import {
  CALLOUT_MAX_CLAIMS,
  type CalloutClaim,
  calloutStep,
  pickCalloutClaims,
  todaysClaimsInOrder,
} from './todays-callout';

const agendas = (
  spaces: Array<{
    spaceId: string;
    listedOn?: string;
    sections: Array<{ id: string; name?: string; claimIds: string[] }>;
  }>
) =>
  ({
    spaces: spaces.map(space => ({
      spaceId: space.spaceId,
      listedOn: space.listedOn ?? '2026-10-29',
      sections: space.sections.map(section => ({
        ...section,
        agendaId: `agenda-${space.spaceId}`,
        spaceId: space.spaceId,
        name: section.name ?? section.id,
        listedOn: space.listedOn ?? '2026-10-29',
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
  listedOn: '2026-10-29',
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

  // GEO-3547: a space whose current agenda is days old follows today's, newest day first, and a
  // claim on both keeps today's listing.
  it('lists older current agendas after the newest day’s, newest first', () => {
    const ordered = todaysClaimsInOrder(
      agendas([
        { spaceId: 'fresh', sections: [{ id: 'f1', claimIds: ['today', 'shared'] }] },
        { spaceId: 'oldest', listedOn: '2026-10-24', sections: [{ id: 'o1', claimIds: ['oldest'] }] },
        { spaceId: 'older', listedOn: '2026-10-27', sections: [{ id: 's1', claimIds: ['shared', 'older'] }] },
      ]),
      ['oldest', 'older', 'fresh'],
      () => undefined
    );

    expect(ordered.map(item => [item.claimId, item.listedOn])).toEqual([
      ['today', '2026-10-29'],
      ['shared', '2026-10-29'],
      ['older', '2026-10-27'],
      ['oldest', '2026-10-24'],
    ]);
  });

  it('counts a story by its heading across spaces, and an unnamed section by its own id', () => {
    const ordered = todaysClaimsInOrder(
      agendas([
        {
          spaceId: 'one',
          sections: [
            { id: 'b1', name: 'Election', claimIds: ['a'] },
            { id: 'b2', name: UNNAMED_AGENDA_SECTION, claimIds: ['b'] },
          ],
        },
        {
          spaceId: 'two',
          sections: [
            { id: 'c1', name: ' election ', claimIds: ['c'] },
            { id: 'c2', name: UNNAMED_AGENDA_SECTION, claimIds: ['d'] },
          ],
        },
      ]),
      ['one', 'two'],
      () => undefined
    );

    expect(ordered.map(item => item.topic)).toEqual(['election', 'b2', 'election', 'c2']);
  });
});

describe('pickCalloutClaims', () => {
  const ids = (picked: CalloutClaim[]) => picked.map(item => item.claimId);
  const scored = (scores: Record<string, number | null>) => (claimId: string) =>
    claimId in scores ? { rankingScore: scores[claimId] ?? null, createdAtMs: null } : undefined;

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

  // GEO-3547.
  it('asks about the viewer’s own spaces first, each group highest-ranked first', () => {
    const ordered = [
      claim('a1', 'a', 'Election'),
      claim('a2', 'a', 'Economy'),
      claim('m1', 'm', 'AI'),
      claim('b1', 'b', 'Health'),
      claim('m2', 'm', 'Crypto'),
    ];
    const picked = pickCalloutClaims(
      ordered,
      () => false,
      scored({ a1: 99, a2: 90, b1: 95, m1: 10, m2: 20 }),
      spaceId => spaceId === 'm'
    );

    expect(ids(picked)).toEqual(['m2', 'm1', 'a1', 'b1', 'a2']);
  });

  it('keeps the caps for a member space while other spaces have claims to ask about', () => {
    const ordered = [
      ...['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map(id => claim(id, 'm', 'Election')),
      ...['o1', 'o2', 'o3', 'o4', 'o5', 'o6'].map(id => claim(id, `space-${id}`, `topic-${id}`)),
    ];
    const picked = pickCalloutClaims(
      ordered,
      () => false,
      scored({}),
      spaceId => spaceId === 'm'
    );

    // Three from the member space's one story, every other space's claim, then the relaxed pass
    // tops the set up from the member space before anywhere else.
    expect(ids(picked)).toEqual(['m1', 'm2', 'm3', 'm4', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6']);
  });

  // GEO-3547: older agendas only top the set up.
  it('fills from today’s agendas before taking any older one', () => {
    const today = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].map(id => claim(id, 'today-space', 'AI'));
    const older = ['o1', 'o2', 'o3', 'o4', 'o5'].map(id => ({
      ...claim(id, `older-${id}`, `older-${id}`),
      listedOn: '2026-10-28',
    }));
    // The older claims rank higher and sit in the viewer's own spaces; today's still come first.
    const picked = pickCalloutClaims(
      [...older, ...today],
      () => false,
      scored({ o1: 99, o2: 98, o3: 97, o4: 96, o5: 95 }),
      spaceId => spaceId.startsWith('older-')
    );

    expect(ids(picked)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 'o1', 'o2', 'o3']);
  });

  it('tops a short day up from older agendas, keeping the caps across days', () => {
    const today = ['t1', 't2'].map(id => claim(id, 'ai', 'AI'));
    const older = [
      ...['w1', 'w2', 'w3', 'w4', 'w5'].map(id => ({ ...claim(id, 'world', 'Brazil'), listedOn: '2026-10-28' })),
      ...['v1', 'v2'].map(id => ({ ...claim(id, 'world', 'Israel'), listedOn: '2026-10-28' })),
      ...['a3', 'a4'].map(id => ({ ...claim(id, 'old-ai', 'AI'), listedOn: '2026-10-28' })),
      { ...claim('d1', 'debates', 'Top three'), listedOn: '2026-10-28' },
    ];
    const picked = pickCalloutClaims([...today, ...older], () => false, scored({}));

    // AI already has two from today, so one more until the caps relax; world takes four, Brazil
    // three; then the space cap relaxes for v2 and the topic cap for w4. Asked today's first, then
    // the older day in its order.
    expect(ids(picked)).toEqual(['t1', 't2', 'w1', 'w2', 'w3', 'w4', 'v1', 'v2', 'a3', 'd1']);
  });

  it('caps a topic across spaces', () => {
    const ordered = [
      claim('a1', 'a', 'election'),
      claim('a2', 'a', 'election'),
      claim('b1', 'b', 'election'),
      claim('b2', 'b', 'election'),
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
    const picked = pickCalloutClaims(ordered, () => false, scored({}));

    expect(picked).toHaveLength(CALLOUT_MAX_CLAIMS);
    // Within the caps: a0–a3 and b0–b2. Space cap off: a4–a6. b3 only with every cap off, and not needed.
    expect(ids(picked)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b0', 'b1', 'b2']);
  });

  it('leaves answered claims out, and ranks unscored ones last in Today’s claims order', () => {
    const ordered = [claim('a0', 'a'), claim('a1', 'a'), claim('a2', 'a'), claim('b0', 'b')];
    const picked = pickCalloutClaims(ordered, claimId => claimId === 'a1', scored({ a2: 1, a0: null }));

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
