import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { HIDDEN_PROPERTIES } from '~/core/constants';
import { graphql } from '~/core/io/graphql-client';
import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID, IMAGE_URL_PROPERTY_ID } from '~/core/io/subgraph/space-image';
import { HIDDEN_PROPERTY_ID, isHiddenMarker } from '~/core/moderation/hidden';
import { normId } from '~/core/utils/norm-id';

import { TOPIC_LENS_FILTER, TOPIC_LENS_VARIABLES, topicLensVariables } from './claims-about';
import { type GraphCentreText, type GraphEntity, type GraphHop, type RawEntity, decodeEntity } from './graph-entity';
import type { GraphFilter } from './graph-filter';
import {
  DATE_PROPERTY_IDS,
  GRAPH_KIND_TYPE_IDS,
  type GraphKind,
  NEWS_EVENT_TYPE_ID,
  NOT_OTHER_TYPE_IDS,
  PLUMBING_RELATION_TYPE_IDS,
  graphKindOf,
  graphTypeRank,
} from './graph-kinds';

/** Per kind and direction around the centre: enough to fill the caps and balance claim bands. */
export const HOP1_PER_KIND = 8;
/** Per hop-1 node and direction: a node shows at most two of these. */
export const HOP2_PER_NODE = 6;
export const CROSS_LINKS_PAGE = 200;

/** Content kinds the topic lens narrows. People, organisations, places and topics are never narrowed. */
export const LENSED_KINDS: readonly GraphKind[] = ['claim', 'story', 'event', 'src', 'case'];

function lensedTypeIds(kinds: readonly GraphKind[]) {
  return kinds.filter(kind => LENSED_KINDS.includes(kind)).flatMap(kind => GRAPH_KIND_TYPE_IDS[kind]);
}

export type GraphNode = GraphEntity & {
  kind: GraphKind;
  /** Position of its best type within its kind (people before places). */
  typeRank: number;
  /** Spaces holding any other non-hidden value; with `namedSpaceIds`, what the claim space rule reads. */
  placedSpaceIds: string[];
  /** Event date or publish date, ISO. */
  date: string | null;
  /** Cross-space stance counts. For picking claims only; never shown, as they are not space-scoped. */
  agrees: number;
  disagrees: number;
};

export type GraphEdge = {
  id: string;
  fromId: string;
  toId: string;
  propertyId: string;
  propertyName: string | null;
  spaceId: string;
};

export type GraphNeighbourCentre = GraphNode & { description: string | null; texts: GraphCentreText[] };

export type GraphHop1 = {
  centre: GraphNeighbourCentre | null;
  /** Neighbours with the edge that reached each, in API order per kind. */
  neighbours: Array<{ node: GraphNode; edge: GraphEdge }>;
  /** Kinds with more than one page around the centre. */
  moreKinds: GraphKind[];
};

/** Neighbours of each hop-1 node, keyed by that node's id. */
export type GraphHop2 = Record<string, Array<{ node: GraphNode; edge: GraphEdge }>>;

const NODE_FIELDS = /* GraphQL */ `
  id
  name
  spaceIds
  agrees
  disagrees
  names: valuesList(filter: { propertyId: { is: $namePropertyId } }) { spaceId text }
  dates: valuesList(filter: { propertyId: { in: $datePropertyIds } }) { datetime date }
  types { id name }
  hidden: valuesList(filter: { propertyId: { is: $hiddenPropertyId }, spaceId: { in: $spaceIds } }) { text boolean }
  relationsList(filter: { typeId: { in: [$avatarPropertyId, $coverPropertyId] } }) {
    typeId
    toEntity { valuesList(filter: { propertyId: { is: $imageUrlPropertyId } }) { text } }
  }
`;

/** Which spaces hold any other non-hidden value: only the claim space rule reads it, so only claims ask. */
const PLACED_FIELD = 'placed: valuesList(filter: { propertyId: { notIn: $unplacingPropertyIds } }) { spaceId }';
const UNPLACING_PROPERTY_IDS = [normId(SystemIds.NAME_PROPERTY), ...[...HIDDEN_PROPERTIES].map(normId)];

const NODE_VARIABLES = `
  $hiddenPropertyId: UUID!
  $namePropertyId: UUID!
  $datePropertyIds: [UUID!]
  $avatarPropertyId: UUID!
  $coverPropertyId: UUID!
  $imageUrlPropertyId: UUID!
`;

