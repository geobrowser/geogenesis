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
          property: {
            id: SCORE_SYSTEM_PROPERTY,
          },
        },
        {
          spaceId: nullPropertySpaceId,
          property: null,
        },
        {
          spaceId: nullPropertyIdSpaceId,
          property: {
            id: null,
          },
        },
      ],
      allRelationsList: [],
    });

    expect(EntityDtoLive(remoteEntity).spaces).toEqual([nullPropertySpaceId, nullPropertyIdSpaceId]);
  });
});
