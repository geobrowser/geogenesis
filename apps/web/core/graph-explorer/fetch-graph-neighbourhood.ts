import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { type DocumentNode, parse, visit } from 'graphql';

import { HIDDEN_PROPERTIES } from '~/core/constants';
import { graphql } from '~/core/io/graphql-client';
import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID, IMAGE_URL_PROPERTY_ID } from '~/core/io/subgraph/space-image';
import { HIDDEN_PROPERTY_ID, isHiddenMarker } from '~/core/moderation/hidden';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';
import { normId } from '~/core/utils/norm-id';

import { TOPIC_LENS_FILTER, topicLensVariables } from './claims-about';
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
/** The least a hop's node request gets after slow links. */
export const NODES_MIN_MS = 2_000;

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

/** Hop 2 by parent, and how many sides failed or ran out of time and are missing from it. */
export type GraphHop2Result = { hop2: GraphHop2; failedSides: number };

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

/** The far end's kinds in hop 2. Lensed: content must carry the topic. `other`: also entities of no listed kind. */
function hop2FarEnd(lensed: boolean, other: boolean) {
  const branches = lensed
    ? [
        '{ typeIds: { overlaps: $openTypeIds }, not: { typeIds: { overlaps: $lensedTypeIds } } }',
        `{ typeIds: { overlaps: $lensedTypeIds } ${TOPIC_LENS_FILTER} }`,
      ]
    : ['{ typeIds: { overlaps: $kindTypeIds } }'];
  if (other) branches.push('{ not: { typeIds: { overlaps: $notOtherTypeIds } } }');
  return `or: [${branches.join(' ')}]`;
}

/**
 * Links around `$id` to far ends matching `farConditions`, ids only, so each stays under the API's
 * expensive-query cost floor. Node fields come in one batched request per hop.
 */
function linksSelection(
  alias: string,
  direction: 'in' | 'out',
  farConditions: readonly string[],
  entityFirst: boolean,
  withPageInfo: boolean
) {
  const self = direction === 'out' ? 'fromEntityId' : 'toEntityId';
  const reaches = `${self}: { is: $id }, spaceId: { in: $spaceIds }, typeId: { notIn: $plumbingPropertyIds }`;
  const pageInfo = withPageInfo ? 'pageInfo { hasNextPage }' : '';
  if (!entityFirst) {
    const end = direction === 'out' ? 'toEntity' : 'fromEntity';
    return `${alias}: relationsConnection(
      first: $first
      filter: { ${reaches}, ${end}: { and: [${farConditions.join(' ')}] } }
    ) { nodes { id spaceId typeId type { name } fromEntityId toEntityId } ${pageInfo} }`;
  }
  // One row per entity, with one in-scope link as its edge. Most recently updated first.
  const link = direction === 'out' ? 'backlinks' : 'relations';
  return `${alias}: entitiesConnection(
    first: $first
    orderBy: [UPDATED_AT_DESC, ID_ASC]
    filter: { and: [${farConditions.join(' ')} { ${link}: { some: { ${reaches} } } }] }
  ) {
    nodes { id edge: ${link}List(first: 1, orderBy: [ID_ASC], filter: { ${reaches} }) { id spaceId typeId type { name } } }
    ${pageInfo}
  }`;
}

