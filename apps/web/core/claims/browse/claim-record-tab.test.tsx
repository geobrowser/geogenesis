import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimRecordTab } from './claim-record-tab';

const mocks = vi.hoisted(() => ({
  hookCalls: [] as Array<Record<string, unknown>>,
  facetHookCalls: [] as Array<Record<string, unknown>>,
  facetError: false,
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
vi.mock('./use-claim-record-facets', () => ({
  useClaimRecordFacets: (args: Record<string, unknown>) => {
    mocks.facetHookCalls.push(args);
    return {
      claimSpaces: [
        { id: 'space-1', count: 8 },
        { id: 'space-2', count: 3 },
      ],
      claimTopics: [
        { id: 'topic-3', name: 'Economics', count: 5 },
        { id: 'topic-1', name: 'Ethics', count: 2 },
      ],
      debateSpaces: [
        { id: 'space-1', count: 4 },
        { id: 'space-2', count: 1 },
      ],
      countsPending: false,
      facetsSettled: true,
      isError: mocks.facetError,
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
  mocks.facetHookCalls = [];
  mocks.facetError = false;
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
    expect(mocks.filterProps?.dimensions[0].options).toEqual([
      { value: 'space-1', label: 'Relationships', count: 8, pending: false },
      { value: 'space-2', label: 'Technology', count: 3, pending: false },
    ]);
    // Facets describe the complete Related claims corpus, not only the source claim's topics.
    expect(mocks.filterProps?.dimensions[1].options).toEqual([
      { value: 'topic-3', label: 'Economics', count: 5 },
      { value: 'topic-1', label: 'Ethics', count: 2 },
    ]);
    expect(mocks.hookCalls.at(-1)).toMatchObject({
      claimSort: 'best',
      spaceIds: ['space-1'],
      filterTopicIds: [],
      claimsEnabled: true,
      debatesEnabled: false,
      countsEnabled: false,
    });
    expect(mocks.facetHookCalls.at(-1)).toMatchObject({
      kind: 'claims',
      allSpaceIds: ['space-1', 'space-2'],
      selectedSpaceIds: ['space-1'],
      selectedTopicIds: [],
      sourceTopicIds: ['topic-1', 'topic-2'],
    });
  });

  it('updates the server query when a sort or Related claims filter changes', () => {
    render(<ClaimRecordTab {...common} kind="claims" />);

    act(() => mocks.filterProps?.sort.onChange('top'));
    expect(mocks.hookCalls.at(-1)).toMatchObject({ claimSort: 'top' });

    const dimensions = mocks.filterProps?.dimensions as Array<Record<string, any>>;
    act(() => dimensions.find(dimension => dimension.key === 'spaces')?.onClear());
    expect(mocks.hookCalls.at(-1)).toMatchObject({ spaceIds: ['space-1', 'space-2'] });
    expect(mocks.facetHookCalls.at(-1)).toMatchObject({ selectedSpaceIds: ['space-1', 'space-2'] });

    act(() =>
      (mocks.filterProps?.dimensions as Array<Record<string, any>>)
        .find(dimension => dimension.key === 'topics')
        ?.onToggle('topic-1')
    );
    expect(mocks.hookCalls.at(-1)).toMatchObject({ filterTopicIds: ['topic-1'] });
    expect(mocks.facetHookCalls.at(-1)).toMatchObject({ selectedTopicIds: ['topic-1'] });
  });

  it('keeps active filters visible and clearable after a terminal facet error', () => {
    const view = render(<ClaimRecordTab {...common} kind="claims" />);

    act(() =>
      (mocks.filterProps?.dimensions as Array<Record<string, any>>)
        .find(dimension => dimension.key === 'topics')
        ?.onToggle('topic-1')
    );
    mocks.facetError = true;
    view.rerender(<ClaimRecordTab {...common} kind="claims" />);

    const dimensions = mocks.filterProps?.dimensions as Array<Record<string, any>>;
    expect(dimensions.map(dimension => dimension.key)).toEqual(['spaces', 'topics']);
    expect(dimensions.find(dimension => dimension.key === 'spaces')?.values).toEqual(['space-1']);
    expect(dimensions.find(dimension => dimension.key === 'topics')?.values).toEqual(['topic-1']);

    act(() => dimensions.find(dimension => dimension.key === 'topics')?.onClear());
    expect(mocks.hookCalls.at(-1)).toMatchObject({ filterTopicIds: [] });
  });

  it('resets sort and filters before rendering a different claim or space', () => {
    const view = render(<ClaimRecordTab {...common} kind="claims" />);

    act(() => mocks.filterProps?.sort.onChange('top'));
    act(() =>
      (mocks.filterProps?.dimensions as Array<Record<string, any>>)
        .find(dimension => dimension.key === 'topics')
        ?.onToggle('topic-1')
    );

    view.rerender(
      <ClaimRecordTab
        {...common}
        kind="claims"
        claimId="claim-2"
        spaceId="space-2"
        availableSpaceIds={['space-2']}
      />
    );

    expect(mocks.hookCalls.at(-1)).toMatchObject({
      claimId: 'claim-2',
      claimSort: 'best',
      spaceIds: ['space-2'],
      filterTopicIds: [],
    });
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
    expect(mocks.filterProps?.dimensions[0].options).toEqual([
      { value: 'space-1', label: 'Relationships', count: 4, pending: false },
      { value: 'space-2', label: 'Technology', count: 1, pending: false },
    ]);
    expect(mocks.hookCalls.at(-1)).toMatchObject({
      debateSort: 'best',
      spaceIds: ['space-1'],
      claimsEnabled: false,
      debatesEnabled: true,
      countsEnabled: false,
    });
  });
});
