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
    "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n\n    types {\n      id\n      name\n    }\n\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      verified\n      entityId\n      to {\n        id\n        name\n      }\n      toSpaceId\n      type {\n        id\n        entity {\n          name\n        }\n      }\n    }\n  }\n": typeof types.FullEntityFragmentDoc,
    "\n  query AllEntities($limit: Int, $offset: Int) {\n    entities(limit: $limit, offset: $offset) {\n      ...FullEntity\n    }\n  }\n": typeof types.AllEntitiesDocument,
    "\n  query EntitiesBatch($ids: [String!]!, $spaceId: String) {\n    entities(spaceId: $spaceId, filter: { id: { in: $ids } }) {\n      ...FullEntity\n    }\n  }\n": typeof types.EntitiesBatchDocument,
    "\n  query Entity($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...FullEntity\n    }\n  }\n": typeof types.EntityDocument,
    "\n  query EntityTypes($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      types {\n        id\n        name\n      }\n    }\n  }\n": typeof types.EntityTypesDocument,
};
const documents: Documents = {
    "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n\n    types {\n      id\n      name\n    }\n\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      verified\n      entityId\n      to {\n        id\n        name\n      }\n      toSpaceId\n      type {\n        id\n        entity {\n          name\n        }\n      }\n    }\n  }\n": types.FullEntityFragmentDoc,
    "\n  query AllEntities($limit: Int, $offset: Int) {\n    entities(limit: $limit, offset: $offset) {\n      ...FullEntity\n    }\n  }\n": types.AllEntitiesDocument,
    "\n  query EntitiesBatch($ids: [String!]!, $spaceId: String) {\n    entities(spaceId: $spaceId, filter: { id: { in: $ids } }) {\n      ...FullEntity\n    }\n  }\n": types.EntitiesBatchDocument,
    "\n  query Entity($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      ...FullEntity\n    }\n  }\n": types.EntityDocument,
    "\n  query EntityTypes($id: String!, $spaceId: String) {\n    entity(id: $id, spaceId: $spaceId) {\n      types {\n        id\n        name\n      }\n    }\n  }\n": types.EntityTypesDocument,
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
export function graphql(source: "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n\n    types {\n      id\n      name\n    }\n\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      verified\n      entityId\n      to {\n        id\n        name\n      }\n      toSpaceId\n      type {\n        id\n        entity {\n          name\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n\n    types {\n      id\n      name\n    }\n\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      verified\n      entityId\n      to {\n        id\n        name\n      }\n      toSpaceId\n      type {\n        id\n        entity {\n          name\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllEntities($limit: Int, $offset: Int) {\n    entities(limit: $limit, offset: $offset) {\n      ...FullEntity\n    }\n  }\n"): (typeof documents)["\n  query AllEntities($limit: Int, $offset: Int) {\n    entities(limit: $limit, offset: $offset) {\n      ...FullEntity\n    }\n  }\n"];
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

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;