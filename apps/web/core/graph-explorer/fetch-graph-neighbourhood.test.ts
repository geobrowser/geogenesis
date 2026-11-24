import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { type OperationDefinitionNode, print } from 'graphql';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';

import {
  ENTITY_FIRST,
  GRAPH_REQUEST_TIMEOUT_MS,
  type GraphNode,
  HOP2_CONCURRENCY,
  HOP2_FIRST_TRY_MS,
  type Hop1Side,
  NODES_MIN_MS,
  declaredVariables,
  decodeCrossLinks,
  decodeHop1,
  decodeLinks,
  decodeNode,
  fetchHop1,
  fetchHop2,
  fetchNodes,
  hop1CentreDocument,
  hop1KindDocument,
  hop1Variables,
  hop2Document,
  hop2Variables,
  lensTopicFor,
  nodesDocument,
  readLinks,
} from './fetch-graph-neighbourhood';
import { resolveGraphFilter } from './graph-filter';
import { GRAPH_KIND_TYPE_IDS, NEWS_EVENT_TYPE_ID, PLUMBING_RELATION_TYPE_IDS } from './graph-kinds';
import { CLAIM_TYPE_ID, NEIGHBOUR_KIND_TYPE_IDS, TOPIC_TYPE_ID } from './ontology';

const CENTRE = 'c'.repeat(32);
const TOPIC = 't'.repeat(32).replace(/t/g, 'e');
const PERSON = NEIGHBOUR_KIND_TYPE_IDS.person[0];
const SPACE = 'a'.repeat(32);
const HIDDEN = [{ text: 'true', boolean: null }];

const raw = (id: string, name: string | null, typeIds: string[], extra: Record<string, unknown> = {}) => ({
  id,
  name,
  spaceIds: [SPACE],
  types: typeIds.map(typeId => ({ id: typeId, name: null })),
  relationsList: [],
  ...extra,
});
const rawCentre = (extra: Record<string, unknown> = {}) => ({
  ...raw(CENTRE, 'Gaza', [TOPIC_TYPE_ID]),
  description: null,
  texts: [],
  ...extra,
});
const link = (id: string, farId: string, name: string | null = null) => ({
  id,
  spaceId: SPACE,
  typeId: 'p'.repeat(32),
  type: name === null ? null : { name },
  farId,
});
const nodesOf = (...raws: Array<ReturnType<typeof raw>>) =>
  new Map(
    raws.flatMap(entity => {
      const node = decodeNode(entity);
      return node ? [[entity.id, node] as [string, GraphNode]] : [];
    })
  );

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('~/core/io/graphql-client', async () => {
  const { Effect } = await import('effect');
  return {
    graphql: (options: {
      query: unknown;
      variables: unknown;
      timeoutMs?: number;
      decoder: (data: unknown) => unknown;
    }) => Effect.tryPromise({ try: () => api.request(options).then(options.decoder), catch: error => error }),
  };
});
afterEach(() => api.request.mockReset());