function kindConnection(kind: GraphKind, direction: 'in' | 'out', lensed: boolean) {
  const self = direction === 'out' ? 'fromEntityId' : 'toEntityId';
  const end = direction === 'out' ? 'toEntity' : 'fromEntity';
  const lens = lensed && LENSED_KINDS.includes(kind) ? TOPIC_LENS_FILTER : '';
  // A Topic typed as content too reads as that content, so the lens applies to it there.
  const exclude =
    kind === 'claim'
      ? `not: { ${end}: { typeIds: { overlaps: [$newsEventTypeId] } } }`
      : kind === 'topic' && lensed
        ? `not: { ${end}: { typeIds: { overlaps: $lensedTypeIds } } }`
        : '';
  return `${kind}_${direction}: relationsConnection(
    first: $first
    filter: {
      ${self}: { is: $id }
      spaceId: { in: $spaceIds }
      typeId: { notIn: $plumbingPropertyIds }
      ${end}: { ${kind === 'other' ? 'not: { typeIds: { overlaps: $otherTypeIds } }' : `typeIds: { overlaps: $${kind}TypeIds } ${lens}`} }
      ${exclude}
    }
  ) {
    nodes { id spaceId typeId type { name } ${end} { ${NODE_FIELDS} ${kind === 'claim' ? PLACED_FIELD : ''} } }
    pageInfo { hasNextPage }
  }`;
}

const hop1Documents = new Map<string, TypedDocumentNode<Hop1Response, Record<string, unknown>>>();

/** One document per kind list and lens, since GraphQL rejects declared but unused variables. */
export function hop1Document(kinds: readonly GraphKind[], lensed: boolean) {
  const key = `${kinds.join(',')}|${lensed}`;
  const cached = hop1Documents.get(key);
  if (cached) return cached;
  const document = parse(/* GraphQL */ `
    query GraphNeighbourhood(
      $id: UUID!
      $spaceIds: [UUID!]
      $plumbingPropertyIds: [UUID!]
      $first: Int
      $textPropertyIds: [UUID!]
      ${kinds.includes('claim') ? '$newsEventTypeId: UUID!' : ''}
      ${kinds.map(kind => `$${kind}TypeIds: [UUID!]`).join('\n')}
      ${lensed ? TOPIC_LENS_VARIABLES : ''}
      ${lensed && kinds.includes('topic') ? '$lensedTypeIds: [UUID!]' : ''}
      ${NODE_VARIABLES}
      $unplacingPropertyIds: [UUID!]
    ) {
      entity(id: $id) {
        ${NODE_FIELDS}
        ${PLACED_FIELD}
        description
        texts: valuesList(filter: { propertyId: { in: $textPropertyIds } }) { propertyId spaceId text }
      }
      ${kinds.flatMap(kind => [kindConnection(kind, 'out', lensed), kindConnection(kind, 'in', lensed)]).join('\n')}
    }
  `) as TypedDocumentNode<Hop1Response, Record<string, unknown>>;
  hop1Documents.set(key, document);
  return document;
}

/** The topic content on the map must carry; also around the topic, where some links aren't `Topics`. */
export function lensTopicFor(filter: GraphFilter): string | null {
  return filter.topicLensId ? normId(filter.topicLensId) : null;
}

function nodeVariables() {
  return {
    hiddenPropertyId: HIDDEN_PROPERTY_ID,
    namePropertyId: normId(SystemIds.NAME_PROPERTY),
    datePropertyIds: DATE_PROPERTY_IDS,
    avatarPropertyId: AVATAR_PROPERTY_ID,
    coverPropertyId: COVER_PROPERTY_ID,
    imageUrlPropertyId: IMAGE_URL_PROPERTY_ID,
  };
}

export function hop1Variables(centreId: string, filter: GraphFilter) {
  const topicId = lensTopicFor(filter);
  return {
    id: normId(centreId),
    spaceIds: filter.spaceIds ?? null,
    plumbingPropertyIds: PLUMBING_RELATION_TYPE_IDS,
    first: HOP1_PER_KIND,
    textPropertyIds: [normId(SystemIds.NAME_PROPERTY), normId(SystemIds.DESCRIPTION_PROPERTY)],
    ...(filter.kinds.includes('claim') ? { newsEventTypeId: NEWS_EVENT_TYPE_ID } : {}),
    ...Object.fromEntries(
      filter.kinds.map(kind => [`${kind}TypeIds`, kind === 'other' ? NOT_OTHER_TYPE_IDS : GRAPH_KIND_TYPE_IDS[kind]])
    ),
    ...(topicId ? topicLensVariables(topicId) : {}),
    ...(topicId && filter.kinds.includes('topic') ? { lensedTypeIds: lensedTypeIds(filter.kinds) } : {}),
    unplacingPropertyIds: UNPLACING_PROPERTY_IDS,
    ...nodeVariables(),
  };
}

