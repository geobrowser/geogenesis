import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { type OperationDefinitionNode, print } from 'graphql';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';

import {
  ENTITY_FIRST,
  GRAPH_REQUEST_TIMEOUT_MS,
  asRelationConnection,
  declaredVariables,
  decodeCrossLinks,
  decodeHop1,
  decodeHop2,
  decodeNode,
  fetchHop1,
  hop1CentreDocument,
  hop1KindDocument,
  hop1Variables,
  hop2Document,
  hop2Variables,
  lensTopicFor,
  withPlacement,
} from './fetch-graph-neighbourhood';
import { resolveGraphFilter } from './graph-filter';
import { GRAPH_KIND_TYPE_IDS, type GraphKind, NEWS_EVENT_TYPE_ID, PLUMBING_RELATION_TYPE_IDS } from './graph-kinds';
import { CLAIM_TYPE_ID, NEIGHBOUR_KIND_TYPE_IDS, TOPIC_TYPE_ID } from './ontology';

const CENTRE = 'c'.repeat(32);
const TOPIC = 't'.repeat(32).replace(/t/g, 'e');
const PERSON = NEIGHBOUR_KIND_TYPE_IDS.person[0];

const raw = (id: string, name: string | null, typeIds: string[], extra: Record<string, unknown> = {}) => ({
  id,
  name,
  spaceIds: ['a'.repeat(32)],
  types: typeIds.map(typeId => ({ id: typeId, name: null })),
  relationsList: [],
  ...extra,
});

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('~/core/io/graphql-client', async () => {
  const { Effect } = await import('effect');
  return {
    graphql: (options: { query: unknown; variables: unknown; timeoutMs?: number }) =>
      Effect.tryPromise({ try: () => api.request(options), catch: error => error }),
  };
});
afterEach(() => api.request.mockReset());

/** Every hop-1 request's document, printed together. */
function printHop1(kinds: readonly GraphKind[], lensed: boolean) {
  return [hop1CentreDocument, ...kinds.map(kind => hop1KindDocument(kind, lensed, true))]
    .map(doc => print(doc))
    .join('\n');
}

/** The filter of one aliased connection in a printed document. */
function aliasFilter(document: string, alias: string) {
  const start = document.indexOf(`${alias}: `);
  return document.slice(start, document.indexOf('nodes {', start));
}

function declared(document: { definitions: readonly unknown[] }) {
  const operation = document.definitions[0] as OperationDefinitionNode;
  return (operation.variableDefinitions ?? []).map(definition => definition.variable.name.value).sort();
}

describe('decodeNode', () => {
  it('reads kind, date and the cross-space counts', () => {
    const node = decodeNode(
      raw('1'.repeat(32), 'IDF strike', [CLAIM_TYPE_ID, NEWS_EVENT_TYPE_ID], {
        agrees: '3',
        disagrees: null,
        dates: [
          { datetime: null, date: null },
          { datetime: '2026-08-12T00:00:00Z', date: null },
        ],
        placed: [{ spaceId: 'B'.repeat(32) }, { spaceId: 'b'.repeat(32) }],
      })
    );
    expect(node).toMatchObject({ kind: 'event', date: '2026-08-12T00:00:00Z', agrees: 3, disagrees: 0 });
    expect(node?.placedSpaceIds).toEqual(['b'.repeat(32)]);
  });

  it('drops unnamed and plumbing neighbours, and keeps unlisted types as Other', () => {
    expect(decodeNode(raw('1'.repeat(32), null, [PERSON]))).toBeNull();
    expect(decodeNode(raw('1'.repeat(32), 'A page', [SystemIds.PAGE_TYPE]))).toBeNull();
    expect(decodeNode(raw('1'.repeat(32), 'A new type', ['f'.repeat(32)]))?.kind).toBe('other');
  });

  it('always makes a centre a node, whatever its type', () => {
    expect(decodeNode(raw('1'.repeat(32), 'A page', [SystemIds.PAGE_TYPE]), true)?.kind).toBe('other');
    expect(decodeNode(raw('1'.repeat(32), null, ['f'.repeat(32)]), true)?.kind).toBe('other');
  });
});

