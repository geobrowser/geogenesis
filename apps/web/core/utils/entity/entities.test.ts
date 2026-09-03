import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';

import { describe, expect, it } from 'vitest';

import { HIDDEN_PROPERTIES, OG_IMAGE_PROPERTY, SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { OG_IMAGE_PROPERTY_ID } from '~/core/debates/ontology';
import { Relation, Value } from '~/core/types';

import {
  avatar,
  cover,
  description,
  descriptionInSpace,
  descriptionTriple,
  name,
  nameInSpace,
  nameValue,
  ogImage,
  spaces,
} from './entities';

const valuesWithSystemDescriptionAttribute: Value[] = [
  {
    id: 'value-id',
    entity: {
      id: 'entityId',
      name: 'banana',
    },
    property: {
      id: SystemIds.DESCRIPTION_PROPERTY,
      name: 'Description',
      dataType: 'TEXT',
    },
    value: 'banana',
    spaceId: 'spaceId',
  },
];

/**
 * We assume that the Description value's property for an Entity will match the expected
 * system Description property ID at SystemIds.DESCRIPTION_PROPERTY. However, anybody can
 * set up a value that references _any_ property whose name is "Description."
 *
 * We currently handle this in the UI by checking the system ID for Description as well
 * as _any_ property whose name is "Description."
 *
 * We currently don't handle description values whose value is an EntityValue that references
 * some other entity.
 */
describe('Entity description helpers', () => {
  it('Entity.description should parse description from values where description property is the expected system Description', () => {
    expect(description(valuesWithSystemDescriptionAttribute)).toBe('banana');
  });

  it('Entity.descriptionTriple should return the Description value', () => {
    expect(descriptionTriple(valuesWithSystemDescriptionAttribute)).toBe(valuesWithSystemDescriptionAttribute[0]);
  });

  it('Entity.descriptionTriple should return undefined if there is no Description value', () => {
    expect(descriptionTriple([])).toBe(undefined);
  });
});

const valuesWithSystemNameAttribute: Value[] = [
  {
    id: 'value-id',
    entity: {
      id: 'entityId',
      name: 'banana',
    },
    property: {
      id: SystemIds.NAME_PROPERTY,
      name: 'Name',
      dataType: 'TEXT',
    },
    value: 'banana',
    spaceId: 'spaceId',
  },
];

// Description now resolves the way name always has. Array order used to decide which space won,
// and `entity.values` is re-partitioned on every store merge — so an entity described by two spaces
// could swap descriptions between renders, and the space fallback in `store.getEntity` inherited
// that arbitrariness (GEO-2778).
describe('descriptionTriple ranks spaces the way nameValue does', () => {
  const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
  const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';

  const describedIn = (spaceId: string, text: string): Value =>
    ({
      id: `value-${spaceId}`,
      entity: { id: 'entityId', name: null },
      property: { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
      value: text,
      spaceId,
    }) as unknown as Value;

  it('picks the highest-ranked space regardless of array order', () => {
    expect(description([describedIn(CRYPTO, 'Crypto'), describedIn(ROOT, 'Root')])).toBe('Root');
    expect(description([describedIn(ROOT, 'Root'), describedIn(CRYPTO, 'Crypto')])).toBe('Root');
  });

  it('skips an empty description in favour of a space that wrote one', () => {
    expect(description([describedIn(ROOT, ''), describedIn(CRYPTO, 'Crypto')])).toBe('Crypto');
  });

  it('leaves a single description alone', () => {
    expect(descriptionTriple([describedIn(CRYPTO, 'Crypto')])?.value).toBe('Crypto');
  });
});

describe('Entity name helpers', () => {
  it('Entity.name should parse name from values where name property is the expected system Name', () => {
    expect(name(valuesWithSystemNameAttribute)).toBe('banana');
  });

  it('Entity.nameValue should return the Name value', () => {
    expect(nameValue(valuesWithSystemNameAttribute)).toBe(valuesWithSystemNameAttribute[0]);
  });

  it('Entity.nameValue should return undefined if there is no Name value', () => {
    expect(nameValue([])).toBe(undefined);
  });
});

// The rule both `store.getEntity` and the orm merge read through, so scoping cannot drift between
// the two paths a reader can arrive by (GEO-2778).
// Only a handful of spaces carry a rank; every other one, personal spaces included, shares
// UNRANKED. A rank-only comparator leaves those ties to array order, and `entity.values` is
// re-partitioned on every store merge — so the winner could still swap between renders.
describe('pickBySpaceRank breaks rank ties deterministically', () => {
  const UNRANKED_A = 'ffffffffffffffffffffffffffffffff';
  const UNRANKED_B = '11111111111111111111111111111111';

  const described = (spaceId: string, text: string): Value =>
    ({
      id: `value-${spaceId}`,
      entity: { id: 'entityId', name: null },
      property: { id: SystemIds.DESCRIPTION_PROPERTY, name: null, dataType: 'TEXT' },
      value: text,
      spaceId,
    }) as unknown as Value;

  it('picks the same unranked space whichever order the values arrive in', () => {
    const forwards = description([described(UNRANKED_A, 'A'), described(UNRANKED_B, 'B')]);
    const backwards = description([described(UNRANKED_B, 'B'), described(UNRANKED_A, 'A')]);

    expect(forwards).toBe(backwards);
  });

  it('does the same for names', () => {
    const named = (spaceId: string, text: string): Value =>
      ({ ...described(spaceId, text), property: { id: SystemIds.NAME_PROPERTY, name: null, dataType: 'TEXT' } }) as
        unknown as Value;

    expect(name([named(UNRANKED_A, 'A'), named(UNRANKED_B, 'B')])).toBe(
      name([named(UNRANKED_B, 'B'), named(UNRANKED_A, 'A')])
    );
  });
});

describe('nameInSpace / descriptionInSpace', () => {
  const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
  const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';

  const wrote = (spaceId: string, propertyId: string, text: string): Value =>
    ({
      id: `value-${spaceId}-${propertyId}`,
      entity: { id: 'entityId', name: null },
      property: { id: propertyId, name: null, dataType: 'TEXT' },
      value: text,
      spaceId,
    }) as unknown as Value;

  const named = (spaceId: string, text: string) => wrote(spaceId, SystemIds.NAME_PROPERTY, text);
  const described = (spaceId: string, text: string) => wrote(spaceId, SystemIds.DESCRIPTION_PROPERTY, text);

  it('reads the named space even when a higher-ranked one disagrees', () => {
    const values = [named(ROOT, 'Root'), named(CRYPTO, 'Crypto')];
    expect(nameInSpace(values, CRYPTO)).toBe('Crypto');
    expect(nameInSpace(values, ROOT)).toBe('Root');
  });

  // A name is an identifier, so borrowing beats rendering untitled. A description is editorial:
  // borrowing another space's prose would put words in this space's mouth.
  it('borrows a name across spaces but never a description', () => {
    expect(nameInSpace([named(ROOT, 'Root')], CRYPTO)).toBe('Root');
    expect(descriptionInSpace([described(ROOT, 'Root desc')], CRYPTO)).toBeNull();
  });

  it('treats an empty value as nothing written', () => {
    expect(nameInSpace([named(ROOT, 'Root'), named(CRYPTO, '')], CRYPTO)).toBe('Root');
    expect(descriptionInSpace([described(ROOT, 'Root desc'), described(CRYPTO, '')], CRYPTO)).toBeNull();
  });

  it('shows the space its own description when it wrote one', () => {
    expect(descriptionInSpace([described(ROOT, 'Root desc'), described(CRYPTO, 'Crypto desc')], CRYPTO)).toBe(
      'Crypto desc'
    );
  });

  it('resolves across spaces when no space is named', () => {
    const values = [named(CRYPTO, 'Crypto'), named(ROOT, 'Root')];
    expect(nameInSpace(values, undefined)).toBe('Root');
    expect(nameInSpace(values, undefined)).toBe(name(values));
  });

  // `pickBySpaceRank` only skips empties when it has more than one candidate, so a lone empty
  // triple survives. Returning `''` from here satisfies the `??` in `getEntity` and `E.merge` and
  // blocks the aggregate fallback, rendering the entity untitled.
  it('reports a lone empty name as nothing written, not as an empty string', () => {
    expect(nameInSpace([named(CRYPTO, '')], CRYPTO)).toBeNull();
    expect(nameInSpace([named(CRYPTO, '')], undefined)).toBeNull();
    expect(descriptionInSpace([described(CRYPTO, '')], CRYPTO)).toBeNull();
    expect(descriptionInSpace([described(CRYPTO, '')], undefined)).toBeNull();
  });

  it('returns null when nobody wrote one', () => {
    expect(nameInSpace([], CRYPTO)).toBeNull();
    expect(descriptionInSpace([], CRYPTO)).toBeNull();
  });
});

describe('Entity space helpers', () => {
  it('treats score as a hidden property', () => {
    expect(HIDDEN_PROPERTIES.has(SCORE_SYSTEM_PROPERTY)).toBe(true);
  });

  const value = (propertyId: string, spaceId: string): Value =>
    ({
      id: `${propertyId}-${spaceId}`,
      entity: {
        id: 'entityId',
        name: 'banana',
      },
      property: {
        id: propertyId,
        name: null,
        dataType: 'TEXT',
      },
      value: 'banana',
      spaceId,
    }) as Value;

  it('ignores spaces that only contribute hidden properties when real content exists elsewhere', () => {
    expect(
      spaces([value(SCORE_SYSTEM_PROPERTY, 'hidden-space'), value(SystemIds.NAME_PROPERTY, 'real-space')])
    ).toEqual(['real-space']);
  });

  it('keeps hidden-only spaces when there is no real content anywhere', () => {
    expect(
      spaces([
        value(SCORE_SYSTEM_PROPERTY, 'hidden-space-b'),
        value(SCORE_SYSTEM_PROPERTY, 'hidden-space-a'),
        value(SCORE_SYSTEM_PROPERTY, 'hidden-space-b'),
      ])
    ).toEqual(['hidden-space-b', 'hidden-space-a']);
  });

  it('treats relations as real content for routing spaces', () => {
    const relation = {
      spaceId: 'relation-space',
    } as Relation;

    expect(spaces([value(SCORE_SYSTEM_PROPERTY, 'hidden-space')], [relation])).toEqual(['relation-space']);
  });
});

/**
 * GEO-2782. OG Image goes in front of the chain because it is the only one of the three actually
 * chosen for a share card: a cover is framed to sit behind a page and an avatar to read at 20px.
 *
 * It is relation-typed and points at an Image entity — the same shape as Cover and Avatar, checked
 * against the graph rather than assumed — so it is read the same way.
 */
const imageRelation = (propertyId: string, url: string, spaceId = 'space-1'): Relation => ({
  id: `relation-${propertyId}-${spaceId}`,
  entityId: 'relation-entity',
  type: { id: propertyId, name: 'Image property' },
  fromEntity: { id: 'entity-1', name: 'Entity' },
  toEntity: { id: `image-${url}`, name: 'Image', value: url },
  renderableType: 'IMAGE',
  spaceId,
});

const OG = imageRelation(OG_IMAGE_PROPERTY, 'ipfs://og');
const COVER = imageRelation(SystemIds.COVER_PROPERTY, 'ipfs://cover');
const AVATAR = imageRelation(ContentIds.AVATAR_PROPERTY, 'ipfs://avatar');

describe('Entity ogImage helper', () => {
  it('reads the OG Image relation the same way cover and avatar are read', () => {
    expect(ogImage([OG])).toBe('ipfs://og');
    expect(cover([COVER])).toBe('ipfs://cover');
    expect(avatar([AVATAR])).toBe('ipfs://avatar');
  });

  it('returns null when the entity has no OG Image', () => {
    expect(ogImage([COVER, AVATAR])).toBeNull();
    expect(ogImage([])).toBeNull();
    expect(ogImage(undefined)).toBeNull();
  });

  it('reads the share card a published debate writes', () => {
    // Publishing a debate mints a share card and relates it through this same property (GEO-2755),
    // so the two features meet here. This asserts they still name one property.
    expect(OG_IMAGE_PROPERTY_ID).toBe(OG_IMAGE_PROPERTY);

    expect(ogImage([imageRelation(OG_IMAGE_PROPERTY_ID, 'ipfs://QmDebateShareCard')])).toBe('ipfs://QmDebateShareCard');
  });

  it('reports nothing for an OG Image pointed at something that is not an image', () => {
    // `RelationDtoLive` puts the target's entity id in `value` when the target is not an Image, so
    // without the renderable-type check this would report a bare id as though it were a URL.
    const notAnImage: Relation = {
      ...OG,
      renderableType: 'RELATION',
      toEntity: { id: 'some-entity', name: 'Some entity', value: 'some-entity' },
    };

    expect(ogImage([notAnImage])).toBeNull();
  });

  it('reports nothing for an OG Image relation that carries no URL', () => {
    // `RelationDtoLive` writes `''` when the target resolves as an Image but has no IPFS URL yet,
    // which is what an upload mid-flight looks like.
    expect(ogImage([{ ...OG, toEntity: { ...OG.toEntity, value: '' } }])).toBeNull();
    expect(ogImage([{ ...OG, toEntity: { ...OG.toEntity, value: '   ' } }])).toBeNull();
  });
});
