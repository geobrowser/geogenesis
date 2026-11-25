import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphKind } from '~/core/graph-explorer/graph-kinds';

import { NodeCard } from './node-card';

vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({ isLoading: false, hasCounts: false, positive: 0, negative: 0, percent: null }),
}));

const NAME = 'Federal Reserve System of the United States and its twelve regional banks';

const node = (kind: GraphKind): GraphNode => ({
  id: '1'.padStart(32, '0'),
  name: NAME,
  kind,
  spaceIds: [],
  namedSpaceIds: [],
  placedSpaceIds: [],
  types: [],
  image: null,
  typeRank: 0,
  date: null,
  agrees: 0,
  disagrees: 0,
});

const clamps = () => screen.getByText(NAME).className.match(/line-clamp-\d/g) ?? [];

// On a phone the panel leaves out the centre's name block (GEO-3849), so the map card is the one
// place the whole name shows.
describe('NodeCard names', () => {
  afterEach(cleanup);

  it.each<GraphKind>(['ent', 'topic', 'story', 'claim'])('shows a phone centre’s %s name whole', kind => {
    render(<NodeCard node={node(kind)} hop={0} isCentre phone claimSpaceId="space" />);
    expect(clamps()).toEqual([]);
  });

  it.each<[GraphKind, string]>([
    ['ent', 'line-clamp-2'],
    ['topic', 'line-clamp-2'],
    ['story', 'line-clamp-3'],
    ['claim', 'line-clamp-2'],
  ])('still cuts the %s name of a card around the centre on a phone', (kind, clamp) => {
    render(<NodeCard node={node(kind)} hop={1} isCentre={false} phone claimSpaceId="space" />);
    expect(clamps()).toEqual([clamp]);
  });

  it.each<[GraphKind, string]>([
    ['ent', 'line-clamp-2'],
    ['topic', 'line-clamp-2'],
    ['story', 'line-clamp-3'],
    ['claim', 'line-clamp-3'],
  ])('keeps the desktop centre’s %s name to its lines', (kind, clamp) => {
    render(<NodeCard node={node(kind)} hop={0} isCentre phone={false} claimSpaceId="space" />);
    expect(clamps()).toEqual([clamp]);
  });
});
