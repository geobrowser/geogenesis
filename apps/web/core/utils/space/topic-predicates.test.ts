import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceDecoder } from '~/core/io/decoders/space';

import { hasExternalTopic, hasTopicEntity } from './spaces';

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

function remoteEntity(id: string, name: string | null) {
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

describe('hasTopicEntity', () => {
  it('is true for a space whose subject is an entity of its own', () => {
    expect(hasTopicEntity(decode({ topic: remoteEntity(TOPIC_ID, 'Preston Mantel') }))).toBe(true);
  });

  it('is false for the 725 personal spaces with no person entity behind them', () => {
    expect(hasTopicEntity(decode({ topicId: null }))).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(hasTopicEntity(null)).toBe(false);
    expect(hasTopicEntity(undefined)).toBe(false);
  });
});
