import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { NEWS_STORY_TYPE_ID } from '~/core/constants';
import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { NEIGHBOUR_KIND_TYPE_IDS } from '~/core/graph-explorer/ontology';
import type { NeighbourGroup } from '~/core/graph-explorer/panel-sections';
import { DATASET_TYPE_ID } from '~/core/topics/ontology';

import { EntityPanel, type PanelCentre, centreEyebrow, panelClaims } from './entity-panel';

const interacted = vi.hoisted(() => vi.fn());
vi.mock('~/core/graph-explorer/graph-explorer-analytics', () => ({ useGraphAnalytics: () => ({ interacted }) }));
vi.mock('./panel-sections', () => ({ NeighbourGroups: () => null }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

const id = (n: number) => String(n).padStart(32, '0');
const claimNode = (n: number, spaceId: string): GraphNode => ({
  id: id(n),
  name: `Claim ${n}`,
  spaceIds: [spaceId],
  namedSpaceIds: [spaceId],
  placedSpaceIds: [],
  types: [],
  image: null,
  kind: 'claim',
  typeRank: 0,
  date: null,
  agrees: 0,
  disagrees: 0,
});
const linked = (nodes: GraphNode[], label: string): NeighbourGroup[] => [
  {
    kind: 'claim',
    spokes: nodes.map(node => ({
      spoke: { entity: node, labels: [label], edgeSpaceIds: [], nodeSpaceId: null, hasOutgoing: true },
      node,
    })),
  },
];

describe('panelClaims', () => {
  it('lists claims about the centre, then linked ones in their own space, each once with its relation', () => {
    const about = { id: id(1), name: 'About', spaceId: 'a' };
    const nodes = [claimNode(1, 'a'), claimNode(2, 'b')];
    const claims = panelClaims([[about]], linked(nodes, 'Supporting argument'), new Map(nodes.map(n => [n.id, n])));
    expect(claims).toEqual([
      { ...about, relation: 'Supporting argument' },
      { id: id(2), name: 'Claim 2', spaceId: 'b', relation: 'Supporting argument' },
    ]);
  });

  it('gives a claim centre its related claims without asking about it', () => {
    const nodes = [claimNode(3, 'c')];
    expect(panelClaims([], linked(nodes, 'Opposing argument'), new Map(nodes.map(n => [n.id, n])))).toEqual([
      { id: id(3), name: 'Claim 3', spaceId: 'c', relation: 'Opposing argument' },
    ]);
  });
});

const DESCRIPTION = 'A long description of the centre.';
const centreOf = (kind: GraphNode['kind'], extra: Partial<PanelCentre> = {}): PanelCentre => ({
  ...claimNode(9, 's'),
  kind,
  description: DESCRIPTION,
  texts: [],
  ...extra,
});

const renderPanel = ({
  kind = 'claim',
  centre = centreOf(kind),
  showClaims = kind !== 'claim',
  pageSpaceId = 's',
}: {
  kind?: GraphNode['kind'];
  centre?: PanelCentre;
  showClaims?: boolean;
  pageSpaceId?: string | null;
} = {}) =>
  render(
    <EntityPanel
      centre={centre}
      pageSpaceId={pageSpaceId}
      topicSpaceId={null}
      spokes={[]}
      nodes={new Map()}
      claimPages={[]}
      claimsState={{
        isLoading: false,
        isError: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: () => {},
      }}
      onOpen={() => {}}
      moreKinds={[]}
      emptyMessages={{ relationships: '', claims: '' }}
      summary={<div data-testid="summary" />}
      showClaims={showClaims}
      summaryFirst={centre.kind === 'claim'}
    />
  );

describe('EntityPanel summary placement', () => {
  afterEach(cleanup);

  const summaryFollowsDescription = () =>
    Boolean(
      screen.getByText(DESCRIPTION).compareDocumentPosition(screen.getByTestId('summary')) &
      Node.DOCUMENT_POSITION_FOLLOWING
    );

  // GEO-3841: Agree and Disagree must be on screen without scrolling past a long description.
  it('puts a claim’s vote block above its description', () => {
    renderPanel({ kind: 'claim' });
    expect(summaryFollowsDescription()).toBe(false);
  });

  it('keeps a topic’s summary under its description', () => {
    renderPanel({ kind: 'topic' });
    expect(summaryFollowsDescription()).toBe(true);
  });

  // Review round 2: placement follows the centre being a claim, not the claims list being shown, so
  // a filter that hides a topic's claims (GEO-3842) cannot lift its summary above its description.
  it('keeps a topic’s summary under its description when its claims list is hidden', () => {
    renderPanel({ kind: 'topic', showClaims: false });
    expect(summaryFollowsDescription()).toBe(true);
  });
});

describe('centreEyebrow', () => {
  const type = (id: string, name: string) => ({ id, name });

  it.each<[string, PanelCentre, string | null]>([
    ['a claim says Claim once', centreOf('claim', { types: [type(CLAIM_TYPE_ID, 'Claim')] }), 'Claim'],
    ['a topic', centreOf('topic', { types: [type(NEIGHBOUR_KIND_TYPE_IDS.topic[0], 'Topic')] }), 'Topic'],
    [
      'a source: kind, type, date',
      centreOf('src', { types: [type(DATASET_TYPE_ID, 'Dataset')], date: '2026-11-15T00:00:00.000Z' }),
      'Source · Dataset · Nov 15, 2026',
    ],
    [
      'news: the kind word, not "News story" again',
      centreOf('story', { types: [type(NEWS_STORY_TYPE_ID, 'News story')], date: '2026-10-02T00:00:00.000Z' }),
      'News · Oct 2, 2026',
    ],
    [
      'an event',
      centreOf('event', { types: [type('bb9a85bd6dc64efd8232e2782cb4b5f8', 'News event')] }),
      'Event · News event',
    ],
    [
      'a court case',
      centreOf('case', { types: [type('c058821272ef463fa97a93693456c8ba', 'Legal case')] }),
      'Court case',
    ],
    [
      'a person: types only, best first',
      centreOf('ent', {
        types: [type('f'.repeat(32), 'Politician'), type(NEIGHBOUR_KIND_TYPE_IDS.person[0], 'Person')],
      }),
      'Person · Politician',
    ],
    ['nothing known', centreOf('other'), null],
  ])('%s', (_, centre, expected) => {
    expect(centreEyebrow(centre)).toBe(expected);
  });
});

describe('EntityPanel header', () => {
  afterEach(() => {
    cleanup();
    interacted.mockClear();
  });

  it('puts the types line above the title and draws no type pills', () => {
    renderPanel({ centre: centreOf('src', { types: [{ id: DATASET_TYPE_ID, name: 'Dataset' }] }) });
    const eyebrow = screen.getByText('Source · Dataset');
    const title = screen.getByRole('heading', { level: 2 });
    expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(eyebrow).toHaveClass('text-[13px]', 'text-grey-04');
    expect(screen.queryByText('Dataset')).toBeNull();
  });

  it.each<GraphNode['kind']>(['claim', 'topic', 'ent', 'src'])(
    'makes a %s’s title the link to its page, with an arrow, and no other open link',
    kind => {
      renderPanel({ kind });
      const link = screen.getByRole('link', { name: 'Claim 9' });
      expect(screen.getByRole('heading', { level: 2 })).toContainElement(link);
      expect(link).toHaveAttribute('href', expect.stringContaining('s'));
      expect(link.textContent).toBe('Claim 9 →');
      expect(screen.getAllByRole('link')).toHaveLength(1);
      expect(screen.queryByText(/Open (the claim|page)/)).toBeNull();

      link.click();
      expect(interacted).toHaveBeenCalledWith({
        interaction: 'open_page',
        value: kind === 'claim' ? 'claim' : 'entity',
        target_id: id(9),
      });
    }
  );

  it('draws a plain title when there is no page to open', () => {
    renderPanel({ kind: 'claim', pageSpaceId: null });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Claim 9$/);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('sets the description as small body text', () => {
    renderPanel({ kind: 'topic' });
    expect(screen.getByText(DESCRIPTION)).toHaveClass('text-[14px]', 'leading-[1.45]', 'text-grey-05');
    expect(screen.getByText(DESCRIPTION)).not.toHaveClass('text-body');
  });

  it('puts a non-claim’s description directly under the header', () => {
    renderPanel({ kind: 'ent' });
    const header = screen.getByRole('heading', { level: 2 }).closest('header')!;
    expect(header.nextElementSibling).toBe(screen.getByText(DESCRIPTION));
  });

  it('puts a claim’s description directly after its vote block', () => {
    renderPanel({ kind: 'claim' });
    const header = screen.getByRole('heading', { level: 2 }).closest('header')!;
    expect(header.nextElementSibling).toBe(screen.getByTestId('summary'));
    expect(screen.getByTestId('summary').nextElementSibling).toBe(screen.getByText(DESCRIPTION));
  });

  it('shows nothing for an empty description', () => {
    renderPanel({ centre: centreOf('topic', { description: null }) });
    const header = screen.getByRole('heading', { level: 2 }).closest('header')!;
    expect(header.nextElementSibling).toBe(screen.getByTestId('summary'));
    expect(screen.queryByText(/No description/)).toBeNull();
  });

  it('draws no avatar without an image', () => {
    renderPanel({ kind: 'ent' });
    const header = screen.getByRole('heading', { level: 2 }).closest('header')!;
    expect(header.querySelector('img')).toBeNull();
    // No lettered circle either: the text column is the header's only child.
    expect(header.children).toHaveLength(1);
    expect(header.firstElementChild).toContainElement(screen.getByRole('heading', { level: 2 }));
  });

  it('draws the image as a 56px rounded square left of the title', () => {
    renderPanel({ centre: centreOf('ent', { image: 'https://example.com/face.png' }) });
    const header = screen.getByRole('heading', { level: 2 }).closest('header')!;
    const img = header.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'https://example.com/face.png');
    expect(img).toHaveClass('h-14', 'w-14', 'rounded-[12px]', 'object-cover');
    expect(header.firstElementChild).toBe(img);
  });
});