type Call = { query: Parameters<typeof declaredVariables>[0]; variables: Record<string, unknown>; timeoutMs: number };
const calls = () => api.request.mock.calls.map(([options]) => options as Call);

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
  it('asks for the Hidden marker in every space on the centre and every node', () => {
    for (const document of [hop1CentreDocument, nodesDocument]) {
      const printed = print(document).replace(/\s+/g, ' ');
      expect(printed).toContain('hidden: valuesList(filter: {propertyId: {is: $hiddenPropertyId}}) { text boolean }');
      expect(declared(document)).toContain('hiddenPropertyId');
    }
    expect(hop1Variables(CENTRE, resolveGraphFilter(null)).hiddenPropertyId).toBe(HIDDEN_PROPERTY_ID);
  });

  it('leaves a hidden neighbour out of the nodes, so off both hops', async () => {
    api.request.mockResolvedValue({
      claims: { nodes: [] },
      others: {
        nodes: [
          raw('1'.repeat(32), 'Shown', [PERSON]),
          raw('2'.repeat(32), 'Withheld', [PERSON], { hidden: HIDDEN }),
          raw('3'.repeat(32), 'Unhidden', [PERSON], { hidden: [{ text: 'false', boolean: false }] }),
        ],
      },
    });
    const nodes = await fetchNodes(['1'.repeat(32), '2'.repeat(32), '3'.repeat(32)]);
    expect([...nodes.values()].map(node => node.name)).toEqual(['Shown', 'Unhidden']);
    const links = ['1', '2', '3'].map(n => link(`r${n}`, n.repeat(32)));
    expect(decodeLinks(links, CENTRE, 'out', nodes).map(entry => entry.node.name)).toEqual(['Shown', 'Unhidden']);
  });

  it('shows a hidden centre as not in the graph, with nothing around it', () => {
    const sides: Hop1Side[] = [{ kind: 'ent', direction: 'out', links: [link('r1', '1'.repeat(32))], more: true }];
    const hop = decodeHop1(rawCentre({ hidden: HIDDEN }), sides, nodesOf(raw('1'.repeat(32), 'N', [PERSON])), CENTRE);
    expect(hop).toEqual({ centre: null, neighbours: [], moreKinds: [] });
  });
});

describe('decodeHop1', () => {
  it('turns both directions into edges in order, drops the centre, and notes kinds with more', () => {
    const sides: Hop1Side[] = [
      { kind: 'ent', direction: 'out', links: [link('r1', '1'.repeat(32), 'Related people')], more: false },
      { kind: 'ent', direction: 'in', links: [link('r2', CENTRE), link('r3', '2'.repeat(32))], more: true },
    ];
    const nodes = nodesOf(
      raw('1'.repeat(32), 'Netanyahu', [PERSON, TOPIC_TYPE_ID]),
      raw('2'.repeat(32), 'Herzog', [PERSON]),
      raw(CENTRE, 'Self', [PERSON])
    );
    const hop = decodeHop1(rawCentre({ description: ' ' }), sides, nodes, CENTRE);
    expect(hop.centre).toMatchObject({ id: CENTRE, kind: 'topic', description: null });
    expect(hop.neighbours.map(({ node, edge }) => [node.name, edge.fromId, edge.toId, edge.propertyName])).toEqual([
      ['Netanyahu', CENTRE, '1'.repeat(32), 'Related people'],
      ['Herzog', '2'.repeat(32), CENTRE, null],
    ]);
    expect(hop.moreKinds).toEqual(['ent']);
  });
});

describe('readLinks', () => {
  it('reads both shapes as links to the far end', () => {
    const relation = { id: 'r1', spaceId: SPACE, typeId: 'p'.repeat(32), type: null };
    expect(
      readLinks(
        { nodes: [{ ...relation, fromEntityId: CENTRE, toEntityId: '1'.repeat(32) }], pageInfo: { hasNextPage: true } },
        'out'
      )
    ).toEqual({ links: [{ ...relation, farId: '1'.repeat(32) }], more: true });
    expect(
      readLinks(
        {
          nodes: [
            { id: '2'.repeat(32), edge: [{ ...relation, id: 'r2' }] },
            { id: '3'.repeat(32), edge: [] },
          ],
        },
        'in'
      )
    ).toEqual({ links: [{ ...relation, id: 'r2', farId: '2'.repeat(32) }], more: false });
  });
});

