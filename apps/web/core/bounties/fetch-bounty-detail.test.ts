import { describe, expect, it } from 'vitest';

import { distinctInterestedIds } from './fetch-bounty-detail';

describe('distinctInterestedIds', () => {
  it('collapses duplicate interest rows and normalizes dashed ids', () => {
    expect(
      distinctInterestedIds([
        { id: 'r1', fromEntityId: '865af0e77373454e98978ea9b4a53387', spaceId: 'p1' },
        { id: 'r2', fromEntityId: '865af0e7-7373-454e-9897-8ea9b4a53387', spaceId: 'p1' },
        { id: 'r3', fromEntityId: 'aaaa0000000000000000000000000001', spaceId: 'p2' },
      ])
    ).toEqual(['865af0e77373454e98978ea9b4a53387', 'aaaa0000000000000000000000000001']);
  });
});
