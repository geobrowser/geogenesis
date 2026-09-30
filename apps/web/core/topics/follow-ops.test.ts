import { describe, expect, it } from 'vitest';

import { buildFollowRelations, buildUnfollowRelations, followEditName } from './follow-ops';
import { FOLLOWING_PROPERTY } from './ontology';

const PERSONAL_SPACE = '11111111111111111111111111111111';
const TOPIC_A = '22222222222222222222222222222222';
const TOPIC_B = '33333333333333333333333333333333';
const TOPIC_SPACE = '44444444444444444444444444444444';

describe('follow ops', () => {
  it('follows from the personal-space system entity into the personal space', () => {
    const { followed, relations } = buildFollowRelations({
      personalSpaceId: PERSONAL_SPACE,
      topics: [{ id: TOPIC_A, name: 'Energy', spaceId: TOPIC_SPACE }],
      existingTopicIds: new Set(),
    });

    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      id: followed[0].id,
      spaceId: PERSONAL_SPACE,
      toSpaceId: TOPIC_SPACE,
      fromEntity: { id: PERSONAL_SPACE },
      toEntity: { id: TOPIC_A, name: 'Energy', value: TOPIC_A },
      type: { id: FOLLOWING_PROPERTY, name: 'Following' },
      isLocal: true,
    });
    expect(relations[0].entityId).not.toBe(relations[0].id);
    expect(followed[0]).toEqual({ id: relations[0].id, spaceId: PERSONAL_SPACE, toEntityId: TOPIC_A });
  });

  it('omits toSpaceId when the topic space is unknown', () => {
    const { relations } = buildFollowRelations({
      personalSpaceId: PERSONAL_SPACE,
      topics: [{ id: TOPIC_A }],
      existingTopicIds: new Set(),
    });

    expect(relations[0]).not.toHaveProperty('toSpaceId');
  });

  it('skips topics already followed, matching across id spellings', () => {
    const { relations } = buildFollowRelations({
      personalSpaceId: PERSONAL_SPACE,
      topics: [{ id: TOPIC_A }],
      existingTopicIds: new Set(['22222222-2222-2222-2222-222222222222']),
    });

    expect(relations).toEqual([]);
  });

  it('dedupes the input so a selection yields one row per topic', () => {
    const { relations } = buildFollowRelations({
      personalSpaceId: PERSONAL_SPACE,
      topics: [{ id: TOPIC_A }, { id: TOPIC_B }, { id: TOPIC_A }],
      existingTopicIds: new Set(),
    });

    expect(relations.map(r => r.toEntity.id)).toEqual([TOPIC_A, TOPIC_B]);
  });

  it('tombstones every matching row, including duplicates, and leaves others alone', () => {
    const relations = buildUnfollowRelations({
      personalSpaceId: PERSONAL_SPACE,
      rows: [
        { id: 'row-1', spaceId: PERSONAL_SPACE, toEntityId: TOPIC_A },
        { id: 'row-2', spaceId: PERSONAL_SPACE, toEntityId: TOPIC_A },
        { id: 'row-3', spaceId: PERSONAL_SPACE, toEntityId: TOPIC_B },
      ],
      topicIds: [TOPIC_A],
    });

    expect(relations.map(r => r.id)).toEqual(['row-1', 'row-2']);
    for (const relation of relations) {
      expect(relation).toMatchObject({
        spaceId: PERSONAL_SPACE,
        fromEntity: { id: PERSONAL_SPACE },
        type: { id: FOLLOWING_PROPERTY },
        isDeleted: true,
      });
    }
  });
});

describe('follow edit name', () => {
  const relation = (id: string, name: string | null) =>
    buildFollowRelations({ personalSpaceId: PERSONAL_SPACE, topics: [{ id, name }], existingTopicIds: new Set() })
      .relations[0];

  it('names a single topic', () => {
    expect(followEditName('Follow', [relation(TOPIC_A, 'Energy')])).toBe('Follow topic: Energy');
  });

  it('counts distinct topics in the relations, not requested ids', () => {
    const tombstones = buildUnfollowRelations({
      personalSpaceId: PERSONAL_SPACE,
      rows: [
        { id: 'row-1', spaceId: PERSONAL_SPACE, toEntityId: TOPIC_A },
        { id: 'row-2', spaceId: PERSONAL_SPACE, toEntityId: TOPIC_A },
      ],
      topicIds: [TOPIC_A, TOPIC_B],
    });

    expect(followEditName('Unfollow', tombstones)).toBe('Unfollow 1 topic');
    expect(followEditName('Follow', [relation(TOPIC_A, null), relation(TOPIC_B, null)])).toBe('Follow 2 topics');
  });
});
