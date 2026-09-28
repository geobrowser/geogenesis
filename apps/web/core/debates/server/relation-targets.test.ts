import { describe, expect, it, vi } from 'vitest';

import { ENTITY_ID_BATCH_SIZE } from '~/core/io/queries';

import { type RelationTarget, type RelationTargetsPageFetcher, collectRelationTargets } from './relation-targets';

const SPACE = '8b5c8625ff017732063d56e85d24dbed';
const TYPE = '806d52bc27e94c9193c057978b093351';

const id = (n: number) => n.toString(16).padStart(32, '0');
const target = (from: string, to: number): RelationTarget => ({ fromEntityId: from, typeId: TYPE, toEntityId: id(to) });

describe('collectRelationTargets', () => {
  it('pages each request to exhaustion', async () => {
    const from = id(1);
    const fetchPage = vi
      .fn<RelationTargetsPageFetcher>()
      .mockResolvedValueOnce({ items: [target(from, 100)], endCursor: 'c1', hasNextPage: true })
      .mockResolvedValueOnce({ items: [target(from, 101)], endCursor: null, hasNextPage: false });

    await expect(
      collectRelationTargets({ fromEntityIds: [from], typeIds: [TYPE], spaceId: SPACE }, fetchPage)
    ).resolves.toEqual([target(from, 100), target(from, 101)]);
    expect(fetchPage.mock.calls.map(([, after]) => after)).toEqual([undefined, 'c1']);
  });

  // An `in` list past the API's per-request cap is rejected or cut short; every source must be read.
  it('splits the source ids under the per-request cap and reads every batch', async () => {
    const fromEntityIds = Array.from({ length: ENTITY_ID_BATCH_SIZE * 2 + 1 }, (_, n) => id(n + 1));
    const fetchPage = vi.fn<RelationTargetsPageFetcher>(async request => ({
      items: request.fromEntityIds.map(from => target(from, 0)),
      endCursor: null,
      hasNextPage: false,
    }));

    const targets = await collectRelationTargets({ fromEntityIds, typeIds: [TYPE], spaceId: SPACE }, fetchPage);

    expect(fetchPage.mock.calls.map(([request]) => request.fromEntityIds.length)).toEqual([
      ENTITY_ID_BATCH_SIZE,
      ENTITY_ID_BATCH_SIZE,
      1,
    ]);
    expect(targets.map(t => t.fromEntityId)).toEqual(fromEntityIds);
  });

  it('throws rather than return a partial list when the cursor chain breaks', async () => {
    const fetchPage = vi
      .fn<RelationTargetsPageFetcher>()
      .mockResolvedValueOnce({ items: [target(id(1), 100)], endCursor: null, hasNextPage: true });

    await expect(
      collectRelationTargets({ fromEntityIds: [id(1)], typeIds: [TYPE], spaceId: SPACE }, fetchPage)
    ).rejects.toThrow('next page but no end cursor');
  });
});
