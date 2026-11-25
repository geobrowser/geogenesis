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

// On a phone the centre's card gets four lines: more than its neighbours, but bounded, so a long claim
// can't fill the middle of the map. The panel under the map leaves the name out on a phone (GEO-3849).
describe('NodeCard names', () => {
  afterEach(cleanup);

  it.each<GraphKind>(['ent', 'topic', 'story', 'claim'])(
    'gives a phone centre’s %s name four lines, and no more',
    kind => {
      render(<NodeCard node={node(kind)} hop={0} isCentre phone claimSpaceId="space" />);
      expect(clamps()).toEqual(['line-clamp-4']);
    }
  );

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
