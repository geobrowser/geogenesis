import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { entityHomeSpaceId, resolveEntitySpaceId } from './entity-home-space';

/** Ranked 3 in the fixed space ranking; the claims on the curated pages live here. */
const AI_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
/** Ranked 0. Outranks every other space, which is what makes `spaces[0]` the wrong answer. */
const ROOT_SPACE = 'a19c345ab9866679b001d7d2138d88a1';
/** Unranked, as every personal space is. */
const PERSONAL_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';

function named(spaceId: string, name = 'AI democracies should share computer chips.') {
  return { property: { id: SystemIds.NAME_PROPERTY }, spaceId, value: name, isDeleted: false };
}

describe('entityHomeSpaceId', () => {
  it('prefers a space the entity is named in over a higher-ranked one that merely cites it', () => {
    const entity = { spaces: [ROOT_SPACE, AI_SPACE], values: [named(AI_SPACE)] };

    expect(entityHomeSpaceId(entity)).toBe(AI_SPACE);
  });

  it('falls back to the top-ranked space when the entity is named nowhere', () => {
    expect(entityHomeSpaceId({ spaces: [PERSONAL_SPACE, AI_SPACE] })).toBe(AI_SPACE);
  });

  it('ignores a deleted or blank name', () => {
    const entity = {
      spaces: [PERSONAL_SPACE, AI_SPACE],
      values: [{ ...named(PERSONAL_SPACE), isDeleted: true }, named(AI_SPACE, '   ')],
    };

    expect(entityHomeSpaceId(entity)).toBe(AI_SPACE);
  });

  it('answers null for an entity in no space at all', () => {
    expect(entityHomeSpaceId({ spaces: [] })).toBeNull();
  });
});

describe('resolveEntitySpaceId', () => {
  // Every ordinary row and every entity page: the space asked for is a space the entity is in.
  it('keeps the requested space when the entity lives in it', () => {
    const entity = { spaces: [AI_SPACE, PERSONAL_SPACE], values: [named(AI_SPACE)] };

    expect(resolveEntitySpaceId(entity, PERSONAL_SPACE)).toBe(PERSONAL_SPACE);
  });

  // The reported bug: a claim collected onto a curated page in a personal space, with no target
  // space pinned on the collection item, arrived here as that personal space.
  it('resolves to the entity’s own space when the requested space holds nothing of it', () => {
    const entity = { spaces: [AI_SPACE], values: [named(AI_SPACE)] };

    expect(resolveEntitySpaceId(entity, PERSONAL_SPACE)).toBe(AI_SPACE);
  });

  it('compares spaces regardless of dashes and case', () => {
    const entity = { spaces: ['41E85161-0E13-A194-41C4-D980F2F2CE6B'], values: [] };

    expect(resolveEntitySpaceId(entity, AI_SPACE)).toBe(AI_SPACE);
  });

  // Callers gate their own requests on loading; guessing before `spaces` is known would key them
  // on a space we may be about to leave.
  it('holds the requested space while the entity is unresolved', () => {
    expect(resolveEntitySpaceId(null, PERSONAL_SPACE)).toBe(PERSONAL_SPACE);
    expect(resolveEntitySpaceId({ spaces: [] }, PERSONAL_SPACE)).toBe(PERSONAL_SPACE);
  });
});