describe('hidden entities', () => {
  const HIDDEN = [{ text: 'true', boolean: null }];
  const relation = (id: string, toEntity: ReturnType<typeof raw>) => ({
    id: `r${id}`,
    spaceId: 'a'.repeat(32),
    typeId: 'p'.repeat(32),
    type: null,
    toEntity,
  });

  it('asks for the Hidden marker in every space on every node, at hop 1 and hop 2', () => {
    const filter = resolveGraphFilter({ spaceIds: ['a'.repeat(32)], topicId: null, topicSpaceId: null });
    for (const document of [
      hop1CentreDocument,
      ...filter.kinds.map(kind => hop1KindDocument(kind, false, true)),
      hop2Document(['1'.repeat(32)], false, false),
    ]) {
      const printed = print(document).replace(/\s+/g, ' ');
      expect(printed).toContain('hidden: valuesList(filter: {propertyId: {is: $hiddenPropertyId}}) { text boolean }');
      expect(declared(document)).toContain('hiddenPropertyId');
    }
    expect(hop1Variables(CENTRE, filter).hiddenPropertyId).toBe(HIDDEN_PROPERTY_ID);
    expect(hop2Variables(filter).hiddenPropertyId).toBe(HIDDEN_PROPERTY_ID);
  });

  it('leaves a hidden neighbour off hop 1 and hop 2', () => {
    const hop = decodeHop1(
      {
        entity: { ...raw(CENTRE, 'Gaza', [TOPIC_TYPE_ID]), description: null, texts: [] },
        ent_out: {
          nodes: [
            relation('1', raw('1'.repeat(32), 'Shown', [PERSON])),
            relation('2', raw('2'.repeat(32), 'Withheld', [PERSON], { hidden: HIDDEN })),
            relation('3', raw('3'.repeat(32), 'Unhidden', [PERSON], { hidden: [{ text: 'false', boolean: false }] })),
          ],
          pageInfo: { hasNextPage: false },
        },
        ent_in: null,
      },
      CENTRE,
      ['ent']
    );
    expect(hop.neighbours.map(entry => entry.node.name)).toEqual(['Shown', 'Unhidden']);

    const hop2 = decodeHop2(
      {
        n0_out: {
          nodes: [
            relation('4', raw('4'.repeat(32), 'Withheld', [PERSON], { hidden: [{ text: null, boolean: true }] })),
          ],
        },
        n0_in: null,
      },
      ['1'.repeat(32)]
    );
    expect(hop2['1'.repeat(32)]).toEqual([]);
  });

  it('shows a hidden centre as not in the graph, with nothing around it', () => {
    const hop = decodeHop1(
      {
        entity: { ...raw(CENTRE, 'Withheld', [TOPIC_TYPE_ID], { hidden: HIDDEN }), description: 'secret', texts: [] },
        ent_out: {
          nodes: [relation('1', raw('1'.repeat(32), 'Neighbour', [PERSON]))],
          pageInfo: { hasNextPage: true },
        },
        ent_in: null,
      },
      CENTRE,
      ['ent']
    );
    expect(hop).toEqual({ centre: null, neighbours: [], moreKinds: [] });
  });
});

describe('decodeHop1', () => {
  it('turns both directions into edges, drops the centre, and notes kinds with more', () => {
    const hop = decodeHop1(
      {
        entity: { ...raw(CENTRE, 'Gaza', [TOPIC_TYPE_ID]), description: ' ', texts: [] },
        ent_out: {
          nodes: [
            {
              id: 'r1',
              spaceId: 'a'.repeat(32),
              typeId: 'p'.repeat(32),
              type: { name: 'Related people' },
              toEntity: raw('1'.repeat(32), 'Netanyahu', [PERSON, TOPIC_TYPE_ID]),
            },
          ],
          pageInfo: { hasNextPage: false },
        },
        ent_in: {
          nodes: [
            {
              id: 'r2',
              spaceId: 'a'.repeat(32),
              typeId: 'p'.repeat(32),
              type: null,
              fromEntity: raw(CENTRE, 'Self', [PERSON]),
            },
          ],
          pageInfo: { hasNextPage: true },
        },
      },
      CENTRE,
      ['ent']
    );
    expect(hop.centre).toMatchObject({ id: CENTRE, kind: 'topic', description: null });
    expect(hop.neighbours).toHaveLength(1);
    expect(hop.neighbours[0].node.kind).toBe('ent');
    expect(hop.neighbours[0].edge).toMatchObject({
      fromId: CENTRE,
      toId: '1'.repeat(32),
      propertyName: 'Related people',
    });
    expect(hop.moreKinds).toEqual(['ent']);
  });
});

