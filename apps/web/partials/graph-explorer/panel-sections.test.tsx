import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NEWS_STORY_TYPE_ID } from '~/core/constants';
import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphFilter } from '~/core/graph-explorer/graph-filter';
import { NEIGHBOUR_KIND_TYPE_IDS } from '~/core/graph-explorer/ontology';
import type { NeighbourGroup } from '~/core/graph-explorer/panel-sections';
import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';

import { NeighbourGroups, type PanelClaim, TopicOverview } from './panel-sections';

const mocks = vi.hoisted(() => ({
  summary: { isLoading: false, isError: false, data: undefined as unknown },
  batches: [] as string[],
}));
vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({ useTopicClaimsSummary: () => mocks.summary }));
vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  ClaimResponseBatchBoundary: ({ children }: { children: React.ReactNode }) => children,
  useClaimResponseSummaryBatch: ({ spaceId }: { spaceId: string }) => {
    mocks.batches.push(spaceId);
    return { isSuccess: true, isPlaceholderData: false, isError: false };
  },
}));

const id = (n: number) => String(n).padStart(32, '0');
const node = (n: number, kind: GraphNode['kind'], extra: Partial<GraphNode> = {}): GraphNode => ({
  id: id(n),
  name: `Node ${n}`,
  spaceIds: [],
  namedSpaceIds: [],
  placedSpaceIds: [],
  types: [
    kind === 'ent'
      ? { id: NEIGHBOUR_KIND_TYPE_IDS.person[0], name: 'Person' }
      : { id: NEWS_STORY_TYPE_ID, name: 'News story' },
  ],
  image: null,
  kind,
  typeRank: 0,
  date: null,
  agrees: 0,
  disagrees: 0,
  ...extra,
});
const filter = {} as GraphFilter;
const idle = {
  isLoading: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
};

let client: QueryClient;
function wrap(ui: React.ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  mocks.summary = { isLoading: false, isError: false, data: undefined };
  mocks.batches.length = 0;
});

