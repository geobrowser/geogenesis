import { describe, expect, it } from 'vitest';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { NEIGHBOUR_KIND_TYPE_IDS } from '~/core/graph-explorer/ontology';
import type { NeighbourGroup } from '~/core/graph-explorer/panel-sections';

import { panelClaims, rowCentreOf } from './entity-panel';

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
      { ...about, relations: ['Supporting argument'] },
      { id: id(2), name: 'Claim 2', spaceId: 'b', relations: ['Supporting argument'] },
    ]);
  });

  it('gives a claim centre its related claims without asking about it', () => {
    const nodes = [claimNode(3, 'c')];
    expect(panelClaims([], linked(nodes, 'Opposing argument'), new Map(nodes.map(n => [n.id, n])))).toEqual([
      { id: id(3), name: 'Claim 3', spaceId: 'c', relations: ['Opposing argument'] },
    ]);
  });
});

describe('rowCentreOf', () => {
  it("takes the centre's kind from its type ids and the type names its header shows", () => {
    const centre = {
      types: [
        { id: NEIGHBOUR_KIND_TYPE_IDS.person[0], name: 'Person' },
        { id: 'aaaabbbbccccddddeeeeffff00001111', name: 'Investor' },
        { id: 'aaaabbbbccccddddeeeeffff00002222', name: null },
      ],
    };
    expect(rowCentreOf(centre)).toEqual({ kind: 'ent', typeNames: ['Person', 'Investor'] });
    expect(rowCentreOf({ types: [{ id: 'aaaabbbbccccddddeeeeffff00003333', name: 'Skill' }] })).toEqual({
      kind: 'other',
      typeNames: ['Skill'],
    });
  });
});
