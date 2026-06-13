import { describe, expect, it } from 'vitest';

import type { RankingSubmissionRecord } from './ranking-submission-types';
import { dedupeSubmissionsByAuthor } from './use-ranking-submissions';

function submission(authorSpaceId: string, orderedEntityIds: string[], createdAt: string): RankingSubmissionRecord {
  return {
    id: `entity-${authorSpaceId}`,
    authorSpaceId,
    targetBlockId: 'block-1',
    targetBlockSpaceId: 'space-1',
    orderedEntityIds,
    createdAt,
    author: { spaceId: authorSpaceId, address: authorSpaceId, name: null, avatarUrl: null },
  };
}

describe('dedupeSubmissionsByAuthor', () => {
  it('keeps only the latest submission per author', () => {
    const deduped = dedupeSubmissionsByAuthor([
      submission('alice', ['a', 'b'], '2026-01-01'),
      submission('alice', ['c', 'd'], '2026-06-01'),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.orderedEntityIds).toEqual(['c', 'd']);
  });
});
