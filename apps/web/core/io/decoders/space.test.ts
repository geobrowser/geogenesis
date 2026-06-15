import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';

import { SpaceDecoder } from './space';

const SPACE_ID = '00000000000000000000000000000001';
const TOPIC_ID = '00000000000000000000000000000002';
const IMAGE_ENTITY_ID = '00000000000000000000000000000004';

function toHex(id: string) {
  return id.replace(/-/g, '');
}

function makeImageRelation(typeId: string, imageUrl: string) {
  return {
    id: '00000000000000000000000000000005',
    spaceId: SPACE_ID,
    position: null,
    verified: null,
    fromEntity: {
      id: TOPIC_ID,
      name: 'From entity',
    },
    toEntity: {
      id: IMAGE_ENTITY_ID,
      name: 'Image',
      types: [{ id: toHex(SystemIds.IMAGE_TYPE), name: 'Image' }],
      valuesList: [
        {
          spaceId: SPACE_ID,
          propertyId: toHex(SystemIds.IMAGE_URL_PROPERTY),
          text: imageUrl,
        },
      ],
    },
    toSpaceId: null,
    type: {
      id: toHex(typeId),
      name: null,
    },
    entityId: '00000000000000000000000000000006',
  };
}

function makeRemoteEntity({
  id,
  name,
  description = null,
  relationsList = [],
}: {
  id: string;
  name: string | null;
  description?: string | null;
  relationsList?: ReturnType<typeof makeImageRelation>[];
}) {
  return {
    id,
    name,
    description,
    types: [],
    spaceIds: [SPACE_ID],
    valuesList: [],
    relationsList,
    updatedAt: '1712345678',
  };
}

function makeRemoteSpace(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: SPACE_ID,
    type: 'DAO',
    address: '0x1234567890123456789012345678901234567890',
    topicId: TOPIC_ID,
    members: { totalCount: 0 },
    membersList: [],
    editors: { totalCount: 0 },
    editorsList: [],
    page: makeRemoteEntity({ id: '00000000000000000000000000000003', name: 'Page name' }),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SpaceDecoder', () => {
  it('prefers topic data when the nested topic decodes successfully', () => {
    const space = SpaceDecoder.decode(
      makeRemoteSpace({
        topic: makeRemoteEntity({ id: TOPIC_ID, name: 'Topic name' }),
      })
    );

    expect(space?.entity.name).toBe('Topic name');
    expect(space?.entity.id).toBe(TOPIC_ID);
  });

  it('falls back to page data when topic decoding fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const space = SpaceDecoder.decode(
      makeRemoteSpace({
        topic: {
          id: TOPIC_ID,
          name: 'Broken topic',
        },
      })
    );

    expect(space?.entity.name).toBe('Page name');
    expect(space?.entity.id).toBe('00000000000000000000000000000003');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('continues decoding older page-only payloads', () => {
    const space = SpaceDecoder.decode(
      makeRemoteSpace({
        topicId: null,
      })
    );

    expect(space?.entity.name).toBe('Page name');
    expect(space?.topicId).toBeNull();
  });

  it('does not use page media as the space image for page-only payloads', () => {
    const space = SpaceDecoder.decode(
      makeRemoteSpace({
        topicId: null,
        page: makeRemoteEntity({
          id: '00000000000000000000000000000003',
          name: 'Page name',
          relationsList: [makeImageRelation(ContentIds.AVATAR_PROPERTY, 'ipfs://page-avatar')],
        }),
      })
    );

    expect(space?.entity.name).toBe('Page name');
    expect(space?.entity.image).toBe(PLACEHOLDER_SPACE_IMAGE);
  });

  it('uses topic media as the space image when topic data is available', () => {
    const space = SpaceDecoder.decode(
      makeRemoteSpace({
        topic: makeRemoteEntity({
          id: TOPIC_ID,
          name: 'Topic name',
          relationsList: [makeImageRelation(ContentIds.AVATAR_PROPERTY, 'ipfs://topic-avatar')],
        }),
      })
    );

    expect(space?.entity.name).toBe('Topic name');
    expect(space?.entity.image).toBe('ipfs://topic-avatar');
  });
});
