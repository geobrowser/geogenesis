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
    "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      to {\n        id\n        name\n      }\n      toSpaceId\n      type {\n        id\n        name\n      }\n    }\n  }\n": typeof types.FullEntityFragmentDoc,
    "\n  query AllEntities {\n    entities {\n      ...FullEntity\n    }\n  }\n": typeof types.AllEntitiesDocument,
};
const documents: Documents = {
    "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      to {\n        id\n        name\n      }\n      toSpaceId\n      type {\n        id\n        name\n      }\n    }\n  }\n": types.FullEntityFragmentDoc,
    "\n  query AllEntities {\n    entities {\n      ...FullEntity\n    }\n  }\n": types.AllEntitiesDocument,
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
export function graphql(source: "\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      to {\n        id\n        name\n      }\n      toSpaceId\n      type {\n        id\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  fragment FullEntity on Entity {\n    id\n    name\n    description\n    values {\n      spaceId\n      property {\n        id\n        entity {\n          id\n          name\n        }\n        dataType\n        relationValueTypes {\n          id\n          name\n        }\n      }\n      value\n      language\n      unit\n    }\n    relations {\n      id\n      spaceId\n      position\n      to {\n        id\n        name\n      }\n      toSpaceId\n      type {\n        id\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllEntities {\n    entities {\n      ...FullEntity\n    }\n  }\n"): (typeof documents)["\n  query AllEntities {\n    entities {\n      ...FullEntity\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;