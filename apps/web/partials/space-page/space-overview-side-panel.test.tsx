import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DailyActivityTask } from '~/core/space/daily-activities';

const mocks = vi.hoisted(() => ({
  tasks: [] as DailyActivityTask[],
  rankingComplete: new Map<string, { complete: boolean; isLoading: boolean }>(),
  uploadComplete: false,
}));

vi.mock('~/core/space/use-space-daily-activities', () => ({
  useSpaceDailyActivityTasks: () => ({ tasks: mocks.tasks, hasLinkIngestionTool: false }),
  useRankingDailyActivityComplete: (blockId: string) =>
    mocks.rankingComplete.get(blockId) ?? { complete: false, isLoading: true },
  useDailyUploadActivityComplete: () => mocks.uploadComplete,
}));

vi.mock('~/partials/community-calls/space-community-calls-section', () => ({
  SpaceCommunityCallsSection: () => <div data-testid="community-calls">Calls</div>,
}));

const { SpaceOverviewSidePanel } = await import('./space-overview-side-panel');

const rankingTask: DailyActivityTask = {
  kind: 'ranking',
  id: 'ranking:block-1',
  blockId: 'block-1',
  title: 'Top albums',
  description: 'Rank them',
};

function renderPanel(communityCalls: never[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SpaceOverviewSidePanel spaceId="space-1" communityCalls={communityCalls} />
    </QueryClientProvider>
  );
  return {
    ...view,
    // Same client, so the shared completion store survives the re-render.
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <SpaceOverviewSidePanel spaceId="space-1" communityCalls={communityCalls} />
        </QueryClientProvider>
      ),
  };
}

const checklist = () => screen.queryByRole('heading', { name: 'Daily activities' });

beforeEach(() => {
  mocks.tasks = [rankingTask];
  mocks.rankingComplete = new Map();
  mocks.uploadComplete = false;
});

afterEach(cleanup);

describe('SpaceOverviewSidePanel', () => {
  it('shows the checklist while a task is outstanding', () => {
    mocks.rankingComplete.set('block-1', { complete: false, isLoading: false });
    renderPanel();

    expect(checklist()).toBeInTheDocument();
  });

  // A finished checklist is a wall of ticks taking up the panel, so it gives the space back.
  it('hides the checklist, and the panel with it, once every task is done', () => {
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    const { container } = renderPanel();

    expect(checklist()).not.toBeInTheDocument();
    // Nothing else has content, so the whole aside goes rather than leaving a bordered column.
    expect(container.querySelector('aside')).toBeNull();
  });

  it('keeps the panel for the calls digest when only the checklist is done', () => {
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    const { container } = renderPanel([{ id: 'series-1' }] as never);

    expect(checklist()).not.toBeInTheDocument();
    expect(screen.getByTestId('community-calls')).toBeInTheDocument();
    expect(container.querySelector('aside')).not.toBeNull();
  });

  // Completion is watched per task, so hiding the checklist must not stop the watching — otherwise
  // tomorrow's reset would go unnoticed and it would stay hidden for the rest of the session.
  it('keeps watching completion after the checklist is hidden', () => {
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    const view = renderPanel();
    expect(checklist()).not.toBeInTheDocument();

    // The task comes back around, and the probes that outlived the checklist notice.
    mocks.rankingComplete.set('block-1', { complete: false, isLoading: false });
    view.rerender();

    expect(checklist()).toBeInTheDocument();
  });

  it('renders nothing at all when there are no tasks and no calls', () => {
    mocks.tasks = [];
    const { container } = renderPanel();

    expect(container).toBeEmptyDOMElement();
  });
});
