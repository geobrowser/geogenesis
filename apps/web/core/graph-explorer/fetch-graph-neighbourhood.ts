import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { type DocumentNode, parse, visit } from 'graphql';

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
/** Under the gateway's 15 s limit, so a query it would time out fails here first, once. */
export const GRAPH_REQUEST_TIMEOUT_MS = 9_000;

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
  /** Kinds whose request failed, so missing here. */
  failedKinds?: GraphKind[];
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
  hidden: valuesList(filter: { propertyId: { is: $hiddenPropertyId } }) { text boolean }
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

/**
 * Asked entity first: relation first, a kind rare among a large topic's backlinks walks nearly all
 * of them to fill a page. Dense kinds stay relation first, as fast there and keeping their picks.
 */
export const ENTITY_FIRST: ReadonlySet<string> = new Set(['ent_in', 'other_in']);

/** Only within a space scope: unscoped, the entity-first plan can be the slower one. */
function isEntityFirst(alias: string, scoped: boolean) {
  return scoped && ENTITY_FIRST.has(alias);
}

/** Conditions on the far end's types, shared by both shapes. */
function farEndFilter(kind: GraphKind, lensed: boolean) {
  const types =
    kind === 'other' ? 'not: { typeIds: { overlaps: $otherTypeIds } }' : `typeIds: { overlaps: $${kind}TypeIds }`;
  const lens = lensed && LENSED_KINDS.includes(kind) ? TOPIC_LENS_FILTER : '';
  // A Topic typed as content too reads as that content, so the lens applies to it there.
  const exclude =
    kind === 'claim'
      ? '{ typeIds: { overlaps: [$newsEventTypeId] } }'
      : kind === 'topic' && lensed
        ? '{ typeIds: { overlaps: $lensedTypeIds } }'
        : null;
  return { types, lens, exclude };
}

function relationFirstConnection(kind: GraphKind, direction: 'in' | 'out', lensed: boolean) {
  const self = direction === 'out' ? 'fromEntityId' : 'toEntityId';
  const end = direction === 'out' ? 'toEntity' : 'fromEntity';
  const { types, lens, exclude } = farEndFilter(kind, lensed);
  return `${kind}_${direction}: relationsConnection(
    first: $first
    filter: {
      ${self}: { is: $id }
      spaceId: { in: $spaceIds }
      typeId: { notIn: $plumbingPropertyIds }
      ${end}: { ${types} ${lens} }
      ${exclude ? `not: { ${end}: ${exclude} }` : ''}
    }
  ) {
    nodes { id spaceId typeId type { name } ${end} { ${NODE_FIELDS} ${kind === 'claim' ? PLACED_FIELD : ''} } }
    pageInfo { hasNextPage }
  }`;
}

/**
 * The same neighbours as `relationFirstConnection`, one per entity, each with one in-scope link to
 * the centre as its edge. Most recently updated first, as the claim lists order.
 */
function entityFirstConnection(kind: GraphKind, direction: 'in' | 'out', lensed: boolean) {
  const link = direction === 'out' ? 'backlinks' : 'relations';
  const self = direction === 'out' ? 'fromEntityId' : 'toEntityId';
  const reaches = `{ ${self}: { is: $id }, spaceId: { in: $spaceIds }, typeId: { notIn: $plumbingPropertyIds } }`;
  const { types, lens, exclude } = farEndFilter(kind, lensed);
  const conditions = [
    `{ ${types} }`,
    lens && `{ ${lens} }`,
    exclude && `{ not: ${exclude} }`,
    `{ ${link}: { some: ${reaches} } }`,
  ];
  return `${kind}_${direction}: entitiesConnection(
    first: $first
    orderBy: [UPDATED_AT_DESC, ID_ASC]
    filter: { and: [${conditions.filter(Boolean).join(' ')}] }
  ) {
    nodes {
      ${NODE_FIELDS} ${kind === 'claim' ? PLACED_FIELD : ''}
      edge: ${link}List(first: 1, orderBy: [ID_ASC], filter: ${reaches}) { id spaceId typeId type { name } }
    }
    pageInfo { hasNextPage }
  }`;
}

function kindConnection(kind: GraphKind, direction: 'in' | 'out', lensed: boolean, scoped: boolean) {
  return isEntityFirst(`${kind}_${direction}`, scoped)
    ? entityFirstConnection(kind, direction, lensed)
    : relationFirstConnection(kind, direction, lensed);
}

const VARIABLE_TYPES: Record<string, string> = {
  id: 'UUID!',
  first: 'Int',
  newsEventTypeId: 'UUID!',
  topicsPropertyId: 'UUID!',
  topicId: 'UUID!',
  hiddenPropertyId: 'UUID!',
  namePropertyId: 'UUID!',
  avatarPropertyId: 'UUID!',
  coverPropertyId: 'UUID!',
  imageUrlPropertyId: 'UUID!',
};

/** A query declaring exactly the variables its selection uses, since GraphQL rejects unused ones. */
function queryDocument(name: string, selection: string) {
  const used = new Set<string>();
  visit(parse(`{ ${selection} }`), { Variable: node => void used.add(node.name.value) });
  const declarations = [...used].map(variable => `$${variable}: ${VARIABLE_TYPES[variable] ?? '[UUID!]'}`);
  return parse(`query ${name}(${declarations.join(' ')}) { ${selection} }`);
}