type RawNode = RawEntity & {
  agrees?: string | number | null;
  disagrees?: string | number | null;
  placed?: Array<{ spaceId: string }> | null;
  dates?: Array<{ datetime: string | null; date: string | null }> | null;
  /** Hidden values in the explorer's spaces. */
  hidden?: Array<{ text: string | null; boolean: boolean | null }> | null;
};

type RawRelation = {
  id: string;
  spaceId: string;
  typeId: string;
  type: { name: string | null } | null;
  toEntity?: RawNode | null;
  fromEntity?: RawNode | null;
};

type RawConnection = { nodes: RawRelation[]; pageInfo?: { hasNextPage: boolean } } | null;

type RawCentre = RawNode & {
  description: string | null;
  texts?: Array<{ propertyId: string; spaceId: string; text: string | null }> | null;
};

/** `entity` plus one `<kind>_<direction>` connection per kind. */
type Hop1Response = { entity: RawCentre | null; [alias: string]: RawConnection | RawCentre | null };

/**
 * Null for a hidden entity (Hidden = true in one of the explorer's spaces), or an unnamed or plumbing
 * neighbour; any other centre is a node.
 */
export function decodeNode(raw: RawNode, isCentre = false): GraphNode | null {
  if ((raw.hidden ?? []).some(isHiddenMarker)) return null;
  const entity = decodeEntity(raw);
  const typeIds = entity.types.map(type => type.id);
  const kind = graphKindOf(typeIds) ?? (isCentre ? 'other' : null);
  if (!kind || (!entity.name && !isCentre)) return null;
  const date = (raw.dates ?? []).map(value => value.datetime ?? value.date).find(Boolean) ?? null;
  return {
    ...entity,
    kind,
    typeRank: graphTypeRank(kind, typeIds),
    placedSpaceIds: [...new Set((raw.placed ?? []).map(value => normId(value.spaceId)))],
    date,
    agrees: Number(raw.agrees ?? 0) || 0,
    disagrees: Number(raw.disagrees ?? 0) || 0,
  };
}

function decodeConnection(connection: RawConnection, selfId: string, direction: 'in' | 'out') {
  return (connection?.nodes ?? []).flatMap(relation => {
    const raw = direction === 'out' ? relation.toEntity : relation.fromEntity;
    const node = raw ? decodeNode(raw) : null;
    if (!node || node.id === selfId) return [];
    const edge: GraphEdge = {
      id: relation.id,
      fromId: direction === 'out' ? selfId : node.id,
      toId: direction === 'out' ? node.id : selfId,
      propertyId: normId(relation.typeId),
      propertyName: relation.type?.name ?? null,
      spaceId: normId(relation.spaceId),
    };
    return [{ node, edge }];
  });
}

export function decodeHop1(response: Hop1Response, centreId: string, kinds: readonly GraphKind[]): GraphHop1 {
  const id = normId(centreId);
  const rawCentre = response.entity;
  const centreNode = rawCentre ? decodeNode(rawCentre, true) : null;
  const centre: GraphNeighbourCentre | null =
    rawCentre && centreNode
      ? {
          ...centreNode,
          description: rawCentre.description?.trim() || null,
          texts: (rawCentre.texts ?? []).flatMap(value =>
            value.text
              ? [{ propertyId: normId(value.propertyId), spaceId: normId(value.spaceId), text: value.text }]
              : []
          ),
        }
      : null;
  // A hidden centre shows as not in the graph, with nothing around it.
  if (rawCentre && !centreNode) return { centre: null, neighbours: [], moreKinds: [] };
  const connection = (alias: string) => (response[alias] ?? null) as RawConnection;
  const neighbours = kinds.flatMap(kind => [
    ...decodeConnection(connection(`${kind}_out`), id, 'out'),
    ...decodeConnection(connection(`${kind}_in`), id, 'in'),
  ]);
  const moreKinds = kinds.filter(
    kind => connection(`${kind}_out`)?.pageInfo?.hasNextPage || connection(`${kind}_in`)?.pageInfo?.hasNextPage
  );
  return { centre, neighbours, moreKinds };
}

