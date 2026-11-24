import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphCentre } from '~/core/graph-explorer/graph-entity';
import type { NeighbourGroup } from '~/core/graph-explorer/panel-sections';

import { EntityPanel, panelClaims } from './entity-panel';

vi.mock('./panel-sections', () => ({ NeighbourGroups: () => null }));
vi.mock('./entity-avatar', () => ({ EntityAvatar: () => null }));
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

describe('EntityPanel summary placement', () => {
  afterEach(cleanup);

  const renderPanel = (kind: GraphNode['kind'], showClaims = kind !== 'claim') =>
    render(
      <EntityPanel
        centre={{ ...claimNode(9, 's'), description: 'A long description of the centre.', texts: [] } as GraphCentre}
        centreSpaceId="s"
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
        emptyMessages={{ relationships: '', claims: '', description: '' }}
        summary={<div data-testid="summary" />}
        showClaims={showClaims}
        summaryFirst={kind === 'claim'}
      />
    );
  const summaryFollowsDescription = () =>
    Boolean(
      screen.getByText('A long description of the centre.').compareDocumentPosition(screen.getByTestId('summary')) &
      Node.DOCUMENT_POSITION_FOLLOWING
    );

  // GEO-3841: Agree and Disagree must be on screen without scrolling past a long description.
  it('puts a claim’s vote block above its description', () => {
    renderPanel('claim');
    expect(summaryFollowsDescription()).toBe(false);
  });

  it('keeps a topic’s summary under its description', () => {
    renderPanel('topic');
    expect(summaryFollowsDescription()).toBe(true);
  });

  // Review round 2: placement follows the centre being a claim, not the claims list being shown, so
  // a filter that hides a topic's claims (GEO-3842) cannot lift its summary above its description.
  it('keeps a topic’s summary under its description when its claims list is hidden', () => {
    renderPanel('topic', false);
    expect(summaryFollowsDescription()).toBe(true);
  });
});
