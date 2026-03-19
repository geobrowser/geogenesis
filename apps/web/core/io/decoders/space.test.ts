import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceDecoder } from './space';

const SPACE_ID = '00000000000000000000000000000001';
const TOPIC_ID = '00000000000000000000000000000002';

function makeRemoteEntity({
  id,
  name,
  description = null,
}: {
  id: string;
  name: string | null;
  description?: string | null;
}) {
  return {
    id,
    name,
    description,
    types: [],
    spaceIds: [SPACE_ID],
    valuesList: [],
    relationsList: [],
    updatedAt: '1712345678',
  };
}

function makeRemoteSpace(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: SPACE_ID,
    type: 'DAO',
    address: '0x1234567890123456789012345678901234567890',
    topicId: TOPIC_ID,
    membersList: [],
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
});
