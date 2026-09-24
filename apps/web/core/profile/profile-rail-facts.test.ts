import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Space } from '~/core/io/dto/spaces';

import { profileRailFacts } from './profile-rail-facts';

const SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const OTHER = 'a19c345ab9866679b001d7d2138d88a1';

const value = (propertyId: string, text: string, spaceId: string) => ({
  id: `${propertyId}-${spaceId}`,
  property: { id: propertyId, name: null },
  value: text,
  spaceId,
});

const space = (values: ReturnType<typeof value>[]) =>
  ({
    id: SPACE,
    type: 'PERSONAL',
    address: null,
    entity: { id: 'person', name: 'Preston Mantel', types: [], values, relations: [] },
  }) as unknown as Pick<Space, 'entity' | 'address' | 'type'>;

/**
 * The bio the rail draws before the sync store has the person (profile load).
 *
 * The rail reads it from the store, which fetches the entity after the page is
 * already on screen — so the About card painted its facts, then grew a
 * paragraph above them and pushed every one of them down.
 */
describe('profileRailFacts description', () => {
  it('reads the bio this space wrote', () => {
    const facts = profileRailFacts(space([value(SystemIds.DESCRIPTION_PROPERTY, 'A bio.', SPACE)]), SPACE);

    expect(facts.description).toBe('A bio.');
  });

  it('does not borrow one written in another space', () => {
    // The rail's own store selector is scoped to this space, and a fallback that
    // is not would put another space's prose in this person's mouth for as long
    // as the store takes to disagree.
    const facts = profileRailFacts(space([value(SystemIds.DESCRIPTION_PROPERTY, 'Elsewhere.', OTHER)]), SPACE);

    expect(facts.description).toBeNull();
  });

  it('is null on a space with no entity at all', () => {
    expect(profileRailFacts(null, SPACE).description).toBeNull();
  });
});
