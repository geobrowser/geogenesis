import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { profileBySpaceIdQueryKey } from '~/core/io/query-keys';
import type { Profile } from '~/core/types';

const fetchProfilesBySpaceIds = vi.hoisted(() => vi.fn());

vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds }));
vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));
vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: ({ value }: { value: string }) => <span data-testid="avatar-image">{value}</span>,
}));
vi.mock('~/design-system/avatar', () => ({
  Avatar: ({ value }: { value?: string }) => <span data-testid="avatar-fallback">{value}</span>,
}));

const { RankingAggregatedSubmitterAvatars } = await import('./ranking-period-metadata');

function profile(spaceId: string): Profile {
  return {
    id: spaceId,
    spaceId,
    address: `0x${spaceId}` as `0x${string}`,
    avatarUrl: `https://example.com/${spaceId}.png`,
    coverUrl: null,
    name: spaceId,
    profileLink: null,
  };
}

beforeEach(() => {
  fetchProfilesBySpaceIds.mockReset();
  fetchProfilesBySpaceIds.mockImplementation(() => {
    throw new Error('unexpected profile fetch');
  });
});

afterEach(cleanup);

describe('RankingAggregatedSubmitterAvatars', () => {
  it('renders cached avatars immediately when a new submitter is prepended', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const spaceId of ['space-viewer', 'space-a', 'space-b']) {
      queryClient.setQueryData(profileBySpaceIdQueryKey(spaceId), profile(spaceId));
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const view = render(<RankingAggregatedSubmitterAvatars submitterSpaceIds={['space-a', 'space-b']} />, { wrapper });

    expect(screen.getAllByTestId('avatar-image').map(node => node.textContent)).toEqual([
      'https://example.com/space-a.png',
      'https://example.com/space-b.png',
    ]);

    // Adding the viewer's own space id used to mint a fresh set-keyed cache entry, blanking
    // every avatar until a refetch landed. Per-id caching keeps them, viewer included.
    view.rerender(<RankingAggregatedSubmitterAvatars submitterSpaceIds={['space-viewer', 'space-a', 'space-b']} />);

    expect(screen.getAllByTestId('avatar-image').map(node => node.textContent)).toEqual([
      'https://example.com/space-viewer.png',
      'https://example.com/space-a.png',
      'https://example.com/space-b.png',
    ]);
    expect(fetchProfilesBySpaceIds).not.toHaveBeenCalled();
  });
});