export function fetchHop1(centreId: string, filter: GraphFilter, signal?: AbortSignal) {
  return Effect.runPromise(
    graphql({
      query: hop1Document(filter.kinds, lensTopicFor(filter) !== null),
      decoder: (response: Hop1Response) => decodeHop1(response, centreId, filter.kinds),
      variables: hop1Variables(centreId, filter),
      signal,
    })
  );
}

/**
 * Ids go in the document as literals: one alias pair per hop-1 node. Lensed: content must carry the
 * topic. `other`: also entities of no listed kind.
 */
export function hop2Document(ids: readonly string[], lensed: boolean, other: boolean) {
  const branches = lensed
    ? [
        '{ typeIds: { overlaps: $openTypeIds }, not: { typeIds: { overlaps: $lensedTypeIds } } }',
        `{ typeIds: { overlaps: $lensedTypeIds } ${TOPIC_LENS_FILTER} }`,
      ]
    : ['{ typeIds: { overlaps: $kindTypeIds } }'];
  if (other) branches.push('{ not: { typeIds: { overlaps: $notOtherTypeIds } } }');
  const kinds = `or: [${branches.join(' ')}]`;
  const connection = (id: string, index: number, direction: 'in' | 'out') => {
    const self = direction === 'out' ? 'fromEntityId' : 'toEntityId';
    const end = direction === 'out' ? 'toEntity' : 'fromEntity';
    return `n${index}_${direction}: relationsConnection(
      first: $first
      filter: {
        ${self}: { is: "${normId(id)}" }
        spaceId: { in: $spaceIds }
        typeId: { notIn: $plumbingPropertyIds }
        ${end}: { ${kinds} }
      }
    ) { nodes { id spaceId typeId type { name } ${end} { ${NODE_FIELDS} } } }`;
  };
  return parse(/* GraphQL */ `
    query GraphNeighbourhoodHop2(
      $spaceIds: [UUID!]
      $plumbingPropertyIds: [UUID!]
      ${lensed ? `$openTypeIds: [UUID!]\n$lensedTypeIds: [UUID!]\n${TOPIC_LENS_VARIABLES}` : '$kindTypeIds: [UUID!]'}
      ${other ? '$notOtherTypeIds: [UUID!]' : ''}
      $first: Int
      ${NODE_VARIABLES}
    ) {
      ${ids.flatMap((id, index) => [connection(id, index, 'out'), connection(id, index, 'in')]).join('\n')}
    }
  `) as TypedDocumentNode<Record<string, RawConnection>, Record<string, unknown>>;
}

export function hop2Variables(filter: GraphFilter) {
  const topicId = lensTopicFor(filter);
  const kinds = topicId
    ? {
        openTypeIds: filter.kinds
          .filter(kind => !LENSED_KINDS.includes(kind))
          .flatMap(kind => GRAPH_KIND_TYPE_IDS[kind]),
        lensedTypeIds: lensedTypeIds(filter.kinds),
        ...topicLensVariables(topicId),
      }
    : { kindTypeIds: filter.kinds.flatMap(kind => GRAPH_KIND_TYPE_IDS[kind]) };
  return {
    spaceIds: filter.spaceIds ?? null,
    plumbingPropertyIds: PLUMBING_RELATION_TYPE_IDS,
    ...kinds,
    ...(filter.kinds.includes('other') ? { notOtherTypeIds: NOT_OTHER_TYPE_IDS } : {}),
    first: HOP2_PER_NODE,
    ...nodeVariables(),
  };
}

export function decodeHop2(response: Record<string, RawConnection>, ids: readonly string[]): GraphHop2 {
  return Object.fromEntries(
    ids.map((id, index) => {
      const self = normId(id);
      return [
        self,
        [
          ...decodeConnection(response[`n${index}_out`] ?? null, self, 'out'),
          ...decodeConnection(response[`n${index}_in`] ?? null, self, 'in'),
        ],
      ];
    })
  );
}

export async function fetchHop2(ids: readonly string[], filter: GraphFilter, signal?: AbortSignal) {
  if (ids.length === 0) return {} as GraphHop2;
  const hop2 = await Effect.runPromise(
    graphql({
      query: hop2Document(ids, lensTopicFor(filter) !== null, filter.kinds.includes('other')),
      decoder: (response: Record<string, RawConnection>) => decodeHop2(response, ids),
      variables: hop2Variables(filter),
      signal,
    })
  );
  const claimIds = [
    ...new Set(
      Object.values(hop2)
        .flat()
        .filter(({ node }) => node.kind === 'claim')
        .map(({ node }) => node.id)
    ),
  ];
  if (claimIds.length === 0) return hop2;
  const placed = await Effect.runPromise(
    graphql({
      query: placementDocument,
      decoder: decodePlacement,
      variables: { ids: claimIds, first: claimIds.length, unplacingPropertyIds: UNPLACING_PROPERTY_IDS },
      signal,
    })
  );
  return withPlacement(hop2, placed);
}

