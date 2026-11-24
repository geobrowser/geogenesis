import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphAnalyticsProvider, type GraphExplorerSession } from '~/core/graph-explorer/graph-explorer-analytics';
import type { GraphFilter } from '~/core/graph-explorer/graph-filter';

import { TopicClaimsSummary } from './centre-summary';

vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({
  useTopicClaimsSummary: () => ({
    isLoading: false,
    isError: false,
    data: {
      claims: [{ id: 'c', name: 'A claim', spaceId: 's', positive: 3, negative: 0, band: 'agreed' }],
      truncated: false,
    },
  }),
}));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({ EntityVoteButtons: () => null }));
vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  CLAIM_RESPONSE_OBJECT_TYPE: 0,
  useClaimResponseSummary: () => ({ hasCounts: false, isLoading: false, positive: 0, negative: 0 }),
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

/** Observers in creation order; `show` reports their element at least half visible. */
const observers: Array<{ callback: IntersectionObserverCallback; disconnected: boolean }> = [];
class FakeObserver {
  entry: { callback: IntersectionObserverCallback; disconnected: boolean };
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, disconnected: false };
    observers.push(this.entry);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.entry.disconnected = true;
  }
}
const show = () => {
  const live = observers.filter(observer => !observer.disconnected).at(-1)!;
  act(() => live.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
};

const interacted = vi.fn();
const session = { interacted } as unknown as GraphExplorerSession;
const summary = (topicId: string) => (
  <GraphAnalyticsProvider value={session}>
    <TopicClaimsSummary topicId={topicId} filter={{} as GraphFilter} topicSpaceId={null} onOpenClaim={vi.fn()} />
  </GraphAnalyticsProvider>
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  observers.length = 0;
  interacted.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('summary_seen', () => {
  it('reports once the summary has been half visible for a second', () => {
    render(summary('t1'));
    show();
    act(() => vi.advanceTimersByTime(999));
    expect(interacted).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(interacted).toHaveBeenCalledWith({ interaction: 'summary_seen' });
  });

  it('drops a pending report when the summary unmounts', () => {
    const { unmount } = render(summary('t1'));
    show();
    act(() => vi.advanceTimersByTime(500));
    unmount();
    act(() => vi.advanceTimersByTime(2_000));
    expect(interacted).not.toHaveBeenCalled();
  });

  it('drops a pending report when the topic changes', () => {
    const { rerender } = render(summary('t1'));
    show();
    act(() => vi.advanceTimersByTime(500));
    rerender(summary('t2'));
    act(() => vi.advanceTimersByTime(2_000));
    expect(interacted).not.toHaveBeenCalled();
  });
});
