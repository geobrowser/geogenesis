import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  votes: [] as Array<{ list_id?: string; item_position?: number; page_type?: string }>,
}));
vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({ useTopicClaimsSummary: () => mocks.summary }));
// The row's line reads the shared count cache, as the real hook does once its batch has answered.
vi.mock('~/core/claims/browse/claim-response-summary', async () => {
  const { useQuery } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  const { entityResponseCountsQueryKey: key } = await vi.importActual<
    typeof import('~/core/responses/entity-response')
  >('~/core/responses/entity-response');
  return {
    CLAIM_RESPONSE_OBJECT_TYPE: 0,
    useClaimResponseSummary: (entityId: string, spaceId: string) => {
      const { data } = useQuery<{ positive: number; negative: number }>({
        queryKey: key(entityId, spaceId, 0, 'stance'),
        enabled: false,
      });
      return { hasCounts: !!data, isLoading: false, positive: data?.positive ?? 0, negative: data?.negative ?? 0 };
    },
  };
});
// A vote: records its scope, then the read-back lands in the count cache.
vi.mock('~/partials/entity-page/entity-vote-buttons', async () => {
  const { useQueryClient } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  const { useActionContext } = await vi.importActual<typeof import('~/core/action-context-provider')>(
    '~/core/action-context-provider'
  );
  const { entityResponseCountsQueryKey: key } = await vi.importActual<
    typeof import('~/core/responses/entity-response')
  >('~/core/responses/entity-response');
  return {
    EntityVoteButtons: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => {
      const client = useQueryClient();
      const getContext = useActionContext('entity_vote_buttons', 'claim', entityId);
      return (
        <button
          type="button"
          aria-label="Agree"
          onClick={() => {
            mocks.votes.push(getContext());
            client.setQueryData(
              key(entityId, spaceId, 0, 'stance'),
              (old?: { positive: number; negative: number }) => ({
                positive: (old?.positive ?? 0) + 1,
                negative: old?.negative ?? 0,
              })
            );
          }}
        />
      );
    },
  };
});
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
const filter = { kinds: [], spaceSource: 'topic' } as unknown as GraphFilter;
const idle = {
  isLoading: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
};

let client = new QueryClient();
function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const seed = (n: number, spaceId: string, positive: number, negative: number) =>
  client.setQueryData(entityResponseCountsQueryKey(id(n), spaceId, 0, 'stance'), { positive, negative });
const rows = (region: HTMLElement) =>
  within(region)
    .getAllByRole('listitem')
    .map(item => item.textContent);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.replaceState({}, '', `/explore/graph/${id(1)}?topic=${id(1)}`);
});

