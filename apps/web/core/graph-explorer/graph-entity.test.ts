import { describe, expect, it } from 'vitest';

import { OG_IMAGE_PROPERTY } from '~/core/constants';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID } from '~/core/io/subgraph/space-image';

import { type RawEntity, decodeEntity } from './graph-entity';

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
      card: null,
    });
  });
});

describe('share card', () => {
  const SPACE = 'a'.repeat(32);
  const OTHER_SPACE = 'b'.repeat(32);
  const og = (url: string | null, spaceId: string | null = SPACE) => ({
    typeId: OG_IMAGE_PROPERTY,
    spaceId,
    toEntity: { valuesList: [{ text: url }] },
  });
  const entity = (typeId: string, relationsList: RawEntity['relationsList']): RawEntity => ({
    id: '1'.repeat(32),
    name: 'A debate',
    spaceIds: [SPACE],
    names: [{ spaceId: SPACE, text: 'A debate' }],
    types: [{ id: typeId, name: null }],
    relationsList,
  });

  it("reads a debate's OG Image as its card, and leaves its image alone", () => {
    const decoded = decodeEntity(entity(DEBATE_TYPE_ID, [og('ipfs://card')]));
    expect(decoded.card).toBe('ipfs://card');
    expect(decoded.image).toBeNull();
  });

  it('gives anything that is not a debate no card, even with an OG Image', () => {
    const decoded = decodeEntity(
      entity('f'.repeat(32), [
        og('ipfs://card'),
        { typeId: AVATAR_PROPERTY_ID, toEntity: { valuesList: [{ text: 'ipfs://avatar' }] } },
      ])
    );
    expect(decoded.card).toBeNull();
    expect(decoded.image).toBe('ipfs://avatar');
  });

  it('prefers the card in a space that names the debate, and skips an OG Image with no URL', () => {
    expect(decodeEntity(entity(DEBATE_TYPE_ID, [og('ipfs://elsewhere', OTHER_SPACE), og('ipfs://own')])).card).toBe(
      'ipfs://own'
    );
    expect(decodeEntity(entity(DEBATE_TYPE_ID, [og(null), og('ipfs://elsewhere', OTHER_SPACE)])).card).toBe(
      'ipfs://elsewhere'
    );
    expect(decodeEntity(entity(DEBATE_TYPE_ID, [])).card).toBeNull();
  });
});
