import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphEdge, GraphHop1, GraphNode } from './fetch-graph-neighbourhood';
import { resolveGraphFilter } from './graph-filter';
import { DESKTOP_GRAPH_CAPS } from './select-graph';
import { useGraphNeighbourhood } from './use-graph-explorer';

const api = vi.hoisted(() => ({ fetchHop1: vi.fn(), fetchHop2: vi.fn(), fetchCrossLinks: vi.fn() }));
vi.mock('./fetch-graph-neighbourhood', async importOriginal => ({
  ...(await importOriginal<typeof import('./fetch-graph-neighbourhood')>()),
  ...api,
}));
vi.mock('~/core/debates/use-claim-space-allowlist', () => ({ useClaimSpaceAllowlist: () => ({ allowlist: [] }) }));
vi.mock('~/core/topics/use-topic-space-scope', () => ({ useTopicSpaceScope: () => undefined }));

const id = (name: string) => name.padEnd(32, '0');
const node = (name: string): GraphNode => ({
  id: id(name),
  name,
  kind: 'ent',
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
const edge = (from: string, to: string): GraphEdge => ({
  id: `${from}-${to}`,
  fromId: id(from),
  toId: id(to),
  propertyId: 'p',
  propertyName: 'Related',
  spaceId: 's',
});
const hop1 = (centre: string, ...neighbours: string[]): GraphHop1 => ({
  centre: { ...node(centre), description: null, texts: [] },
  neighbours: neighbours.map(neighbour => ({ node: node(neighbour), edge: edge(centre, neighbour) })),
  moreKinds: [],
});

const filter = resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null });

afterEach(() => vi.clearAllMocks());

describe('useGraphNeighbourhood across a hop', () => {
  it('hopping to a neighbour keeps the old ring and asks for no stale hop 2 until the new centre’s hop 1 lands', async () => {
    let landB: (value: GraphHop1) => void = () => {};
    api.fetchHop1.mockImplementation((centreId: string) =>
      centreId === id('a') ? Promise.resolve(hop1('a', 'p', 'b')) : new Promise(resolve => (landB = resolve))
    );
    api.fetchHop2.mockImplementation(async (ids: string[]) =>
      Object.fromEntries(
        ids.map(parent => [parent, [{ node: node(`${parent[0]}x`), edge: edge(parent[0], `${parent[0]}x`) }]])
      )
    );
    api.fetchCrossLinks.mockResolvedValue([]);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ centreId }) =>
        useGraphNeighbourhood({ centreId, filter, caps: DESKTOP_GRAPH_CAPS, kindFilter: 'all', hubId: null }),
      { wrapper, initialProps: { centreId: id('a') } }
    );
    const names = () => result.current.selection?.nodes.map(entry => entry.node.name).sort();
    await waitFor(() => expect(names()).toEqual(['a', 'b', 'bx', 'p', 'px']));
    expect(api.fetchHop2).toHaveBeenCalledTimes(1);

    rerender({ centreId: id('b') });
    await waitFor(() => expect(api.fetchHop1).toHaveBeenCalledWith(id('b'), filter, expect.anything()));
    expect(result.current.isSwitching).toBe(true);
    expect(names()).toEqual(['a', 'b', 'bx', 'p', 'px']);
    expect(api.fetchHop2).toHaveBeenCalledTimes(1);

    landB(hop1('b', 'r'));
    await waitFor(() => expect(names()).toEqual(['b', 'r', 'rx']));
    expect(api.fetchHop2).toHaveBeenLastCalledWith([id('r')], filter, expect.anything());
    expect(api.fetchHop2).toHaveBeenCalledTimes(2);
  });

  it('does not fill a new scope with the old scope’s outer ring', async () => {
    const other = resolveGraphFilter({ spaceIds: ['b'.repeat(32)], topicId: null, topicSpaceId: null });
    let landOther: (value: GraphHop1) => void = () => {};
    api.fetchHop1.mockImplementation((_: string, asked: typeof filter) =>
      asked === filter ? Promise.resolve(hop1('a', 'p')) : new Promise(resolve => (landOther = resolve))
    );
    api.fetchHop2.mockImplementation(async (ids: string[]) =>
      Object.fromEntries(
        ids.map(parent => [parent, [{ node: node(`${parent[0]}x`), edge: edge(parent[0], `${parent[0]}x`) }]])
      )
    );
    api.fetchCrossLinks.mockResolvedValue([]);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ scoped }) =>
        useGraphNeighbourhood({
          centreId: id('a'),
          filter: scoped,
          caps: DESKTOP_GRAPH_CAPS,
          kindFilter: 'all',
          hubId: null,
        }),
      { wrapper, initialProps: { scoped: filter } }
    );
    const names = () => result.current.selection?.nodes.map(entry => entry.node.name).sort();
    await waitFor(() => expect(names()).toEqual(['a', 'p', 'px']));

    rerender({ scoped: other });
    await waitFor(() => expect(api.fetchHop1).toHaveBeenCalledWith(id('a'), other, expect.anything()));
    expect(names()).toEqual(['a', 'p']);
    expect(api.fetchHop2).toHaveBeenCalledTimes(1);

    landOther(hop1('a', 'p'));
    await waitFor(() => expect(names()).toEqual(['a', 'p', 'px']));
    expect(api.fetchHop2).toHaveBeenLastCalledWith([id('p')], other, expect.anything());
  });
});

describe('useGraphNeighbourhood failures', () => {
  it('shows a failed hop 1 at once, without retrying it, even under a retrying client', async () => {
    api.fetchHop1.mockRejectedValue(new Error('timed out'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useGraphNeighbourhood({ centreId: id('a'), filter, caps: DESKTOP_GRAPH_CAPS, kindFilter: 'all', hubId: null }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.hop1.isError).toBe(true));
    expect(api.fetchHop1).toHaveBeenCalledTimes(1);
  });
});

describe('useGraphNeighbourhood partial hop 1', () => {
  it('treats a hop missing a failed kind as stale at once', async () => {
    api.fetchHop1.mockResolvedValue({ ...hop1('a', 'p'), failedKinds: ['story'] });
    api.fetchHop2.mockResolvedValue({});
    api.fetchCrossLinks.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useGraphNeighbourhood({ centreId: id('a'), filter, caps: DESKTOP_GRAPH_CAPS, kindFilter: 'all', hubId: null }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.hop1.isSuccess).toBe(true));
    expect(result.current.hop1.isStale).toBe(true);

    api.fetchHop1.mockResolvedValue(hop1('a', 'p'));
    await result.current.hop1.refetch();
    await waitFor(() => expect(result.current.hop1.data?.failedKinds).toBeUndefined());
    expect(result.current.hop1.isStale).toBe(false);
  });
});
