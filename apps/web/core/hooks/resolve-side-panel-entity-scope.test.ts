import { describe, expect, it } from 'vitest';

import type { Entity } from '~/core/types';

import {
  deriveSpaceIdFromUnscopedEntity,
  entityHasScopedContent,
  resolveSidePanelEntityScope,
} from './resolve-side-panel-entity-scope';

function entity(partial: Partial<Entity> & Pick<Entity, 'id'>): Entity {
  return {
    id: partial.id,
    name: partial.name ?? null,
    values: partial.values ?? [],
    relations: partial.relations ?? [],
    types: partial.types ?? [],
  };
}

describe('entityHasScopedContent', () => {
  it('returns false when entity is missing', () => {
    expect(entityHasScopedContent(null)).toBe(false);
  });

  it('returns true when non-deleted values exist', () => {
    expect(
      entityHasScopedContent(
        entity({
          id: 'e1',
          values: [
            { entityId: 'e1', spaceId: 's1', propertyId: 'p', value: 'x', isDeleted: false } as Entity['values'][0],
          ],
        })
      )
    ).toBe(true);
  });

  it('returns false when only deleted triples exist', () => {
    expect(
      entityHasScopedContent(
        entity({
          id: 'e1',
          values: [
            { entityId: 'e1', spaceId: 's1', propertyId: 'p', value: 'x', isDeleted: true } as Entity['values'][0],
          ],
        })
      )
    ).toBe(false);
  });
});

describe('deriveSpaceIdFromUnscopedEntity', () => {
  it('prefers value space id over relation space id', () => {
    expect(
      deriveSpaceIdFromUnscopedEntity(
        entity({
          id: 'e1',
          values: [
            {
              entityId: 'e1',
              spaceId: 'from-value',
              propertyId: 'p',
              value: 'x',
              isDeleted: false,
            } as Entity['values'][0],
          ],
          relations: [{ spaceId: 'from-relation' } as Entity['relations'][0]],
        }),
        'fallback'
      )
    ).toBe('from-value');
  });

  it('falls back to requested space id', () => {
    expect(deriveSpaceIdFromUnscopedEntity(null, 'fallback')).toBe('fallback');
  });
});

describe('resolveSidePanelEntityScope', () => {
  it('uses requested space when scoped entity has content', () => {
    expect(
      resolveSidePanelEntityScope({
        requestedSpaceId: 'requested',
        unscopedEntity: entity({ id: 'e1', values: [{ spaceId: 'derived' } as Entity['values'][0]] }),
        requestedScopedEntity: entity({
          id: 'e1',
          values: [
            {
              entityId: 'e1',
              spaceId: 'requested',
              propertyId: 'p',
              value: 'x',
              isDeleted: false,
            } as Entity['values'][0],
          ],
        }),
      }).effectiveSpaceId
    ).toBe('requested');
  });

  it('derives space when requested scope is empty', () => {
    expect(
      resolveSidePanelEntityScope({
        requestedSpaceId: 'requested',
        unscopedEntity: entity({
          id: 'e1',
          values: [
            {
              entityId: 'e1',
              spaceId: 'derived',
              propertyId: 'p',
              value: 'x',
              isDeleted: false,
            } as Entity['values'][0],
          ],
        }),
        requestedScopedEntity: entity({ id: 'e1' }),
      }).effectiveSpaceId
    ).toBe('derived');
  });
});
