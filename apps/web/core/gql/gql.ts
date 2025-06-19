/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n\n    types {\n      id\n      name\n    }\n\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      verified\n      entityId\n      to {\n        id\n        name\n        types {\n          id\n          name\n        }\n        values {\n          propertyId\n          value\n        }\n      }\n      toSpaceId\n      type {\n        id\n        entity {\n          name\n        }\n        renderableType\n      }\n    }\n  }\n": typeof types.FullEntityFragmentDoc,
    "\n  query AllEntities($spaceId: String, $limit: Int, $offset: Int) {\n    entities(spaceId: $spaceId, limit: $limit, offset: $offset) {\n      ...FullEntity\n    }\n  }\n": typeof types.AllEntitiesDocument,
    "\n  query EntitiesBatch($ids: [String!]!, $spaceId: String) {\n    entities(spaceId: $spaceId, filter: { id: { in: $ids } }) {\n      ...FullEntity\n    }\n  }\n": typeof types.EntitiesBatchDocument,
    "\n  query Entity($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...FullEntity\n    }\n  }\n": typeof types.EntityDocument,
    "\n  query EntityTypes($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      types {\n        id\n        name\n      }\n    }\n  }\n": typeof types.EntityTypesDocument,
    "\n  fragment FullSpace on Space {\n    id\n    type\n    daoAddress\n    spaceAddress\n    mainVotingAddress\n    membershipAddress\n    personalAddress\n\n    members {\n      address\n    }\n\n    editors {\n      address\n    }\n\n    entity {\n      ...FullEntity\n    }\n  }\n": typeof types.FullSpaceFragmentDoc,
    "\n  query Space($id: String!) {\n    space(id: $id) {\n      ...FullSpace\n    }\n  }\n": typeof types.SpaceDocument,
    "\n  query Spaces($filter: SpaceFilter, $limit: Int, $offset: Int) {\n    spaces(filter: $filter, limit: $limit, offset: $offset) {\n      ...FullSpace\n    }\n  }\n": typeof types.SpacesDocument,
    "\n  fragment Result on Entity {\n    id\n    name\n    description\n    spaces\n    types {\n      id\n      name\n    }\n  }\n": typeof types.ResultFragmentDoc,
    "\n  query Result($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...Result\n    }\n  }\n": typeof types.ResultDocument,
    "\n  query Results($query: String!, $filter: SearchFilter, $spaceId: String, $limit: Int, $offset: Int) {\n    search(query: $query, filter: $filter, spaceId: $spaceId, limit: $limit, offset: $offset) {\n      ...Result\n    }\n  }\n": typeof types.ResultsDocument,
};
const documents: Documents = {
    "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n\n    types {\n      id\n      name\n    }\n\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      verified\n      entityId\n      to {\n        id\n        name\n        types {\n          id\n          name\n        }\n        values {\n          propertyId\n          value\n        }\n      }\n      toSpaceId\n      type {\n        id\n        entity {\n          name\n        }\n        renderableType\n      }\n    }\n  }\n": types.FullEntityFragmentDoc,
    "\n  query AllEntities($spaceId: String, $limit: Int, $offset: Int) {\n    entities(spaceId: $spaceId, limit: $limit, offset: $offset) {\n      ...FullEntity\n    }\n  }\n": types.AllEntitiesDocument,
    "\n  query EntitiesBatch($ids: [String!]!, $spaceId: String) {\n    entities(spaceId: $spaceId, filter: { id: { in: $ids } }) {\n      ...FullEntity\n    }\n  }\n": types.EntitiesBatchDocument,
    "\n  query Entity($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...FullEntity\n    }\n  }\n": types.EntityDocument,
    "\n  query EntityTypes($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      types {\n        id\n        name\n      }\n    }\n  }\n": types.EntityTypesDocument,
    "\n  fragment FullSpace on Space {\n    id\n    type\n    daoAddress\n    spaceAddress\n    mainVotingAddress\n    membershipAddress\n    personalAddress\n\n    members {\n      address\n    }\n\n    editors {\n      address\n    }\n\n    entity {\n      ...FullEntity\n    }\n  }\n": types.FullSpaceFragmentDoc,
    "\n  query Space($id: String!) {\n    space(id: $id) {\n      ...FullSpace\n    }\n  }\n": types.SpaceDocument,
    "\n  query Spaces($filter: SpaceFilter, $limit: Int, $offset: Int) {\n    spaces(filter: $filter, limit: $limit, offset: $offset) {\n      ...FullSpace\n    }\n  }\n": types.SpacesDocument,
    "\n  fragment Result on Entity {\n    id\n    name\n    description\n    spaces\n    types {\n      id\n      name\n    }\n  }\n": types.ResultFragmentDoc,
    "\n  query Result($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...Result\n    }\n  }\n": types.ResultDocument,
    "\n  query Results($query: String!, $filter: SearchFilter, $spaceId: String, $limit: Int, $offset: Int) {\n    search(query: $query, filter: $filter, spaceId: $spaceId, limit: $limit, offset: $offset) {\n      ...Result\n    }\n  }\n": types.ResultsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n\n    types {\n      id\n      name\n    }\n\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      verified\n      entityId\n      to {\n        id\n        name\n        types {\n          id\n          name\n        }\n        values {\n          propertyId\n          value\n        }\n      }\n      toSpaceId\n      type {\n        id\n        entity {\n          name\n        }\n        renderableType\n      }\n    }\n  }\n"): (typeof documents)["\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n\n    types {\n      id\n      name\n    }\n\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      verified\n      entityId\n      to {\n        id\n        name\n        types {\n          id\n          name\n        }\n        values {\n          propertyId\n          value\n        }\n      }\n      toSpaceId\n      type {\n        id\n        entity {\n          name\n        }\n        renderableType\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllEntities($spaceId: String, $limit: Int, $offset: Int) {\n    entities(spaceId: $spaceId, limit: $limit, offset: $offset) {\n      ...FullEntity\n    }\n  }\n"): (typeof documents)["\n  query AllEntities($spaceId: String, $limit: Int, $offset: Int) {\n    entities(spaceId: $spaceId, limit: $limit, offset: $offset) {\n      ...FullEntity\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EntitiesBatch($ids: [String!]!, $spaceId: String) {\n    entities(spaceId: $spaceId, filter: { id: { in: $ids } }) {\n      ...FullEntity\n    }\n  }\n"): (typeof documents)["\n  query EntitiesBatch($ids: [String!]!, $spaceId: String) {\n    entities(spaceId: $spaceId, filter: { id: { in: $ids } }) {\n      ...FullEntity\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Entity($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...FullEntity\n    }\n  }\n"): (typeof documents)["\n  query Entity($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...FullEntity\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EntityTypes($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      types {\n        id\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query EntityTypes($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      types {\n        id\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment FullSpace on Space {\n    id\n    type\n    daoAddress\n    spaceAddress\n    mainVotingAddress\n    membershipAddress\n    personalAddress\n\n    members {\n      address\n    }\n\n    editors {\n      address\n    }\n\n    entity {\n      ...FullEntity\n    }\n  }\n"): (typeof documents)["\n  fragment FullSpace on Space {\n    id\n    type\n    daoAddress\n    spaceAddress\n    mainVotingAddress\n    membershipAddress\n    personalAddress\n\n    members {\n      address\n    }\n\n    editors {\n      address\n    }\n\n    entity {\n      ...FullEntity\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Space($id: String!) {\n    space(id: $id) {\n      ...FullSpace\n    }\n  }\n"): (typeof documents)["\n  query Space($id: String!) {\n    space(id: $id) {\n      ...FullSpace\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Spaces($filter: SpaceFilter, $limit: Int, $offset: Int) {\n    spaces(filter: $filter, limit: $limit, offset: $offset) {\n      ...FullSpace\n    }\n  }\n"): (typeof documents)["\n  query Spaces($filter: SpaceFilter, $limit: Int, $offset: Int) {\n    spaces(filter: $filter, limit: $limit, offset: $offset) {\n      ...FullSpace\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment Result on Entity {\n    id\n    name\n    description\n    spaces\n    types {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  fragment Result on Entity {\n    id\n    name\n    description\n    spaces\n    types {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Result($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...Result\n    }\n  }\n"): (typeof documents)["\n  query Result($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...Result\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Results($query: String!, $filter: SearchFilter, $spaceId: String, $limit: Int, $offset: Int) {\n    search(query: $query, filter: $filter, spaceId: $spaceId, limit: $limit, offset: $offset) {\n      ...Result\n    }\n  }\n"): (typeof documents)["\n  query Results($query: String!, $filter: SearchFilter, $spaceId: String, $limit: Int, $offset: Int) {\n    search(query: $query, filter: $filter, spaceId: $spaceId, limit: $limit, offset: $offset) {\n      ...Result\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;