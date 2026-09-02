import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';

import { describe, expect, it } from 'vitest';

import { HIDDEN_PROPERTIES, OG_IMAGE_PROPERTY, SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { OG_IMAGE_PROPERTY_ID } from '~/core/debates/ontology';
import { Relation, Value } from '~/core/types';

import {
  avatar,
  cover,
  description,
  descriptionTriple,
  name,
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
