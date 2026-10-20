import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFollowedTopics } from './use-followed-topics';

const mocks = vi.hoisted(() => ({
  fetchInterestedTopics: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: SPACE, isRegistered: true, isLoading: false }),
}));
vi.mock('~/core/io/subgraph/fetch-interested-topics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/subgraph/fetch-interested-topics')>()),
  fetchInterestedTopics: mocks.fetchInterestedTopics,
}));

const SPACE = '11111111111111111111111111111111';
const TOPIC = '33333333333333333333333333333333';
const PERSON = '55555555555555555555555555555555';

function setup() {
  mocks.fetchInterestedTopics.mockResolvedValue([
    { objectId: TOPIC, spaceId: SPACE, kind: 'topic' },
    { objectId: PERSON, spaceId: SPACE, kind: 'person' },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useFollowedTopics(), { wrapper }).result;
}

describe('useFollowedTopics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads a topic as followed by a current Interested, and leaves followed people out', async () => {
    const result = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.topicIds).toEqual(new Set([TOPIC]));
  });
});
