import { describe, expect, it } from 'vitest';

import { EntityDecoder } from './entity';
import { RelationDecoder } from './relation';

const entityId = '11111111111111111111111111111111';
const spaceId = '22222222222222222222222222222222';
const propertyId = '33333333333333333333333333333333';
const typeId = '44444444444444444444444444444444';
const targetId = '55555555555555555555555555555555';
const relationEntityId = '66666666666666666666666666666666';
const danglingRelationId = '77777777777777777777777777777777';
const goodRelationId = '88888888888888888888888888888888';

function rawRelation(overrides: { id: string; toEntity: unknown }) {
  return {
    id: overrides.id,
    spaceId,
    position: null,
    verified: null,
    entityId: relationEntityId,
    fromEntity: { id: entityId, name: 'From' },
    toEntity: overrides.toEntity,
    toSpaceId: null,
    type: { id: typeId, name: 'Some property' },
  };
}

const goodToEntity = {
  id: targetId,
  name: 'Target',
  types: [],
  valuesList: [],
};

function rawEntity(relationsList: unknown[]) {
  return {
    id: entityId,
    name: 'Best Neighborhood',
    description: null,
    types: [],
    spaceIds: [spaceId],
    valuesList: [
      {
        spaceId,
        property: {
          id: propertyId,
          name: 'Name',
          dataTypeId: null,
          dataTypeName: 'Text',
          renderableTypeId: null,
          renderableTypeName: null,
          format: null,
          isType: null,
        },
        text: 'Best Neighborhood',
        integer: null,
        float: null,
        point: null,
        boolean: null,
        time: null,
        language: '090adac0-fca4-822e-8e71-9263e67620ec',
        unit: null,
        datetime: null,
        date: null,
        decimal: null,
        schedule: null,
      },
    ],
    relationsList,
  };
}

describe('EntityDecoder — dangling relations', () => {
  it('decodes the entity and drops relations whose target no longer resolves', () => {
    // A single relation with `toEntity: null` used to fail the whole entity
    // decode (relationsList is a strict array), wiping every value and relation.
    const decoded = EntityDecoder.decode(
      rawEntity([
        rawRelation({ id: goodRelationId, toEntity: goodToEntity }),
        rawRelation({ id: danglingRelationId, toEntity: null }),
      ])
    );

    expect(decoded).not.toBeNull();
    // Values survive even though one relation is dangling.
    expect(decoded?.values).toHaveLength(1);
    // The dangling relation is dropped; the resolvable one is kept.
    expect(decoded?.relations.map(r => r.id)).toEqual([goodRelationId]);
  });
});

describe('RelationDecoder — dangling relations', () => {
  it('returns null for a relation with no target entity', () => {
    expect(RelationDecoder.decode(rawRelation({ id: danglingRelationId, toEntity: null }))).toBeNull();
  });

  it('decodes a relation whose target resolves', () => {
    const decoded = RelationDecoder.decode(rawRelation({ id: goodRelationId, toEntity: goodToEntity }));
    expect(decoded?.id).toBe(goodRelationId);
    expect(decoded?.toEntity.id).toBe(targetId);
  });
});

describe('the optional relations projection', () => {
  const base = {
    id: entityId,
    name: 'Entity',
    description: null,
    types: [],
    spaceIds: [spaceId],
    valuesList: [],
    relationsList: [],
  };

  /**
   * Different queries put different things under `relations`, and the schema has to tolerate all of
   * them: a decode failure here returns `null` silently — `EntityDecoder.decode` swallows it — so a
   * schema that is too strict takes out every call to whichever query it doesn't fit, with nothing
   * to show for it.
   *
   * Requiring `totalCount` inside this struct did exactly that: `entityQuery` returns a *connection*
   * (`pageInfo`/`nodes`) with no count, so every `getEntity` decoded as `null`.
   */
  it('decodes the connection shape that entityQuery returns', () => {
    const decoded = EntityDecoder.decode({
      ...base,
      relations: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    });

    expect(decoded).not.toBeNull();
  });

  it('decodes the count shape that EntitiesBatch returns, and carries the count', () => {
    const decoded = EntityDecoder.decode({ ...base, relations: { totalCount: 4000 } });

    expect(decoded).not.toBeNull();
    // The count is the only signal that says a relation list was truncated; `relations.length`
    // can't, because the decoder filters dangling relations out of it.
    expect(decoded?.relationsTotalCount).toBe(4000);
  });

  it('decodes when a query selects no relations projection at all', () => {
    const decoded = EntityDecoder.decode(base);

    expect(decoded).not.toBeNull();
    expect(decoded?.relationsTotalCount).toBeUndefined();
  });
});
