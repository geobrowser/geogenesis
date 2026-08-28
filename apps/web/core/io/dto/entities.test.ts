import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it, vi } from 'vitest';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';

import { RemoteEntity } from '../schema';
import { EntityDtoLive } from './entities';

vi.mock('~/core/utils/property/properties', () => ({
  getDataTypeFromEntityId: () => 'TEXT',
}));

const entityId = '11111111111111111111111111111111';
const hiddenSpaceId = '22222222222222222222222222222222';
const nullPropertySpaceId = '33333333333333333333333333333333';
const nullPropertyIdSpaceId = '44444444444444444444444444444444';

function entity(overrides: Partial<RemoteEntity> = {}): RemoteEntity {
  return {
    id: entityId,
    name: null,
    description: null,
    types: [],
    spaceIds: [hiddenSpaceId, nullPropertySpaceId, nullPropertyIdSpaceId],
    valuesList: [],
    relationsList: [],
    ...overrides,
  };
}

describe('EntityDtoLive', () => {
  it('treats unresolved routing value property metadata as real content', () => {
    const remoteEntity = entity({
      allValuesList: [
        {
          spaceId: hiddenSpaceId,
          propertyId: SCORE_SYSTEM_PROPERTY,
        },
        {
          spaceId: nullPropertySpaceId,
          propertyId: null,
        },
        {
          spaceId: nullPropertyIdSpaceId,
          propertyId: null,
        },
      ],
      allRelationsList: [],
    });

    expect(EntityDtoLive(remoteEntity).spaces).toEqual([nullPropertySpaceId, nullPropertyIdSpaceId]);
  });

  it('does not fall back to API spaceIds when every projected value is hidden', () => {
    const remoteEntity = entity({
      spaceIds: [hiddenSpaceId],
      allValuesList: [
        {
          spaceId: hiddenSpaceId,
          propertyId: SCORE_SYSTEM_PROPERTY,
        },
      ],
      allRelationsList: [],
    });

    expect(EntityDtoLive(remoteEntity).spaces).toEqual([]);
  });
});

/**
 * The Root space names entity `e4e366e9…` "Role"; a downstream space names the same entity
 * "Person role". The API's own `name` handed back the downstream one, which is what a proposal
 * diff in the Root space ended up showing for the type being added.
 */
describe('EntityDtoLive names', () => {
  const ROOT_SPACE = 'a19c345ab9866679b001d7d2138d88a1';
  const BASEBALL_SPACE = '7570a0ba7552e6806e0751c2ad105754';
  const NAME_PROPERTY = SystemIds.NAME_PROPERTY;

  function nameValue(spaceId: string, text: string) {
    return {
      spaceId,
      property: {
        id: NAME_PROPERTY,
        name: 'Name',
        dataTypeId: null,
        dataTypeName: null,
        renderableTypeId: null,
        renderableTypeName: null,
        format: null,
        isType: null,
      },
      text,
      integer: null,
      float: null,
      boolean: null,
      point: null,
      time: null,
      language: null,
      unit: null,
      datetime: null,
      date: null,
      decimal: null,
      schedule: null,
      embedding: null,
    };
  }

  it('reads the name from the highest-ranked space rather than the API default', () => {
    const decoded = EntityDtoLive(
      entity({
        name: 'Person role',
        spaceIds: [ROOT_SPACE, BASEBALL_SPACE],
        valuesList: [nameValue(BASEBALL_SPACE, 'Person role'), nameValue(ROOT_SPACE, 'Role')],
      })
    );

    expect(decoded.name).toBe('Role');
  });

  it('does not depend on the order the API returns the names in', () => {
    const decoded = EntityDtoLive(
      entity({
        name: 'Person role',
        spaceIds: [ROOT_SPACE, BASEBALL_SPACE],
        valuesList: [nameValue(ROOT_SPACE, 'Role'), nameValue(BASEBALL_SPACE, 'Person role')],
      })
    );

    expect(decoded.name).toBe('Role');
  });

  // A space-scoped query returns only that space's values, so scoped reads are unchanged.
  it('keeps a space-scoped name when that is all the query asked for', () => {
    const decoded = EntityDtoLive(
      entity({
        name: 'Person role',
        spaceIds: [BASEBALL_SPACE],
        valuesList: [nameValue(BASEBALL_SPACE, 'Person role')],
      })
    );

    expect(decoded.name).toBe('Person role');
  });

  // Plenty of queries don't ask for values at all; those keep the only answer available.
  it('falls back to the API name when no values were fetched', () => {
    const decoded = EntityDtoLive(entity({ name: 'Person role', valuesList: [] }));

    expect(decoded.name).toBe('Person role');
  });

  it('leaves an unnamed entity unnamed', () => {
    const decoded = EntityDtoLive(entity({ name: null, valuesList: [] }));

    expect(decoded.name).toBeNull();
  });
});
