import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphHop } from '~/core/graph-explorer/graph-entity';
import { startGraphHistory } from '~/core/graph-explorer/history';
import {
  CLAIM_TYPE_ID,
  NEIGHBOUR_KIND_TYPE_IDS,
  RELATED_PEOPLE_PROPERTY_ID,
  TOPIC_TYPE_ID,
} from '~/core/graph-explorer/ontology';

import { GraphViewer } from './graph-viewer';

const TOPIC = '11111111111111111111111111111111';
const PERSON = '22222222222222222222222222222222';
const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const hops: Record<string, GraphHop> = {
  [TOPIC]: {
    centre: {
      texts: [{ propertyId: '9b1f76ff9711404c861e59dc3fa7d037', spaceId: SPACE, text: 'A topic.' }],
      id: TOPIC,
      name: 'Israel-Gaza war',
      description: 'A topic.',
      spaceIds: [SPACE],
      namedSpaceIds: [SPACE],
      types: [{ id: TOPIC_TYPE_ID, name: 'Topic' }],
      image: null,
    },
    relations: [
      {
        id: 'r1',
        direction: 'out',
        propertyId: RELATED_PEOPLE_PROPERTY_ID,
        propertyName: 'Related people',
        spaceId: SPACE,
        position: null,
        entity: {
          id: PERSON,
          name: 'Isaac Herzog',
          spaceIds: [SPACE],
          namedSpaceIds: [SPACE],
          types: [{ id: NEIGHBOUR_KIND_TYPE_IDS.person[0], name: 'Person' }],
          image: null,
        },
      },
    ],
  },
  [PERSON]: {
    centre: {
      texts: [],
      id: PERSON,
      name: 'Isaac Herzog',
      description: null,
      spaceIds: [SPACE],
      namedSpaceIds: [SPACE],
      types: [{ id: NEIGHBOUR_KIND_TYPE_IDS.person[0], name: 'Person' }],
      image: null,
    },
    relations: [],
  },
};

const hooks = vi.hoisted(() => ({
  hopFor: vi.fn(),
  useClaimsAbout: vi.fn(),
  prefetch: vi.fn(),
  useGraphNeighbourhood: vi.fn(),
}));

const EMPTY_SUMMARY = { claims: [], bands: { agreed: 0, contested: 0, rejected: 0 }, truncated: false };
const topicSummary = vi.hoisted(() => ({ data: null as unknown }));

vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({
  useClaimsAbout: hooks.useClaimsAbout,
  usePrefetchHop1: () => hooks.prefetch,
  useGraphNeighbourhood: hooks.useGraphNeighbourhood,
  useTopicClaimsSummary: () => ({ isLoading: false, isError: false, data: topicSummary.data }),
}));
vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));
vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => false }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  ClaimResponseBatchBoundary: ({ children }: { children: React.ReactNode }) => children,
  useClaimResponseSummaryBatch: () => ({ isSuccess: true, isPlaceholderData: false, isError: false }),
}));
vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  CLAIM_RESPONSE_OBJECT_TYPE: 0,
  useClaimResponseSummary: () => ({ isLoading: false, hasCounts: false, positive: 0, negative: 0 }),
}));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({ EntityVoteButtons: () => <div /> }));
vi.mock('~/core/utils/space/space-ranking', () => ({
  getTopRankedSpaceId: (ids: string[]) => ids[0] ?? null,
}));

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  // jsdom has no layout; give the canvas a size so nodes render.
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width: 800, height: 500 } } as ResizeObserverEntry], this as never);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

/** Hop 1 and the 3D view's selection, built from the hop fixtures. */
function neighbourhood({ centreId, filter }: { centreId: string; filter: unknown }) {
  const hop: GraphHop | undefined = hooks.hopFor(centreId);
  if (!filter || !hop)
    return { selection: null, kinds: [], hop1: { isError: false }, centre: null, isSwitching: false };
  if (!hop.centre)
    return {
      selection: null,
      kinds: [],
      hop1: { isError: false, data: { centre: null, neighbours: [], moreKinds: [] } },
      centre: null,
      isSwitching: false,
    };
  const centreKind = hop.centre.types.some(type => type.id === CLAIM_TYPE_ID)
    ? 'claim'
    : centreId === TOPIC
      ? 'topic'
      : 'ent';
  const node = (entity: GraphHop['relations'][number]['entity'], kind: 'topic' | 'ent') => ({
    ...entity,
    kind,
    typeRank: 0,
    placedSpaceIds: [],
    date: null,
    agrees: 0,
    disagrees: 0,
  });
  const centre = {
    ...node(hop.centre, 'ent'),
    kind: centreKind,
    description: hop.centre.description,
    texts: hop.centre.texts,
  };
  const nodes = [
    { node: centre, hop: 0, parentId: null },
    ...hop.relations.map(relation => ({ node: node(relation.entity, 'ent'), hop: 1, parentId: centreId })),
  ];
  const links = hop.relations.map(relation => ({
    hop: 1,
    edge: {
      id: relation.id,
      fromId: relation.direction === 'out' ? centreId : relation.entity.id,
      toId: relation.direction === 'out' ? relation.entity.id : centreId,
      propertyId: relation.propertyId,
      propertyName: relation.propertyName,
      spaceId: relation.spaceId,
    },
  }));
  return {
    selection: { nodes, links },
    kinds: ['ent'],
    hop1: {
      isError: false,
      data: {
        centre,
        neighbours: links.map((link, i) => ({ node: nodes[i + 1].node, edge: link.edge })),
        moreKinds: [],
      },
    },
    centre,
    isSwitching: false,
  };
}

