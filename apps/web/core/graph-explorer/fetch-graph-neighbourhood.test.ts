import { type OperationDefinitionNode, print } from 'graphql';
import { describe, expect, it } from 'vitest';

import {
  decodeCrossLinks,
  decodeHop1,
  decodeHop2,
  decodeNode,
  hop1Document,
  hop1Variables,
  hop2Document,
  hop2Variables,
  lensTopicFor,
} from './fetch-graph-neighbourhood';
import { resolveGraphFilter } from './graph-filter';
import { GRAPH_KIND_TYPE_IDS, NEWS_EVENT_TYPE_ID } from './graph-kinds';
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

/** The filter of one aliased connection in a printed document. */
function aliasFilter(document: string, alias: string) {
  const start = document.indexOf(`${alias}: relationsConnection`);
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

  it('drops unnamed nodes and types no kind covers', () => {
    expect(decodeNode(raw('1'.repeat(32), null, [PERSON]))).toBeNull();
    expect(decodeNode(raw('1'.repeat(32), 'Block', ['f'.repeat(32)]))).toBeNull();
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
      expect(declared(hop1Document(filter.kinds, on))).toEqual(Object.keys(hop1Variables(CENTRE, filter)).sort());
      expect(declared(hop2Document([CENTRE], on))).toEqual(Object.keys(hop2Variables(filter)).sort());
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
    const hop1 = print(hop1Document(filter.kinds, true));
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
    expect(print(hop2Document([CENTRE], true))).toContain('$topicsPropertyId');
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