describe('hop documents', () => {
  it('declares exactly the variables it is sent, with and without the topic lens', () => {
    const lensed = resolveGraphFilter({ spaceIds: ['a'.repeat(32)], topicId: TOPIC, topicSpaceId: null });
    const open = resolveGraphFilter(
      { spaceIds: ['a'.repeat(32)], topicId: TOPIC, topicSpaceId: null },
      { lens: 'off' }
    );
    const narrow = resolveGraphFilter(null, { kinds: ['ent'] });
    for (const filter of [lensed, open, narrow]) {
      const on = lensTopicFor(filter) !== null;
      const sent = Object.keys(hop1Variables(CENTRE, filter));
      const hop1 = [
        hop1CentreDocument,
        ...filter.kinds.map(kind => hop1KindDocument(kind, on, filter.spaceIds !== undefined)),
      ].map(declared);
      // Each request declares a subset of the hop's variables, and together they use every one.
      for (const names of hop1) expect(sent).toEqual(expect.arrayContaining(names));
      expect([...new Set(hop1.flat())].sort()).toEqual([...sent].sort());
      expect(declared(hop2Document([CENTRE], on, filter.kinds.includes('other')))).toEqual(
        Object.keys(hop2Variables(filter)).sort()
      );
    }
  });

  it('lenses content around every centre in a topic scope, and nowhere with the lens off or no topic', () => {
    const filter = resolveGraphFilter({ spaceIds: null, topicId: TOPIC, topicSpaceId: null });
    expect(lensTopicFor(filter)).toBe(TOPIC);
    expect(
      lensTopicFor(resolveGraphFilter({ spaceIds: null, topicId: TOPIC, topicSpaceId: null }, { lens: 'off' }))
    ).toBeNull();
    expect(lensTopicFor(resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null }))).toBeNull();
  });

  it('asks every content kind to carry the topic, in both directions and in hop 2, but not people or topics', () => {
    const filter = resolveGraphFilter({ spaceIds: null, topicId: TOPIC, topicSpaceId: null });
    const hop1 = printHop1(filter.kinds, true);
    for (const kind of ['claim', 'story', 'event', 'src', 'case'])
      for (const direction of ['in', 'out'])
        expect(aliasFilter(hop1, `${kind}_${direction}`)).toContain('$topicsPropertyId');
    for (const kind of ['ent', 'topic']) expect(aliasFilter(hop1, `${kind}_in`)).not.toContain('$topicsPropertyId');
    // A Topic typed as content goes through the content alias, lensed.
    expect(aliasFilter(hop1, 'topic_in')).toContain('$lensedTypeIds');
    const hop2 = hop2Variables(filter) as { lensedTypeIds?: string[]; openTypeIds?: string[] };
    expect(hop2.lensedTypeIds).toEqual(expect.arrayContaining([...GRAPH_KIND_TYPE_IDS.claim]));
    expect(hop2.openTypeIds).toEqual(expect.arrayContaining([...GRAPH_KIND_TYPE_IDS.ent]));
    expect(hop2.openTypeIds).not.toEqual(expect.arrayContaining([...GRAPH_KIND_TYPE_IDS.story]));
    expect(print(hop2Document([CENTRE], true, true))).toContain('$topicsPropertyId');
  });

  it('asks hop 2 for the allowed kinds only, without the lens', () => {
    expect(hop2Variables(resolveGraphFilter(null, { kinds: ['case'] })).kindTypeIds).toEqual(GRAPH_KIND_TYPE_IDS.case);
  });
});

describe('decodeHop2 and decodeCrossLinks', () => {
  it('keys hop 2 by the node it came from', () => {
    const hop2 = decodeHop2(
      {
        n0_out: {
          nodes: [
            {
              id: 'r',
              spaceId: 'a'.repeat(32),
              typeId: 'p'.repeat(32),
              type: null,
              toEntity: raw('2'.repeat(32), 'X', [PERSON]),
            },
          ],
        },
        n0_in: null,
      },
      ['1'.repeat(32)]
    );
    expect(hop2['1'.repeat(32)].map(n => n.edge.toId)).toEqual(['2'.repeat(32)]);
  });

  it('drops self links', () => {
    const edges = decodeCrossLinks({
      relationsConnection: {
        nodes: [
          {
            id: 'a',
            spaceId: 's'.repeat(32),
            typeId: 'p'.repeat(32),
            type: null,
            fromEntityId: '1'.repeat(32),
            toEntityId: '1'.repeat(32),
          },
          {
            id: 'b',
            spaceId: 's'.repeat(32),
            typeId: 'p'.repeat(32),
            type: null,
            fromEntityId: '1'.repeat(32),
            toEntityId: '2'.repeat(32),
          },
        ],
      },
    });
    expect(edges.map(e => e.id)).toEqual(['b']);
  });
});

