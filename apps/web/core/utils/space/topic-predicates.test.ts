import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceDecoder } from '~/core/io/decoders/space';
import type { RemoteEntity } from '~/core/io/schema';

import { hasExternalTopic, isPersonProfileSpace } from './spaces';

/**
 * The two topic predicates, exercised through the decoder rather than a
 * hand-built `Space` (GEO-2859).
 *
 * The bug these pin was invisible against a literal: `hasExternalTopic` reads
 * fine in isolation and only fails once `SpaceDto` has built `entity` from
 * `topic ?? page`. So the fixture goes through the real decoder.
 */
const SPACE_ID = '00000000000000000000000000000001';
const TOPIC_ID = '00000000000000000000000000000002';
const PAGE_ID = '00000000000000000000000000000003';

function remoteEntity(id: string, name: string | null): RemoteEntity {
  return {
    id,
    name,
    description: null,
    types: [],
    spaceIds: [SPACE_ID],
    valuesList: [],
    relationsList: [],
    updatedAt: '1712345678',
  };
}

function decode(overrides: Record<string, unknown>) {
  return SpaceDecoder.decode({
    id: SPACE_ID,
    type: 'PERSONAL',
    address: '0x1234567890123456789012345678901234567890',
    topicId: TOPIC_ID,
    members: { totalCount: 0 },
    membersList: [],
    editors: { totalCount: 0 },
    editorsList: [],
    page: remoteEntity(PAGE_ID, 'Page name'),
    ...overrides,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hasExternalTopic', () => {
  it('is false for a space whose topic resolved — the case it is named for', () => {
    const space = decode({ topic: remoteEntity(TOPIC_ID, 'Preston Mantel') });

    // `entity` *is* the topic, so `topicId !== entity.id` can never hold. Every
    // branch gated on this predicate is dead for exactly the spaces it was
    // meant to catch.
    expect(space?.topicId).toBe(TOPIC_ID);
    expect(space?.entity.id).toBe(TOPIC_ID);
    expect(hasExternalTopic(space)).toBe(false);
  });

  it('is true only when the topic failed to decode, which is backwards', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const space = decode({ topic: { id: TOPIC_ID, name: 'Broken topic' } });

    expect(space?.entity.id).toBe(PAGE_ID);
    expect(hasExternalTopic(space)).toBe(true);
  });
});

describe('isPersonProfileSpace', () => {
  const person = remoteEntity(TOPIC_ID, 'Preston Mantel');
  person.types = [{ id: SystemIds.PERSON_TYPE, name: 'Person' }];
  person.relationsList = [
    {
      id: '00000000000000000000000000000004',
      entityId: TOPIC_ID,
      spaceId: SPACE_ID,
      position: null,
      verified: null,
      fromEntity: { id: TOPIC_ID, name: 'Preston Mantel' },
      toEntity: { id: SystemIds.PERSON_TYPE, name: 'Person', types: [], valuesList: [] },
      toSpaceId: null,
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    },
  ];

  it('is true for a person carried on the page, with no topic at all', () => {
    // The case that broke every visitor's view of somebody else's profile:
    // `topicId` is null on a great many personal spaces whose page entity is a
    // fully-populated person. `SpaceDto` builds `entity` from `topic ?? page`,
    // so the person is right there — just not where `topicId` looks.
    const space = decode({ topicId: null, page: person });

    expect(space?.topicId).toBeNull();
    expect(space?.entity.name).toBe('Preston Mantel');
    expect(isPersonProfileSpace(space)).toBe(true);
  });

  it('is true for a person carried on the topic', () => {
    expect(isPersonProfileSpace(decode({ topic: person }))).toBe(true);
  });

  it('is false for a personal space with nobody on it', () => {
    expect(isPersonProfileSpace(decode({ topicId: null }))).toBe(false);
  });

  it('is false for a DAO space, whatever is on its entity', () => {
    // A Person written into a DAO space is a page about someone, not their
    // profile — the counts and the history all key on a personal space.
    expect(isPersonProfileSpace(decode({ type: 'DAO', topic: person }))).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(isPersonProfileSpace(null)).toBe(false);
    expect(isPersonProfileSpace(undefined)).toBe(false);
  });
});
