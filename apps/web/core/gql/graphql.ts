/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type Block = {
  __typename?: 'Block';
  dataSourceType?: Maybe<DataSourceType>;
  entity?: Maybe<Entity>;
  id: Scalars['ID']['output'];
  type: BlockType;
  value?: Maybe<Scalars['String']['output']>;
};

export enum BlockType {
  Data = 'DATA',
  Image = 'IMAGE',
  Text = 'TEXT'
}

export type CheckboxFilter = {
  exists?: InputMaybe<Scalars['Boolean']['input']>;
  is?: InputMaybe<Scalars['Boolean']['input']>;
};

export enum DataSourceType {
  Collection = 'COLLECTION',
  Geo = 'GEO',
  Query = 'QUERY'
}

export enum DataType {
  Checkbox = 'CHECKBOX',
  Number = 'NUMBER',
  Point = 'POINT',
  Relation = 'RELATION',
  Text = 'TEXT',
  Time = 'TIME'
}

export type Entity = {
  __typename?: 'Entity';
  blocks: Array<Maybe<Block>>;
  createdAt: Scalars['String']['output'];
  createdAtBlock: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  relations: Array<Maybe<Relation>>;
  spaces: Array<Maybe<Scalars['String']['output']>>;
  types: Array<Maybe<Entity>>;
  updatedAt: Scalars['String']['output'];
  updatedAtBlock: Scalars['String']['output'];
  values: Array<Maybe<Value>>;
};


export type EntityRelationsArgs = {
  filter?: InputMaybe<RelationFilter>;
  spaceId?: InputMaybe<Scalars['String']['input']>;
};


export type EntityValuesArgs = {
  filter?: InputMaybe<ValueFilter>;
  spaceId?: InputMaybe<Scalars['String']['input']>;
};

export type EntityFilter = {
  NOT?: InputMaybe<EntityFilter>;
  OR?: InputMaybe<Array<EntityFilter>>;
  fromRelation?: InputMaybe<RelationFilter>;
  id?: InputMaybe<IdFilter>;
  toRelation?: InputMaybe<RelationFilter>;
  value?: InputMaybe<ValueFilter>;
};

