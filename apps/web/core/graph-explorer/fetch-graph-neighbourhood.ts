import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { HIDDEN_PROPERTIES } from '~/core/constants';
import { graphql } from '~/core/io/graphql-client';
import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID, IMAGE_URL_PROPERTY_ID } from '~/core/io/subgraph/space-image';
import { normId } from '~/core/utils/norm-id';

import { type GraphCentreText, type GraphEntity, type GraphHop, type RawEntity, decodeEntity } from './fetch-graph-hop';
import type { GraphFilter } from './graph-filter';
import {
  DATE_PROPERTY_IDS,
  GRAPH_KIND_TYPE_IDS,
  type GraphKind,
  NEWS_EVENT_TYPE_ID,
  PLUMBING_RELATION_TYPE_IDS,
  graphKindOf,
  graphTypeRank,
} from './graph-kinds';

/** Per kind and direction around the centre: enough to fill the caps and balance claim bands. */
export const HOP1_PER_KIND = 8;
/** Per hop-1 node and direction: a node shows at most two of these. */
export const HOP2_PER_NODE = 6;
export const CROSS_LINKS_PAGE = 200;

/** Kinds the topic lens narrows: content must also carry the topic. People, topics and cases never do. */
const LENSED_KINDS: readonly GraphKind[] = ['claim', 'story', 'event', 'src'];

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
  placed: valuesList(filter: { propertyId: { notIn: $unplacingPropertyIds } }) { spaceId }
  dates: valuesList(filter: { propertyId: { in: $datePropertyIds } }) { datetime date }
  types { id name }
  relationsList(filter: { typeId: { in: [$avatarPropertyId, $coverPropertyId] } }) {
    typeId
    toEntity { valuesList(filter: { propertyId: { is: $imageUrlPropertyId } }) { text } }
  }
`;

const NODE_VARIABLES = `
  $namePropertyId: UUID!
  $unplacingPropertyIds: [UUID!]
  $datePropertyIds: [UUID!]
  $avatarPropertyId: UUID!
  $coverPropertyId: UUID!
  $imageUrlPropertyId: UUID!