function kindLinks(kind: GraphKind, direction: 'in' | 'out', lensed: boolean, scoped: boolean) {
  const { types, lens, exclude } = farEndFilter(kind, lensed);
  const conditions = [`{ ${types} }`, lens && `{ ${lens} }`, exclude && `{ not: ${exclude} }`];
  return linksSelection(
    `${kind}_${direction}`,
    direction,
    conditions.filter((condition): condition is string => Boolean(condition)),
    isEntityFirst(`${kind}_${direction}`, scoped),
    true
  );
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

type LinksResponse = Record<string, unknown>;
const linksDocuments = new Map<string, TypedDocumentNode<LinksResponse, Record<string, unknown>>>();

function cachedDocument(key: string, name: string, selection: () => string) {
  const cached = linksDocuments.get(key);
  if (cached) return cached;
  const document = queryDocument(name, selection()) as TypedDocumentNode<LinksResponse, Record<string, unknown>>;
  linksDocuments.set(key, document);
  return document;
}

/** One request per kind, both directions, so a slow or failing kind can't hold up or blank the rest. */
export function hop1KindDocument(kind: GraphKind, lensed: boolean, scoped: boolean) {
  return cachedDocument(
    `hop1|${kind}|${lensed}|${scoped}`,
    'GraphNeighbourhoodKind',
    () => `${kindLinks(kind, 'out', lensed, scoped)}\n${kindLinks(kind, 'in', lensed, scoped)}`
  );
}

/** One direction around one hop-1 node (`$id`), relation first or entity first. */
export function hop2Document(direction: 'in' | 'out', lensed: boolean, other: boolean, entityFirst: boolean) {
  return cachedDocument(`hop2|${direction}|${lensed}|${other}|${entityFirst}`, 'GraphNeighbourhoodHop2', () =>
    linksSelection('hop', direction, [`{ ${hop2FarEnd(lensed, other)} }`], entityFirst, false)
  );
}

/** Every node's fields in one request; claims also carry their placement. */
export const nodesDocument = queryDocument(
  'GraphNeighbourhoodNodes',
  `claims: entitiesConnection(first: $first, filter: { id: { in: $ids }, typeIds: { overlaps: $claimTypeIds } }) {
    nodes { ${NODE_FIELDS} ${PLACED_FIELD} }
  }
  others: entitiesConnection(first: $first, filter: { id: { in: $ids }, not: { typeIds: { overlaps: $claimTypeIds } } }) {
    nodes { ${NODE_FIELDS} }
  }`
) as TypedDocumentNode<
  { claims: { nodes: RawNode[] } | null; others: { nodes: RawNode[] } | null },
  Record<string, unknown>
>;

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

type RawCentre = RawNode & {
  description: string | null;
  texts?: Array<{ propertyId: string; spaceId: string; text: string | null }> | null;
};

type RawRelationFields = { id: string; spaceId: string; typeId: string; type: { name: string | null } | null };

/** A link from the node asked about to `farId`. */
export type RawLink = RawRelationFields & { farId: string };

type RawLinks =
  | {
      nodes: Array<
        | (RawRelationFields & { fromEntityId: string; toEntityId: string })
        | { id: string; edge?: RawRelationFields[] | null }
      >;
      pageInfo?: { hasNextPage: boolean };
    }
  | null
  | undefined;

/** One side's links, whichever shape asked for them. */
export function readLinks(connection: RawLinks, direction: 'in' | 'out') {
  const links = (connection?.nodes ?? []).flatMap((row): RawLink[] => {
    if ('edge' in row) {
      const edge = row.edge?.[0];
      return edge ? [{ ...edge, farId: normId(row.id) }] : [];
    }
    if (!('fromEntityId' in row)) return [];
    const { fromEntityId, toEntityId, ...relation } = row;
    return [{ ...relation, farId: normId(direction === 'out' ? toEntityId : fromEntityId) }];
  });
  return { links, more: connection?.pageInfo?.hasNextPage ?? false };
}

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

/** Links in order, each with its far end's node; hidden, unnamed, unknown and self links drop. */
export function decodeLinks(
  links: readonly RawLink[],
  selfId: string,
  direction: 'in' | 'out',
  nodes: ReadonlyMap<string, GraphNode>
) {
  return links.flatMap(link => {
    const node = nodes.get(link.farId);
    if (!node || node.id === selfId) return [];
    const edge: GraphEdge = {
      id: link.id,
      fromId: direction === 'out' ? selfId : node.id,
      toId: direction === 'out' ? node.id : selfId,
      propertyId: normId(link.typeId),
      propertyName: link.type?.name ?? null,
      spaceId: normId(link.spaceId),
    };
    return [{ node, edge }];
  });
}

/** The nodes behind `ids`, decoded; hidden and unnamed ones are absent. */
export async function fetchNodes(
  ids: readonly string[],
  signal?: AbortSignal,
  timeoutMs = GRAPH_REQUEST_TIMEOUT_MS
): Promise<Map<string, GraphNode>> {
  // Sorted, so the API's response cache doesn't depend on link order.
  const unique = [...new Set(ids.map(normId))].sort();
  if (unique.length === 0) return new Map();
  const response = await Effect.runPromise(
    graphql({
      query: nodesDocument,
      decoder: response => response,
      variables: pickVariables(nodesDocument, {
        ids: unique,
        first: unique.length,
        claimTypeIds: GRAPH_KIND_TYPE_IDS.claim,
        unplacingPropertyIds: UNPLACING_PROPERTY_IDS,
        ...nodeVariables(),
      }),
      signal,
      timeoutMs,
    })
  );
  const raws = [...(response.claims?.nodes ?? []), ...(response.others?.nodes ?? [])];
  return new Map(
    raws.flatMap(raw => {
      const node = decodeNode(raw);
      return node ? [[normId(raw.id), node] as const] : [];
    })
  );
}

export type Hop1Side = { kind: GraphKind; direction: 'in' | 'out'; links: RawLink[]; more: boolean };

export function decodeCentre(rawCentre: RawCentre): GraphNeighbourCentre | null {
  const node = decodeNode(rawCentre, true);
  if (!node) return null;
  return {
    ...node,
    description: rawCentre.description?.trim() || null,
    texts: (rawCentre.texts ?? []).flatMap(value =>
      value.text ? [{ propertyId: normId(value.propertyId), spaceId: normId(value.spaceId), text: value.text }] : []
    ),
  };
}

/** Sides in kind order, out before in, as asked. */
export function decodeHop1(
  rawCentre: RawCentre | null,
  sides: readonly Hop1Side[],
  nodes: ReadonlyMap<string, GraphNode>,
  centreId: string
): GraphHop1 {
  const id = normId(centreId);
  const centre = rawCentre ? decodeCentre(rawCentre) : null;
  // A hidden centre shows as not in the graph, with nothing around it.
  if (rawCentre && !centre) return { centre: null, neighbours: [], moreKinds: [] };
  const neighbours = sides.flatMap(side => decodeLinks(side.links, id, side.direction, nodes));
  const moreKinds = [...new Set(sides.filter(side => side.more).map(side => side.kind))];
  return { centre, neighbours, moreKinds };
}

/**
 * The centre and each kind's links in parallel, then their nodes, drawn together. A kind that fails
 * drops out; the centre, the nodes, or every kind failing, or a cancel, fails the hop.
 */
export async function fetchHop1(centreId: string, filter: GraphFilter, signal?: AbortSignal): Promise<GraphHop1> {
  const startedAt = Date.now();
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
    ...filter.kinds.map(kind => request(hop1KindDocument(kind, lensed, scoped))),
  ]);
  // A cancelled hop is not a partial one.
  if (signal?.aborted) throw signal.reason;
  if (centre.status === 'rejected') throw centre.reason;
  const failed = kinds.find(result => result.status === 'rejected');
  if (failed && kinds.every(result => result.status === 'rejected')) throw failed.reason;
  const rawCentre = centre.value.entity;
  const failedKinds = filter.kinds.filter((_, index) => kinds[index].status === 'rejected');
  if (rawCentre && !decodeCentre(rawCentre)) return { centre: null, neighbours: [], moreKinds: [], failedKinds };
  const sides = filter.kinds.flatMap((kind, index): Hop1Side[] => {
    const result = kinds[index];
    if (result.status === 'rejected') return [];
    return (['out', 'in'] as const).map(direction => ({
      kind,
      direction,
      ...readLinks(result.value[`${kind}_${direction}`] as RawLinks, direction),
    }));
  });
  // The nodes get what is left of the hop's deadline, so a failing hop shows in about 10 s.
  const left = Math.max(NODES_MIN_MS, GRAPH_REQUEST_TIMEOUT_MS - (Date.now() - startedAt));
  const nodes = await fetchNodes(
    sides.flatMap(side => side.links.map(link => link.farId)),
    signal,
    left
  );
  return { ...decodeHop1(rawCentre, sides, nodes, centreId), failedKinds };
}