type PlacementResponse = {
  entitiesConnection: { nodes: Array<{ id: string; placed: Array<{ spaceId: string }> | null }> } | null;
};

const placementDocument = parse(/* GraphQL */ `
  query GraphNodePlacement($ids: [UUID!], $first: Int, $unplacingPropertyIds: [UUID!]) {
    entitiesConnection(first: $first, filter: { id: { in: $ids } }) {
      nodes { id ${PLACED_FIELD} }
    }
  }
`) as TypedDocumentNode<PlacementResponse, Record<string, unknown>>;

function decodePlacement(response: PlacementResponse): Map<string, string[]> {
  return new Map(
    (response.entitiesConnection?.nodes ?? []).map(node => [
      normId(node.id),
      [...new Set((node.placed ?? []).map(value => normId(value.spaceId)))],
    ])
  );
}

/** Hop 2 with each claim's placement filled in from the follow-up query. */
export function withPlacement(hop2: GraphHop2, placed: ReadonlyMap<string, string[]>): GraphHop2 {
  return Object.fromEntries(
    Object.entries(hop2).map(([parent, entries]) => [
      parent,
      entries.map(entry =>
        placed.has(entry.node.id)
          ? { ...entry, node: { ...entry.node, placedSpaceIds: placed.get(entry.node.id)! } }
          : entry
      ),
    ])
  );
}

const crossLinksDocument = parse(/* GraphQL */ `
  query GraphCrossLinks($ids: [UUID!], $spaceIds: [UUID!], $plumbingPropertyIds: [UUID!], $first: Int) {
    relationsConnection(
      first: $first
      filter: {
        fromEntityId: { in: $ids }
        toEntityId: { in: $ids }
        spaceId: { in: $spaceIds }
        typeId: { notIn: $plumbingPropertyIds }
      }
    ) {
      nodes {
        id
        spaceId
        typeId
        type {
          name
        }
        fromEntityId
        toEntityId
      }
    }
  }
`) as TypedDocumentNode<CrossLinksResponse, Record<string, unknown>>;

type CrossLinksResponse = {
  relationsConnection: {
    nodes: Array<{
      id: string;
      spaceId: string;
      typeId: string;
      type: { name: string | null } | null;
      fromEntityId: string;
      toEntityId: string;
    }>;
  } | null;
};

export function decodeCrossLinks(response: CrossLinksResponse): GraphEdge[] {
  return (response.relationsConnection?.nodes ?? []).flatMap(relation => {
    const fromId = normId(relation.fromEntityId);
    const toId = normId(relation.toEntityId);
    if (fromId === toId) return [];
    return [
      {
        id: relation.id,
        fromId,
        toId,
        propertyId: normId(relation.typeId),
        propertyName: relation.type?.name ?? null,
        spaceId: normId(relation.spaceId),
      },
    ];
  });
}

export function fetchCrossLinks(ids: readonly string[], filter: GraphFilter, signal?: AbortSignal) {
  if (ids.length < 2) return Promise.resolve([]);
  return Effect.runPromise(
    graphql({
      query: crossLinksDocument,
      decoder: decodeCrossLinks,
      variables: {
        ids: ids.map(normId),
        spaceIds: filter.spaceIds ?? null,
        plumbingPropertyIds: PLUMBING_RELATION_TYPE_IDS,
        first: CROSS_LINKS_PAGE,
      },
      signal,
    })
  );
}

/** Hop 1 as a flat hop, so the panel lists the same relations the map draws. */
export function hop1AsGraphHop(hop1: GraphHop1): GraphHop {
  return {
    centre: hop1.centre,
    relations: hop1.neighbours.map(({ node, edge }) => ({
      id: edge.id,
      direction: edge.fromId === hop1.centre?.id ? ('out' as const) : ('in' as const),
      propertyId: edge.propertyId,
      propertyName: edge.propertyName,
      spaceId: edge.spaceId,
      position: null,
      entity: node,
    })),
  };
}