afterEach(() => {
  cleanup();
  mocks.summary = { isLoading: false, isError: false, data: undefined };
  mocks.batches.length = 0;
  mocks.votes.length = 0;
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

  it('lists fights and settled claims with 3+ votes, voting in place and re-centring on the title', async () => {
    mocks.summary.data = {
      claims: [
        { id: id(2), name: 'A fight', spaceId: 's', positive: 30, negative: 25, band: 'contested' },
        { id: id(3), name: 'Settled', spaceId: 's', positive: 9, negative: 1, band: 'agreed' },
        { id: id(4), name: 'Too few', spaceId: 's', positive: 1, negative: 1, band: 'contested' },
      ],
      truncated: false,
    };
    seed(2, 's', 30, 25);
    seed(3, 's', 9, 1);
    const onOpen = overview();
    const fights = screen.getByRole('region', { name: 'The biggest fights' });
    expect(rows(fights)).toEqual(['A fight55% agree · 55 votes']);
    expect(within(screen.getByRole('region', { name: 'Widely agreed, most votes' })).getByText('Settled')).toBeTruthy();
    fireEvent.click(within(fights).getByRole('button', { name: 'A fight' }));
    expect(onOpen).toHaveBeenCalledWith(id(2), 'A fight');

    // Voting from the list: no re-centre, its own list scope, and the row updates.
    fireEvent.click(within(fights).getByRole('button', { name: 'Agree' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(mocks.votes).toEqual([
      expect.objectContaining({ list_id: 'graph_explorer_fights', item_position: 1, page_type: 'graph_explorer' }),
    ]);
    await waitFor(() => expect(rows(fights)).toEqual(['A fight55% agree · 56 votes']));
  });

  it('says once that nothing has enough votes, and shows nothing for a topic without responses', () => {
    mocks.summary.data = {
      claims: [{ id: id(4), name: 'Too few', spaceId: 's', positive: 1, negative: 1, band: 'contested' }],
      truncated: false,
    };
    overview();
    expect(screen.getByText(/No claim here has 3 or more votes yet/)).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    cleanup();

    mocks.summary.data = { claims: [], truncated: false };
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
        centre={{ kind: 'topic', typeNames: ['Topic'] }}
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
    // The button is gone, so focus lands on the first row it revealed.
    expect(document.activeElement).toBe(within(region).getByRole('button', { name: /Node 16/ }));
  });

  it('leaves out labels that repeat the group, and keeps the ones that add something', () => {
    const row = (n: number, kind: NeighbourGroup['kind'], labels: string[], extra: Partial<GraphNode>) => ({
      spoke: { entity: node(n, kind, extra), labels, edgeSpaceIds: [], nodeSpaceId: null, hasOutgoing: true },
      node: node(n, kind, extra),
    });
    const topicType = { id: NEIGHBOUR_KIND_TYPE_IDS.topic[0], name: 'Topic' };
    const storyType = { id: NEWS_STORY_TYPE_ID, name: 'News story' };
    groups({
      groups: [
        {
          kind: 'story',
          spokes: [
            row(20, 'story', ['Story', 'On this topic'], {
              name: 'Ceasefire talks',
              types: [storyType],
              date: '2026-11-03',
            }),
          ],
        },
        { kind: 'topic', spokes: [row(21, 'topic', ['Topic'], { name: 'Civilian casualties', types: [topicType] })] },
        {
          kind: 'ent',
          spokes: [
            row(23, 'ent', ['Related entity'], {
              name: 'International Court of Justice',
              types: [{ id: NEIGHBOUR_KIND_TYPE_IDS.organisation[0], name: 'Organization' }],
            }),
          ],
        },
        {
          kind: 'other',
          spokes: [row(22, 'other', ['Mentions'], { name: 'A memo', types: [{ id: 'x', name: 'Memo' }] })],
        },
      ],
    });
    expect(rows(screen.getByRole('region', { name: 'Topics · 1' }))).toEqual(['Civilian casualties']);
    expect(rows(screen.getByRole('region', { name: 'News · 1' }))).toEqual(['Ceasefire talksNov 3, 2026']);
    expect(rows(screen.getByRole('region', { name: 'People and groups · 1' }))).toEqual([
      'International Court of JusticeOrganization',
    ]);
    expect(rows(screen.getByRole('region', { name: 'Other · 1' }))).toEqual(['MentionsA memoMemo']);
  });

  it('moves focus to the first revealed claim after Show all and Show more claims', async () => {
    const claims: PanelClaim[] = Array.from({ length: 7 }, (_, i) => ({
      id: id(i + 1),
      name: `C${i + 1}`,
      spaceId: 'a',
    }));
    claims.forEach((_, i) => seed(i + 1, 'a', 10 - i, 0));
    const fetchNextPage = vi.fn();
    const view = (list: PanelClaim[]) => (
      <QueryClientProvider client={client}>
        <NeighbourGroups
          groups={[]}
          centre={{ kind: 'topic', typeNames: ['Topic'] }}
          claims={list}
          claimsState={{ ...idle, hasNextPage: true, fetchNextPage }}
          moreKinds={[]}
          emptyMessage="No relationships."
          claimsEmptyMessage="No claims."
          onOpen={vi.fn()}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view(claims));
    const region = () => screen.getByRole('region', { name: /^Claims/ });
    await waitFor(() => expect(rows(region())[0]).toContain('C1'));
    fireEvent.click(within(region()).getByRole('button', { name: 'Show all 7' }));
    expect(document.activeElement).toBe(within(region()).getByRole('button', { name: 'C7' }));

    fireEvent.click(within(region()).getByRole('button', { name: 'Show more claims' }));
    expect(fetchNextPage).toHaveBeenCalled();
    seed(8, 'a', 50, 0);
    rerender(view([...claims, { id: id(8), name: 'C8', spaceId: 'a' }]));
    await waitFor(() => expect(document.activeElement).toBe(within(region()).getByRole('button', { name: 'C8' })));
  });

  it('sorts claims by votes in their own spaces, with a band bar, one batch per space and votes in place', async () => {
    const claims: PanelClaim[] = [
      { id: id(1), name: 'Few', spaceId: 'a' },
      { id: id(2), name: 'Many', spaceId: 'b', relations: ['Claim', 'Supports'] },
      { id: id(3), name: 'Some', spaceId: 'a' },
    ];
    seed(1, 'a', 1, 0);
    seed(2, 'b', 40, 2);
    seed(3, 'a', 2, 3);
    const onOpen = vi.fn();
    groups({ claims, onOpen });
    const region = screen.getByRole('region', { name: 'Claims · 3' });
    await waitFor(() =>
      expect(rows(region)).toEqual(['SupportsMany95% agree · 42 votes', 'Some40% agree · 5 votes', 'Few1 vote'])
    );
    expect(region.textContent).toContain('Of 2 with 3+ votes: 1 widely agreed, 1 contested');
    expect(new Set(mocks.batches)).toEqual(new Set(['a', 'b']));

    // A vote from the third row: scoped to the list at its position, updates the row, and stays put.
    fireEvent.click(within(within(region).getAllByRole('listitem')[2]).getByRole('button', { name: 'Agree' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(mocks.votes).toEqual([
      expect.objectContaining({ list_id: 'graph_explorer_claims', item_position: 3, page_type: 'graph_explorer' }),
    ]);
    await waitFor(() => expect(rows(region)[2]).toBe('Few2 votes'));
    fireEvent.click(within(region).getByRole('button', { name: 'Few' }));
    expect(onOpen).toHaveBeenCalledWith(id(1), 'Few');
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