`;

const LENS = `relations: { some: { typeId: { is: $topicsPropertyId }, toEntityId: { is: $topicId }, spaceId: { in: $spaceIds } } }`;

function kindConnection(kind: GraphKind, direction: 'in' | 'out', lensed: boolean) {
  const self = direction === 'out' ? 'fromEntityId' : 'toEntityId';
  const end = direction === 'out' ? 'toEntity' : 'fromEntity';
  const lens = lensed && direction === 'in' && LENSED_KINDS.includes(kind) ? LENS : '';
  const notNewsEvent = kind === 'claim' ? `not: { ${end}: { typeIds: { overlaps: [$newsEventTypeId] } } }` : '';
  return `${kind}_${direction}: relationsConnection(
    first: $first
    filter: {
      ${self}: { is: $id }
      spaceId: { in: $spaceIds }
      typeId: { notIn: $plumbingPropertyIds }
      ${end}: { typeIds: { overlaps: $${kind}TypeIds } ${lens} }
      ${notNewsEvent}
    }
  ) {
    nodes { id spaceId typeId type { name } ${end} { ${NODE_FIELDS} } }
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
      ${lensed ? '$topicsPropertyId: UUID!\n$topicId: UUID!' : ''}
      ${NODE_VARIABLES}
    ) {
      entity(id: $id) {
        ${NODE_FIELDS}
        description
        texts: valuesList(filter: { propertyId: { in: $textPropertyIds } }) { propertyId spaceId text }
      }
      ${kinds.flatMap(kind => [kindConnection(kind, 'out', lensed), kindConnection(kind, 'in', lensed)]).join('\n')}
    }
  `) as TypedDocumentNode<Hop1Response, Record<string, unknown>>;
  hop1Documents.set(key, document);
  return document;
}

/** The topic the lens asks content to carry; none when the centre is the topic itself. */
export function lensTopicFor(centreId: string, filter: GraphFilter): string | null {
  const topicId = filter.claimsTopicId ? normId(filter.claimsTopicId) : null;
  return topicId && topicId !== normId(centreId) ? topicId : null;
}

function nodeVariables() {
  return {
    namePropertyId: normId(SystemIds.NAME_PROPERTY),
    unplacingPropertyIds: [normId(SystemIds.NAME_PROPERTY), ...[...HIDDEN_PROPERTIES].map(normId)],
    datePropertyIds: DATE_PROPERTY_IDS,
    avatarPropertyId: AVATAR_PROPERTY_ID,
    coverPropertyId: COVER_PROPERTY_ID,
    imageUrlPropertyId: IMAGE_URL_PROPERTY_ID,
  };
}

export function hop1Variables(centreId: string, filter: GraphFilter) {
  const topicId = lensTopicFor(centreId, filter);
  return {
    id: normId(centreId),
    spaceIds: filter.spaceIds ?? null,
    plumbingPropertyIds: PLUMBING_RELATION_TYPE_IDS,
    first: HOP1_PER_KIND,
    textPropertyIds: [normId(SystemIds.NAME_PROPERTY), normId(SystemIds.DESCRIPTION_PROPERTY)],
    ...(filter.kinds.includes('claim') ? { newsEventTypeId: NEWS_EVENT_TYPE_ID } : {}),
    ...Object.fromEntries(filter.kinds.map(kind => [`${kind}TypeIds`, GRAPH_KIND_TYPE_IDS[kind]])),
    ...(topicId ? { topicsPropertyId: TOPICS_PROPERTY_ID, topicId } : {}),
    ...nodeVariables(),
  };
}

type RawNode = RawEntity & {
  agrees?: string | number | null;
  disagrees?: string | number | null;
  placed?: Array<{ spaceId: string }> | null;
  dates?: Array<{ datetime: string | null; date: string | null }> | null;
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

export function decodeNode(raw: RawNode): GraphNode | null {
  const entity = decodeEntity(raw);
  const typeIds = entity.types.map(type => type.id);
  const kind = graphKindOf(typeIds);
  if (!kind || !entity.name) return null;
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
  const centreNode = rawCentre ? decodeNode(rawCentre) : null;
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
      query: hop1Document(filter.kinds, lensTopicFor(centreId, filter) !== null),
      decoder: (response: Hop1Response) => decodeHop1(response, centreId, filter.kinds),
      variables: hop1Variables(centreId, filter),
      signal,
    })
  );
}

/** Ids go in the document as literals: one alias pair per hop-1 node. */
export function hop2Document(ids: readonly string[]) {
  const connection = (id: string, index: number, direction: 'in' | 'out') => {
    const self = direction === 'out' ? 'fromEntityId' : 'toEntityId';
    const end = direction === 'out' ? 'toEntity' : 'fromEntity';
    return `n${index}_${direction}: relationsConnection(
      first: $first
      filter: {
        ${self}: { is: "${normId(id)}" }
        spaceId: { in: $spaceIds }
        typeId: { notIn: $plumbingPropertyIds }
        ${end}: { typeIds: { overlaps: $kindTypeIds } }
      }
    ) { nodes { id spaceId typeId type { name } ${end} { ${NODE_FIELDS} } } }`;
  };
  return parse(/* GraphQL */ `
    query GraphNeighbourhoodHop2(
      $spaceIds: [UUID!]
      $plumbingPropertyIds: [UUID!]
      $kindTypeIds: [UUID!]
      $first: Int
      ${NODE_VARIABLES}
    ) {
      ${ids.flatMap((id, index) => [connection(id, index, 'out'), connection(id, index, 'in')]).join('\n')}
    }
  `) as TypedDocumentNode<Record<string, RawConnection>, Record<string, unknown>>;
}

export function hop2Variables(filter: GraphFilter) {
  return {
    spaceIds: filter.spaceIds ?? null,
    plumbingPropertyIds: PLUMBING_RELATION_TYPE_IDS,
    kindTypeIds: filter.kinds.flatMap(kind => GRAPH_KIND_TYPE_IDS[kind]),
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

export function fetchHop2(ids: readonly string[], filter: GraphFilter, signal?: AbortSignal): Promise<GraphHop2> {
  if (ids.length === 0) return Promise.resolve({});
  return Effect.runPromise(
    graphql({
      query: hop2Document(ids),
      decoder: (response: Record<string, RawConnection>) => decodeHop2(response, ids),
      variables: hop2Variables(filter),
      signal,
    })
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
    truncated: false,
  };
}
