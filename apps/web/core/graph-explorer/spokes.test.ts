import { describe, expect, it, vi } from 'vitest';

import type { GraphEntity, GraphHop, GraphRelation } from './graph-entity';
import { resolveGraphFilter } from './graph-filter';
import {
  BROADER_TOPICS_PROPERTY_ID,
  CLAIM_TYPE_ID,
  NEIGHBOUR_KIND_TYPE_IDS,
  RELATED_PEOPLE_PROPERTY_ID,
  SUBTOPIC_RELATION_TYPE_ID,
  TOPIC_TYPE_ID,
  UNNAMED_SUBTOPIC_PROPERTY_ID,
} from './ontology';
import { buildSpokes, entitySpaceId, groupSpokesByLabel, relationLabel } from './spokes';

// Ranking by id order keeps these tests independent of the real space ranking table.
vi.mock('~/core/utils/space/space-ranking', () => ({
  getTopRankedSpaceId: (ids: string[]) => (ids.length ? [...ids].sort()[0] : null),
}));

const CENTRE = '00000000000000000000000000000001';
const SPACE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PERSON = NEIGHBOUR_KIND_TYPE_IDS.person[0];

function entity(
  id: string,
  name: string | null,
  typeIds: string[],
  spaceIds = [SPACE_A],
  namedSpaceIds = spaceIds
): GraphEntity {
  return { id, name, spaceIds, namedSpaceIds, types: typeIds.map(typeId => ({ id: typeId, name: null })), image: null };
}

function relation(
  partial: Partial<GraphRelation> & Pick<GraphRelation, 'entity' | 'propertyId' | 'direction'>
): GraphRelation {
  return {
    id: `${partial.entity.id}-${partial.propertyId}`,
    propertyName: null,
    spaceId: SPACE_A,
    position: null,
    ...partial,
  };
}

function hop(relations: GraphRelation[]): GraphHop {
  return {
    centre: { ...entity(CENTRE, 'Centre', [TOPIC_TYPE_ID]), description: null, texts: [] },
    relations,
  };
}

const filter = resolveGraphFilter({ spaceIds: [SPACE_A, SPACE_B], topicId: null, topicSpaceId: null });

describe('relationLabel', () => {
  it('reads the same relation differently from each end', () => {
    expect(relationLabel({ propertyId: SUBTOPIC_RELATION_TYPE_ID, propertyName: 'Subtopics', direction: 'out' })).toBe(
      'Subtopic'
    );
    expect(relationLabel({ propertyId: SUBTOPIC_RELATION_TYPE_ID, propertyName: 'Subtopics', direction: 'in' })).toBe(
      'Broader topic'
    );
  });

  it('falls back to the property name for properties it has no label for', () => {
    expect(relationLabel({ propertyId: 'f'.repeat(32), propertyName: 'Members', direction: 'out' })).toBe('Members');
    expect(relationLabel({ propertyId: 'f'.repeat(32), propertyName: 'Members', direction: 'in' })).toBe(
      'Members (incoming)'
    );
  });
});

