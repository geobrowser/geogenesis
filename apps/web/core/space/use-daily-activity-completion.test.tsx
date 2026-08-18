import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DailyActivityTask } from '~/core/space/daily-activities';

const mocks = vi.hoisted(() => ({
  rankingComplete: new Map<string, { complete: boolean; isLoading: boolean }>(),
  uploadComplete: false,
}));

vi.mock('~/core/space/use-space-daily-activities', () => ({
  useRankingDailyActivityComplete: (blockId: string) =>
    mocks.rankingComplete.get(blockId) ?? { complete: false, isLoading: true },
  useDailyUploadActivityComplete: () => mocks.uploadComplete,
}));

const { DailyActivityCompletionProbes, useDailyActivityCompletion } = await import('./use-daily-activity-completion');

const SPACE_ID = 'space-1';

const rankingTask: DailyActivityTask = {
  kind: 'ranking',
  id: 'ranking:block-1',
  blockId: 'block-1',
  title: 'Top albums',
  description: 'Rank them',
};
const uploadTask: DailyActivityTask = {
  kind: 'upload',
  id: 'upload-news-story',
  title: 'Upload a news story',
  description: 'Share a link',
};

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Mounts the probes and the hook together, the way the side panel does. */
function Harness({ tasks }: { tasks: DailyActivityTask[] }) {
  const { onCompleteChange, allComplete, isLoading } = useDailyActivityCompletion(tasks);

  return (
    <>
      <DailyActivityCompletionProbes tasks={tasks} spaceId={SPACE_ID} onCompleteChange={onCompleteChange} />
      <span data-testid="state">{isLoading ? 'loading' : allComplete ? 'all-complete' : 'open'}</span>
    </>
  );
}

beforeEach(() => {
  mocks.rankingComplete = new Map();
  mocks.uploadComplete = false;
});

afterEach(cleanup);

describe('useDailyActivityCompletion', () => {
  it('reads as open until every task has reported', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.rankingComplete.set('block-1', { complete: false, isLoading: true });
    mocks.uploadComplete = true;

    render(<Harness tasks={[rankingTask, uploadTask]} />, {
      wrapper: makeWrapper(queryClient),
    });

    // The upload task answered, the ranking hasn't — an unknown answer is never "done".
    expect(screen.getByTestId('state')).toHaveTextContent('loading');
  });

  it('reads as complete only once every task reports done', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    mocks.uploadComplete = true;

    render(<Harness tasks={[rankingTask, uploadTask]} />, {
      wrapper: makeWrapper(queryClient),
    });

    expect(screen.getByTestId('state')).toHaveTextContent('all-complete');
  });

  it('reads as open when one task is still outstanding', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    mocks.uploadComplete = false;

    render(<Harness tasks={[rankingTask, uploadTask]} />, {
      wrapper: makeWrapper(queryClient),
    });

    expect(screen.getByTestId('state')).toHaveTextContent('open');
  });

  it('forgets a task that no longer exists rather than counting it done', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.rankingComplete.set('block-1', { complete: true, isLoading: false });
    mocks.uploadComplete = true;

    const view = render(<Harness tasks={[rankingTask, uploadTask]} />, {
      wrapper: makeWrapper(queryClient),
    });
    expect(screen.getByTestId('state')).toHaveTextContent('all-complete');

    // The ranking block is removed, and a fresh one nobody has answered takes its place.
    const newTask: DailyActivityTask = { ...rankingTask, id: 'ranking:block-2', blockId: 'block-2' };
    act(() => {
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <Harness tasks={[newTask, uploadTask]} />
        </QueryClientProvider>
      );
    });

    expect(screen.getByTestId('state')).toHaveTextContent('loading');
  });

  it('is never complete with no tasks at all', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useDailyActivityCompletion([]), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.allComplete).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