beforeEach(() => {
  topicSummary.data = EMPTY_SUMMARY;
  hooks.useGraphNeighbourhood.mockImplementation(neighbourhood);
  hooks.hopFor.mockImplementation((id: string) => hops[id]);
  hooks.useClaimsAbout.mockReturnValue({
    data: { pages: [{ claims: [], endCursor: null, hasNextPage: false }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The viewer is controlled; this keeps its history the way the page's URL would. */
function Viewer({
  start,
  ...props
}: Omit<React.ComponentProps<typeof GraphViewer>, 'history' | 'onNavigate'> & { start: string }) {
  const [history, setHistory] = React.useState(() => startGraphHistory(start));
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <GraphViewer {...props} history={history} onNavigate={setHistory} />
    </QueryClientProvider>
  );
}

const scope = { spaceIds: [SPACE], topicId: null, topicSpaceId: null } as const;

describe('GraphViewer', () => {
  it('waits for the scope before asking for anything', () => {
    render(<Viewer start={TOPIC} scope={null} />);
    expect(hooks.useGraphNeighbourhood).toHaveBeenCalledWith(
      expect.objectContaining({ centreId: TOPIC, filter: null })
    );
    expect(screen.queryByText('Isaac Herzog')).toBeNull();
  });

  it('draws the centre and its neighbours as buttons', () => {
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(screen.getByRole('button', { name: 'Isaac Herzog' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Israel-Gaza war', current: true })).toBeTruthy();
  });

  it('re-centres on a clicked node, offers Back, and says plainly when a node has no relations', () => {
    render(<Viewer start={TOPIC} scope={scope} />);
    fireEvent.click(screen.getByRole('button', { name: 'Isaac Herzog' }));

    expect(hooks.useGraphNeighbourhood).toHaveBeenLastCalledWith(expect.objectContaining({ centreId: PERSON }));
    expect(
      screen.getAllByText('No relationships of the shown types in this topic’s spaces yet.').length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Israel-Gaza war' }));
    expect(hooks.useGraphNeighbourhood).toHaveBeenLastCalledWith(expect.objectContaining({ centreId: TOPIC }));
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
  });

  it('shows the description, and says honestly that there are no claims', () => {
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(screen.getByText('A topic.')).toBeTruthy();
    expect(screen.getByText('No claims in this topic’s spaces are linked to this yet.')).toBeTruthy();
  });

  it('lists claims about the centre', () => {
    hooks.useClaimsAbout.mockReturnValue({
      data: {
        pages: [
          {
            claims: [{ id: 'c'.repeat(32), name: 'Hamas must disarm', spaceId: SPACE }],
            endCursor: 'x',
            hasNextPage: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(screen.getByRole('heading', { name: 'Claims · 1+' })).toBeTruthy();
    expect(screen.getByText('Hamas must disarm')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show more claims' })).toBeTruthy();
  });

  it('draws a skeleton graph while nothing is loaded, with nothing in it to focus', () => {
    hooks.hopFor.mockReturnValue(undefined);
    render(<Viewer start={TOPIC} scope={scope} />);
    const stage = screen.getByTestId('connections-stage');
    expect(stage.getAttribute('aria-busy')).toBe('true');
    expect(stage.textContent).toContain('Loading connections');
    const placeholders = stage.querySelectorAll('[data-skeleton-node]');
    expect(placeholders.length).toBeGreaterThan(10);
    for (const node of placeholders) {
      expect(node.getAttribute('aria-hidden')).toBe('true');
      expect(node.matches('button, a, [tabindex]')).toBe(false);
      expect(node.querySelector('button, a, [tabindex]')).toBeNull();
    }
    expect(stage.querySelectorAll('button[data-node-id]')).toHaveLength(0);
  });

  it('shows the error, not a skeleton, when the connections fail to load', () => {
    hooks.useGraphNeighbourhood.mockImplementation(() => ({
      selection: null,
      kinds: [],
      hop1: { isError: true, refetch: vi.fn() },
      centre: null,
      isSwitching: false,
    }));
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(screen.getByText(/Couldn’t load the connections/)).toBeTruthy();
    expect(screen.queryByTestId('connections-stage')).toBeNull();
    expect(document.querySelector('[data-skeleton-node]')).toBeNull();
  });

  it('says so when the entity is not in the graph', () => {
    hooks.hopFor.mockReturnValue({ centre: null, relations: [] });
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(screen.getAllByText('This entity isn’t in the knowledge graph.').length).toBeGreaterThan(0);
  });

  it('names the topic when no claims about a re-centred entity carry it', () => {
    render(
      <Viewer
        start={TOPIC}
        scope={{ spaceIds: [SPACE], topicId: TOPIC, topicSpaceId: null }}
        topicName="Israel-Gaza war"
      />
    );
    expect(screen.getByText('No claims about this in Israel-Gaza war yet.')).toBeTruthy();
  });

  it('keeps the topic lens when the topic has no space scope', () => {
    render(
      <Viewer
        start={TOPIC}
        scope={{ spaceIds: null, topicId: TOPIC, topicSpaceId: null }}
        topicName="Israel-Gaza war"
      />
    );
    expect(hooks.useClaimsAbout).toHaveBeenLastCalledWith(
      TOPIC,
      expect.objectContaining({ topicLensId: TOPIC, spaceSource: 'all' }),
      null
    );
    expect(screen.getByText('No claims about this in Israel-Gaza war yet.')).toBeTruthy();
  });

  it('reads the topic’s text in the space its topic page uses, and a node’s where it is named', () => {
    const OTHER_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const NAME = 'a126ca530c8e48d5b88882c734c38935';
    const DESCRIPTION = '9b1f76ff9711404c861e59dc3fa7d037';
    hooks.hopFor.mockImplementation((id: string) => {
      const hop = hops[id];
      const texts =
        id === TOPIC
          ? [
              { propertyId: DESCRIPTION, spaceId: SPACE, text: 'As World affairs describes it.' },
              { propertyId: DESCRIPTION, spaceId: OTHER_SPACE, text: 'As another space describes it.' },
            ]
          : [
              { propertyId: NAME, spaceId: SPACE, text: 'Isaac Herzog' },
              { propertyId: DESCRIPTION, spaceId: SPACE, text: 'President of Israel.' },
            ];
      return { ...hop, centre: { ...hop.centre!, spaceIds: [OTHER_SPACE, SPACE], texts } };
    });
    // The topic is named only in SPACE, so only `topicSpaceId` can send it to OTHER_SPACE.
    render(<Viewer start={TOPIC} scope={{ ...scope, topicId: TOPIC, topicSpaceId: OTHER_SPACE }} />);
    expect(screen.getByText('As another space describes it.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Isaac Herzog' }));
    expect(screen.getByText('President of Israel.')).toBeTruthy();
  });

  it('lists the relations the map draws, news included, once the neighbourhood answers', () => {
    const STORY = '33333333333333333333333333333333';
    const base = neighbourhood({ centreId: TOPIC, filter: {} });
    const story = {
      ...base.selection!.nodes[1].node,
      id: STORY,
      name: 'A news story',
      kind: 'story',
      types: [{ id: 'cccccccccccccccccccccccccccccccc', name: 'News story' }],
    };
    const edge = { id: 'e2', fromId: STORY, toId: TOPIC, propertyId: 'p', propertyName: 'Topics', spaceId: SPACE };
    hooks.useGraphNeighbourhood.mockReturnValue({
      ...base,
      hop1: {
        isError: false,
        data: {
          centre: base.selection!.nodes[0].node,
          neighbours: [
            ...base.selection!.links.map((link, i) => ({ node: base.selection!.nodes[i + 1].node, edge: link.edge })),
            { node: story, edge },
          ],
          moreKinds: [],
        },
      },
      centre: base.selection!.nodes[0].node,
    });
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(screen.getByRole('heading', { name: 'News · 1' })).toBeTruthy();
    expect(screen.getAllByText('A news story').length).toBeGreaterThan(0);
  });

  it('says a cut-short topic summary is a lower bound', () => {
    topicSummary.data = {
      claims: [{ id: 'c', name: 'A claim', spaceId: 's', positive: 3, negative: 0, band: 'agreed' }],
      bands: { agreed: 1, contested: 0, rejected: 0 },
      truncated: true,
    };
    render(<Viewer start={TOPIC} scope={{ ...scope, topicId: TOPIC, topicSpaceId: SPACE }} />);
    expect(
      screen.getByText(
        'At least 1 claim about this topic has responses so far; only its first 2,000 claims were counted.'
      )
    ).toBeTruthy();
  });

  it('says how far it counted when none of the counted claims have responses', () => {
    topicSummary.data = { ...EMPTY_SUMMARY, truncated: true };
    render(<Viewer start={TOPIC} scope={{ ...scope, topicId: TOPIC, topicSpaceId: SPACE }} />);
    expect(screen.getByText('None of the first 2,000 claims about this topic have responses yet.')).toBeTruthy();
    expect(screen.queryByText(/No claims about this topic/)).toBeNull();
  });

  it('lists no claims about a centre that is itself a claim', () => {
    hooks.hopFor.mockImplementation(() => ({
      ...hops[TOPIC],
      centre: { ...hops[TOPIC].centre!, types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }] },
    }));
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(screen.getByText('A topic.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^Claims/ })).toBeNull();
    expect(screen.queryByText(/No claims/)).toBeNull();
  });
});
