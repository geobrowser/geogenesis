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

/**
 * The wrapper exists so a disclosure trigger only ever exists around faces that exist.
 *
 * The responder *count* and the responder *list* are two separate queries. A claim the count says has
 * five responses draws nothing here while the list is unresolved, and nothing at all if it failed — so
 * a trigger applied from outside on the count alone was an invisible, focusable button for exactly that
 * state, offering to list people it could not name.
 */
describe('ClaimResponderAvatars and the trigger around it', () => {
  function renderWithWrap(seeded: Array<{ userId: string; direction: string }> | undefined) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (seeded) queryClient.setQueryData(entityRespondersQueryKey('claim-1', 'space-1', 0, 'stance'), seeded);

    return render(
      <QueryClientProvider client={queryClient}>
        <ClaimResponderAvatars
          entityId="claim-1"
          spaceId="space-1"
          objectType={0}
          responseKind="stance"
          // What the count says, which is the number the trigger used to be decided on.
          totalResponders={5}
          wrap={faces => (
            <button type="button" data-testid="responders-trigger">
              {faces}
            </button>
          )}
        />
      </QueryClientProvider>
    );
  }

  it('wraps the faces once there are faces', () => {
    renderWithWrap([{ userId: 'profile-other', direction: 'negative' }]);

    expect(screen.getByTestId('responders-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('responder-ids')).toHaveTextContent('profile-other');
  });

  it('builds no trigger while the list has not answered, even though the count says five', () => {
    renderWithWrap(undefined);

    expect(screen.queryByTestId('responders-trigger')).not.toBeInTheDocument();
  });
});
