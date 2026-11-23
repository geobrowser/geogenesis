import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphHop } from '~/core/graph-explorer/fetch-graph-hop';
import { NEIGHBOUR_KIND_TYPE_IDS, RELATED_PEOPLE_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/graph-explorer/ontology';

import { GraphViewer, NO_RELATIONSHIPS_MESSAGE } from './graph-viewer';

const TOPIC = '11111111111111111111111111111111';
const PERSON = '22222222222222222222222222222222';
const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const hops: Record<string, GraphHop> = {
  [TOPIC]: {
    centre: {
      id: TOPIC,
      name: 'Israel-Gaza war',
      description: 'A topic.',
      spaceIds: [SPACE],
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
          types: [{ id: NEIGHBOUR_KIND_TYPE_IDS.person[0], name: 'Person' }],
          image: null,
        },
      },
    ],
    truncated: false,
  },
  [PERSON]: {
    centre: {
      id: PERSON,
      name: 'Isaac Herzog',
      description: null,
      spaceIds: [SPACE],
      types: [{ id: NEIGHBOUR_KIND_TYPE_IDS.person[0], name: 'Person' }],
      image: null,
    },
    relations: [],
    truncated: false,
  },
};

const hooks = vi.hoisted(() => ({
  useGraphHop: vi.fn(),
  useClaimsAbout: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({
  useGraphHop: hooks.useGraphHop,
  useClaimsAbout: hooks.useClaimsAbout,
  usePrefetchGraphHop: () => hooks.prefetch,
}));
vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => false }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('./graph-claim-row', () => ({
  GraphClaimRow: ({ claim }: { claim: { name: string } }) => <li>{claim.name}</li>,
}));
vi.mock('~/core/utils/space/space-ranking', () => ({
  getTopRankedSpaceId: (ids: string[]) => ids[0] ?? null,
}));

beforeAll(() => {
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

beforeEach(() => {
  hooks.useGraphHop.mockImplementation((id: string, filter: unknown) =>
    filter
      ? { data: hops[id], isLoading: false, isError: false, refetch: vi.fn() }
      : { data: undefined, isLoading: true }
  );
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

const scope = { kind: 'spaces', spaceIds: [SPACE] } as const;

describe('GraphViewer', () => {
  it('waits for the scope before asking for anything', () => {
    render(<GraphViewer startEntityId={TOPIC} scope={null} />);
    expect(hooks.useGraphHop).toHaveBeenCalledWith(TOPIC, null);
    expect(screen.queryByText('Isaac Herzog')).toBeNull();
  });

  it('draws the centre’s relations with their labels', () => {
    render(<GraphViewer startEntityId={TOPIC} scope={scope} />);
    expect(screen.getByRole('button', { name: /Isaac Herzog, Related person/ })).toBeTruthy();
    expect(screen.getAllByText('Related person').length).toBeGreaterThan(0);
  });

  it('re-centres on a clicked node, offers Back, and says plainly when a node has no relations', () => {
    render(<GraphViewer startEntityId={TOPIC} scope={scope} />);
    fireEvent.click(screen.getByRole('button', { name: /Isaac Herzog, Related person/ }));

    expect(hooks.useGraphHop).toHaveBeenLastCalledWith(PERSON, expect.anything());
    expect(screen.getByText(NO_RELATIONSHIPS_MESSAGE)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Israel-Gaza war' }));
    expect(hooks.useGraphHop).toHaveBeenLastCalledWith(TOPIC, expect.anything());
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
  });

  it('shows the description, and an honest empty Claims tab', () => {
    render(<GraphViewer startEntityId={TOPIC} scope={scope} />);
    expect(screen.getByText('A topic.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Claims (0)' }));
    expect(screen.getByText('No claims in the knowledge graph are linked to this yet.')).toBeTruthy();
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
    render(<GraphViewer startEntityId={TOPIC} scope={scope} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Claims (1+)' }));
    expect(screen.getByText('Hamas must disarm')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show more claims' })).toBeTruthy();
  });

  it('says so when the entity is not in the graph', () => {
    hooks.useGraphHop.mockReturnValue({
      data: { centre: null, relations: [], truncated: false },
      isLoading: false,
      isError: false,
    });
    render(<GraphViewer startEntityId={TOPIC} scope={scope} />);
    expect(screen.getByText('This entity isn’t in the knowledge graph.')).toBeTruthy();
  });
});