describe('TopicOverview', () => {
  const overview = (props: Partial<React.ComponentProps<typeof TopicOverview>> = {}) => {
    const onOpen = vi.fn();
    wrap(
      <TopicOverview
        topicId={id(1)}
        filter={filter}
        topicSpaceId={null}
        selection={null}
        nodes={[]}
        onOpen={onOpen}
        {...props}
      />
    );
    return onOpen;
  };

  it('lists fights and settled claims with 3+ votes, re-centring on click', () => {
    mocks.summary.data = {
      claims: [
        { id: id(2), name: 'A fight', positive: 30, negative: 25, band: 'contested' },
        { id: id(3), name: 'Settled', positive: 9, negative: 1, band: 'agreed' },
        { id: id(4), name: 'Too few', positive: 1, negative: 1, band: 'contested' },
      ],
      bands: { agreed: 1, contested: 2, rejected: 0 },
      truncated: false,
    };
    const onOpen = overview();
    const fights = screen.getByRole('region', { name: 'The biggest fights' });
    expect(
      within(fights)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['A fight55% agree · 55 votes']);
    expect(within(screen.getByRole('region', { name: 'Widely agreed, most votes' })).getByText('Settled')).toBeTruthy();
    fireEvent.click(within(fights).getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(id(2), 'A fight');
  });

  it('says once that nothing has enough votes, and shows nothing for a topic without responses', () => {
    mocks.summary.data = {
      claims: [{ id: id(4), name: 'Too few', positive: 1, negative: 1, band: 'contested' }],
      bands: { agreed: 0, contested: 1, rejected: 0 },
      truncated: false,
    };
    overview();
    expect(screen.getByText(/No claim here has 3 or more votes yet/)).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    cleanup();

    mocks.summary.data = { claims: [], bands: { agreed: 0, contested: 0, rejected: 0 }, truncated: false };
    overview();
    expect(screen.queryByText(/No claim here/)).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows the most-linked people and only dated news', () => {
    overview({
      selection: {
        nodes: [node(1, 'topic'), node(2, 'ent')].map(entry => ({ node: entry, hop: 1 as const, parentId: null })),
        links: [
          {
            edge: { id: 'e', fromId: id(1), toId: id(2), propertyId: 'p', propertyName: null, spaceId: 's' },
            hop: 1,
          },
        ],
      },
      nodes: [node(5, 'story', { date: '2025-06-01T00:00:00Z' }), node(6, 'story')],
    });
    expect(screen.getByRole('region', { name: 'People and groups' }).textContent).toContain('Person · 1 link');
    const news = screen.getByRole('region', { name: 'Latest news' });
    expect(
      within(news)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['Node 5News story · Jun 1, 2025']);
  });
});

describe('NeighbourGroups', () => {
  const spokeGroup = (kind: NeighbourGroup['kind'], count: number, start = 10): NeighbourGroup => ({
    kind,
    spokes: Array.from({ length: count }, (_, i) => ({
      spoke: {
        entity: node(start + i, kind),
        labels: ['Mentioned in'],
        edgeSpaceIds: [],
        nodeSpaceId: null,
        hasOutgoing: false,
      },
      node: node(start + i, kind),
    })),
  });
  const groups = (props: Partial<React.ComponentProps<typeof NeighbourGroups>>) =>
    wrap(
      <NeighbourGroups
        groups={[]}
        claims={[]}
        claimsState={idle}
        moreKinds={[]}
        emptyMessage="No relationships."
        claimsEmptyMessage="No claims."
        onOpen={vi.fn()}
        {...props}
      />
    );

  it('shows six rows of a kind, then all of them on request, with the relation label', () => {
    groups({ groups: [spokeGroup('ent', 8)], moreKinds: ['ent'] });
    const region = screen.getByRole('region', { name: 'People and groups · 8+' });
    expect(within(region).getAllByRole('button')).toHaveLength(7);
    expect(region.textContent).toContain('Mentioned in');
    expect(region.textContent).toContain('Person');
    fireEvent.click(within(region).getByRole('button', { name: 'Show all 8' }));
    expect(within(region).getAllByRole('button')).toHaveLength(8);
  });

  it('sorts claims by votes in their own spaces, with one band bar, one batch per space', async () => {
    const claims: PanelClaim[] = [
      { id: id(1), name: 'Few', spaceId: 'a' },
      { id: id(2), name: 'Many', spaceId: 'b', relation: 'Supports' },
      { id: id(3), name: 'Some', spaceId: 'a' },
    ];
    groups({ claims });
    const counts = (n: number, spaceId: string, positive: number, negative: number) =>
      React.act(() =>
        client.setQueryData(entityResponseCountsQueryKey(id(n), spaceId, 0, 'stance'), { positive, negative })
      );
    counts(1, 'a', 1, 0);
    counts(2, 'b', 40, 2);
    counts(3, 'a', 2, 3);
    const region = screen.getByRole('region', { name: 'Claims · 3' });
    await waitFor(() => expect(region.textContent).toContain('42 votes'));
    expect(
      within(region)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['SupportsMany95% agree · 42 votes', 'Some40% agree · 5 votes', 'Few1 vote']);
    expect(region.textContent).toContain('Of 2 with 3+ votes: 1 widely agreed, 1 contested');
    expect(new Set(mocks.batches)).toEqual(new Set(['a', 'b']));
  });

  it('keeps the honest empty states', () => {
    groups({});
    expect(screen.getByText('No relationships.')).toBeTruthy();
    expect(screen.getByText('No claims.')).toBeTruthy();
    cleanup();

    groups({ claimsEmptyMessage: null });
    expect(screen.getByText('No relationships.')).toBeTruthy();
    expect(screen.queryByText('No claims.')).toBeNull();
    cleanup();

    groups({ claims: [], claimsState: { ...idle, hasNextPage: true } });
    expect(screen.getByText('None of the claims loaded so far can be shown here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show more claims' })).toBeTruthy();
  });
});
