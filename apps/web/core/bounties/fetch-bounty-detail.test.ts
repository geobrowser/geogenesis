import { describe, expect, it } from 'vitest';

import { distinctInterestedIds, interestAllocationTarget } from './fetch-bounty-detail';

const DAO = 'dddd0000000000000000000000000001';

describe('interestAllocationTarget', () => {
  it('uses the row space (the personal space) for rows authored outside the bounty space', () => {
    expect(interestAllocationTarget({ id: 'r', fromEntityId: 'person-1', spaceId: 'p1' }, DAO)).toBe('p1');
  });

  it('falls back to the from-entity for rows authored into the bounty space itself', () => {
    expect(interestAllocationTarget({ id: 'r', fromEntityId: 'p1', spaceId: DAO }, DAO)).toBe('p1');
  });
});

describe('distinctInterestedIds', () => {
  it('collapses duplicate rows and both identity shapes for the same curator', () => {
    expect(
      distinctInterestedIds(
        [
          // New shape: from the personal-space entity, in the personal space.
          { id: 'r1', fromEntityId: '865af0e77373454e98978ea9b4a53387', spaceId: '865af0e77373454e98978ea9b4a53387' },
          // Legacy curator-app shape: from the person entity, in the same personal space.
          {
            id: 'r2',
            fromEntityId: 'aaaa0000000000000000000000000009',
            spaceId: '865af0e7-7373-454e-9897-8ea9b4a53387',
          },
          // Old geogenesis shape: from the personal-space entity, written into the DAO space.
          { id: 'r3', fromEntityId: 'bbbb0000000000000000000000000001', spaceId: DAO },
        ],
        DAO
      )
    ).toEqual(['865af0e77373454e98978ea9b4a53387', 'bbbb0000000000000000000000000001']);
  });
});