/**
 * Relation first gets this long; a node whose links are mostly of kinds the map doesn't show can
 * walk them all, and is asked again entity first in the rest of the deadline.
 */
export const HOP2_FIRST_TRY_MS = 3_000;
/** Hop-2 link requests in flight at once, so one load holds few API connections. */
export const HOP2_CONCURRENCY = 8;

/** One direction around one hop-1 node, within the hop's deadline. */
function fetchHop2Links(
  id: string,
  direction: 'in' | 'out',
  filter: GraphFilter,
  variables: Record<string, unknown>,
  deadline: number,
  signal?: AbortSignal
) {
  const lensed = lensTopicFor(filter) !== null;
  const other = filter.kinds.includes('other');
  const ask = (entityFirst: boolean, timeoutMs: number) => {
    const query = hop2Document(direction, lensed, other, entityFirst);
    return graphql({
      query,
      decoder: (response: LinksResponse) => readLinks(response.hop as RawLinks, direction).links,
      variables: pickVariables(query, { ...variables, id }),
      signal,
      timeoutMs,
    });
  };
  const left = () => deadline - Date.now();
  // Unscoped, entity first is the slower plan, so relation first gets the whole deadline.
  if (filter.spaceIds === undefined) return Effect.runPromise(ask(false, left()));
  return Effect.runPromise(
    ask(false, Math.min(HOP2_FIRST_TRY_MS, left())).pipe(
      Effect.catchIf(
        error => error.isTimeout && left() > 0,
        () => ask(true, left())
      )
    )
  );
}

