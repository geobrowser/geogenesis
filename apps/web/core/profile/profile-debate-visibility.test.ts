import { describe, expect, it } from 'vitest';

import {
  HIDDEN_FROM_PROFILE_PROPERTY,
  buildHideDebateRelation,
  buildUnhideDebateRelations,
  debateVisibilityCounts,
  hiddenProfileDebatesPath,
  profileDebateNavigationCount,
} from './profile-debate-visibility';

const PERSONAL_SPACE = '11111111111111111111111111111111';
const DEBATE = '22222222222222222222222222222222';
const DEBATE_SPACE = '33333333333333333333333333333333';

describe('profile debate visibility', () => {
  it('builds a hide relation from the personal-space system entity in the personal space', () => {
    const { hidden, relation } = buildHideDebateRelation({
      personalSpaceId: PERSONAL_SPACE,
      debateId: DEBATE,
      debateName: 'A debate',
      debateSpaceId: DEBATE_SPACE,
    });

    expect(relation).toMatchObject({
      id: hidden.id,
      spaceId: PERSONAL_SPACE,
      toSpaceId: DEBATE_SPACE,
      fromEntity: { id: PERSONAL_SPACE },
      toEntity: { id: DEBATE, value: DEBATE },
      type: { id: HIDDEN_FROM_PROFILE_PROPERTY, name: 'Hidden from profile' },
      isLocal: true,
    });
  });

  it('tombstones every duplicate hide row when restoring a debate', () => {
    const relations = buildUnhideDebateRelations({
      personalSpaceId: PERSONAL_SPACE,
      debateId: DEBATE,
      debateName: 'A debate',
      hidden: [
        { id: 'hide-1', spaceId: PERSONAL_SPACE, toEntityId: DEBATE },
        { id: 'hide-2', spaceId: PERSONAL_SPACE, toEntityId: DEBATE },
      ],
    });

    expect(relations.map(relation => relation.id)).toEqual(['hide-1', 'hide-2']);
    expect(relations.every(relation => relation.isDeleted && relation.spaceId === PERSONAL_SPACE)).toBe(true);
  });

  it('keeps public and total counts from the same distinct debate set', () => {
    expect(
      debateVisibilityCounts(
        [DEBATE, DEBATE.toUpperCase(), '44444444-4444-4444-4444-444444444444'],
        ['22222222-2222-2222-2222-222222222222']
      )
    ).toEqual({ visible: 1, total: 2 });
  });

  it('uses total debates only for owner navigation', () => {
    expect(profileDebateNavigationCount(0, 1, true)).toBe(1);
    expect(profileDebateNavigationCount(0, 1, false)).toBe(0);
  });

  it('links directly to the hidden list on the profile debates tab', () => {
    expect(hiddenProfileDebatesPath(PERSONAL_SPACE)).toBe(`/space/${PERSONAL_SPACE}/debates?hidden=true`);
  });
});
