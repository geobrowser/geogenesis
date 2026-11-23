import { describe, expect, it } from 'vitest';

import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID } from '~/core/io/subgraph/space-image';

import { decodeGraphHop, graphHopVariables } from './fetch-graph-hop';
import { resolveGraphFilter } from './graph-filter';

const raw = (
  id: string,
  name: string | null,
  relationsList: Array<{ typeId: string; toEntity: { valuesList: Array<{ text: string | null }> } | null }> = []
) => ({
  id,
  name,
  spaceIds: ['AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'],
  types: [{ id: 't', name: 'Topic' }],
  relationsList,
});

describe('decodeGraphHop', () => {
  it('decodes both directions and prefers the avatar over the cover', () => {
    const hop = decodeGraphHop({
      entity: {
        ...raw('c'.repeat(32), 'Centre'),
        description: '  ',
        texts: [
          { propertyId: 'A126CA53-0C8E-48D5-B888-82C734C38935', spaceId: 'a'.repeat(32), text: 'Centre in A' },
          { propertyId: 'a126ca530c8e48d5b88882c734c38935', spaceId: 'b'.repeat(32), text: null },
        ],
      },
      outgoing: {
        nodes: [
          {
            id: 'r1',
            spaceId: 'a'.repeat(32),
            position: 'a0',
            typeId: 'p'.repeat(32),
            type: { name: 'Subtopics' },
            toEntity: raw('1'.repeat(32), 'Out', [
              { typeId: COVER_PROPERTY_ID, toEntity: { valuesList: [{ text: 'ipfs://cover' }] } },
              { typeId: AVATAR_PROPERTY_ID, toEntity: { valuesList: [{ text: 'ipfs://avatar' }] } },
            ]),
          },
        ],
        pageInfo: { hasNextPage: false },
      },
      incoming: {
        nodes: [
          {
            id: 'r2',
            spaceId: 'a'.repeat(32),
            position: null,
            typeId: 'q'.repeat(32),
            type: null,
            fromEntity: raw('2'.repeat(32), 'In'),
          },
          { id: 'r3', spaceId: 'a'.repeat(32), position: null, typeId: 'q'.repeat(32), type: null, fromEntity: null },
        ],
        pageInfo: { hasNextPage: true },
      },
    });

    expect(hop.centre).toMatchObject({ id: 'c'.repeat(32), name: 'Centre', description: null });
    expect(hop.centre?.texts).toEqual([
      { propertyId: 'a126ca530c8e48d5b88882c734c38935', spaceId: 'a'.repeat(32), text: 'Centre in A' },
    ]);
    expect(hop.relations.map(relation => [relation.direction, relation.entity.name])).toEqual([
      ['out', 'Out'],
      ['in', 'In'],
    ]);
    expect(hop.relations[0].entity.image).toBe('ipfs://avatar');
    expect(hop.relations[0].entity.spaceIds).toEqual(['a'.repeat(32)]);
    expect(hop.truncated).toBe(true);
  });

  it('reads a missing entity as no centre', () => {
    expect(decodeGraphHop({ entity: null, outgoing: null, incoming: null })).toEqual({
      centre: null,
      relations: [],
      truncated: false,
    });
  });
});

describe('graphHopVariables', () => {
  it('sends null spaces for no space filter and the filter lists as given', () => {
    const filter = resolveGraphFilter({ kind: 'global' });
    const variables = graphHopVariables('c'.repeat(32), filter);
    expect(variables.spaceIds).toBeNull();
    expect(variables.includeTypeIds).toBe(filter.includeTypeIds);
    expect(variables.relationTypeIds).toBe(filter.relationTypeIds);
  });
});