/**
 * Each side of each hop-1 node, a few at a time, then their nodes. A failed side drops out alone;
 * every side or the nodes failing, or a cancel, fails the hop.
 */
export async function fetchHop2(
  ids: readonly string[],
  filter: GraphFilter,
  signal?: AbortSignal
): Promise<GraphHop2Result> {
  if (ids.length === 0) return { hop2: {}, failedSides: 0 };
  const deadline = Date.now() + GRAPH_REQUEST_TIMEOUT_MS;
  const variables = hop2Variables(filter);
  const sides = ids.flatMap(id => (['out', 'in'] as const).map(direction => ({ id: normId(id), direction })));
  const results = await mapWithConcurrency(sides, HOP2_CONCURRENCY, ({ id, direction }) =>
    deadline - Date.now() <= 0
      ? Promise.resolve<PromiseSettledResult<RawLink[]>>({
          status: 'rejected',
          reason: new Error('Hop 2 ran out of time'),
        })
      : fetchHop2Links(id, direction, filter, variables, deadline, signal).then(
          (value): PromiseSettledResult<RawLink[]> => ({ status: 'fulfilled', value }),
          (reason): PromiseSettledResult<RawLink[]> => ({ status: 'rejected', reason })
        )
  );
  if (signal?.aborted) throw signal.reason;
  const failed = results.find(result => result.status === 'rejected');
  if (failed && results.every(result => result.status === 'rejected')) throw failed.reason;
  const links = results.map(result => (result.status === 'fulfilled' ? result.value : []));
  const nodes = await fetchNodes(
    links.flat().map(link => link.farId),
    signal,
    Math.max(NODES_MIN_MS, deadline - Date.now())
  );
  const hop2: GraphHop2 = Object.fromEntries(ids.map(id => [normId(id), []]));
  sides.forEach(({ id, direction }, index) => hop2[id].push(...decodeLinks(links[index], id, direction, nodes)));
  return { hop2, failedSides: results.filter(result => result.status === 'rejected').length };
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
