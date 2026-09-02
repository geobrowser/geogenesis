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
  shareImage,
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

describe('Entity share-image helpers', () => {
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

  it('puts OG Image in front of a cover and an avatar', () => {
    // Order in the relation list must not matter — the chain decides, not the graph.
    expect(shareImage([COVER, AVATAR, OG])).toBe('ipfs://og');
    expect(shareImage([OG, COVER, AVATAR])).toBe('ipfs://og');
  });

  it('leaves the existing order untouched below the new first position', () => {
    // The point of the ticket is that this is purely additive: an entity that has never heard of
    // the property shares exactly what it shared before.
    expect(shareImage([COVER, AVATAR])).toBe('ipfs://cover');
    expect(shareImage([AVATAR])).toBe('ipfs://avatar');
    expect(shareImage([])).toBeNull();
    expect(shareImage(undefined)).toBeNull();
  });

  it('reads the share card a published debate writes', () => {
    // Not a coincidence worth leaving undocumented: publishing a debate already mints a share card
    // and relates it through this same property (GEO-2755), so putting OG Image at the front of the
    // chain means a published debate now serves that generated card instead of the default one.
    // `debate-publish-draft` builds exactly this shape — an Image entity carrying the URL, related
    // from the debate — so the two features meet here, and this asserts they still use one property.
    expect(OG_IMAGE_PROPERTY_ID).toBe(OG_IMAGE_PROPERTY);

    const publishedDebateCard = imageRelation(OG_IMAGE_PROPERTY_ID, 'ipfs://QmDebateShareCard');

    expect(shareImage([publishedDebateCard])).toBe('ipfs://QmDebateShareCard');
  });

  it('falls through an OG Image pointed at something that is not an image', () => {
    // `RelationDtoLive` puts the target's entity id in `value` when the target is not an Image, so
    // without the renderable-type check the card would be handed a bare id as though it were a URL.
    const notAnImage: Relation = {
      ...OG,
      renderableType: 'RELATION',
      toEntity: { id: 'some-entity', name: 'Some entity', value: 'some-entity' },
    };

    expect(ogImage([notAnImage])).toBeNull();
    expect(shareImage([notAnImage, COVER])).toBe('ipfs://cover');
  });

  it('falls through an OG Image whose URL is not a URL', () => {
    // Copilot caught this on PR #2333. The value is free text an author types, and `getImagePath`
    // passes anything that is not `ipfs://` straight through to the `<img>`, so "non-empty" is not
    // the same as "usable" — and at the front of the chain a typo would shadow a cover that works.
    for (const junk of ['hello', 'not a url', 'www.example.com/x.png', '   ']) {
      const bad: Relation = { ...OG, toEntity: { ...OG.toEntity, value: junk } };

      expect(ogImage([bad])).toBeNull();
      expect(shareImage([bad, COVER])).toBe('ipfs://cover');
    }
  });

  it('accepts the URL shapes an image value legitimately takes', () => {
    // ipfs:// parses as absolute and is resolved to a gateway later; http(s) and root-relative are
    // handed to the card as-is. None of these may be rejected by the guard above.
    for (const good of ['ipfs://QmAbc', 'https://cdn.example.com/a.png', '/static/a.png']) {
      const ok: Relation = { ...OG, toEntity: { ...OG.toEntity, value: good } };

      expect(ogImage([ok])).toBe(good);
    }
  });

  it('falls through an OG Image relation that carries no URL', () => {
    // A relation pointing at an Image entity with an empty value is not a share image, and must not
    // shadow the cover underneath it — otherwise setting the property badly loses the old card.
    const emptyOg: Relation = { ...OG, toEntity: { ...OG.toEntity, value: '' } };

    expect(ogImage([emptyOg])).toBeNull();
    expect(shareImage([emptyOg, COVER])).toBe('ipfs://cover');
  });
});