describe('buildSpokes', () => {
  it('merges the two Subtopics properties into one spoke', () => {
    const sub = entity('1'.repeat(32), 'Sub', [TOPIC_TYPE_ID]);
    const spokes = buildSpokes(
      hop([
        relation({ entity: sub, propertyId: SUBTOPIC_RELATION_TYPE_ID, direction: 'out' }),
        relation({ entity: sub, propertyId: UNNAMED_SUBTOPIC_PROPERTY_ID, direction: 'out', spaceId: SPACE_B }),
      ]),
      CENTRE,
      filter
    );
    expect(spokes).toHaveLength(1);
    expect(spokes[0].labels).toEqual(['Subtopic']);
    expect(spokes[0].edgeSpaceIds).toEqual([SPACE_A, SPACE_B]);
  });

  it('keeps one label per direction for a neighbour linked both ways', () => {
    const parent = entity('2'.repeat(32), 'Parent', [TOPIC_TYPE_ID]);
    const [spoke] = buildSpokes(
      hop([
        relation({ entity: parent, propertyId: SUBTOPIC_RELATION_TYPE_ID, direction: 'in' }),
        relation({ entity: parent, propertyId: BROADER_TOPICS_PROPERTY_ID, direction: 'out' }),
      ]),
      CENTRE,
      filter
    );
    expect(spoke.labels).toEqual(['Broader topic']);
    expect(spoke.hasOutgoing).toBe(true);
  });

  it('drops the centre and unnamed entities; hop 1 has already chosen the kinds', () => {
    const spokes = buildSpokes(
      hop([
        relation({
          entity: entity(CENTRE, 'Self', [TOPIC_TYPE_ID]),
          propertyId: SUBTOPIC_RELATION_TYPE_ID,
          direction: 'out',
        }),
        relation({
          entity: entity('3'.repeat(32), null, [PERSON]),
          propertyId: RELATED_PEOPLE_PROPERTY_ID,
          direction: 'out',
        }),
        relation({
          entity: entity('4'.repeat(32), 'A claim', [TOPIC_TYPE_ID, CLAIM_TYPE_ID]),
          propertyId: SUBTOPIC_RELATION_TYPE_ID,
          direction: 'out',
        }),
        relation({
          entity: entity('5'.repeat(32), 'Kept', [PERSON]),
          propertyId: RELATED_PEOPLE_PROPERTY_ID,
          direction: 'out',
        }),
      ]),
      CENTRE,
      filter
    );
    expect(spokes.map(spoke => spoke.entity.name)).toEqual(['A claim', 'Kept']);
  });

  it('puts outgoing relations first, by position, then name', () => {
    const spokes = buildSpokes(
      hop([
        relation({
          entity: entity('6'.repeat(32), 'Incoming', [TOPIC_TYPE_ID]),
          propertyId: BROADER_TOPICS_PROPERTY_ID,
          direction: 'in',
        }),
        relation({
          entity: entity('7'.repeat(32), 'Zed', [PERSON]),
          propertyId: RELATED_PEOPLE_PROPERTY_ID,
          direction: 'out',
        }),
        relation({
          entity: entity('8'.repeat(32), 'Second', [PERSON]),
          propertyId: RELATED_PEOPLE_PROPERTY_ID,
          direction: 'out',
          position: 'b',
        }),
        relation({
          entity: entity('9'.repeat(32), 'First', [PERSON]),
          propertyId: RELATED_PEOPLE_PROPERTY_ID,
          direction: 'out',
          position: 'a',
        }),
      ]),
      CENTRE,
      filter
    );
    expect(spokes.map(spoke => spoke.entity.name)).toEqual(['First', 'Second', 'Zed', 'Incoming']);
  });

  it('reads a node from its own space inside the filter, not the edge’s', () => {
    const elsewhere = entity('a'.repeat(32), 'Elsewhere', [PERSON], ['f'.repeat(32), SPACE_B]);
    const [spoke] = buildSpokes(
      hop([
        relation({ entity: elsewhere, propertyId: RELATED_PEOPLE_PROPERTY_ID, direction: 'out', spaceId: SPACE_A }),
      ]),
      CENTRE,
      filter
    );
    expect(spoke.nodeSpaceId).toBe(SPACE_B);
  });

  it('returns nothing for an entity with no relations', () => {
    expect(buildSpokes(hop([]), CENTRE, filter)).toEqual([]);
  });
});

describe('entitySpaceId', () => {
  const CITING = '0'.repeat(32);
  const HOME = 'f'.repeat(32);

  it('reads an entity where it is named, even when a space that only cites it outranks that', () => {
    // The test ranking puts CITING first.
    expect(entitySpaceId({ spaceIds: [CITING, HOME], namedSpaceIds: [HOME] }, undefined, null)).toBe(HOME);
    expect(entitySpaceId({ spaceIds: [CITING, HOME], namedSpaceIds: [HOME] }, [CITING, HOME], null)).toBe(HOME);
  });

  it('prefers a named space inside the filter, then any named space', () => {
    expect(entitySpaceId({ spaceIds: [SPACE_A, SPACE_B], namedSpaceIds: [SPACE_A, SPACE_B] }, [SPACE_B], null)).toBe(
      SPACE_B
    );
    expect(entitySpaceId({ spaceIds: [SPACE_A, HOME], namedSpaceIds: [HOME] }, [SPACE_A], null)).toBe(HOME);
  });

  it('falls back to its ranked spaces, then the fallback, when it is named nowhere', () => {
    expect(entitySpaceId({ spaceIds: [SPACE_B], namedSpaceIds: [] }, [SPACE_A], null)).toBe(SPACE_B);
    expect(entitySpaceId({ spaceIds: [], namedSpaceIds: [] }, [SPACE_A], SPACE_A)).toBe(SPACE_A);
  });
});

describe('buildSpokes node space', () => {
  it('reads a neighbour where it is named, not in a higher-ranked space that only cites it', () => {
    const cited = entity('c'.repeat(32), 'Cited', [PERSON], ['0'.repeat(32), SPACE_B], [SPACE_B]);
    const [spoke] = buildSpokes(
      hop([relation({ entity: cited, propertyId: RELATED_PEOPLE_PROPERTY_ID, direction: 'out' })]),
      CENTRE,
      filter
    );
    expect(spoke.nodeSpaceId).toBe(SPACE_B);
  });
});

describe('groupSpokesByLabel', () => {
  it('lists a neighbour under every label it has', () => {
    const both = entity('b'.repeat(32), 'Both', [TOPIC_TYPE_ID]);
    const spokes = buildSpokes(
      hop([
        relation({ entity: both, propertyId: SUBTOPIC_RELATION_TYPE_ID, direction: 'out' }),
        relation({ entity: both, propertyId: RELATED_PEOPLE_PROPERTY_ID, direction: 'in' }),
      ]),
      CENTRE,
      filter
    );
    expect(groupSpokesByLabel(spokes).map(group => group.label)).toEqual(['Subtopic', 'Related to']);
  });
});
