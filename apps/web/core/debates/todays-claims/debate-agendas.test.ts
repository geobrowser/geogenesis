import { describe, expect, it } from 'vitest';

import { type DebateAgendaRow, agendaDayFromValue, buildDebateAgendas } from './debate-agendas';

const WORLD = '89bd89bf28ff8a0963faf92a8c905e20';
const DEBATES = '9284477c8fe746368698994e2e517b32';

const claim = (n: number) => `c${String(n).padStart(31, '0')}`;
const midnight = (day: string) => `${day}T04:00:00+00:00`;

/** A block item row as `currentDebateAgendas` returns it. */
function item(
  spaceId: string,
  agendaId: string,
  listedOn: string,
  isCurrent: boolean,
  entityId: string,
  section: { id: string; name: string | null } | null = null
): DebateAgendaRow {
  return {
    spaceId,
    agendaId,
    listedOn,
    listedAt: midnight(listedOn),
    isCurrent,
    source: 'block_item',
    sectionId: section?.id ?? null,
    sectionName: section?.name ?? null,
    entityId,
  };
}

const current =
  (spaceId: string, agendaId: string, listedOn: string, section: { id: string; name: string | null }) =>
  (entityId: string) =>
    item(spaceId, agendaId, listedOn, true, entityId, section);
const earlierRow = (spaceId: string, agendaId: string, listedOn: string) => (entityId: string) =>
  item(spaceId, agendaId, listedOn, false, entityId);

const allClaims = new Set(Array.from({ length: 20 }, (_, index) => claim(index)));

describe('agenda days', () => {
  it('reads the calendar day of a listing, written with an offset or as the API’s UTC midnight New York', () => {
    expect(agendaDayFromValue('2026-10-27T00:00:00-04:00')).toBe('2026-10-27');
    expect(agendaDayFromValue('2026-10-27T04:00:00+00:00')).toBe('2026-10-27');
    expect(agendaDayFromValue('not a date')).toBeNull();
  });
});

