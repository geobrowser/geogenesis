import { SystemIds } from '@geoprotocol/geo-sdk';

import { describe, expect, it } from 'vitest';

import { DEBATE_AGENDA_DATE_PROPERTY_ID, agendaDayFromValue, buildDebateAgendas } from './debate-agendas';

const WORLD = '89bd89bf28ff8a0963faf92a8c905e20';
const DEBATES = '9284477c8fe746368698994e2e517b32';
const TODAY = '2026-10-28';

const claim = (n: number) => `c${String(n).padStart(31, '0')}`;

function agenda(id: string, days: Record<string, { date: string; blocks: string[] }>) {
  return {
    id,
    spaces: Object.keys(days),
    values: Object.entries(days).map(([spaceId, { date }]) => ({
      property: { id: DEBATE_AGENDA_DATE_PROPERTY_ID },
      spaceId,
      value: date,
    })),
    relations: Object.entries(days).flatMap(([spaceId, { blocks }]) =>
      blocks
        .map((blockId, index) => ({
          type: { id: SystemIds.BLOCKS },
          toEntity: { id: blockId },
          position: `a${index}`,
          spaceId,
        }))
        // Written out of order, so the positions are what sorts them.
        .reverse()
    ),
  };
}

function block(id: string, name: string, claimIds: string[], spaceId = WORLD) {
  return {
    id,
    name,
    relations: claimIds.map((claimId, index) => ({
      type: { id: SystemIds.COLLECTION_ITEM_RELATION_TYPE },
      toEntity: { id: claimId },
      position: `a${index}`,
      spaceId,
    })),
  };
}

const allClaims = new Set(Array.from({ length: 20 }, (_, index) => claim(index)));

describe('agenda days', () => {
  it('reads the calendar day an agenda’s Date was written as, offset or Z alike', () => {
    expect(agendaDayFromValue('2026-10-27T00:00:00-04:00')).toBe('2026-10-27');
    expect(agendaDayFromValue('2026-10-27T04:00:00Z')).toBe('2026-10-27');
    expect(agendaDayFromValue('not a date')).toBeNull();
  });
});

