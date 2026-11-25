import { describe, expect, it } from 'vitest';

import { agreePercent, claimBand } from './claim-band';
import type { GraphEdge, GraphNode } from './fetch-graph-neighbourhood';
import type { GraphKind } from './graph-kinds';
import { DESKTOP_GRAPH_CAPS, PHONE_GRAPH_CAPS, pickNeighbours, presentKinds, selectGraph } from './select-graph';

const id = (n: number) => n.toString(16).padStart(32, '0');
const CENTRE = id(0);

function node(n: number, kind: GraphKind, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id: id(n),
    name: `Node ${n}`,
    spaceIds: [],
    namedSpaceIds: [],
    types: [],
    image: null,
    kind,
    typeRank: 0,
    placedSpaceIds: [],
    date: null,
    agrees: 0,
    disagrees: 0,
    ...extra,
  };
}

const edge = (from: string, to: string, n = 0): GraphEdge => ({
  id: `${from}-${to}-${n}`,
  fromId: from,
  toId: to,
  propertyId: 'p'.repeat(32),
  propertyName: null,
  spaceId: 's'.repeat(32),
});

const around = (nodes: GraphNode[], centre = CENTRE) => nodes.map(n => ({ node: n, edge: edge(n.id, centre) }));

describe('claimBand', () => {
  it('uses the design thresholds', () => {
    expect(claimBand(65, 35)).toBe('agreed');
    expect(claimBand(64, 36)).toBe('contested');
    expect(claimBand(35, 65)).toBe('contested');
    expect(claimBand(34, 66)).toBe('rejected');
  });

  it('has no band and no percent without responses', () => {
    expect(claimBand(0, 0)).toBeNull();
    expect(agreePercent(0, 0)).toBeNull();
    expect(agreePercent(1, 2)).toBe(33);
  });
});

describe('pickNeighbours', () => {
  it('takes one of each kind per round, in priority order, up to the cap', () => {
    const picked = pickNeighbours(
      around([node(1, 'src'), node(2, 'src'), node(3, 'claim'), node(4, 'ent'), node(5, 'topic'), node(6, 'src')]),
      4,
      new Set(),
      'all'
    );
    expect(picked.map(p => p.node.kind)).toEqual(['topic', 'ent', 'claim', 'src']);
  });

  it('balances claims across bands, answered before unanswered', () => {
    const claims = [
      node(1, 'claim'),
      node(2, 'claim', { agrees: 9, disagrees: 1 }),
      node(3, 'claim', { agrees: 8, disagrees: 0 }),
      node(4, 'claim', { agrees: 1, disagrees: 9 }),
      node(5, 'claim', { agrees: 5, disagrees: 5 }),
    ];
    expect(pickNeighbours(around(claims), 5, new Set(), 'all').map(p => p.node.id)).toEqual([
      id(2),
      id(5),
      id(4),
      id(3),
      id(1),
    ]);
  });

  it('orders within a kind by type rank, keeps API order on ties, and skips taken or repeated nodes', () => {
    const picked = pickNeighbours(
      around([node(1, 'ent', { typeRank: 5 }), node(2, 'ent'), node(3, 'ent'), node(2, 'ent'), node(4, 'ent')]),
      10,
      new Set([id(3)]),
      'all'
    );
    expect(picked.map(p => p.node.id)).toEqual([id(2), id(4), id(1)]);
  });

  it('keeps only the chip’s kind, dropping topics too', () => {
    const candidates = around([node(1, 'src'), node(2, 'claim'), node(3, 'topic')]);
    expect(pickNeighbours(candidates, 10, new Set(), 'claim').map(p => p.node.kind)).toEqual(['claim']);
    expect(pickNeighbours(candidates, 10, new Set(), 'all').map(p => p.node.kind)).toEqual(['topic', 'claim', 'src']);
  });
});