describe('hop documents', () => {
  it('declares exactly the variables it is sent, with and without the topic lens', () => {
    const lensed = resolveGraphFilter({ spaceIds: [SPACE], topicId: TOPIC, topicSpaceId: null });
    const open = resolveGraphFilter({ spaceIds: [SPACE], topicId: TOPIC, topicSpaceId: null }, { lens: 'off' });
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
      const other = filter.kinds.includes('other');
      const hop2 = [true, false].flatMap(entityFirst =>
        (['in', 'out'] as const).map(direction => declared(hop2Document(direction, on, other, entityFirst)))
      );
      for (const names of hop2) expect([...names].sort()).toEqual([...Object.keys(hop2Variables(filter)), 'id'].sort());
    }
  });

  it('asks the links requests for ids only, so they stay cheap; the nodes request carries the fields', () => {
    const filter = resolveGraphFilter({ spaceIds: [SPACE], topicId: TOPIC, topicSpaceId: null });
    for (const document of [
      ...filter.kinds.map(kind => hop1KindDocument(kind, true, true)),
      hop2Document('in', true, true, false),
      hop2Document('in', true, true, true),
    ]) {
      const printed = print(document);
      expect(printed).not.toContain('valuesList');
      expect(printed).not.toContain('types {');
    }
    expect(print(nodesDocument)).toContain('types {');
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
    const hop1 = filter.kinds.map(kind => print(hop1KindDocument(kind, true, true))).join('\n');
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
    for (const entityFirst of [false, true])
      expect(print(hop2Document('in', true, true, entityFirst))).toContain('$topicsPropertyId');
  });

  it('asks hop 2 for the allowed kinds only, without the lens', () => {
    expect(hop2Variables(resolveGraphFilter(null, { kinds: ['case'] })).kindTypeIds).toEqual(GRAPH_KIND_TYPE_IDS.case);
  });
});

describe('placement', () => {
  it('asks for placement on the centre and on claims among the nodes only', () => {
    expect(print(hop1CentreDocument)).toContain('placed:');
    const printed = print(nodesDocument);
    expect(aliasFilter(printed, 'claims')).toContain('$claimTypeIds');
    expect(printed.slice(printed.indexOf('claims:'), printed.indexOf('others:'))).toContain('placed:');
    expect(printed.slice(printed.indexOf('others:'))).not.toContain('placed:');
  });

  it('asks for each node once, with claims split out by type', async () => {
    api.request.mockResolvedValue({
      claims: { nodes: [raw('1'.repeat(32), 'A claim', [CLAIM_TYPE_ID], { placed: [{ spaceId: 'B'.repeat(32) }] })] },
      others: { nodes: [raw('2'.repeat(32), 'A person', [PERSON])] },
    });
    const nodes = await fetchNodes(['1'.repeat(32), '2'.repeat(32), '1'.repeat(32)]);
    const [call] = calls();
    expect(call.variables).toMatchObject({ ids: ['1'.repeat(32), '2'.repeat(32)], first: 2 });
    expect(call.variables.claimTypeIds).toEqual(GRAPH_KIND_TYPE_IDS.claim);
    expect(call.timeoutMs).toBe(GRAPH_REQUEST_TIMEOUT_MS);
    expect(nodes.get('1'.repeat(32))?.placedSpaceIds).toEqual(['b'.repeat(32)]);
    expect(nodes.get('2'.repeat(32))?.placedSpaceIds).toEqual([]);
    expect(await fetchNodes([])).toEqual(new Map());
    expect(api.request).toHaveBeenCalledTimes(1);
  });
});

