import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BacklinksClientContainer } from './backlinks-client-container';

const mocks = vi.hoisted(() => ({
  fetchPayload: vi.fn(),
}));

vi.mock('~/partials/entity-page/fetch-entity-backlinks', () => ({
  fetchEntityBacklinksPayload: (entityId: string) => mocks.fetchPayload(entityId),
}));

vi.mock('~/partials/entity-page/backlinks', () => ({
  Backlinks: ({ backlinks }: { backlinks: unknown[] }) => <div data-testid="backlinks">{backlinks.length}</div>,
}));

/** Stands in for the `TrackedErrorBoundary` the real call site is wrapped in. */
class CatchingBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };

  static getDerivedStateFromError() {
    return { caught: true };
  }

  render() {
    return this.state.caught ? <div data-testid="caught" /> : this.props.children;
  }
}

function renderInBoundary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CatchingBoundary>
        <BacklinksClientContainer entityId="entity-1" />
      </CatchingBoundary>
    </QueryClientProvider>
  );
}

describe('BacklinksClientContainer', () => {
  // This repo does not switch on RTL's global cleanup (see the note in `vitest.setup.ts`), so
  // without this the previous test's DOM is still mounted and `queryByTestId` finds its boundary
  // rather than this test's.
  afterEach(() => {
    cleanup();
    mocks.fetchPayload.mockReset();
  });

  it('surfaces a failed fetch to the error boundary rather than rendering nothing', async () => {
    // The reason this is worth a test: a failed fetch and an empty result both render nothing, so a
    // regression here is invisible from the outside. `useQuery` swallows errors unless told not to,
    // and the route variant used to report these — it reached the same data through an async
    // component whose throw the boundary caught. Losing that would be silent.
    mocks.fetchPayload.mockRejectedValueOnce(new Error('backlinks fetch failed'));

    renderInBoundary();

    await waitFor(() => expect(screen.getByTestId('caught')).toBeTruthy());
  });

  it('renders nothing for a genuinely empty result, without involving the boundary', async () => {
    mocks.fetchPayload.mockResolvedValueOnce([]);

    const { container } = renderInBoundary();

    await waitFor(() => expect(mocks.fetchPayload).toHaveBeenCalled());
    expect(screen.queryByTestId('caught')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders backlinks when there are some', async () => {
    mocks.fetchPayload.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    renderInBoundary();

    await waitFor(() => expect(screen.getByTestId('backlinks').textContent).toBe('2'));
  });
});
