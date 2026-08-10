import { QueryClient } from '@tanstack/react-query';

import { describe, expect, it, vi } from 'vitest';

import type { Space } from '~/core/io/dto/spaces';
import { profilesBySpaceIdsQueryKey, spacesByIdsQueryKey } from '~/core/io/query-keys';
import type { Profile } from '~/core/types';

import {
  CLAIM_RESPONSE_SUMMARY_PAGE_SIZE,
  buildClaimResponseSummaryFilter,
  fetchClaimResponseSummaries,
  groupClaimResponseSummaryRows,
  loadClaimResponderMetadataCaches,
  loadClaimResponseSummaryCaches,
  normalizeClaimResponseTargets,
} from './claim-response-summaries';
import {
  entityResponderProfilesQueryKey,
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
  userEntityResponseQueryKey,
} from './entity-response';

const targets = [
  { entityId: 'claim-veracity', responseKind: 'veracity' as const },
  { entityId: 'claim-stance', responseKind: 'stance' as const },
];

describe('claim response summaries', () => {
  it('normalizes duplicate claim-kind pairs deterministically', () => {
    expect(normalizeClaimResponseTargets([targets[0], targets[1], targets[0]])).toEqual([
      { entityId: 'claim-stance', responseKind: 'stance' },
      { entityId: 'claim-veracity', responseKind: 'veracity' },
    ]);
  });

  it('builds an exact-space entity filter with one exact branch per active vote kind', () => {
    expect(buildClaimResponseSummaryFilter('space-1', targets)).toEqual({
      spaceId: { is: 'space-1' },
      objectType: { is: 0 },
      voteType: { in: [0, 1] },
      or: [
        { objectId: { is: 'claim-stance' }, voteKind: { is: 1 } },
        { objectId: { is: 'claim-veracity' }, voteKind: { is: 2 } },
      ],
    });
  });

  it('groups active positive and negative rows and ignores cleared or inactive-kind rows', () => {
    const summaries = groupClaimResponseSummaryRows(
      targets,
      [
        row('claim-stance', 1, 'viewer', 0),
        row('claim-stance', 1, 'negative-user', 1),
        row('claim-stance', 1, 'cleared-user', 2),
        row('claim-stance', 2, 'wrong-kind', 0),
        row('claim-veracity', 2, 'verifier', 0),
        row('another-claim', 1, 'wrong-claim', 0),
      ],
      'viewer'
    );

    expect(summaries.get('claim-stance:stance')).toEqual({
      counts: { positive: 1, negative: 1 },
      viewerResponse: 'positive',
      responders: [
        { userId: 'viewer', direction: 'positive' },
        { userId: 'negative-user', direction: 'negative' },
      ],
    });
    expect(summaries.get('claim-veracity:veracity')).toEqual({
      counts: { positive: 1, negative: 0 },
      viewerResponse: null,
      responders: [{ userId: 'verifier', direction: 'positive' }],
    });
  });

  it('does not assign a viewer response for anonymous requests', () => {
    const summaries = groupClaimResponseSummaryRows(
      [{ entityId: 'claim-stance', responseKind: 'stance' }],
      [row('claim-stance', 1, 'user-1', 1)],
      null
    );

    expect(summaries.get('claim-stance:stance')?.viewerResponse).toBeNull();
  });

  it('paginates in deterministic 1,000-row pages and deduplicates rows repeated across pages', async () => {
    const firstPage = Array.from({ length: CLAIM_RESPONSE_SUMMARY_PAGE_SIZE }, (_, index) =>
      row('claim-stance', 1, `user-${index}`, index % 2)
    );
    const duplicate = firstPage.at(-1)!;
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([duplicate, row('claim-stance', 1, 'user-1000', 0)]);

    const summaries = await fetchClaimResponseSummaries({
      spaceId: 'space-1',
      targets: [{ entityId: 'claim-stance', responseKind: 'stance' }],
      personalSpaceId: 'user-1000',
      fetchPage,
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls.map(call => call[0].offset)).toEqual([0, 1000]);
    expect(fetchPage.mock.calls[0]?.[0]).toMatchObject({
      first: 1000,
      filter: {
        spaceId: { is: 'space-1' },
        objectType: { is: 0 },
        or: [{ objectId: { is: 'claim-stance' }, voteKind: { is: 1 } }],
      },
    });
    expect(summaries.get('claim-stance:stance')).toMatchObject({
      counts: { positive: 501, negative: 500 },
      viewerResponse: 'positive',
    });
    expect(summaries.get('claim-stance:stance')?.responders).toHaveLength(1001);
  });

  it('deduplicates avatar metadata in chunks and seeds every existing per-claim cache', async () => {
    const queryClient = new QueryClient();
    const responderIds = Array.from({ length: 205 }, (_, index) => `profile-${index}`);
    const summary = {
      counts: { positive: 103, negative: 102 },
      viewerResponse: 'negative' as const,
      responders: responderIds.map((userId, index) => ({
        userId,
        direction: index % 2 === 0 ? ('positive' as const) : ('negative' as const),
      })),
    };
    const fetchSummaries = vi.fn().mockResolvedValue(new Map([['claim-stance:stance', summary]]));
    const fetchProfiles = vi.fn(async (ids: string[]) =>
      ids.map(id => ({ spaceId: id, address: `0x${id}` }) as Profile)
    );
    const fetchSpaces = vi.fn(async (ids: string[]) =>
      ids.map(id => ({ id, entity: { id: `entity-${id}` } }) as Space)
    );

    const summaries = await loadClaimResponseSummaryCaches({
      queryClient,
      spaceId: 'space-1',
      targets: [{ entityId: 'claim-stance', responseKind: 'stance' }],
      personalSpaceId: 'profile-1',
      fetchSummaries,
    });
    await loadClaimResponderMetadataCaches({
      queryClient,
      spaceId: 'space-1',
      targets: [{ entityId: 'claim-stance', responseKind: 'stance' }],
      summaries,
      fetchProfiles,
      fetchSpaces,
    });

    expect(fetchProfiles.mock.calls.map(call => call[0].length)).toEqual([100, 100, 5]);
    expect(fetchSpaces.mock.calls.map(call => call[0].length)).toEqual([100, 100, 5]);
    expect(queryClient.getQueryData(entityResponseCountsQueryKey('claim-stance', 'space-1', 0, 'stance'))).toEqual(
      summary.counts
    );
    expect(
      queryClient.getQueryData(userEntityResponseQueryKey('profile-1', 'claim-stance', 'space-1', 0, 'stance'))
    ).toBe('negative');
    expect(queryClient.getQueryData(entityRespondersQueryKey('claim-stance', 'space-1', 0, 'stance'))).toEqual(
      summary.responders
    );
    expect(
      queryClient.getQueryData([
        ...entityResponderProfilesQueryKey('claim-stance', 'space-1', 0, 'stance'),
        responderIds,
      ])
    ).toHaveLength(205);
    expect(queryClient.getQueryData(profilesBySpaceIdsQueryKey(responderIds))).toBeInstanceOf(Map);
    expect(queryClient.getQueryData(spacesByIdsQueryKey(responderIds))).toHaveLength(205);
  });

  it('keeps response caches usable when avatar metadata fails and reuses successful metadata on retry', async () => {
    const queryClient = new QueryClient();
    const fetchSummaries = vi.fn().mockResolvedValue(
      new Map([
        [
          'claim-stance:stance',
          {
            counts: { positive: 1, negative: 0 },
            viewerResponse: null,
            responders: [{ userId: 'profile-1', direction: 'positive' }],
          },
        ],
      ])
    );
    const fetchProfiles = vi.fn(async () => [{ spaceId: 'profile-1', address: '0x1' } as unknown as Profile]);
    const fetchSpaces = vi
      .fn<() => Promise<Space[]>>()
      .mockRejectedValueOnce(new Error('space metadata unavailable'))
      .mockResolvedValueOnce([{ id: 'profile-1', entity: { id: 'profile-1' } } as Space]);
    const summaries = await loadClaimResponseSummaryCaches({
      queryClient,
      spaceId: 'space-1',
      targets: [{ entityId: 'claim-stance', responseKind: 'stance' as const }],
      personalSpaceId: null,
      fetchSummaries,
    });
    const metadataArgs = {
      queryClient,
      spaceId: 'space-1',
      targets: [{ entityId: 'claim-stance', responseKind: 'stance' as const }],
      summaries,
      fetchProfiles,
      fetchSpaces,
    };

    await expect(loadClaimResponderMetadataCaches(metadataArgs)).rejects.toThrow('space metadata unavailable');
    expect(queryClient.getQueryData(entityResponseCountsQueryKey('claim-stance', 'space-1', 0, 'stance'))).toEqual({
      positive: 1,
      negative: 0,
    });
    await expect(loadClaimResponderMetadataCaches(metadataArgs)).resolves.toBeUndefined();

    expect(fetchSummaries).toHaveBeenCalledOnce();
    expect(fetchProfiles).toHaveBeenCalledOnce();
    expect(fetchSpaces).toHaveBeenCalledTimes(2);
  });

  it('does not seed avatar caches after metadata enrichment is cancelled', async () => {
    const queryClient = new QueryClient();
    const controller = new AbortController();
    const fetchSummaries = vi.fn().mockResolvedValue(
      new Map([
        [
          'claim-stance:stance',
          {
            counts: { positive: 1, negative: 0 },
            viewerResponse: 'positive' as const,
            responders: [{ userId: 'profile-1', direction: 'positive' as const }],
          },
        ],
      ])
    );
    const fetchProfiles = vi.fn(async () => {
      controller.abort();
      return [{ spaceId: 'profile-1', address: '0x1' } as unknown as Profile];
    });

    const summaries = await loadClaimResponseSummaryCaches({
      queryClient,
      spaceId: 'space-1',
      targets: [{ entityId: 'claim-stance', responseKind: 'stance' }],
      personalSpaceId: 'profile-1',
      fetchSummaries,
    });

    await expect(
      loadClaimResponderMetadataCaches({
        queryClient,
        spaceId: 'space-1',
        targets: [{ entityId: 'claim-stance', responseKind: 'stance' }],
        summaries,
        signal: controller.signal,
        fetchProfiles,
        fetchSpaces: vi.fn(async () => [{ id: 'profile-1', entity: { id: 'profile-1' } } as Space]),
      })
    ).rejects.toBeDefined();

    expect(queryClient.getQueryData(entityResponseCountsQueryKey('claim-stance', 'space-1', 0, 'stance'))).toEqual({
      positive: 1,
      negative: 0,
    });
    expect(
      queryClient.getQueryData([
        ...entityResponderProfilesQueryKey('claim-stance', 'space-1', 0, 'stance'),
        ['profile-1'],
      ])
    ).toBeUndefined();
  });

  it('caps concurrent responder profile and space metadata requests', async () => {
    const queryClient = new QueryClient();
    const responderIds = Array.from({ length: 505 }, (_, index) => `profile-${index}`);
    const summaries = new Map([
      [
        'claim-stance:stance',
        {
          counts: { positive: 505, negative: 0 },
          viewerResponse: null,
          responders: responderIds.map(userId => ({ userId, direction: 'positive' as const })),
        },
      ],
    ]);
    let activeProfiles = 0;
    let activeSpaces = 0;
    let maxProfiles = 0;
    let maxSpaces = 0;
    const fetchProfiles = vi.fn(async (ids: string[]) => {
      activeProfiles += 1;
      maxProfiles = Math.max(maxProfiles, activeProfiles);
      await Promise.resolve();
      activeProfiles -= 1;
      return ids.map(id => ({ spaceId: id, address: `0x${id}` }) as Profile);
    });
    const fetchSpaces = vi.fn(async (ids: string[]) => {
      activeSpaces += 1;
      maxSpaces = Math.max(maxSpaces, activeSpaces);
      await Promise.resolve();
      activeSpaces -= 1;
      return ids.map(id => ({ id, entity: { id } }) as Space);
    });

    await loadClaimResponderMetadataCaches({
      queryClient,
      spaceId: 'space-1',
      targets: [{ entityId: 'claim-stance', responseKind: 'stance' }],
      summaries,
      fetchProfiles,
      fetchSpaces,
    });

    expect(fetchProfiles).toHaveBeenCalledTimes(6);
    expect(fetchSpaces).toHaveBeenCalledTimes(6);
    expect(maxProfiles).toBeLessThanOrEqual(4);
    expect(maxSpaces).toBeLessThanOrEqual(4);
  });
});

function row(objectId: string, voteKind: number, userId: string, voteType: number) {
  return { objectId, voteKind, userId, voteType };
}
