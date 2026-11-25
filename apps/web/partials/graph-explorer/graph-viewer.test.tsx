import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureSafely } from '~/core/analytics-capture-safely';
import type { GraphHop } from '~/core/graph-explorer/graph-entity';
import { GraphAnalyticsProvider, useGraphExplorerSession } from '~/core/graph-explorer/graph-explorer-analytics';
import * as share from '~/core/graph-explorer/graph-share';
import { type GraphHistory, recentre, startGraphHistory } from '~/core/graph-explorer/history';
import {
  CLAIM_TYPE_ID,
  NEIGHBOUR_KIND_TYPE_IDS,
  RELATED_PEOPLE_PROPERTY_ID,
  TOPIC_TYPE_ID,
} from '~/core/graph-explorer/ontology';
import { NavUtils } from '~/core/utils/utils';

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

const EMPTY_SUMMARY = { claims: [], truncated: false };
const topicSummary = vi.hoisted(() => ({ data: null as unknown }));

vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({
  useClaimsAbout: hooks.useClaimsAbout,
  usePrefetchHop1: () => hooks.prefetch,
  useGraphNeighbourhood: hooks.useGraphNeighbourhood,
  useTopicClaimsSummary: () => ({ isLoading: false, isError: false, data: topicSummary.data }),
}));
vi.mock('~/core/analytics-capture-safely', () => ({ captureSafely: vi.fn() }));
vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));
// The open claim's Agree/Disagree has its own suite.
vi.mock('./connections/graph-claim-position', () => ({ GraphClaimPosition: () => null }));
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
vi.mock('~/core/graph-explorer/graph-share', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/graph-explorer/graph-share')>()),
  shareGraph: vi.fn(async () => 'copied'),
}));
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
      truncated: true,
    };
    render(<Viewer start={TOPIC} scope={{ ...scope, topicId: TOPIC, topicSpaceId: SPACE }} />);
    expect(
      screen.getByText('At least 1 claim with 3+ responses; only its first 2,000 claims were counted.')
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

  // The title is the way to the centre's page: a claim's in the space its vote is in, anything
  // else's where its text was read. They differ when the scope picks a space other than the claim's home.
  it('links a claim’s title to the claim’s own space and a person’s to the space it was read in', () => {
    const OTHER_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    hooks.hopFor.mockImplementation((id: string) =>
      id === TOPIC
        ? {
            ...hops[TOPIC],
            centre: {
              ...hops[TOPIC].centre!,
              types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
              spaceIds: [OTHER_SPACE, SPACE],
              namedSpaceIds: [OTHER_SPACE, SPACE],
            },
          }
        : hops[id]
    );
    const titleHref = () =>
      within(screen.getByRole('region', { name: /^About / }))
        .getByRole('heading', { level: 2 })
        .querySelector('a')
        ?.getAttribute('href');

    render(<Viewer start={TOPIC} scope={scope} />);
    expect(titleHref()).toBe(NavUtils.toEntity(OTHER_SPACE, TOPIC));

    cleanup();
    render(<Viewer start={PERSON} scope={scope} />);
    expect(titleHref()).toBe(NavUtils.toEntity(SPACE, PERSON));
  });

  // GEO-3841: a claim centre's vote block sits above its description, so the buttons are on screen.
  it('puts a claim centre’s vote block above its description', () => {
    hooks.hopFor.mockImplementation(() => ({
      ...hops[TOPIC],
      centre: { ...hops[TOPIC].centre!, types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }] },
    }));
    render(<Viewer start={TOPIC} scope={scope} />);
    const respond = screen.getByRole('region', { name: 'Respond' });
    expect(
      respond.compareDocumentPosition(screen.getByText('A topic.')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('GraphViewer under a kind chip', () => {
  const STORY = '33333333333333333333333333333333';
  const OTHER_TOPIC = '44444444444444444444444444444444';
  const CLAIM = '55555555555555555555555555555555';
  const topicScope = { ...scope, topicId: TOPIC, topicSpaceId: SPACE };

  /** The topic with a person, a dated story and another topic around it, and a claim about it. */
  function mixedNeighbourhood(moreKinds: string[] = []) {
    const base = neighbourhood({ centreId: TOPIC, filter: {} });
    const person = base.selection!.nodes[1].node;
    const story = {
      ...person,
      id: STORY,
      name: 'A news story',
      kind: 'story',
      date: '2026-11-01',
      types: [{ id: 'cccccccccccccccccccccccccccccccc', name: 'News story' }],
    };
    const topic = {
      ...person,
      id: OTHER_TOPIC,
      name: 'Gaza ceasefire',
      kind: 'topic',
      types: [{ id: TOPIC_TYPE_ID, name: 'Topic' }],
    };
    const edgeTo = (id: string, n: number) => ({
      id: `e${n}`,
      fromId: id,
      toId: TOPIC,
      propertyId: 'p',
      propertyName: 'Topics',
      spaceId: SPACE,
    });
    const neighbours = [
      { node: person, edge: base.selection!.links[0].edge },
      { node: story, edge: edgeTo(STORY, 2) },
      { node: topic, edge: edgeTo(OTHER_TOPIC, 3) },
    ];
    const centre = base.selection!.nodes[0].node;
    hooks.useGraphNeighbourhood.mockReturnValue({
      ...base,
      selection: {
        nodes: [base.selection!.nodes[0], ...neighbours.map(({ node }) => ({ node, hop: 1, parentId: TOPIC }))],
        links: neighbours.map(({ edge }) => ({ hop: 1, edge })),
      },
      kinds: ['topic', 'ent', 'story'],
      hop1: { isError: false, data: { centre, neighbours, moreKinds } },
      centre,
    });
    hooks.useClaimsAbout.mockReturnValue({
      data: { pages: [{ claims: [{ id: CLAIM, name: 'A claim about it', spaceId: SPACE }], endCursor: null }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
  }
  const chips = () => within(screen.getByRole('group', { name: 'Show' }));
  const heading = (name: string) => screen.queryByRole('heading', { name });

  it('shows only the chosen kind’s group in the panel, and every group again under Everything', () => {
    mixedNeighbourhood();
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(heading('Topics · 1')).toBeTruthy();

    fireEvent.click(chips().getByRole('button', { name: 'News' }));
    expect(heading('News · 1')).toBeTruthy();
    expect(heading('Topics · 1')).toBeNull();
    expect(heading('People and groups · 1')).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Claims/ })).toBeNull();
    expect(screen.queryByText(/No claims/)).toBeNull();

    fireEvent.click(chips().getByRole('button', { name: 'Everything' }));
    expect(heading('Topics · 1')).toBeTruthy();
    expect(heading('People and groups · 1')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^Claims/ })).toBeTruthy();
  });

  it('notes capped kinds only for the groups the chip leaves in the panel', () => {
    mixedNeighbourhood(['topic']);
    render(<Viewer start={TOPIC} scope={scope} />);
    expect(screen.queryByText(/Showing the first/)).toBeTruthy();
    fireEvent.click(chips().getByRole('button', { name: 'News' }));
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('keeps claims about the centre under Claims, and nothing else', () => {
    mixedNeighbourhood();
    // No claim is on this map, so there is no Claims chip: open it the way a shared link does.
    render(<Viewer start={TOPIC} scope={scope} overrides={{ chip: 'claim' }} />);
    expect(screen.getByText('A claim about it')).toBeTruthy();
    expect(heading('News · 1')).toBeNull();
    expect(heading('Topics · 1')).toBeNull();
  });

  it('hides the topic overview’s People and Latest news under a chip, keeping the centre', () => {
    mixedNeighbourhood();
    render(<Viewer start={TOPIC} scope={topicScope} />);
    expect(heading('People and groups')).toBeTruthy();
    expect(heading('Latest news')).toBeTruthy();

    fireEvent.click(chips().getByRole('button', { name: 'News' }));
    expect(heading('People and groups')).toBeNull();
    expect(heading('Latest news')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Israel-Gaza war' })).toBeTruthy();
  });

  it('opens a ?kinds= link on that chip', () => {
    mixedNeighbourhood();
    render(<Viewer start={TOPIC} scope={scope} overrides={{ chip: 'story' }} />);
    expect(chips().getByRole('button', { name: 'News' }).getAttribute('aria-pressed')).toBe('true');
    expect(heading('Topics · 1')).toBeNull();
  });

  it('shares the chip in view', () => {
    mixedNeighbourhood();
    render(<Viewer start={TOPIC} scope={topicScope} />);
    fireEvent.click(chips().getByRole('button', { name: 'News' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(share.shareGraph).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityId: TOPIC, topicId: TOPIC }),
      expect.anything(),
      { nativeShare: false, kindFilter: 'story' }
    );
  });

  it('gives way to Everything when recentring on a topic under a chip', () => {
    mixedNeighbourhood();
    render(<Viewer start={TOPIC} scope={scope} />);
    fireEvent.click(chips().getByRole('button', { name: 'News' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gaza ceasefire' }));
    expect(chips().getByRole('button', { name: 'Everything' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a shared chip pressed even with none of its kind around the centre', () => {
    mixedNeighbourhood();
    render(<Viewer start={TOPIC} scope={scope} overrides={{ chip: 'event' }} />);
    expect(chips().getByRole('button', { name: 'Events' }).getAttribute('aria-pressed')).toBe('true');
  });

  it.each([
    ['the most-responded claim', true],
    ['a widely agreed claim', false],
  ] as const)('gives way to Everything when opening %s from the topic summary under a chip', (_, inHeadline) => {
    mixedNeighbourhood();
    topicSummary.data = {
      claims: [{ id: CLAIM, name: 'A claim', spaceId: SPACE, positive: 3, negative: 0, band: 'agreed' }],
      truncated: false,
    };
    render(<Viewer start={TOPIC} scope={topicScope} />);
    fireEvent.click(chips().getByRole('button', { name: 'News' }));
    const headline = screen.getByRole('region', { name: 'How people responded' });
    const rows = screen.getAllByRole('button', { name: /A claim/ });
    expect(rows).toHaveLength(2);
    fireEvent.click(rows.find(row => headline.contains(row) === inHeadline)!);
    expect(chips().getByRole('button', { name: 'Everything' }).getAttribute('aria-pressed')).toBe('true');
  });

  // The map's node of the same kind keeps the chip too, so these open the row inside the panel.
  const panel = () => within(screen.getByRole('region', { name: 'About Israel-Gaza war' }));
  const recentredKinds = () =>
    vi
      .mocked(captureSafely)
      .mock.calls.filter(([event]) => event === 'graph_explorer_recentred')
      .map(([, props]) => (props as Record<string, unknown>).kind_filter);

  it('keeps the chip when opening a row of its kind from the panel, and reports the hop under it', () => {
    mixedNeighbourhood();
    const move: React.MutableRefObject<((next: GraphHistory) => void) | null> = { current: null };
    render(<TrackedViewer move={move} />);
    fireEvent.click(chips().getByRole('button', { name: 'News' }));
    fireEvent.click(panel().getByRole('button', { name: /A news story/ }));
    expect(chips().getByRole('button', { name: 'News' }).getAttribute('aria-pressed')).toBe('true');
    expect(recentredKinds()).toEqual(['story']);
  });

  it('reports the hop under Everything when a summary claim opened under a chip', () => {
    mixedNeighbourhood();
    topicSummary.data = {
      claims: [{ id: CLAIM, name: 'A claim', spaceId: SPACE, positive: 3, negative: 0, band: 'agreed' }],
      truncated: false,
    };
    const move: React.MutableRefObject<((next: GraphHistory) => void) | null> = { current: null };
    render(<TrackedViewer move={move} viewScope={topicScope} />);
    fireEvent.click(chips().getByRole('button', { name: 'News' }));
    fireEvent.click(
      within(screen.getByRole('region', { name: 'How people responded' })).getByRole('button', { name: /A claim/ })
    );
    expect(recentredKinds()).toEqual(['all']);
  });
});

/** The page's session around the viewer, with a way to move history as browser Back would. */
function TrackedViewer({
  move,
  viewScope = scope,
}: {
  move: React.MutableRefObject<((next: GraphHistory) => void) | null>;
  viewScope?: React.ComponentProps<typeof GraphViewer>['scope'];
}) {
  const [history, setHistory] = React.useState(() => startGraphHistory(TOPIC));
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const session = useGraphExplorerSession({ entityId: TOPIC, topicId: TOPIC, spaceId: null, trailDepth: 0 });
  move.current = setHistory;
  return (
    <QueryClientProvider client={client}>
      <GraphAnalyticsProvider value={session}>
        <GraphViewer scope={viewScope} history={history} onNavigate={setHistory} />
      </GraphAnalyticsProvider>
    </QueryClientProvider>
  );
}

describe('GraphViewer analytics', () => {
  const events = (name: string) =>
    vi
      .mocked(captureSafely)
      .mock.calls.filter(([event]) => event === name)
      .map(([, props]) => props as Record<string, unknown>);

  it('sends opened once when the first centre draws, then a recentred per hop with its method', () => {
    const move: React.MutableRefObject<((next: GraphHistory) => void) | null> = { current: null };
    const { unmount } = render(<TrackedViewer move={move} />);
    expect(events('graph_explorer_opened')).toEqual([
      expect.objectContaining({ entity_id: TOPIC, load_outcome: 'ready', layout: 'desktop', entity_kind: 'topic' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Isaac Herzog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Israel-Gaza war' }));
    // Browser Forward: the URL moves with nothing in the explorer tagging it.
    React.act(() => move.current!(recentre(startGraphHistory(TOPIC), PERSON)));

    expect(events('graph_explorer_recentred').map(props => [props.method, props.hop_index, props.entity_id])).toEqual([
      ['node', 1, PERSON],
      ['back', 2, TOPIC],
      ['history', 3, PERSON],
    ]);
    expect(events('graph_explorer_opened')).toHaveLength(1);

    unmount();
    expect(events('graph_explorer_left')).toEqual([
      expect.objectContaining({ exit: 'navigated', hops: 3, entity_id: PERSON }),
    ]);
  });

  it('opens a new session with entry history when the page is restored from the back/forward cache', () => {
    const move: React.MutableRefObject<((next: GraphHistory) => void) | null> = { current: null };
    render(<TrackedViewer move={move} />);
    window.dispatchEvent(new Event('pagehide'));
    const show = new Event('pageshow');
    Object.defineProperty(show, 'persisted', { value: true });
    React.act(() => {
      window.dispatchEvent(show);
    });
    const opened = events('graph_explorer_opened');
    expect(opened).toHaveLength(2);
    expect(opened[1]).toEqual(expect.objectContaining({ entry: 'history', load_outcome: 'ready', entity_id: TOPIC }));
    expect(opened[1].graph_session_id).not.toBe(opened[0].graph_session_id);
    expect(events('graph_explorer_left').map(props => props.exit)).toEqual(['page_hidden']);
  });

  it('reports a kind filter change, not a repeat', () => {
    const move: React.MutableRefObject<((next: GraphHistory) => void) | null> = { current: null };
    render(<TrackedViewer move={move} />);
    const chips = within(screen.getByRole('group', { name: 'Show' }));
    fireEvent.click(chips.getByRole('button', { name: 'People and groups' }));
    fireEvent.click(chips.getByRole('button', { name: 'People and groups' }));
    fireEvent.click(chips.getByRole('button', { name: 'Everything' }));
    expect(
      events('graph_explorer_interacted')
        .filter(props => props.interaction === 'filter')
        .map(props => props.value)
    ).toEqual(['ent', 'all']);
  });
});
