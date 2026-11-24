import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';

import { resolveGraphFilter } from './graph-filter';
import { useTopicClaimsSummary } from './use-graph-explorer';

const TOPIC = 't'.repeat(32);
const SPACE = 's'.repeat(32);

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: null, isLoading: false }),
}));
vi.mock('~/core/debates/use-claim-space-allowlist', () => ({ useClaimSpaceAllowlist: () => ({ allowlist: [] }) }));
vi.mock('~/core/topics/use-topic-space-scope', () => ({ useTopicSpaceScope: () => undefined }));
vi.mock('./claims-about', async importOriginal => ({
  ...(await importOriginal<typeof import('./claims-about')>()),
  fetchClaimsAbout: async () => ({
    claims: [
      { id: 'a', name: 'Claim A', spaceId: SPACE },
      { id: 'b', name: 'Claim B', spaceId: SPACE },
    ],
    endCursor: null,
    hasNextPage: false,
  }),
}));
vi.mock('~/core/responses/claim-response-summaries', () => ({
  loadClaimResponseSummaryCaches: async ({ queryClient }: { queryClient: QueryClient }) => {
    queryClient.setQueryData(entityResponseCountsQueryKey('a', SPACE, 0, 'stance'), { positive: 2, negative: 0 });
    queryClient.setQueryData(entityResponseCountsQueryKey('b', SPACE, 0, 'stance'), { positive: 0, negative: 0 });
    return new Map();
  },
}));

describe('useTopicClaimsSummary', () => {
  it('counts each claim from the shared cache and follows a vote landing there', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const filter = resolveGraphFilter({ spaceIds: [SPACE], topicId: TOPIC, topicSpaceId: SPACE });
    const { result } = renderHook(() => useTopicClaimsSummary(TOPIC, filter, SPACE), { wrapper });
    await waitFor(() => expect(result.current.data?.claims.map(claim => claim.id)).toEqual(['a']));

    act(() => client.setQueryData(entityResponseCountsQueryKey('b', SPACE, 0, 'stance'), { positive: 2, negative: 2 }));
    expect(result.current.data?.claims.map(claim => [claim.id, claim.band])).toEqual([
      ['b', 'contested'],
      ['a', 'agreed'],
    ]);
  });
});
