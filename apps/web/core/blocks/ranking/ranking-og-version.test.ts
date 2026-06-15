import { describe, expect, it } from 'vitest';

import { buildRankingOgVersion } from './ranking-og-version';

describe('buildRankingOgVersion', () => {
  it('is stable for the same preview-affecting inputs', () => {
    const input = {
      rankEntityId: 'rank-1',
      orderedEntityIds: ['a', 'b'],
      rankingName: 'Top projects',
      authorName: 'Alice',
      authorAvatarUrl: 'https://example.com/a.png',
    };

    expect(buildRankingOgVersion(input)).toBe(buildRankingOgVersion(input));
  });

  it('changes when ordered entries change', () => {
    const first = buildRankingOgVersion({
      rankEntityId: 'rank-1',
      orderedEntityIds: ['a', 'b'],
      rankingName: 'Top projects',
    });
    const second = buildRankingOgVersion({
      rankEntityId: 'rank-1',
      orderedEntityIds: ['b', 'a'],
      rankingName: 'Top projects',
    });

    expect(first).not.toBe(second);
  });
});
