import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimRecordTab } from './claim-record-tab';

const mocks = vi.hoisted(() => ({
  hookCalls: [] as Array<Record<string, unknown>>,
  filterProps: null as Record<string, any> | null,
  feedProps: null as Record<string, unknown> | null,
}));

vi.mock('./use-claim-record', () => ({
  useClaimRecord: (args: Record<string, unknown>) => {
    mocks.hookCalls.push(args);
    return {
      claimRows: [],
      debateRows: [],
      claimsLoading: false,
      debatesLoading: false,
      claimsError: false,
      debatesError: false,
      claimsFetchingNextPage: false,
      debatesFetchingNextPage: false,
      claimsHasNextPage: false,
      debatesHasNextPage: false,
      fetchNextClaimsPage: vi.fn(),
      fetchNextDebatesPage: vi.fn(),
    };
  },
}));
vi.mock('~/core/hooks/use-space-labels', () => ({
  spaceLabel: (labels: Map<string, { name: string }>, id: string) => labels.get(id),
  useSpaceLabels: (ids: string[]) => ({
    labelsById: new Map(ids.map(id => [id, { name: id === 'space-1' ? 'Relationships' : 'Technology' }])),
    isLoading: false,
  }),
}));
vi.mock('~/partials/profile/record-filter-row', () => ({
  RecordFilterRow: (props: Record<string, unknown>) => {
    mocks.filterProps = props;
    return <div data-testid="filters" />;
  },
}));
vi.mock('~/partials/profile/person-record-feed', () => ({
  PersonRecordFeed: (props: Record<string, unknown>) => {
    mocks.feedProps = props;
    return <div data-testid="feed" />;
  },
}));

const common = {
  claimId: 'claim-1',
  spaceId: 'space-1',
  availableSpaceIds: ['space-1', 'space-2'],
  sourceTopics: [
    { id: 'topic-1', name: 'Ethics' },
    { id: 'topic-2', name: 'Technology' },
  ],
};

beforeEach(() => {
  mocks.hookCalls = [];
  mocks.filterProps = null;
  mocks.feedProps = null;
});

afterEach(cleanup);

describe('ClaimRecordTab', () => {
  it('gives Related claims Best, Top, New plus Spaces and Topics controls', () => {
    render(<ClaimRecordTab {...common} kind="claims" />);

    expect(mocks.filterProps?.sort.value).toBe('best');
    expect(mocks.filterProps?.sort.options.map((option: { label: string }) => option.label)).toEqual([
      'Best',
      'Top',
      'New',
    ]);
    expect(mocks.filterProps?.dimensions.map((dimension: { key: string }) => dimension.key)).toEqual([
      'spaces',
      'topics',
    ]);
    expect(mocks.hookCalls.at(-1)).toMatchObject({
      claimSort: 'best',
      spaceIds: ['space-1'],
      filterTopicIds: [],
      claimsEnabled: true,
      debatesEnabled: false,
      countsEnabled: false,
    });
  });

  it('updates the server query when a sort or Related claims filter changes', () => {
    render(<ClaimRecordTab {...common} kind="claims" />);

    act(() => mocks.filterProps?.sort.onChange('top'));
    expect(mocks.hookCalls.at(-1)).toMatchObject({ claimSort: 'top' });

    const dimensions = mocks.filterProps?.dimensions as Array<Record<string, any>>;
    act(() => dimensions.find(dimension => dimension.key === 'spaces')?.onClear());
    expect(mocks.hookCalls.at(-1)).toMatchObject({ spaceIds: ['space-1', 'space-2'] });

    act(() =>
      (mocks.filterProps?.dimensions as Array<Record<string, any>>)
        .find(dimension => dimension.key === 'topics')
        ?.onToggle('topic-1')
    );
    expect(mocks.hookCalls.at(-1)).toMatchObject({ filterTopicIds: ['topic-1'] });
  });

  it('gives Debates the same sort order and only its Spaces filter', () => {
    render(<ClaimRecordTab {...common} kind="debates" />);

    expect(mocks.filterProps?.sort.value).toBe('best');
    expect(mocks.filterProps?.sort.options.map((option: { label: string }) => option.label)).toEqual([
      'Best',
      'Top',
      'New',
    ]);
    expect(mocks.filterProps?.dimensions.map((dimension: { key: string }) => dimension.key)).toEqual(['spaces']);
    expect(mocks.hookCalls.at(-1)).toMatchObject({
      debateSort: 'best',
      spaceIds: ['space-1'],
      claimsEnabled: false,
      debatesEnabled: true,
      countsEnabled: false,
    });
  });
});