describe('buildDebateAgendas', () => {
  it('lists each space’s current agenda as sections, in the order the API returns them', () => {
    const brazil = current(WORLD, 'agenda-28', '2026-10-28', { id: 'b-brazil', name: 'Brazil election' });
    const courts = current(WORLD, 'agenda-28', '2026-10-28', { id: 'b-courts', name: 'The Bolsonaro family' });
    const debates = current(DEBATES, 'agenda-d-27', '2026-10-27', { id: 'b-debates', name: 'Debates space' });
    const rows = [brazil(claim(1)), brazil(claim(2)), courts(claim(3)), debates(claim(5))];

    const { spaces, newestDay } = buildDebateAgendas(rows, allClaims);

    expect(newestDay).toBe('2026-10-28');
    const world = spaces.find(space => space.spaceId === WORLD)!;
    expect(world.listedOn).toBe('2026-10-28');
    expect(world.sections.map(section => [section.id, section.name, section.claimIds])).toEqual([
      ['b-brazil', 'Brazil election', [claim(1), claim(2)]],
      ['b-courts', 'The Bolsonaro family', [claim(3)]],
    ]);
    expect(world.sections[0]!.agendaId).toBe('agenda-28');
    expect(world.sections[0]!.listedAt).toBe('2026-10-28T04:00:00+00:00');
    expect(spaces.find(space => space.spaceId === DEBATES)!.sections.map(section => section.name)).toEqual([
      'Debates space',
    ]);
  });

  it('names an unnamed block for the day', () => {
    const rows = [current(WORLD, 'agenda-28', '2026-10-28', { id: 'b-1', name: null })(claim(1))];

    expect(buildDebateAgendas(rows, allClaims).spaces[0]!.sections[0]!.name).toBe('Today’s claims');
  });

  it('lists the earlier rows newest listing first, once per claim across spaces', () => {
    const rows = [
      current(WORLD, 'agenda-28', '2026-10-28', { id: 'b-28', name: 'Today' })(claim(1)),
      earlierRow(WORLD, 'agenda-27', '2026-10-27')(claim(2)),
      earlierRow(WORLD, 'agenda-27', '2026-10-27')(claim(3)),
      earlierRow(WORLD, 'agenda-25', '2026-10-25')(claim(4)),
      // The API gives each space its own earlier rows; across spaces the picker shows a claim once.
      earlierRow(DEBATES, 'agenda-d-26', '2026-10-26')(claim(4)),
      earlierRow(DEBATES, 'agenda-d-26', '2026-10-26')(claim(2)),
    ];

    const { earlier, listedAtByClaim } = buildDebateAgendas(rows, allClaims);

    expect(earlier.map(listing => [listing.claimId, listing.spaceId, listing.listedOn])).toEqual([
      [claim(2), WORLD, '2026-10-27'],
      [claim(3), WORLD, '2026-10-27'],
      [claim(4), DEBATES, '2026-10-26'],
    ]);
    // Each claim's debates count from its newest listing.
    expect(Object.fromEntries(listedAtByClaim)).toEqual({
      [claim(1)]: midnight('2026-10-28'),
      [claim(2)]: midnight('2026-10-27'),
      [claim(3)]: midnight('2026-10-27'),
      [claim(4)]: midnight('2026-10-26'),
    });
  });

  // GEO-3503's rule: of two agendas on one Date, the later-created is current and the other's claims
  // come back as earlier rows on the same day.
  it('shows the other agenda of a shared Date under Earlier this week', () => {
    const rows = [
      current(WORLD, 'agenda-28-later', '2026-10-28', { id: 'b-later', name: 'Later' })(claim(1)),
      earlierRow(WORLD, 'agenda-28-first', '2026-10-28')(claim(2)),
    ];

    const { spaces, earlier } = buildDebateAgendas(rows, allClaims);

    expect(spaces.flatMap(space => space.sections.map(section => section.agendaId))).toEqual(['agenda-28-later']);
    expect(earlier.map(listing => [listing.claimId, listing.agendaId, listing.listedOn])).toEqual([
      [claim(2), 'agenda-28-first', '2026-10-28'],
    ]);
  });

  // An agenda in a space that does not count must not move a claim's listing or its Earlier slot.
  it('decides which spaces count before deduping, dating or picking the newest day', () => {
    const PERSONAL = 'f0000000000000000000000000000001';
    const rows = [
      current(PERSONAL, 'agenda-spam', '2026-10-28', { id: 'b-spam', name: 'Read this' })(claim(1)),
      earlierRow(PERSONAL, 'agenda-spam-27', '2026-10-27')(claim(2)),
      current(WORLD, 'agenda-26', '2026-10-26', { id: 'b-26', name: 'Monday' })(claim(1)),
      earlierRow(WORLD, 'agenda-25', '2026-10-25')(claim(2)),
    ];

    const { spaces, earlier, newestDay, listedAtByClaim } = buildDebateAgendas(
      rows,
      allClaims,
      spaceId => spaceId !== PERSONAL
    );

    expect(spaces.map(space => space.spaceId)).toEqual([WORLD]);
    expect(newestDay).toBe('2026-10-26');
    expect(listedAtByClaim.get(claim(1))).toBe(midnight('2026-10-26'));
    expect(earlier.map(listing => [listing.claimId, listing.listedOn])).toEqual([[claim(2), '2026-10-25']]);
  });

  // Counted from the newest listing anywhere, not from the space the claim happens to be shown under.
  it('dates a claim from its newest listing across spaces', () => {
    const rows = [
      current(WORLD, 'agenda-world-26', '2026-10-26', { id: 'b-world', name: 'World' })(claim(1)),
      current(DEBATES, 'agenda-debates-28', '2026-10-28', { id: 'b-d-28', name: 'Today' })(claim(2)),
      earlierRow(DEBATES, 'agenda-debates-27', '2026-10-27')(claim(1)),
    ];

    expect(buildDebateAgendas(rows, allClaims).listedAtByClaim.get(claim(1))).toBe(midnight('2026-10-27'));
  });

  it('leaves out claims it could not resolve, ranking-only rows, and blocks left empty', () => {
    const mixed = current(WORLD, 'agenda-28', '2026-10-28', { id: 'b-1', name: 'Mixed' });
    const rows = [
      mixed(claim(1)),
      mixed(claim(2)),
      current(WORLD, 'agenda-28', '2026-10-28', { id: 'b-2', name: 'Gone' })(claim(3)),
      { ...item(WORLD, 'agenda-28', '2026-10-28', true, claim(4)), source: 'agenda_claims' },
      { ...item(WORLD, 'agenda-28', '2026-10-28', true, 'topic-1'), source: 'agenda_topics' },
    ];

    const { spaces, listedAtByClaim } = buildDebateAgendas(rows, new Set([claim(1), claim(4)]));

    expect(spaces[0]!.sections.map(section => [section.name, section.claimIds])).toEqual([['Mixed', [claim(1)]]]);
    expect([...listedAtByClaim.keys()]).toEqual([claim(1)]);
  });

  it('matches ids however they are written', () => {
    const dashed = '89bd89bf-28ff-8a09-63fa-f92a8c905e20';
    const rows = [current(dashed, 'agenda-28', '2026-10-28', { id: 'b-1', name: 'One' })(claim(1).toUpperCase())];

    expect(buildDebateAgendas(rows, allClaims).spaces[0]!.sections[0]!.claimIds).toEqual([claim(1)]);
  });

  it('has no spaces and no day when nothing is published', () => {
    expect(buildDebateAgendas([], allClaims)).toEqual({
      spaces: [],
      earlier: [],
      newestDay: null,
      listedAtByClaim: new Map(),
    });
  });
});