describe('decodeCrossLinks', () => {
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

describe('entity-first kinds', () => {
  const filter = resolveGraphFilter({ spaceIds: [SPACE], topicId: TOPIC, topicSpaceId: null });
  const reaches = 'toEntityId: {is: $id}, spaceId: {in: $spaceIds}, typeId: {notIn: $plumbingPropertyIds}';

  it('asks the sparse incoming kinds for entities that reach the centre, in scope and without plumbing', () => {
    expect([...ENTITY_FIRST].sort()).toEqual(['ent_in', 'other_in']);
    for (const [kind, alias] of [
      ['ent', 'ent_in'],
      ['other', 'other_in'],
    ] as const) {
      const printed = print(hop1KindDocument(kind, true, true)).replace(/\s+/g, ' ');
      const filterText = aliasFilter(printed, alias);
      expect(filterText).toContain(`${alias}: entitiesConnection`);
      expect(filterText).toContain(`relations: {some: {${reaches}}}`);
      expect(filterText).toContain('orderBy: [UPDATED_AT_DESC, ID_ASC]');
      // Its edge is one of the same in-scope links.
      expect(printed).toContain(`edge: relationsList( first: 1 orderBy: [ID_ASC] filter: {${reaches}} )`);
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

  it('asks hop 2 entity first with the same far end and scope as relation first', () => {
    const relationFirst = print(hop2Document('out', true, true, false)).replace(/\s+/g, ' ');
    const entityFirst = print(hop2Document('out', true, true, true)).replace(/\s+/g, ' ');
    const farEnd = relationFirst.slice(relationFirst.indexOf('{or:'), relationFirst.indexOf(']}]}}') + 2);
    expect(farEnd).toContain('$notOtherTypeIds');
    expect(entityFirst).toContain(farEnd);
    expect(entityFirst).toContain(
      'backlinks: {some: {fromEntityId: {is: $id}, spaceId: {in: $spaceIds}, typeId: {notIn: $plumbingPropertyIds}}}'
    );
    expect(entityFirst).toContain('edge: backlinksList(');
  });
});

describe('fetchHop1', () => {
  const filter = resolveGraphFilter(
    { spaceIds: [SPACE], topicId: null, topicSpaceId: null },
    { kinds: ['ent', 'story'] }
  );
  const person = raw('1'.repeat(32), 'Ada', [PERSON]);
  const story = raw('2'.repeat(32), 'A story', [...GRAPH_KIND_TYPE_IDS.story]);
  const relation = { id: 'r', spaceId: SPACE, typeId: 'p'.repeat(32), type: null };
  const responses: Record<string, (variables: Record<string, unknown>) => Promise<unknown>> = {
    GraphNeighbourhoodCentre: async () => ({ entity: rawCentre() }),
    GraphNeighbourhoodNodes: async variables => ({
      claims: { nodes: [] },
      others: { nodes: [person, story].filter(entity => (variables.ids as string[]).includes(entity.id)) },
    }),
    ent: async () => ({
      ent_out: { nodes: [] },
      ent_in: { nodes: [{ id: person.id, edge: [{ ...relation, id: 'r1' }] }] },
    }),
    story: async () => ({
      story_out: { nodes: [{ ...relation, id: 'r2', fromEntityId: CENTRE, toEntityId: story.id }] },
      story_in: { nodes: [] },
    }),
  };
  const respond = (overrides: Partial<typeof responses> = {}) =>
    api.request.mockImplementation(({ query, variables }: Call) => {
      const printed = print(query);
      const name = printed.match(/query (\w+)/)![1];
      const key = name === 'GraphNeighbourhoodKind' ? printed.match(/(\w+)_out:/)![1] : name;
      return { ...responses, ...overrides }[key]!(variables);
    });

  it('asks for the centre and each kind separately, then their nodes once, each with its own variables and a deadline', async () => {
    respond();
    const hop = await fetchHop1(CENTRE, filter);
    expect(calls().map(call => print(call.query).match(/query (\w+)/)![1])).toEqual([
      'GraphNeighbourhoodCentre',
      'GraphNeighbourhoodKind',
      'GraphNeighbourhoodKind',
      'GraphNeighbourhoodNodes',
    ]);
    for (const call of calls()) {
      expect(Object.keys(call.variables).sort()).toEqual(declaredVariables(call.query).sort());
      expect(call.timeoutMs).toBeLessThanOrEqual(GRAPH_REQUEST_TIMEOUT_MS);
      expect(call.timeoutMs).toBeGreaterThan(GRAPH_REQUEST_TIMEOUT_MS - 1_000);
    }
    expect(calls()[3].variables.ids).toEqual([person.id, story.id]);
    expect(hop.neighbours.map(({ node }) => node.name)).toEqual(['Ada', 'A story']);
    expect(hop.failedKinds).toEqual([]);
  });

  it('gives the nodes what is left of the deadline, and no less than a floor', async () => {
    vi.useFakeTimers();
    try {
      for (const [linksMs, nodesMs] of [
        [4_000, GRAPH_REQUEST_TIMEOUT_MS - 4_000],
        [8_500, NODES_MIN_MS],
      ]) {
        api.request.mockReset();
        respond({
          story: () => new Promise(resolve => setTimeout(() => resolve(responses.story({})), linksMs)),
        });
        const pending = fetchHop1(CENTRE, filter);
        await vi.advanceTimersByTimeAsync(linksMs);
        await pending;
        expect(calls().at(-1)?.timeoutMs).toBe(nodesMs);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a kind that fails and keeps the rest', async () => {
    respond({ ent: () => Promise.reject(new Error('timed out')) });
    const hop = await fetchHop1(CENTRE, filter);
    expect(hop.centre?.id).toBe(CENTRE);
    expect(hop.neighbours.map(({ node }) => node.name)).toEqual(['A story']);
    expect(hop.failedKinds).toEqual(['ent']);
  });

  it('asks nothing more around a hidden centre', async () => {
    respond({ GraphNeighbourhoodCentre: async () => ({ entity: rawCentre({ hidden: HIDDEN }) }) });
    expect(await fetchHop1(CENTRE, filter)).toMatchObject({ centre: null, neighbours: [] });
    expect(calls().some(call => print(call.query).includes('GraphNeighbourhoodNodes'))).toBe(false);
  });

  it('asks people relation first when the filter has no space scope', async () => {
    respond({
      ent: async () => ({
        ent_out: { nodes: [] },
        ent_in: { nodes: [{ ...relation, id: 'r1', fromEntityId: person.id, toEntityId: CENTRE }] },
      }),
    });
    const hop = await fetchHop1(CENTRE, resolveGraphFilter(null, { kinds: ['ent', 'story'] }));
    expect(
      calls()
        .map(call => print(call.query))
        .join('\n')
    ).not.toContain('ent_in: entitiesConnection');
    expect(hop.neighbours.map(({ node }) => node.name)).toEqual(['Ada', 'A story']);
  });

  it('rejects rather than resolve partly when the caller cancels', async () => {
    const controller = new AbortController();
    respond({
      ent: () => {
        controller.abort();
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      },
    });
    await expect(fetchHop1(CENTRE, filter, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('fails when the centre, the nodes, or every kind fails', async () => {
    respond({ GraphNeighbourhoodCentre: () => Promise.reject(new Error('centre')) });
    await expect(fetchHop1(CENTRE, filter)).rejects.toThrow('centre');
    respond({ GraphNeighbourhoodNodes: () => Promise.reject(new Error('nodes')) });
    await expect(fetchHop1(CENTRE, filter)).rejects.toThrow('nodes');
    respond({ ent: () => Promise.reject(new Error('ent')), story: () => Promise.reject(new Error('story')) });
    await expect(fetchHop1(CENTRE, filter)).rejects.toThrow('ent');
  });
});

describe('fetchHop2', () => {
  const filter = resolveGraphFilter({ spaceIds: [SPACE], topicId: null, topicSpaceId: null });
  const [A, B] = ['a1'.padEnd(32, '0'), 'b1'.padEnd(32, '0')];
  const far = (id: string) => raw(id, `node ${id.slice(0, 2)}`, [PERSON]);
  const relation = (id: string, from: string, to: string) => ({
    id,
    spaceId: SPACE,
    typeId: 'p'.repeat(32),
    type: null,
    fromEntityId: from,
    toEntityId: to,
  });
  const hop2Calls = () => calls().filter(call => print(call.query).includes('GraphNeighbourhoodHop2'));
  const timeout = Object.assign(new Error('timed out'), { isTimeout: true });
  /** Answers one side by parent and direction; entity-first sides by `entityFirst`. */
  const respond = (
    side: (id: string, direction: 'in' | 'out', entityFirst: boolean) => Promise<unknown>,
    nodes: () => Promise<unknown> = async () => ({
      claims: { nodes: [] },
      others: { nodes: ['1', '2', '3'].map(n => far(n.repeat(32))) },
    })
  ) =>
    api.request.mockImplementation(({ query, variables }: Call) => {
      const printed = print(query);
      if (printed.includes('GraphNeighbourhoodNodes')) return nodes();
      const direction = printed.includes('fromEntityId: {is: $id}') ? 'out' : 'in';
      return side(variables.id as string, direction, printed.includes('entitiesConnection'));
    });

  it('asks each direction of each node separately, relation first, then their nodes once', async () => {
    respond(async (id, direction) => ({
      hop: { nodes: id === A && direction === 'out' ? [relation('r1', A, '1'.repeat(32))] : [] },
    }));
    const hop2 = await fetchHop2([A, B], filter);
    const sides = hop2Calls();
    expect(sides).toHaveLength(4);
    expect(sides.every(call => call.timeoutMs === HOP2_FIRST_TRY_MS)).toBe(true);
    expect(sides.some(call => print(call.query).includes('entitiesConnection'))).toBe(false);
    expect(hop2[A].map(({ node }) => node.id)).toEqual(['1'.repeat(32)]);
    expect(hop2[B]).toEqual([]);
  });

  it('asks a side again entity first, in the rest of the deadline, when relation first times out', async () => {
    vi.useFakeTimers();
    try {
      respond(async (id, direction, entityFirst) => {
        if (id === A && direction === 'in')
          return entityFirst
            ? {
                hop: {
                  nodes: [
                    { id: '2'.repeat(32), edge: [{ id: 'r2', spaceId: SPACE, typeId: 'p'.repeat(32), type: null }] },
                  ],
                },
              }
            : new Promise((_, reject) => setTimeout(() => reject(timeout), HOP2_FIRST_TRY_MS));
        return { hop: { nodes: [] } };
      });
      const pending = fetchHop2([A, B], filter);
      await vi.advanceTimersByTimeAsync(HOP2_FIRST_TRY_MS);
      const hop2 = await pending;
      const retried = hop2Calls().filter(call => print(call.query).includes('entitiesConnection'));
      expect(retried).toHaveLength(1);
      expect(retried[0].timeoutMs).toBe(GRAPH_REQUEST_TIMEOUT_MS - HOP2_FIRST_TRY_MS);
      expect(hop2[A].map(({ edge }) => [edge.fromId, edge.toId])).toEqual([['2'.repeat(32), A]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks relation first only, with the whole deadline, without a space scope', async () => {
    respond(async (id, direction) => {
      if (id === A && direction === 'in') throw timeout;
      return { hop: { nodes: [] } };
    });
    await fetchHop2([A, B], resolveGraphFilter(null));
    expect(hop2Calls().some(call => print(call.query).includes('entitiesConnection'))).toBe(false);
    expect(hop2Calls().every(call => call.timeoutMs > GRAPH_REQUEST_TIMEOUT_MS - 1_000)).toBe(true);
  });

  it('keeps at most a few sides in flight', async () => {
    let inFlight = 0;
    let most = 0;
    respond(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight--;
      return { hop: { nodes: [] } };
    });
    const ids = Array.from({ length: 14 }, (_, n) => n.toString(16).padStart(32, '0'));
    await fetchHop2(ids, filter);
    expect(hop2Calls()).toHaveLength(28);
    expect(most).toBe(HOP2_CONCURRENCY);
  });

  it('leaves a node without a side that fails otherwise, without retrying it', async () => {
    respond(async (id, direction) => {
      if (id === A && direction === 'out') throw new Error('503');
      return { hop: { nodes: id === B && direction === 'out' ? [relation('r3', B, '3'.repeat(32))] : [] } };
    });
    const hop2 = await fetchHop2([A, B], filter);
    expect(hop2Calls().some(call => print(call.query).includes('entitiesConnection'))).toBe(false);
    expect(hop2[A]).toEqual([]);
    expect(hop2[B].map(({ node }) => node.id)).toEqual(['3'.repeat(32)]);
  });

  it('fails when every side or the nodes fail, or the caller cancels', async () => {
    respond(() => Promise.reject(new Error('down')));
    await expect(fetchHop2([A], filter)).rejects.toThrow('down');
    respond(
      async () => ({ hop: { nodes: [relation('r1', A, '1'.repeat(32))] } }),
      () => Promise.reject(new Error('nodes'))
    );
    await expect(fetchHop2([A], filter)).rejects.toThrow('nodes');
    const controller = new AbortController();
    respond(async (id, direction) => {
      if (direction === 'in') {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      }
      return { hop: { nodes: [] } };
    });
    await expect(fetchHop2([A], filter, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
