import { describe, expect, it } from 'vitest';

import { rankingComposeHref } from './ranking-compose-url';

describe('rankingComposeHref', () => {
  it('preserves existing edit URLs without share params', () => {
    expect(
      rankingComposeHref({
        spaceId: 'space-1',
        blockEntityId: 'block-1',
        relationId: 'relation-1',
        parentEntityId: 'parent-1',
      })
    ).toBe('/space/space-1/block-1/ranking-compose?relationId=relation-1&parentEntityId=parent-1');
  });

  it('adds share identity params for view URLs', () => {
    expect(
      rankingComposeHref({
        spaceId: 'space-1',
        blockEntityId: 'block-1',
        relationId: 'relation-1',
        parentEntityId: 'parent-1',
        rankingStartDate: '2026-06-01',
        rankingEndDate: '2026-06-30',
        mode: 'view',
        rankEntityId: 'rank-1',
        authorSpaceId: 'author-1',
        ogVersion: 'ranking-og-v1-abc123',
      })
    ).toBe(
      '/space/space-1/block-1/ranking-compose?relationId=relation-1&parentEntityId=parent-1&rankingStartDate=2026-06-01&rankingEndDate=2026-06-30&mode=view&rankEntityId=rank-1&authorSpaceId=author-1&ogVersion=ranking-og-v1-abc123'
    );
  });
});
