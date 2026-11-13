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

  it('keeps the latest submission when timestamps mix unix-seconds and ISO formats', () => {
    // 2024-01-01T00:00:00Z in unix seconds vs a later ISO string.
    const olderUnixSeconds = '1704067200';
    const newerIso = '2026-06-01T00:00:00Z';

    const orderInsensitive = [
      dedupeSubmissionsByAuthor([
        submission('alice', ['a', 'b'], olderUnixSeconds),
        submission('alice', ['c', 'd'], newerIso),
      ]),
      dedupeSubmissionsByAuthor([
        submission('alice', ['c', 'd'], newerIso),
        submission('alice', ['a', 'b'], olderUnixSeconds),
      ]),
    ];

    for (const deduped of orderInsensitive) {
      expect(deduped).toHaveLength(1);
      expect(deduped[0]?.orderedEntityIds).toEqual(['c', 'd']);
    }
  });

  it('breaks a same-second tie by ballot id, whatever the list order (GEO-3686)', () => {
    const a = { ...submission('alice', ['a'], '1793875856'), id: 'rank-a' };
    const b = { ...submission('alice', ['b'], '1793875856'), id: 'rank-b' };
    expect(dedupeSubmissionsByAuthor([a, b])[0]?.id).toBe('rank-b');
    expect(dedupeSubmissionsByAuthor([b, a])[0]?.id).toBe('rank-b');
  });

  it('reads a millisecond createdAt as milliseconds (GEO-3686)', () => {
    const olderMs = { ...submission('alice', ['a'], String(Date.parse('2026-01-01'))), id: 'rank-a' };
    const newerSeconds = { ...submission('alice', ['b'], String(Date.parse('2026-06-01') / 1000)), id: 'rank-b' };
    expect(dedupeSubmissionsByAuthor([olderMs, newerSeconds])[0]?.id).toBe('rank-b');
  });
});
