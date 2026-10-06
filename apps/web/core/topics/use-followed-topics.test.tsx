import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFollowedTopics } from './use-followed-topics';

const mocks = vi.hoisted(() => ({
  fetchFollowedTopics: vi.fn(),
  fetchInterestedTopics: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: SPACE, isRegistered: true, isLoading: false }),
}));
vi.mock('~/core/io/subgraph/fetch-followed-topics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/subgraph/fetch-followed-topics')>()),
  fetchFollowedTopics: mocks.fetchFollowedTopics,
}));
vi.mock('~/core/io/subgraph/fetch-interested-topics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/subgraph/fetch-interested-topics')>()),
  fetchInterestedTopics: mocks.fetchInterestedTopics,
}));

const SPACE = '11111111111111111111111111111111';
const BY_RELATION = '22222222222222222222222222222222';
const BY_INTERESTED = '33333333333333333333333333333333';
const BOTH = '55555555555555555555555555555555';

function setup() {
  mocks.fetchFollowedTopics.mockResolvedValue([
    { id: 'row-1', spaceId: SPACE, toEntityId: BY_RELATION },
    { id: 'row-2', spaceId: SPACE, toEntityId: BOTH },
  ]);
  mocks.fetchInterestedTopics.mockResolvedValue([
    { objectId: BY_INTERESTED, spaceId: SPACE },
    { objectId: BOTH, spaceId: SPACE },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useFollowedTopics(), { wrapper }).result;
}

describe('useFollowedTopics', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('with the Interested flag off, reads Following relations only, exactly as before', async () => {
    const result = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.topicIds).toEqual(new Set([BY_RELATION, BOTH]));
    expect(mocks.fetchInterestedTopics).not.toHaveBeenCalled();
  });

  it('with it on, reads a topic as followed only by a current Interested, never by a relation', async () => {
    vi.stubEnv('NEXT_PUBLIC_INTERESTED_FOLLOW_ENABLED', 'true');
    const result = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.topicIds).toEqual(new Set([BY_INTERESTED, BOTH]));
    // Old Following relations are dropped: not fetched, not returned.
    expect(mocks.fetchFollowedTopics).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });
});