describe('buildDebateAgendas', () => {
  it('lists each space’s newest agenda, with that space’s own blocks in order', () => {
    // One agenda written into two spaces, each with its own blocks.
    const agendas = [
      agenda('agenda-27', {
        [WORLD]: { date: '2026-10-27T04:00:00Z', blocks: ['b-old'] },
        [DEBATES]: { date: '2026-10-27T00:00:00-04:00', blocks: ['b-debates'] },
      }),
      agenda('agenda-28', { [WORLD]: { date: '2026-10-28T00:00:00-04:00', blocks: ['b-brazil', 'b-courts'] } }),
    ];
    const blocks = [
      block('b-brazil', 'Brazil election', [claim(1), claim(2)]),
      block('b-courts', 'The Bolsonaro family', [claim(3)]),
      block('b-old', 'Monday', [claim(4)]),
      block('b-debates', 'Debates space', [claim(5)], DEBATES),
    ];

    const { spaces, newestDay } = buildDebateAgendas(agendas, blocks, allClaims, TODAY);

    expect(newestDay).toBe('2026-10-28');
    const world = spaces.find(space => space.spaceId === WORLD)!;
    expect(world.listedOn).toBe('2026-10-28');
    expect(world.sections.map(section => [section.name, section.claimIds])).toEqual([
      ['Brazil election', [claim(1), claim(2)]],
      ['The Bolsonaro family', [claim(3)]],
    ]);
    expect(world.sections[0]!.listedAt).toBe('2026-10-28T00:00:00-04:00');
    const debates = spaces.find(space => space.spaceId === DEBATES)!;
    expect(debates.sections.map(section => section.name)).toEqual(['Debates space']);
  });

  it('waits for a future-dated agenda’s day, and drops agendas older than the week', () => {
    const agendas = [
      agenda('agenda-tomorrow', { [WORLD]: { date: '2026-10-29T00:00:00-04:00', blocks: ['b-tomorrow'] } }),
      agenda('agenda-28', { [WORLD]: { date: '2026-10-28T00:00:00-04:00', blocks: ['b-today'] } }),
      agenda('agenda-21', { [WORLD]: { date: '2026-10-21T00:00:00-04:00', blocks: ['b-last-week'] } }),
    ];
    const blocks = [
      block('b-tomorrow', 'Tomorrow', [claim(1)]),
      block('b-today', 'Today', [claim(2)]),
      block('b-last-week', 'Last week', [claim(3)]),
    ];

    const { spaces, earlier } = buildDebateAgendas(agendas, blocks, allClaims, TODAY);

    expect(spaces[0]!.sections.map(section => section.name)).toEqual(['Today']);
    expect(earlier).toEqual([]);
  });

  it('lists the week’s older claims that the newest agenda does not, newest listing first, once each', () => {
    const agendas = [
      agenda('agenda-28', { [WORLD]: { date: '2026-10-28T00:00:00-04:00', blocks: ['b-28'] } }),
      agenda('agenda-27', { [WORLD]: { date: '2026-10-27T00:00:00-04:00', blocks: ['b-27'] } }),
      agenda('agenda-25', { [WORLD]: { date: '2026-10-25T00:00:00-04:00', blocks: ['b-25'] } }),
    ];
    const blocks = [
      block('b-28', 'Today', [claim(1)]),
      // claim 1 is listed again today, so it is not "earlier".
      block('b-27', 'Tuesday', [claim(1), claim(2), claim(3)]),
      // claim 2 was listed on the 27th too; its newest listing wins.
      block('b-25', 'Sunday', [claim(4), claim(2)]),
    ];

    const { earlier, listedAtByClaim } = buildDebateAgendas(agendas, blocks, allClaims, TODAY);

    expect(earlier.map(listing => [listing.claimId, listing.listedOn])).toEqual([
      [claim(2), '2026-10-27'],
      [claim(3), '2026-10-27'],
      [claim(4), '2026-10-25'],
    ]);
    // Each claim's debates count from its newest listing.
    expect(Object.fromEntries(listedAtByClaim)).toEqual({
      [claim(1)]: '2026-10-28T00:00:00-04:00',
      [claim(2)]: '2026-10-27T00:00:00-04:00',
      [claim(3)]: '2026-10-27T00:00:00-04:00',
      [claim(4)]: '2026-10-25T00:00:00-04:00',
    });
  });

  // An agenda in a space that does not count must not move a claim's listing or its Earlier slot.
  it('decides which spaces count before dating, deduping or picking the newest day', () => {
    const PERSONAL = 'f0000000000000000000000000000001';
    const agendas = [
      agenda('agenda-spam', { [PERSONAL]: { date: '2026-10-28T00:00:00-04:00', blocks: ['b-spam'] } }),
      agenda('agenda-spam-27', { [PERSONAL]: { date: '2026-10-27T00:00:00-04:00', blocks: ['b-spam-27'] } }),
      agenda('agenda-26', { [WORLD]: { date: '2026-10-26T00:00:00-04:00', blocks: ['b-26'] } }),
      agenda('agenda-25', { [WORLD]: { date: '2026-10-25T00:00:00-04:00', blocks: ['b-25'] } }),
    ];
    const blocks = [
      block('b-spam', 'Read this', [claim(1)], PERSONAL),
      block('b-spam-27', 'And this', [claim(2)], PERSONAL),
      block('b-26', 'Monday', [claim(1)]),
      block('b-25', 'Sunday', [claim(2)]),
    ];

    const { spaces, earlier, newestDay, listedAtByClaim } = buildDebateAgendas(
      agendas,
      blocks,
      allClaims,
      TODAY,
      spaceId => spaceId !== PERSONAL
    );

    expect(spaces.map(space => space.spaceId)).toEqual([WORLD]);
    expect(newestDay).toBe('2026-10-26');
    expect(listedAtByClaim.get(claim(1))).toBe('2026-10-26T00:00:00-04:00');
    expect(earlier.map(listing => [listing.claimId, listing.listedOn])).toEqual([[claim(2), '2026-10-25']]);
  });

  it('leaves out items that are not claims, and blocks with none', () => {
    const agendas = [agenda('agenda-28', { [WORLD]: { date: '2026-10-28T00:00:00-04:00', blocks: ['b-1', 'b-2'] } })];
    const blocks = [block('b-1', 'Mixed', [claim(1), 'not-a-claim']), block('b-2', 'Notes', ['not-a-claim'])];

    const { spaces } = buildDebateAgendas(agendas, blocks, new Set([claim(1)]), TODAY);

    expect(spaces[0]!.sections.map(section => [section.name, section.claimIds])).toEqual([['Mixed', [claim(1)]]]);
  });

  it('has no spaces and no day when nothing is published', () => {
    expect(buildDebateAgendas([], [], allClaims, TODAY)).toEqual({
      spaces: [],
      earlier: [],
      newestDay: null,
      listedAtByClaim: new Map(),
    });
  });
});
