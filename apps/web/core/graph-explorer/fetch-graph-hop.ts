import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID, IMAGE_URL_PROPERTY_ID } from '~/core/io/subgraph/space-image';
import { normId } from '~/core/utils/norm-id';

import type { GraphFilter } from './graph-filter';

/** Per direction. A centre with more than this shows the first page and says so. */
export const GRAPH_HOP_RELATIONS_PAGE = 100;

export type GraphEntity = {
  id: string;
  name: string | null;
  spaceIds: string[];
  types: Array<{ id: string; name: string | null }>;
  /** Avatar, else cover; an `ipfs://` or http URL. */
  image: string | null;
};

export type GraphCentre = GraphEntity & { description: string | null };

export type GraphRelation = {
  id: string;
  direction: 'out' | 'in';
  propertyId: string;
  propertyName: string | null;
  /** The space the relation was written in. */
  spaceId: string;
  position: string | null;
  entity: GraphEntity;
};

export type GraphHop = {
  centre: GraphCentre | null;
  relations: GraphRelation[];
  /** Either direction had more relations than one page. */
  truncated: boolean;
};

const NEIGHBOUR_FIELDS = /* GraphQL */ `
  id
  name
  spaceIds
  types { id name }
  relationsList(filter: { typeId: { in: [$avatarPropertyId, $coverPropertyId] } }) {
    typeId
    toEntity { valuesList(filter: { propertyId: { is: $imageUrlPropertyId } }) { text } }
  }
`;

// No totalCount: it is what made these connections slow on testnet (1.5–4.3 s).
// A null `$spaceIds` is ignored by the API, which is how "no space filter" is sent.
const graphHopDocument = parse(/* GraphQL */ `
  query GraphHop(
    $id: UUID!
    $relationTypeIds: [UUID!]
    $spaceIds: [UUID!]
    $includeTypeIds: [UUID!]
    $excludeTypeIds: [UUID!]
    $first: Int
    $avatarPropertyId: UUID!
    $coverPropertyId: UUID!
    $imageUrlPropertyId: UUID!
  ) {
    entity(id: $id) {
      ${NEIGHBOUR_FIELDS}
      description
    }
    outgoing: relationsConnection(
      first: $first
      filter: {
        fromEntityId: { is: $id }
        typeId: { in: $relationTypeIds }
        spaceId: { in: $spaceIds }
        toEntity: { typeIds: { overlaps: $includeTypeIds } }
        not: { toEntity: { typeIds: { overlaps: $excludeTypeIds } } }
      }
    ) {
      nodes { id spaceId position typeId type { name } toEntity { ${NEIGHBOUR_FIELDS} } }
      pageInfo { hasNextPage }
    }
    incoming: relationsConnection(
      first: $first
      filter: {
        toEntityId: { is: $id }
        typeId: { in: $relationTypeIds }
        spaceId: { in: $spaceIds }
        fromEntity: { typeIds: { overlaps: $includeTypeIds } }
        not: { fromEntity: { typeIds: { overlaps: $excludeTypeIds } } }
      }
    ) {
      nodes { id spaceId position typeId type { name } fromEntity { ${NEIGHBOUR_FIELDS} } }
      pageInfo { hasNextPage }
    }
  }
`) as TypedDocumentNode<GraphHopResponse, Record<string, unknown>>;

type RawEntity = {
  id: string;
  name: string | null;
  spaceIds: string[] | null;
  types: Array<{ id: string; name: string | null }> | null;
  relationsList: Array<{ typeId: string; toEntity: { valuesList: Array<{ text: string | null }> } | null }> | null;
};

type RawRelation = {
  id: string;
  spaceId: string;
  position: string | null;
  typeId: string;
  type: { name: string | null } | null;
  toEntity?: RawEntity | null;
  fromEntity?: RawEntity | null;
};

type RawConnection = { nodes: RawRelation[]; pageInfo: { hasNextPage: boolean } } | null;

export type GraphHopResponse = {
  entity: (RawEntity & { description: string | null }) | null;
  outgoing: RawConnection;
  incoming: RawConnection;
};

function imageOf(entity: RawEntity): string | null {
  const relations = entity.relationsList ?? [];
  for (const propertyId of [AVATAR_PROPERTY_ID, COVER_PROPERTY_ID]) {
    for (const relation of relations) {
      if (normId(relation.typeId) !== propertyId) continue;
      const url = relation.toEntity?.valuesList.find(value => value.text)?.text;
      if (url) return url;
    }
  }
  return null;
}

function decodeEntity(entity: RawEntity): GraphEntity {
  return {
    id: normId(entity.id),
    name: entity.name?.trim() ? entity.name.trim() : null,
    spaceIds: (entity.spaceIds ?? []).map(normId),
    types: entity.types ?? [],
    image: imageOf(entity),
  };
}

function decodeRelations(connection: RawConnection, direction: 'out' | 'in'): GraphRelation[] {
  return (connection?.nodes ?? []).flatMap(node => {
    const raw = direction === 'out' ? node.toEntity : node.fromEntity;
    if (!raw) return [];
    return [
      {
        id: node.id,
        direction,
        propertyId: normId(node.typeId),
        propertyName: node.type?.name ?? null,
        spaceId: normId(node.spaceId),
        position: node.position,
        entity: decodeEntity(raw),
      },
    ];
  });
}

export function decodeGraphHop(response: GraphHopResponse): GraphHop {
  const centre = response.entity
    ? { ...decodeEntity(response.entity), description: response.entity.description?.trim() || null }
    : null;
  return {
    centre,
    relations: [...decodeRelations(response.outgoing, 'out'), ...decodeRelations(response.incoming, 'in')],
    truncated: Boolean(response.outgoing?.pageInfo.hasNextPage || response.incoming?.pageInfo.hasNextPage),
  };
}

export function graphHopVariables(entityId: string, filter: GraphFilter) {
  return {
    id: normId(entityId),
    relationTypeIds: filter.relationTypeIds,
    spaceIds: filter.spaceIds ?? null,
    includeTypeIds: filter.includeTypeIds,
    excludeTypeIds: filter.excludeTypeIds,
    first: GRAPH_HOP_RELATIONS_PAGE,
    avatarPropertyId: AVATAR_PROPERTY_ID,
    coverPropertyId: COVER_PROPERTY_ID,
    imageUrlPropertyId: IMAGE_URL_PROPERTY_ID,
  };
}

export function fetchGraphHop(entityId: string, filter: GraphFilter, signal?: AbortSignal) {
  return Effect.runPromise(
    graphql({
      query: graphHopDocument,
      decoder: decodeGraphHop,
      variables: graphHopVariables(entityId, filter),
      signal,
    })
  );
}