export type IdFilter = {
  in?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type NumberFilter = {
  NOT?: InputMaybe<NumberFilter>;
  exists?: InputMaybe<Scalars['Boolean']['input']>;
  greaterThan?: InputMaybe<Scalars['Float']['input']>;
  greaterThanOrEqual?: InputMaybe<Scalars['Float']['input']>;
  is?: InputMaybe<Scalars['Float']['input']>;
  lessThan?: InputMaybe<Scalars['Float']['input']>;
  lessThanOrEqual?: InputMaybe<Scalars['Float']['input']>;
};

export type PointFilter = {
  exists?: InputMaybe<Scalars['Boolean']['input']>;
  is?: InputMaybe<Array<InputMaybe<Scalars['Float']['input']>>>;
};

export type Property = {
  __typename?: 'Property';
  dataType: DataType;
  entity?: Maybe<Entity>;
  id: Scalars['ID']['output'];
  relationValueTypes?: Maybe<Array<Maybe<Type>>>;
  renderableType?: Maybe<RenderableType>;
};

export type PropertyFilter = {
  dataType?: InputMaybe<DataType>;
};

export type Query = {
  __typename?: 'Query';
  entities: Array<Maybe<Entity>>;
  entity?: Maybe<Entity>;
  properties: Array<Maybe<Property>>;
  search: Array<Maybe<Entity>>;
  space?: Maybe<Space>;
  spaces: Array<Maybe<Space>>;
  types: Array<Maybe<Type>>;
};


export type QueryEntitiesArgs = {
  filter?: InputMaybe<EntityFilter>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  spaceId?: InputMaybe<Scalars['String']['input']>;
};


export type QueryEntityArgs = {
  id: Scalars['String']['input'];
  spaceId?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPropertiesArgs = {
  filter?: InputMaybe<PropertyFilter>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QuerySearchArgs = {
  filter?: InputMaybe<SearchFilter>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  query: Scalars['String']['input'];
  spaceId?: InputMaybe<Scalars['String']['input']>;
  threshold?: InputMaybe<Scalars['Float']['input']>;
};


export type QuerySpaceArgs = {
  id: Scalars['String']['input'];
};


export type QuerySpacesArgs = {
  filter?: InputMaybe<SpaceFilter>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryTypesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  spaceId?: InputMaybe<Scalars['String']['input']>;
};

export type Relation = {
  __typename?: 'Relation';
  entityId: Scalars['ID']['output'];
  from?: Maybe<Entity>;
  fromId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  position?: Maybe<Scalars['String']['output']>;
  relationEntity?: Maybe<Entity>;
  spaceId: Scalars['String']['output'];
  to?: Maybe<Entity>;
  toId: Scalars['String']['output'];
  toSpaceId?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Property>;
  typeId: Scalars['String']['output'];
  verified?: Maybe<Scalars['Boolean']['output']>;
};

export type RelationFilter = {
  fromEntityId?: InputMaybe<Scalars['String']['input']>;
  toEntityId?: InputMaybe<Scalars['String']['input']>;
  typeId?: InputMaybe<Scalars['String']['input']>;
};

export enum RenderableType {
  Image = 'IMAGE',
  Url = 'URL'
}

export type SearchFilter = {
  NOT?: InputMaybe<SearchFilter>;
  OR?: InputMaybe<Array<SearchFilter>>;
  types?: InputMaybe<IdFilter>;
};

export type Space = {
  __typename?: 'Space';
  daoAddress: Scalars['String']['output'];
  entity?: Maybe<Entity>;
  id: Scalars['ID']['output'];
  mainVotingAddress?: Maybe<Scalars['String']['output']>;
  membershipAddress?: Maybe<Scalars['String']['output']>;
  personalAddress?: Maybe<Scalars['String']['output']>;
  spaceAddress: Scalars['String']['output'];
  type: SpaceType;
};

export type SpaceFilter = {
  id?: InputMaybe<IdFilter>;
};

export enum SpaceType {
  Personal = 'PERSONAL',
  Public = 'PUBLIC'
}

export type TextFilter = {
  NOT?: InputMaybe<TextFilter>;
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  exists?: InputMaybe<Scalars['Boolean']['input']>;
  is?: InputMaybe<Scalars['String']['input']>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type Type = {
  __typename?: 'Type';
  description?: Maybe<Scalars['String']['output']>;
  entity?: Maybe<Entity>;
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  properties?: Maybe<Array<Maybe<Property>>>;
};

export type Value = {
  __typename?: 'Value';
  entity?: Maybe<Entity>;
  entityId: Scalars['String']['output'];
  format?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  language?: Maybe<Scalars['String']['output']>;
  property?: Maybe<Property>;
  propertyId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
  timezone?: Maybe<Scalars['String']['output']>;
  unit?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
};

export type ValueFilter = {
  checkbox?: InputMaybe<CheckboxFilter>;
  number?: InputMaybe<NumberFilter>;
  point?: InputMaybe<PointFilter>;
  property: Scalars['String']['input'];
  text?: InputMaybe<TextFilter>;
};

export type FullEntityFragment = { __typename?: 'Entity', id: string, name?: string | null, description?: string | null, types: Array<{ __typename?: 'Entity', id: string, name?: string | null } | null>, values: Array<{ __typename?: 'Value', spaceId: string, value?: string | null, language?: string | null, unit?: string | null, property?: { __typename?: 'Property', id: string, dataType: DataType, entity?: { __typename?: 'Entity', id: string, name?: string | null } | null, relationValueTypes?: Array<{ __typename?: 'Type', id: string, name?: string | null } | null> | null } | null } | null>, relations: Array<{ __typename?: 'Relation', id: string, spaceId: string, position?: string | null, verified?: boolean | null, entityId: string, toSpaceId?: string | null, to?: { __typename?: 'Entity', id: string, name?: string | null, types: Array<{ __typename?: 'Entity', id: string, name?: string | null } | null>, values: Array<{ __typename?: 'Value', propertyId: string, value?: string | null } | null> } | null, type?: { __typename?: 'Property', id: string, renderableType?: RenderableType | null, entity?: { __typename?: 'Entity', name?: string | null } | null } | null } | null> } & { ' $fragmentName'?: 'FullEntityFragment' };

export type AllEntitiesQueryVariables = Exact<{
  spaceId?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type AllEntitiesQuery = { __typename?: 'Query', entities: Array<(
    { __typename?: 'Entity' }
    & { ' $fragmentRefs'?: { 'FullEntityFragment': FullEntityFragment } }
  ) | null> };

export type EntitiesBatchQueryVariables = Exact<{
  ids: Array<Scalars['String']['input']> | Scalars['String']['input'];
  spaceId?: InputMaybe<Scalars['String']['input']>;
}>;


export type EntitiesBatchQuery = { __typename?: 'Query', entities: Array<(
    { __typename?: 'Entity' }
    & { ' $fragmentRefs'?: { 'FullEntityFragment': FullEntityFragment } }
  ) | null> };

export type EntityQueryVariables = Exact<{
  id: Scalars['String']['input'];
  spaceId?: InputMaybe<Scalars['String']['input']>;
}>;


export type EntityQuery = { __typename?: 'Query', entity?: (
    { __typename?: 'Entity' }
    & { ' $fragmentRefs'?: { 'FullEntityFragment': FullEntityFragment } }
  ) | null };

export type EntityTypesQueryVariables = Exact<{
  id: Scalars['String']['input'];
  spaceId?: InputMaybe<Scalars['String']['input']>;
}>;


export type EntityTypesQuery = { __typename?: 'Query', entity?: { __typename?: 'Entity', types: Array<{ __typename?: 'Entity', id: string, name?: string | null } | null> } | null };

export type FullSpaceFragment = { __typename?: 'Space', id: string, type: SpaceType, daoAddress: string, spaceAddress: string, mainVotingAddress?: string | null, membershipAddress?: string | null, personalAddress?: string | null, entity?: (
    { __typename?: 'Entity' }
    & { ' $fragmentRefs'?: { 'FullEntityFragment': FullEntityFragment } }
  ) | null } & { ' $fragmentName'?: 'FullSpaceFragment' };

export type SpaceQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type SpaceQuery = { __typename?: 'Query', space?: (
    { __typename?: 'Space' }
    & { ' $fragmentRefs'?: { 'FullSpaceFragment': FullSpaceFragment } }
  ) | null };

export type SpacesQueryVariables = Exact<{
  filter?: InputMaybe<SpaceFilter>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type SpacesQuery = { __typename?: 'Query', spaces: Array<(
    { __typename?: 'Space' }
    & { ' $fragmentRefs'?: { 'FullSpaceFragment': FullSpaceFragment } }
  ) | null> };

export type ResultFragment = { __typename?: 'Entity', id: string, name?: string | null, description?: string | null, spaces: Array<string | null>, types: Array<{ __typename?: 'Entity', id: string, name?: string | null } | null> } & { ' $fragmentName'?: 'ResultFragment' };

export type ResultQueryVariables = Exact<{
  id: Scalars['String']['input'];
  spaceId?: InputMaybe<Scalars['String']['input']>;
}>;


export type ResultQuery = { __typename?: 'Query', entity?: (
    { __typename?: 'Entity' }
    & { ' $fragmentRefs'?: { 'ResultFragment': ResultFragment } }
  ) | null };

export const FullEntityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"to"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]} as unknown as DocumentNode<FullEntityFragment, unknown>;
export const FullSpaceFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"daoAddress"}},{"kind":"Field","name":{"kind":"Name","value":"spaceAddress"}},{"kind":"Field","name":{"kind":"Name","value":"mainVotingAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membershipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"personalAddress"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"to"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]} as unknown as DocumentNode<FullSpaceFragment, unknown>;
export const ResultFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Result"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaces"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<ResultFragment, unknown>;
export const AllEntitiesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllEntities"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"to"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]} as unknown as DocumentNode<AllEntitiesQuery, AllEntitiesQueryVariables>;
export const EntitiesBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntitiesBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"ids"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"ids"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"to"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]} as unknown as DocumentNode<EntitiesBatchQuery, EntitiesBatchQueryVariables>;
export const EntityDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Entity"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"to"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]} as unknown as DocumentNode<EntityQuery, EntityQueryVariables>;
export const EntityTypesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityTypes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<EntityTypesQuery, EntityTypesQueryVariables>;
export const SpaceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Space"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"space"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullSpace"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"to"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"daoAddress"}},{"kind":"Field","name":{"kind":"Name","value":"spaceAddress"}},{"kind":"Field","name":{"kind":"Name","value":"mainVotingAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membershipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"personalAddress"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}}]} as unknown as DocumentNode<SpaceQuery, SpaceQueryVariables>;
export const SpacesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Spaces"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"SpaceFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaces"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullSpace"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"to"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"daoAddress"}},{"kind":"Field","name":{"kind":"Name","value":"spaceAddress"}},{"kind":"Field","name":{"kind":"Name","value":"mainVotingAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membershipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"personalAddress"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}}]} as unknown as DocumentNode<SpacesQuery, SpacesQueryVariables>;
export const ResultDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Result"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"Result"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"Result"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaces"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<ResultQuery, ResultQueryVariables>;