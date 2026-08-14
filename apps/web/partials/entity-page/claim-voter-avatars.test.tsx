import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityRespondersQueryKey } from '~/core/responses/entity-response';

import { ClaimResponderAvatars } from './claim-voter-avatars';

const mocks = vi.hoisted(() => ({
  useGeoProfile: vi.fn(() => ({
    profile: { avatarUrl: 'ipfs://viewer-avatar', address: '0xabc123', id: 'profile-viewer', name: 'Viewer' },
    isLoading: false,
    isFetched: true,
  })),
  useSmartAccount: vi.fn(() => ({
    smartAccount: { account: { address: '0xabc123' } },
    isLoading: false,
    error: null,
  })),
}));

vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseBatchState: () => ({ managed: true, ready: true }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => mocks.useSmartAccount(),
}));

vi.mock('~/core/hooks/use-geo-profile', () => ({
  useGeoProfile: (account?: `0x${string}`) => mocks.useGeoProfile(account),
}));

vi.mock('~/partials/blocks/table/ranking-period-metadata', () => ({
  RankingAggregatedSubmitterAvatars: ({
    submitterSpaceIds,
    totalCount,
    knownProfiles,
  }: {
    submitterSpaceIds: string[];
    totalCount: number;
    knownProfiles?: ReadonlyMap<string, { avatarUrl: string | null; address?: string | null }>;
  }) => (
    <div>
      <span data-testid="responder-ids">{submitterSpaceIds.join(',')}</span>
      <span data-testid="responder-count">{totalCount}</span>
      <span data-testid="known-profile-ids">{knownProfiles ? [...knownProfiles.keys()].join(',') : ''}</span>
      <span data-testid="known-profile-avatar">{knownProfiles?.get('profile-viewer')?.avatarUrl ?? ''}</span>
      <span data-testid="known-profile-address">{knownProfiles?.get('profile-viewer')?.address ?? ''}</span>
    </div>
  ),
}));

afterEach(cleanup);

beforeEach(() => {
  mocks.useGeoProfile.mockReturnValue({
    profile: { avatarUrl: 'ipfs://viewer-avatar', address: '0xabc123', id: 'profile-viewer', name: 'Viewer' },
    isLoading: false,
    isFetched: true,
  });
  mocks.useSmartAccount.mockReturnValue({
    smartAccount: { account: { address: '0xabc123' } },
    isLoading: false,
    error: null,
  });
});

function renderWithResponders(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(entityRespondersQueryKey('claim-1', 'space-1', 0, 'stance'), [
    { userId: 'profile-other', direction: 'negative' },
  ]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}

describe('ClaimResponderAvatars', () => {
  it('adds and removes the viewer avatar with the optimistic response', () => {
    const view = renderWithResponders(
      <ClaimResponderAvatars
        entityId="claim-1"
        spaceId="space-1"
        objectType={0}
        responseKind="stance"
        totalResponders={2}
        viewerSpaceId="profile-viewer"
        optimisticViewerResponse="positive"
      />
    );

    expect(screen.getByTestId('responder-ids')).toHaveTextContent('profile-viewer,profile-other');
    expect(screen.getByTestId('responder-count')).toHaveTextContent('2');
    expect(screen.getByTestId('known-profile-ids')).toHaveTextContent('profile-viewer');
    expect(screen.getByTestId('known-profile-avatar')).toHaveTextContent('ipfs://viewer-avatar');
    expect(screen.getByTestId('known-profile-address')).toHaveTextContent('0xabc123');

    view.rerender(
      <ClaimResponderAvatars
        entityId="claim-1"
        spaceId="space-1"
        objectType={0}
        responseKind="stance"
        totalResponders={1}
        viewerSpaceId="profile-viewer"
        optimisticViewerResponse={null}
      />
    );

    expect(screen.getByTestId('responder-ids')).toHaveTextContent('profile-other');
    expect(screen.getByTestId('responder-count')).toHaveTextContent('1');
    expect(screen.getByTestId('known-profile-ids')).toHaveTextContent('');
  });

  it('seeds knownProfiles immediately with the wallet address when the profile is still loading', () => {
    mocks.useGeoProfile.mockReturnValue({
      profile: null,
      isLoading: true,
      isFetched: false,
    });

    renderWithResponders(
      <ClaimResponderAvatars
        entityId="claim-1"
        spaceId="space-1"
        objectType={0}
        responseKind="stance"
        totalResponders={2}
        viewerSpaceId="profile-viewer"
        optimisticViewerResponse="positive"
      />
    );

    expect(screen.getByTestId('known-profile-ids')).toHaveTextContent('profile-viewer');
    expect(screen.getByTestId('known-profile-avatar')).toHaveTextContent('');
    expect(screen.getByTestId('known-profile-address')).toHaveTextContent('0xabc123');
  });

  it('keeps the viewer profile query warm even before an optimistic vote', () => {
    renderWithResponders(
      <ClaimResponderAvatars
        entityId="claim-1"
        spaceId="space-1"
        objectType={0}
        responseKind="stance"
        totalResponders={1}
        viewerSpaceId="profile-viewer"
      />
    );

    expect(mocks.useGeoProfile).toHaveBeenCalledWith('0xabc123');
    expect(screen.getByTestId('known-profile-ids')).toHaveTextContent('');
  });
});
