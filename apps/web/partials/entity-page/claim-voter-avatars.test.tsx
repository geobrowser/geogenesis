import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { entityRespondersQueryKey } from '~/core/responses/entity-response';

import { ClaimResponderAvatars } from './claim-voter-avatars';

vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseBatchState: () => ({ managed: true, ready: true }),
}));

vi.mock('~/partials/blocks/table/ranking-period-metadata', () => ({
  RankingAggregatedSubmitterAvatars: ({
    submitterSpaceIds,
    totalCount,
  }: {
    submitterSpaceIds: string[];
    totalCount: number;
  }) => (
    <div>
      <span data-testid="responder-ids">{submitterSpaceIds.join(',')}</span>
      <span data-testid="responder-count">{totalCount}</span>
    </div>
  ),
}));

afterEach(cleanup);

describe('ClaimResponderAvatars', () => {
  it('adds and removes the viewer avatar with the optimistic response', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(entityRespondersQueryKey('claim-1', 'space-1', 0, 'stance'), [
      { userId: 'profile-other', direction: 'negative' },
    ]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const view = render(
      <ClaimResponderAvatars
        entityId="claim-1"
        spaceId="space-1"
        objectType={0}
        responseKind="stance"
        totalResponders={2}
        viewerSpaceId="profile-viewer"
        optimisticViewerResponse="positive"
      />,
      { wrapper }
    );

    expect(screen.getByTestId('responder-ids')).toHaveTextContent('profile-viewer,profile-other');
    expect(screen.getByTestId('responder-count')).toHaveTextContent('2');

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
  });
});