describe('placement', () => {
  it('asks for placement only on claims and the centre', () => {
    const filter = resolveGraphFilter({ spaceIds: ['a'.repeat(32)], topicId: null, topicSpaceId: null });
    const hop1 = printHop1(filter.kinds, false);
    const withPlaced = [...hop1.matchAll(/(\w+): (?:relations|entities)Connection[\s\S]*?pageInfo/g)]
      .filter(match => match[0].includes('placed:'))
      .map(match => match[1]);
    expect(withPlaced).toEqual(['claim_out', 'claim_in']);
    expect(hop1.match(/entity\(id: \$id\)[\s\S]*?placed:/)).not.toBeNull();
    expect(print(hop2Document([CENTRE], false, true))).not.toContain('placed:');
  });

  it('fills claims in hop 2 from the follow-up placement', () => {
    const claim = decodeNode(raw('1'.repeat(32), 'A claim', [CLAIM_TYPE_ID]))!;
    const person = decodeNode(raw('2'.repeat(32), 'A person', [PERSON]))!;
    const edge = { id: 'e', fromId: CENTRE, toId: claim.id, propertyId: 'p', propertyName: null, spaceId: 's' };
    const filled = withPlacement(
      {
        [CENTRE]: [
          { node: claim, edge },
          { node: person, edge },
        ],
      },
      new Map([[claim.id, ['b'.repeat(32)]]])
    );
    expect(filled[CENTRE].map(entry => entry.node.placedSpaceIds)).toEqual([['b'.repeat(32)], []]);
  });
});

