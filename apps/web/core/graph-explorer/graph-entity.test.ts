import { describe, expect, it } from 'vitest';

import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID } from '~/core/io/subgraph/space-image';

import { decodeEntity } from './graph-entity';

describe('decodeEntity', () => {
  it('normalises ids, keeps spaces that name it and prefers the avatar over the cover', () => {
    const entity = decodeEntity({
      id: '11111111-1111-1111-1111-111111111111',
      name: '  Isaac Herzog ',
      spaceIds: ['AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'],
      names: [
        { spaceId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', text: 'Isaac Herzog' },
        { spaceId: 'b'.repeat(32), text: ' ' },
      ],
      types: [{ id: 't', name: 'Person' }],
      relationsList: [
        { typeId: COVER_PROPERTY_ID, toEntity: { valuesList: [{ text: 'ipfs://cover' }] } },
        { typeId: AVATAR_PROPERTY_ID, toEntity: { valuesList: [{ text: 'ipfs://avatar' }] } },
      ],
    });
    expect(entity).toEqual({
      id: '1'.repeat(32),
      name: 'Isaac Herzog',
      spaceIds: ['a'.repeat(32)],
      namedSpaceIds: ['a'.repeat(32)],
      types: [{ id: 't', name: 'Person' }],
      image: 'ipfs://avatar',
    });
  });
});
