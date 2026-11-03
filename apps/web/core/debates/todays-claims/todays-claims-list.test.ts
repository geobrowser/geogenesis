import { describe, expect, it } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';

import type { ClaimPickerEntity } from '../claim-picker-page';
import { agendaRow } from './debate-agenda-fixtures';
import { buildDebateAgendas } from './debate-agendas';
import { placeTodaysClaims, todaysListCounts } from './todays-claims-list';
import { TODAYS_CLAIMS_LIST_ID, isTodaysClaimsList } from './todays-claims-list-id';

const SPACE_A = 'a0000000000000000000000000000001';
const SPACE_B = 'b0000000000000000000000000000002';
const CLAIM_1 = 'c0000000000000000000000000000001';
const CLAIM_2 = 'c0000000000000000000000000000002';
const CLAIM_3 = 'c0000000000000000000000000000003';
const TOPIC = 'e0000000000000000000000000000001';

function entity(id: string, topics: { id: string; spaceId: string }[] = []): ClaimPickerEntity {
  return {
    id,
    name: `Claim ${id.slice(-1)}`,
    description: null,
    spaces: [],
    values: [],
    relations: topics.map(topic => ({
      type: { id: TOPICS_PROPERTY_ID },
      spaceId: topic.spaceId,
      toEntity: { id: topic.id, name: 'Elections' },
    })),
  };
}

const rows = [
  agendaRow({ spaceId: SPACE_A, sectionId: 'a-1', sectionName: 'AI', entityId: CLAIM_1, agendaId: 'agenda-a' }),
  agendaRow({ spaceId: SPACE_A, sectionId: 'a-1', sectionName: 'AI', entityId: CLAIM_2, agendaId: 'agenda-a' }),
  agendaRow({ spaceId: SPACE_B, sectionId: 'b-1', sectionName: 'Brazil', entityId: CLAIM_3, agendaId: 'agenda-b' }),
  // Listed again in another space: shown once, at the first.
  agendaRow({ spaceId: SPACE_B, sectionId: 'b-1', sectionName: 'Brazil', entityId: CLAIM_1, agendaId: 'agenda-b' }),
];
const entities = [entity(CLAIM_1), entity(CLAIM_2), entity(CLAIM_3, [{ id: TOPIC, spaceId: SPACE_B }])];
const agendas = buildDebateAgendas(rows, new Set([CLAIM_1, CLAIM_2, CLAIM_3]));

describe('placeTodaysClaims', () => {
  it('leads with the lobby’s space, then lists each claim once under its agenda’s headings', () => {
    const sections = placeTodaysClaims(agendas, entities, { leadSpaceId: SPACE_B });
    expect(sections.map(section => section.name)).toEqual(['Brazil', 'AI']);
    expect(sections.map(section => section.claims.map(claim => claim.id))).toEqual([[CLAIM_3, CLAIM_1], [CLAIM_2]]);
    expect(sections[0]!.claims[0]).toMatchObject({
      spaceId: SPACE_B,
      topics: [{ id: TOPIC, name: 'Elections' }],
      scope: { agenda_id: 'agenda-b', agenda_date: '2026-10-28', list_section_id: 'b-1' },
    });
  });

  it('puts claims debated since their listing below the rest of their section', () => {
    const sections = placeTodaysClaims(agendas, entities, {
      leadSpaceId: SPACE_A,
      debatesOf: claimId => (claimId === CLAIM_1 ? 2 : 0),
    });
    expect(sections[0]!.claims.map(claim => claim.id)).toEqual([CLAIM_2, CLAIM_1]);
    expect(sections[0]!.claims[1]!.scope.debated_since_listing).toBe(2);
  });

  it('counts spaces and claims as the tab draws them', () => {
    expect(todaysListCounts(placeTodaysClaims(agendas, entities))).toEqual({ spaceCount: 2, claimCount: 3 });
  });
});

describe('isTodaysClaimsList', () => {
  it('knows the stored id in either spelling', () => {
    expect(isTodaysClaimsList(TODAYS_CLAIMS_LIST_ID)).toBe(true);
    expect(isTodaysClaimsList('698fd915-2d90-4087-a336-34278640408e')).toBe(true);
    expect(isTodaysClaimsList(CLAIM_1)).toBe(false);
  });
});