/** The variable names `document` declares. */
export function declaredVariables(document: DocumentNode) {
  const operation = document.definitions[0];
  return operation.kind === 'OperationDefinition'
    ? (operation.variableDefinitions ?? []).map(definition => definition.variable.name.value)
    : [];
}

function pickVariables(document: DocumentNode, variables: Record<string, unknown>) {
  return Object.fromEntries(declaredVariables(document).map(name => [name, variables[name] ?? null]));
}

export const hop1CentreDocument = queryDocument(
  'GraphNeighbourhoodCentre',
  `entity(id: $id) {
    ${NODE_FIELDS}
    ${PLACED_FIELD}
    description
    texts: valuesList(filter: { propertyId: { in: $textPropertyIds } }) { propertyId spaceId text }
  }`
) as TypedDocumentNode<{ entity: RawCentre | null }, Record<string, unknown>>;

const hop1KindDocuments = new Map<string, TypedDocumentNode<Record<string, unknown>, Record<string, unknown>>>();

/** One request per kind, both directions, so a slow or failing kind can't hold up or blank the rest. */
export function hop1KindDocument(kind: GraphKind, lensed: boolean, scoped: boolean) {
  const key = `${kind}|${lensed}|${scoped}`;
  const cached = hop1KindDocuments.get(key);
  if (cached) return cached;
  const document = queryDocument(
    'GraphNeighbourhoodKind',
    `${kindConnection(kind, 'out', lensed, scoped)}\n${kindConnection(kind, 'in', lensed, scoped)}`
  ) as TypedDocumentNode<Record<string, unknown>, Record<string, unknown>>;
  hop1KindDocuments.set(key, document);
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
  /** Hidden values in every space: a node's link and vote space can be outside the explorer's. */
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

type RawEntityFirstConnection = {
  nodes: Array<RawNode & { edge?: Array<Omit<RawRelation, 'toEntity' | 'fromEntity'>> | null }>;
  pageInfo?: { hasNextPage: boolean };
} | null;

/** An entity-first page in the relation-first shape: each entity behind its edge. */
export function asRelationConnection(connection: RawEntityFirstConnection, direction: 'in' | 'out'): RawConnection {
  if (!connection) return null;
  const end = direction === 'out' ? 'toEntity' : 'fromEntity';
  return {
    nodes: connection.nodes.flatMap(({ edge, ...entity }) => {
      const relation = edge?.[0];
      return relation ? [{ ...relation, [end]: entity }] : [];
    }),
    pageInfo: connection.pageInfo,
  };
}

/** A kind's two connections, its entity-first directions in the relation-first shape. */
function normaliseKind(response: Record<string, unknown>, kind: GraphKind, scoped: boolean) {
  const normalised: Record<string, RawConnection> = {};
  for (const direction of ['out', 'in'] as const) {
    const alias = `${kind}_${direction}`;
    const connection = response[alias] ?? null;
    normalised[alias] = isEntityFirst(alias, scoped)
      ? asRelationConnection(connection as RawEntityFirstConnection, direction)
      : (connection as RawConnection);
  }
  return normalised;
}

type RawCentre = RawNode & {
  description: string | null;
  texts?: Array<{ propertyId: string; spaceId: string; text: string | null }> | null;
};

/** `entity` plus one `<kind>_<direction>` connection per kind. */
type Hop1Response = { entity: RawCentre | null; [alias: string]: RawConnection | RawCentre | null };

/**
 * Null for a hidden entity (Hidden = true in any space), or an unnamed or plumbing neighbour; any
 * other centre is a node.
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

/**
 * The centre and each kind in parallel, drawn together once all settle. A kind that fails drops out;
 * the centre failing, or every kind, fails the hop.
 */
export async function fetchHop1(centreId: string, filter: GraphFilter, signal?: AbortSignal): Promise<GraphHop1> {
  const lensed = lensTopicFor(filter) !== null;
  const scoped = filter.spaceIds !== undefined;
  const variables = hop1Variables(centreId, filter);
  const request = <T>(query: TypedDocumentNode<T, Record<string, unknown>>) =>
    Effect.runPromise(
      graphql({
        query,
        decoder: (response: T) => response,
        variables: pickVariables(query, variables),
        signal,
        timeoutMs: GRAPH_REQUEST_TIMEOUT_MS,
      })
    );
  const [centre, ...kinds] = await Promise.allSettled([
    request(hop1CentreDocument),
    ...filter.kinds.map(kind =>
      request(hop1KindDocument(kind, lensed, scoped)).then(response => normaliseKind(response, kind, scoped))
    ),
  ]);
  // A cancelled hop is not a partial one.
  if (signal?.aborted) throw signal.reason;
  if (centre.status === 'rejected') throw centre.reason;
  const failed = kinds.find(result => result.status === 'rejected');
  if (failed && kinds.every(result => result.status === 'rejected')) throw failed.reason;
  const settled = filter.kinds.filter((_, index) => kinds[index].status === 'fulfilled');
  const response: Hop1Response = { entity: centre.value.entity };
  for (const result of kinds) if (result.status === 'fulfilled') Object.assign(response, result.value);
  const failedKinds = filter.kinds.filter(kind => !settled.includes(kind));
  return { ...decodeHop1(response, centreId, settled), failedKinds };
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
      timeoutMs: GRAPH_REQUEST_TIMEOUT_MS,
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
      timeoutMs: GRAPH_REQUEST_TIMEOUT_MS,
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
      timeoutMs: GRAPH_REQUEST_TIMEOUT_MS,
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