describe('entity-first kinds', () => {
  const filter = resolveGraphFilter({ spaceIds: ['a'.repeat(32)], topicId: TOPIC, topicSpaceId: null });

  it('asks the sparse incoming kinds for entities that reach the centre, in scope and without plumbing', () => {
    expect([...ENTITY_FIRST].sort()).toEqual(['ent_in', 'other_in']);
    for (const [kind, alias] of [
      ['ent', 'ent_in'],
      ['other', 'other_in'],
    ] as const) {
      const printed = print(hop1KindDocument(kind, true, true)).replace(/\s+/g, ' ');
      const filterText = aliasFilter(printed, alias);
      expect(filterText).toContain(`${alias}: entitiesConnection`);
      expect(filterText).toContain(
        'relations: {some: {toEntityId: {is: $id}, spaceId: {in: $spaceIds}, typeId: {notIn: $plumbingPropertyIds}}}'
      );
      expect(filterText).toContain('orderBy: [UPDATED_AT_DESC, ID_ASC]');
      // Its edge is one of the same in-scope links.
      expect(printed).toContain(
        'edge: relationsList( first: 1 orderBy: [ID_ASC] filter: {toEntityId: {is: $id}, spaceId: {in: $spaceIds}, typeId: {notIn: $plumbingPropertyIds}} )'
      );
      expect(printed).toContain('hidden: valuesList');
      expect(aliasFilter(printed, alias.replace('_in', '_out'))).toContain('relationsConnection');
    }
    expect(aliasFilter(print(hop1KindDocument('ent', true, true)), 'ent_in')).toContain('$entTypeIds');
    expect(aliasFilter(print(hop1KindDocument('other', true, true)), 'other_in')).toMatch(
      /not: \{\s*typeIds: \{\s*overlaps: \$otherTypeIds/
    );
    for (const kind of ['topic', 'claim', 'story', 'event', 'src', 'case'] as const)
      expect(print(hop1KindDocument(kind, true, true))).not.toContain('entitiesConnection');
    expect(hop1Variables(CENTRE, filter).plumbingPropertyIds).toEqual(PLUMBING_RELATION_TYPE_IDS);
  });

  it('asks them relation first without a space scope', () => {
    for (const kind of ['ent', 'other'] as const)
      expect(print(hop1KindDocument(kind, false, false))).not.toContain('entitiesConnection');
  });

  it('reads an entity-first page as relations, dropping an entity with no edge', () => {
    const person = raw('1'.repeat(32), 'Ada', [PERSON]);
    const edge = { id: 'r1', spaceId: 'a'.repeat(32), typeId: 'p'.repeat(32), type: { name: 'Related' } };
    const connection = asRelationConnection(
      {
        nodes: [
          { ...person, edge: [edge] },
          { ...raw('2'.repeat(32), 'Bo', [PERSON]), edge: [] },
        ],
        pageInfo: { hasNextPage: true },
      },
      'in'
    );
    expect(connection).toEqual({ nodes: [{ ...edge, fromEntity: person }], pageInfo: { hasNextPage: true } });
    const centre = { ...raw(CENTRE, 'Topic', [TOPIC_TYPE_ID]), description: null };
    const hop = decodeHop1({ entity: centre, ent_in: connection }, CENTRE, ['ent']);
    expect(hop.neighbours.map(({ edge }) => [edge.fromId, edge.toId, edge.propertyName])).toEqual([
      ['1'.repeat(32), CENTRE, 'Related'],
    ]);
    expect(hop.moreKinds).toEqual(['ent']);
  });
});

describe('fetchHop1', () => {
  const filter = resolveGraphFilter(
    { spaceIds: ['a'.repeat(32)], topicId: null, topicSpaceId: null },
    { kinds: ['ent', 'story'] }
  );
  const centre = { entity: { ...raw(CENTRE, 'Topic', [TOPIC_TYPE_ID]), description: null } };
  const person = raw('1'.repeat(32), 'Ada', [PERSON]);
  const story = raw('2'.repeat(32), 'A story', [...GRAPH_KIND_TYPE_IDS.story]);
  const edge = { id: 'r', spaceId: 'a'.repeat(32), typeId: 'p'.repeat(32), type: null };
  const responses: Record<string, () => Promise<unknown>> = {
    GraphNeighbourhoodCentre: async () => centre,
    ent: async () => ({ ent_out: { nodes: [] }, ent_in: { nodes: [{ ...person, edge: [{ ...edge, id: 'r1' }] }] } }),
    story: async () => ({ story_out: { nodes: [{ ...edge, id: 'r2', toEntity: story }] }, story_in: { nodes: [] } }),
  };
  const respond = (overrides: Partial<typeof responses> = {}) =>
    api.request.mockImplementation(({ query }: { query: Parameters<typeof print>[0] }) => {
      const printed = print(query);
      const key = printed.includes('GraphNeighbourhoodCentre')
        ? 'GraphNeighbourhoodCentre'
        : printed.match(/(\w+)_out:/)![1];
      return { ...responses, ...overrides }[key]!();
    });

  it('asks for the centre and each kind separately, each with its own variables and a deadline', async () => {
    respond();
    const hop = await fetchHop1(CENTRE, filter);
    expect(api.request).toHaveBeenCalledTimes(3);
    for (const [options] of api.request.mock.calls as Array<
      [{ query: Parameters<typeof declaredVariables>[0]; variables: object; timeoutMs: number }]
    >) {
      expect(Object.keys(options.variables).sort()).toEqual(declaredVariables(options.query).sort());
      expect(options.timeoutMs).toBe(GRAPH_REQUEST_TIMEOUT_MS);
    }
    expect(hop.neighbours.map(({ node }) => node.name)).toEqual(['Ada', 'A story']);
  });

  it('drops a kind that fails and keeps the rest', async () => {
    respond({ ent: () => Promise.reject(new Error('timed out')) });
    const hop = await fetchHop1(CENTRE, filter);
    expect(hop.centre?.id).toBe(CENTRE);
    expect(hop.neighbours.map(({ node }) => node.name)).toEqual(['A story']);
    expect(hop.failedKinds).toEqual(['ent']);
  });

  it('asks people relation first when the filter has no space scope', async () => {
    respond({
      ent: async () => ({ ent_out: { nodes: [] }, ent_in: { nodes: [{ ...edge, id: 'r1', fromEntity: person }] } }),
    });
    const hop = await fetchHop1(CENTRE, resolveGraphFilter(null, { kinds: ['ent', 'story'] }));
    const queries = api.request.mock.calls.map(([options]) => print(options.query)).join('\n');
    expect(queries).not.toContain('entitiesConnection');
    expect(hop.neighbours.map(({ node }) => node.name)).toEqual(['Ada', 'A story']);
  });

  it('fails when the centre fails, or every kind does', async () => {
    respond({ GraphNeighbourhoodCentre: () => Promise.reject(new Error('centre')) });
    await expect(fetchHop1(CENTRE, filter)).rejects.toThrow('centre');
    respond({ ent: () => Promise.reject(new Error('ent')), story: () => Promise.reject(new Error('story')) });
    await expect(fetchHop1(CENTRE, filter)).rejects.toThrow('ent');
  });
});