describe('selectGraph', () => {
  const centre = node(0, 'topic');
  const hop1 = around(Array.from({ length: 20 }, (_, i) => node(i + 1, i % 2 ? 'src' : 'ent')));
  const hop2 = Object.fromEntries(
    hop1.map(({ node: parent }, i) => [
      parent.id,
      around([node(100 + i * 3, 'claim'), node(101 + i * 3, 'claim'), node(102 + i * 3, 'claim')], parent.id),
    ])
  );

  it('applies the desktop caps', () => {
    const selection = selectGraph({
      centre,
      neighbours: hop1,
      hop2,
      crossLinks: [],
      caps: DESKTOP_GRAPH_CAPS,
      kindFilter: 'all',
    });
    expect(selection.nodes.filter(n => n.hop === 1)).toHaveLength(14);
    expect(selection.nodes.filter(n => n.hop === 2)).toHaveLength(26);
    expect(selection.nodes.filter(n => n.hop === 2).every(n => n.parentId !== null)).toBe(true);
  });

  it('applies the phone caps', () => {
    const selection = selectGraph({
      centre,
      neighbours: hop1,
      hop2,
      crossLinks: [],
      caps: PHONE_GRAPH_CAPS,
      kindFilter: 'all',
    });
    expect(selection.nodes.filter(n => n.hop === 1)).toHaveLength(8);
    expect(selection.nodes.filter(n => n.hop === 2)).toHaveLength(6);
  });

  it('is deterministic', () => {
    const args = {
      centre,
      neighbours: hop1,
      hop2,
      crossLinks: [],
      caps: DESKTOP_GRAPH_CAPS,
      kindFilter: 'all' as const,
    };
    expect(selectGraph(args)).toEqual(selectGraph(args));
  });

  it('adds cross-links only between shown nodes, once per pair, never to the topic hub', () => {
    const a = hop1[0].node.id;
    const b = hop1[1].node.id;
    const selection = selectGraph({
      centre,
      neighbours: hop1.slice(0, 2),
      hop2: {},
      crossLinks: [edge(a, b, 1), edge(b, a, 2), edge(a, id(999)), edge(a, CENTRE, 3)],
      caps: DESKTOP_GRAPH_CAPS,
      kindFilter: 'all',
      noExpand: new Set([CENTRE]),
    });
    expect(selection.links.filter(l => l.hop === 3).map(l => l.edge.id)).toEqual([`${a}-${b}-1`]);
  });

  it('does not expand a no-expand node', () => {
    const hub = node(50, 'topic');
    const selection = selectGraph({
      centre,
      neighbours: around([hub]),
      hop2: { [hub.id]: around([node(51, 'claim')], hub.id) },
      crossLinks: [],
      caps: DESKTOP_GRAPH_CAPS,
      kindFilter: 'all',
      noExpand: new Set([hub.id]),
    });
    expect(selection.nodes.map(n => n.node.id)).toEqual([centre.id, hub.id]);
  });
  it('reaches for topics last in hop 2, but still shows one when nothing else is there', () => {
    const story = node(60, 'story');
    const person = node(61, 'ent');
    const selection = selectGraph({
      centre,
      neighbours: around([story, person]),
      hop2: {
        [story.id]: around([node(62, 'topic'), node(63, 'topic'), node(64, 'src')], story.id),
        [person.id]: around([node(65, 'topic')], person.id),
      },
      crossLinks: [],
      caps: { ...DESKTOP_GRAPH_CAPS, hop2Each: 1 },
      kindFilter: 'all',
    });
    expect(selection.nodes.filter(n => n.hop === 2).map(n => n.node.id)).toEqual([id(65), id(64)]);
  });
});

describe('selectGraph under a chip', () => {
  const centre = node(0, 'topic');
  const topic = node(1, 'topic');
  const claim = node(2, 'claim');
  const story = node(3, 'story');
  // Only the dropped topic reaches 10; 11 is reached through the topic and through the kept claim.
  const onlyViaTopic = node(10, 'claim');
  const alsoViaClaim = node(11, 'claim');
  const args = {
    centre,
    neighbours: around([topic, claim, story]),
    hop2: {
      [topic.id]: around([onlyViaTopic, alsoViaClaim, node(12, 'topic')], topic.id),
      [claim.id]: around([alsoViaClaim, node(13, 'topic')], claim.id),
      [story.id]: around([node(14, 'topic')], story.id),
    },
    crossLinks: [edge(claim.id, topic.id, 1), edge(alsoViaClaim.id, topic.id, 2), edge(claim.id, story.id, 3)],
    caps: DESKTOP_GRAPH_CAPS,
  };
  const ids = (selection: ReturnType<typeof selectGraph>) => selection.nodes.map(entry => entry.node.id);

  it('shows no topics but the centre, and no lines to topics', () => {
    const selection = selectGraph({ ...args, kindFilter: 'claim' });
    expect(selection.nodes[0]).toEqual({ node: centre, hop: 0, parentId: null });
    expect(selection.nodes.slice(1).some(entry => entry.node.kind === 'topic')).toBe(false);
    const shown = new Set(ids(selection));
    expect(selection.links.every(({ edge }) => shown.has(edge.fromId) && shown.has(edge.toId))).toBe(true);
  });

  it('keeps a dropped topic’s second ring off the map unless a kept node reaches it', () => {
    const selection = selectGraph({ ...args, kindFilter: 'claim' });
    expect(ids(selection)).toEqual([centre.id, claim.id, alsoViaClaim.id]);
    expect(selection.nodes.find(entry => entry.node.id === alsoViaClaim.id)?.parentId).toBe(claim.id);
  });

  it('brings topics back under Everything', () => {
    const selection = selectGraph({ ...args, kindFilter: 'all' });
    expect(ids(selection)).toEqual(expect.arrayContaining([topic.id, onlyViaTopic.id]));
    expect(selection.links.some(({ edge }) => edge.toId === topic.id)).toBe(true);
  });
});

describe('presentKinds', () => {
  it('lists the kinds around the centre in priority order', () => {
    expect(presentKinds(around([node(1, 'src'), node(2, 'claim'), node(3, 'src')]))).toEqual(['claim', 'src']);
  });
});
