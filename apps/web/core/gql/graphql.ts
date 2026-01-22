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
  /** A floating point number that requires more precision than IEEE 754 binary 64 */
  BigFloat: { input: any; output: any; }
  /**
   * A signed eight-byte integer. The upper big integer values are greater than the
   * max value for a JavaScript number. Therefore all big integers will be output as
   * strings and not numbers.
   */
  BigInt: { input: any; output: any; }
  /** A location in a connection that can be used for resuming pagination. */
  Cursor: { input: any; output: any; }
  /**
   * A point in time as described by the [ISO
   * 8601](https://en.wikipedia.org/wiki/ISO_8601) standard. May or may not include a timezone.
   */
  Datetime: { input: any; output: any; }
  /** A universally unique identifier as defined by [RFC 4122](https://tools.ietf.org/html/rfc4122). */
  UUID: { input: any; output: any; }
};

/** A filter to be used against BigFloat fields. All fields are combined with a logical ‘and.’ */
export type BigFloatFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<Scalars['BigFloat']['input']>>;
  /** Equal to the specified value. */
  is?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<Scalars['BigFloat']['input']>>;
};

/** A filter to be used against BigInt fields. All fields are combined with a logical ‘and.’ */
export type BigIntFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<Scalars['BigInt']['input']>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<Scalars['BigInt']['input']>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<Scalars['BigInt']['input']>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  /** Equal to the specified value. */
  is?: InputMaybe<Scalars['BigInt']['input']>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<Scalars['BigInt']['input']>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<Scalars['BigInt']['input']>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<Scalars['BigInt']['input']>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<Scalars['BigInt']['input']>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

/** A filter to be used against Boolean fields. All fields are combined with a logical ‘and.’ */
export type BooleanFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<Scalars['Boolean']['input']>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<Scalars['Boolean']['input']>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<Scalars['Boolean']['input']>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<Scalars['Boolean']['input']>>;
  /** Equal to the specified value. */
  is?: InputMaybe<Scalars['Boolean']['input']>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<Scalars['Boolean']['input']>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<Scalars['Boolean']['input']>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<Scalars['Boolean']['input']>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<Scalars['Boolean']['input']>>;
};

export enum DataTypes {
  Boolean = 'BOOLEAN',
  Number = 'NUMBER',
  Point = 'POINT',
  Relation = 'RELATION',
  String = 'STRING',
  Time = 'TIME'
}

/** A filter to be used against DataTypes fields. All fields are combined with a logical ‘and.’ */
export type DataTypesFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<DataTypes>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<DataTypes>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<DataTypes>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<DataTypes>>;
  /** Equal to the specified value. */
  is?: InputMaybe<DataTypes>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<DataTypes>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<DataTypes>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<DataTypes>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<DataTypes>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<DataTypes>>;
};

/** A filter to be used against Datetime fields. All fields are combined with a logical ‘and.’ */
export type DatetimeFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<Scalars['Datetime']['input']>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<Scalars['Datetime']['input']>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<Scalars['Datetime']['input']>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<Scalars['Datetime']['input']>>;
  /** Equal to the specified value. */
  is?: InputMaybe<Scalars['Datetime']['input']>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<Scalars['Datetime']['input']>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<Scalars['Datetime']['input']>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<Scalars['Datetime']['input']>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<Scalars['Datetime']['input']>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<Scalars['Datetime']['input']>>;
};

export type Editor = Node & {
  __typename?: 'Editor';
  address: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Space` that is related to this `Editor`. */
  space?: Maybe<Space>;
  spaceId: Scalars['UUID']['output'];
};

/** A condition to be used against `Editor` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type EditorCondition = {
  /** Checks for equality with the object’s `address` field. */
  address?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};

/** A filter to be used against `Editor` object types. All fields are combined with a logical ‘and.’ */
export type EditorFilter = {
  /** Filter by the object’s `address` field. */
  address?: InputMaybe<StringFilter>;
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<EditorFilter>>;
  /** Negates the expression. */
  not?: InputMaybe<EditorFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<EditorFilter>>;
  /** Filter by the object’s `space` relation. */
  space?: InputMaybe<SpaceFilter>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
};

/** A connection to a list of `Editor` values. */
export type EditorsConnection = {
  __typename?: 'EditorsConnection';
  /** A list of edges which contains the `Editor` and cursor to aid in pagination. */
  edges: Array<EditorsEdge>;
  /** A list of `Editor` objects. */
  nodes: Array<Editor>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Editor` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Editor` edge in the connection. */
export type EditorsEdge = {
  __typename?: 'EditorsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Editor` at the end of the edge. */
  node: Editor;
};

/** Methods to use when ordering `Editor`. */
export enum EditorsOrderBy {
  AddressAsc = 'ADDRESS_ASC',
  AddressDesc = 'ADDRESS_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC'
}

/** A connection to a list of `Entity` values. */
export type EntitiesConnection = {
  __typename?: 'EntitiesConnection';
  /** A list of edges which contains the `Entity` and cursor to aid in pagination. */
  edges: Array<EntitiesEdge>;
  /** A list of `Entity` objects. */
  nodes: Array<Entity>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Entity` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Entity` edge in the connection. */
export type EntitiesEdge = {
  __typename?: 'EntitiesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Entity` at the end of the edge. */
  node: Entity;
};

/** Methods to use when ordering `Entity`. */
export enum EntitiesOrderBy {
  CreatedAtAsc = 'CREATED_AT_ASC',
  CreatedAtBlockAsc = 'CREATED_AT_BLOCK_ASC',
  CreatedAtBlockDesc = 'CREATED_AT_BLOCK_DESC',
  CreatedAtDesc = 'CREATED_AT_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  UpdatedAtAsc = 'UPDATED_AT_ASC',
  UpdatedAtBlockAsc = 'UPDATED_AT_BLOCK_ASC',
  UpdatedAtBlockDesc = 'UPDATED_AT_BLOCK_DESC',
  UpdatedAtDesc = 'UPDATED_AT_DESC'
}

export type Entity = Node & {
  __typename?: 'Entity';
  /** Reads and enables pagination through a set of `Relation`. */
  backlinks: RelationsConnection;
  /** Reads and enables pagination through a set of `Relation`. */
  backlinksList: Array<Relation>;
  createdAt: Scalars['String']['output'];
  createdAtBlock: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['UUID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads and enables pagination through a set of `Property`. */
  properties?: Maybe<Array<Property>>;
  /** Reads and enables pagination through a set of `Property`. */
  propertiesConnection: PropertiesConnection;
  /** Reads and enables pagination through a set of `Relation`. */
  relations: RelationsConnection;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsList: Array<Relation>;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsWhereEntity: RelationsConnection;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsWhereEntityList: Array<Relation>;
  spaceIds?: Maybe<Array<Maybe<Scalars['UUID']['output']>>>;
  /** Reads and enables pagination through a set of `Space`. */
  spacesIn?: Maybe<Array<Space>>;
  /** Reads and enables pagination through a set of `Space`. */
  spacesInConnection: SpacesConnection;
  typeIds?: Maybe<Array<Maybe<Scalars['UUID']['output']>>>;
  /** Reads and enables pagination through a set of `Entity`. */
  types?: Maybe<Array<Entity>>;
  /** Reads and enables pagination through a set of `Entity`. */
  typesConnection: EntitiesConnection;
  updatedAt: Scalars['String']['output'];
  updatedAtBlock: Scalars['String']['output'];
  /** Reads and enables pagination through a set of `Value`. */
  values: ValuesConnection;
  /** Reads and enables pagination through a set of `Value`. */
  valuesList: Array<Value>;
};


export type EntityBacklinksArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type EntityBacklinksListArgs = {
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type EntityPropertiesArgs = {
  filter?: InputMaybe<PropertyFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};


export type EntityPropertiesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  filter?: InputMaybe<PropertyFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};


export type EntityRelationsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type EntityRelationsListArgs = {
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type EntityRelationsWhereEntityArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type EntityRelationsWhereEntityListArgs = {
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type EntitySpacesInArgs = {
  filter?: InputMaybe<SpaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type EntitySpacesInConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  filter?: InputMaybe<SpaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type EntityTypesArgs = {
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type EntityTypesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type EntityValuesArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ValueCondition>;
  filter?: InputMaybe<ValueFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ValuesOrderBy>>;
};


export type EntityValuesListArgs = {
  condition?: InputMaybe<ValueCondition>;
  filter?: InputMaybe<ValueFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ValuesOrderBy>>;
};

/** A condition to be used against `Entity` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type EntityCondition = {
  /** Checks for equality with the object’s `createdAt` field. */
  createdAt?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `updatedAtBlock` field. */
  updatedAtBlock?: InputMaybe<Scalars['String']['input']>;
};

/** A filter to be used against `Entity` object types. All fields are combined with a logical ‘and.’ */
export type EntityFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<EntityFilter>>;
  /** Filter by the object’s `backlinks` relation. */
  backlinks?: InputMaybe<EntityToManyRelationFilter>;
  /** Some related `backlinks` exist. */
  backlinksExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `createdAt` field. */
  createdAt?: InputMaybe<StringFilter>;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: InputMaybe<StringFilter>;
  /** Filter by the object’s `description` field. */
  description?: InputMaybe<StringFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `name` field. */
  name?: InputMaybe<StringFilter>;
  /** Negates the expression. */
  not?: InputMaybe<EntityFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<EntityFilter>>;
  /** Filter by the object’s `relations` relation. */
  relations?: InputMaybe<EntityToManyRelationFilter>;
  /** Some related `relations` exist. */
  relationsExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `relationsWhereEntity` relation. */
  relationsWhereEntity?: InputMaybe<EntityToManyRelationFilter>;
  /** Some related `relationsWhereEntity` exist. */
  relationsWhereEntityExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `spaceIds` field. */
  spaceIds?: InputMaybe<UuidListFilter>;
  /** Filter by the object’s `typeIds` field. */
  typeIds?: InputMaybe<UuidListFilter>;
  /** Filter by the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<StringFilter>;
  /** Filter by the object’s `updatedAtBlock` field. */
  updatedAtBlock?: InputMaybe<StringFilter>;
  /** Filter by the object’s `values` relation. */
  values?: InputMaybe<EntityToManyValueFilter>;
  /** Some related `values` exist. */
  valuesExist?: InputMaybe<Scalars['Boolean']['input']>;
};

/** A filter to be used against many `Relation` object types. All fields are combined with a logical ‘and.’ */
export type EntityToManyRelationFilter = {
  /** Every related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<RelationFilter>;
  /** No related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<RelationFilter>;
  /** Some related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<RelationFilter>;
};

/** A filter to be used against many `Value` object types. All fields are combined with a logical ‘and.’ */
export type EntityToManyValueFilter = {
  /** Every related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<ValueFilter>;
  /** No related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<ValueFilter>;
  /** Some related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<ValueFilter>;
};

export type GlobalScore = Node & {
  __typename?: 'GlobalScore';
  entityId: Scalars['UUID']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  score: Scalars['BigFloat']['output'];
  updatedAt: Scalars['Datetime']['output'];
};

/**
 * A condition to be used against `GlobalScore` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type GlobalScoreCondition = {
  /** Checks for equality with the object’s `entityId` field. */
  entityId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `score` field. */
  score?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Checks for equality with the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<Scalars['Datetime']['input']>;
};

/** A filter to be used against `GlobalScore` object types. All fields are combined with a logical ‘and.’ */
export type GlobalScoreFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<GlobalScoreFilter>>;
  /** Filter by the object’s `entityId` field. */
  entityId?: InputMaybe<UuidFilter>;
  /** Negates the expression. */
  not?: InputMaybe<GlobalScoreFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<GlobalScoreFilter>>;
  /** Filter by the object’s `score` field. */
  score?: InputMaybe<BigFloatFilter>;
  /** Filter by the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<DatetimeFilter>;
};

/** A connection to a list of `GlobalScore` values. */
export type GlobalScoresConnection = {
  __typename?: 'GlobalScoresConnection';
  /** A list of edges which contains the `GlobalScore` and cursor to aid in pagination. */
  edges: Array<GlobalScoresEdge>;
  /** A list of `GlobalScore` objects. */
  nodes: Array<GlobalScore>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `GlobalScore` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `GlobalScore` edge in the connection. */
export type GlobalScoresEdge = {
  __typename?: 'GlobalScoresEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `GlobalScore` at the end of the edge. */
  node: GlobalScore;
};

/** Methods to use when ordering `GlobalScore`. */
export enum GlobalScoresOrderBy {
  EntityIdAsc = 'ENTITY_ID_ASC',
  EntityIdDesc = 'ENTITY_ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  ScoreAsc = 'SCORE_ASC',
  ScoreDesc = 'SCORE_DESC',
  UpdatedAtAsc = 'UPDATED_AT_ASC',
  UpdatedAtDesc = 'UPDATED_AT_DESC'
}

/** A filter to be used against Int fields. All fields are combined with a logical ‘and.’ */
export type IntFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<Scalars['Int']['input']>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<Scalars['Int']['input']>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<Scalars['Int']['input']>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  /** Equal to the specified value. */
  is?: InputMaybe<Scalars['Int']['input']>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<Scalars['Int']['input']>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<Scalars['Int']['input']>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<Scalars['Int']['input']>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<Scalars['Int']['input']>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type LocalScore = Node & {
  __typename?: 'LocalScore';
  entityId: Scalars['UUID']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  score: Scalars['BigFloat']['output'];
  spaceId: Scalars['UUID']['output'];
  updatedAt: Scalars['Datetime']['output'];
};

/**
 * A condition to be used against `LocalScore` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type LocalScoreCondition = {
  /** Checks for equality with the object’s `entityId` field. */
  entityId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `score` field. */
  score?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<Scalars['Datetime']['input']>;
};

/** A filter to be used against `LocalScore` object types. All fields are combined with a logical ‘and.’ */
export type LocalScoreFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<LocalScoreFilter>>;
  /** Filter by the object’s `entityId` field. */
  entityId?: InputMaybe<UuidFilter>;
  /** Negates the expression. */
  not?: InputMaybe<LocalScoreFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<LocalScoreFilter>>;
  /** Filter by the object’s `score` field. */
  score?: InputMaybe<BigFloatFilter>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<DatetimeFilter>;
};

/** A connection to a list of `LocalScore` values. */
export type LocalScoresConnection = {
  __typename?: 'LocalScoresConnection';
  /** A list of edges which contains the `LocalScore` and cursor to aid in pagination. */
  edges: Array<LocalScoresEdge>;
  /** A list of `LocalScore` objects. */
  nodes: Array<LocalScore>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `LocalScore` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `LocalScore` edge in the connection. */
export type LocalScoresEdge = {
  __typename?: 'LocalScoresEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `LocalScore` at the end of the edge. */
  node: LocalScore;
};

/** Methods to use when ordering `LocalScore`. */
export enum LocalScoresOrderBy {
  EntityIdAsc = 'ENTITY_ID_ASC',
  EntityIdDesc = 'ENTITY_ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  ScoreAsc = 'SCORE_ASC',
  ScoreDesc = 'SCORE_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC',
  UpdatedAtAsc = 'UPDATED_AT_ASC',
  UpdatedAtDesc = 'UPDATED_AT_DESC'
}

export type Member = Node & {
  __typename?: 'Member';
  address: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Space` that is related to this `Member`. */
  space?: Maybe<Space>;
  spaceId: Scalars['UUID']['output'];
};

/** A condition to be used against `Member` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type MemberCondition = {
  /** Checks for equality with the object’s `address` field. */
  address?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};

/** A filter to be used against `Member` object types. All fields are combined with a logical ‘and.’ */
export type MemberFilter = {
  /** Filter by the object’s `address` field. */
  address?: InputMaybe<StringFilter>;
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<MemberFilter>>;
  /** Negates the expression. */
  not?: InputMaybe<MemberFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<MemberFilter>>;
  /** Filter by the object’s `space` relation. */
  space?: InputMaybe<SpaceFilter>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
};

/** A connection to a list of `Member` values. */
export type MembersConnection = {
  __typename?: 'MembersConnection';
  /** A list of edges which contains the `Member` and cursor to aid in pagination. */
  edges: Array<MembersEdge>;
  /** A list of `Member` objects. */
  nodes: Array<Member>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Member` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Member` edge in the connection. */
export type MembersEdge = {
  __typename?: 'MembersEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Member` at the end of the edge. */
  node: Member;
};

/** Methods to use when ordering `Member`. */
export enum MembersOrderBy {
  AddressAsc = 'ADDRESS_ASC',
  AddressDesc = 'ADDRESS_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC'
}

export type Meta = Node & {
  __typename?: 'Meta';
  blockNumber: Scalars['String']['output'];
  cursor: Scalars['String']['output'];
  id: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
};

/** A condition to be used against `Meta` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type MetaCondition = {
  /** Checks for equality with the object’s `blockNumber` field. */
  blockNumber?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `cursor` field. */
  cursor?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['String']['input']>;
};

/** A filter to be used against `Meta` object types. All fields are combined with a logical ‘and.’ */
export type MetaFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<MetaFilter>>;
  /** Filter by the object’s `blockNumber` field. */
  blockNumber?: InputMaybe<StringFilter>;
  /** Filter by the object’s `cursor` field. */
  cursor?: InputMaybe<StringFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<StringFilter>;
  /** Negates the expression. */
  not?: InputMaybe<MetaFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<MetaFilter>>;
};

/** A connection to a list of `Meta` values. */
export type MetasConnection = {
  __typename?: 'MetasConnection';
  /** A list of edges which contains the `Meta` and cursor to aid in pagination. */
  edges: Array<MetasEdge>;
  /** A list of `Meta` objects. */
  nodes: Array<Meta>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Meta` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Meta` edge in the connection. */
export type MetasEdge = {
  __typename?: 'MetasEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Meta` at the end of the edge. */
  node: Meta;
};

/** Methods to use when ordering `Meta`. */
export enum MetasOrderBy {
  BlockNumberAsc = 'BLOCK_NUMBER_ASC',
  BlockNumberDesc = 'BLOCK_NUMBER_DESC',
  CursorAsc = 'CURSOR_ASC',
  CursorDesc = 'CURSOR_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

/** An object with a globally unique `ID`. */
export type Node = {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
};

/** Information about pagination in a connection. */
export type PageInfo = {
  __typename?: 'PageInfo';
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars['Cursor']['output']>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars['Boolean']['output'];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars['Cursor']['output']>;
};

/** A connection to a list of `Property` values. */
export type PropertiesConnection = {
  __typename?: 'PropertiesConnection';
  /** A list of edges which contains the `Property` and cursor to aid in pagination. */
  edges: Array<PropertiesEdge>;
  /** A list of `Property` objects. */
  nodes: Array<Property>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Property` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Property` edge in the connection. */
export type PropertiesEdge = {
  __typename?: 'PropertiesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Property` at the end of the edge. */
  node: Property;
};

/** Methods to use when ordering `Property`. */
export enum PropertiesOrderBy {
  DataTypeAsc = 'DATA_TYPE_ASC',
  DataTypeDesc = 'DATA_TYPE_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

export type Property = Node & {
  __typename?: 'Property';
  dataType: DataTypes;
  description?: Maybe<Scalars['String']['output']>;
  format?: Maybe<Scalars['String']['output']>;
  id: Scalars['UUID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  relationValueTypeIds?: Maybe<Array<Maybe<Scalars['UUID']['output']>>>;
  /** Reads and enables pagination through a set of `Entity`. */
  relationValueTypes?: Maybe<Array<Entity>>;
  /** Reads and enables pagination through a set of `Entity`. */
  relationValueTypesConnection: EntitiesConnection;
  renderableType?: Maybe<Scalars['UUID']['output']>;
  unit?: Maybe<Scalars['UUID']['output']>;
};


export type PropertyRelationValueTypesArgs = {
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type PropertyRelationValueTypesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * A condition to be used against `Property` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type PropertyCondition = {
  /** Checks for equality with the object’s `dataType` field. */
  dataType?: InputMaybe<DataTypes>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['UUID']['input']>;
};

/** A filter to be used against `Property` object types. All fields are combined with a logical ‘and.’ */
export type PropertyFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<PropertyFilter>>;
  /** Filter by the object’s `dataType` field. */
  dataType?: InputMaybe<DataTypesFilter>;
  /** Filter by the object’s `description` field. */
  description?: InputMaybe<StringFilter>;
  /** Filter by the object’s `format` field. */
  format?: InputMaybe<StringFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `name` field. */
  name?: InputMaybe<StringFilter>;
  /** Negates the expression. */
  not?: InputMaybe<PropertyFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<PropertyFilter>>;
  /** Filter by the object’s `relationValueTypeIds` field. */
  relationValueTypeIds?: InputMaybe<UuidListFilter>;
  /** Filter by the object’s `relationsByTypeIdConnection` relation. */
  relationsByTypeIdConnection?: InputMaybe<PropertyToManyRelationFilter>;
  /** Some related `relationsByTypeIdConnection` exist. */
  relationsByTypeIdConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `renderableType` field. */
  renderableType?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `unit` field. */
  unit?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `valuesConnection` relation. */
  valuesConnection?: InputMaybe<PropertyToManyValueFilter>;
  /** Some related `valuesConnection` exist. */
  valuesConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
};

/** A filter to be used against many `Relation` object types. All fields are combined with a logical ‘and.’ */
export type PropertyToManyRelationFilter = {
  /** Every related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<RelationFilter>;
  /** No related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<RelationFilter>;
  /** Some related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<RelationFilter>;
};

/** A filter to be used against many `Value` object types. All fields are combined with a logical ‘and.’ */
export type PropertyToManyValueFilter = {
  /** Every related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<ValueFilter>;
  /** No related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<ValueFilter>;
  /** Some related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<ValueFilter>;
};

export type Proposal = Node & {
  __typename?: 'Proposal';
  createdAt: Scalars['String']['output'];
  createdAtBlock: Scalars['String']['output'];
  endTime: Scalars['BigInt']['output'];
  executedAt?: Maybe<Scalars['BigInt']['output']>;
  id: Scalars['UUID']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads and enables pagination through a set of `ProposalAction`. */
  proposalActions: Array<ProposalAction>;
  /** Reads and enables pagination through a set of `ProposalAction`. */
  proposalActionsConnection: ProposalActionsConnection;
  /** Reads and enables pagination through a set of `ProposalVote`. */
  proposalVotes: Array<ProposalVote>;
  /** Reads and enables pagination through a set of `ProposalVote`. */
  proposalVotesConnection: ProposalVotesConnection;
  proposedBy: Scalars['UUID']['output'];
  quorum: Scalars['BigInt']['output'];
  /** Reads a single `Space` that is related to this `Proposal`. */
  space?: Maybe<Space>;
  spaceId: Scalars['UUID']['output'];
  startTime: Scalars['BigInt']['output'];
  threshold: Scalars['BigInt']['output'];
  votingMode: VotingMode;
};


export type ProposalProposalActionsArgs = {
  condition?: InputMaybe<ProposalActionCondition>;
  filter?: InputMaybe<ProposalActionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalActionsOrderBy>>;
};


export type ProposalProposalActionsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ProposalActionCondition>;
  filter?: InputMaybe<ProposalActionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalActionsOrderBy>>;
};


export type ProposalProposalVotesArgs = {
  condition?: InputMaybe<ProposalVoteCondition>;
  filter?: InputMaybe<ProposalVoteFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalVotesOrderBy>>;
};


export type ProposalProposalVotesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ProposalVoteCondition>;
  filter?: InputMaybe<ProposalVoteFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalVotesOrderBy>>;
};

export type ProposalAction = Node & {
  __typename?: 'ProposalAction';
  actionType: ProposalActionType;
  contentId?: Maybe<Scalars['String']['output']>;
  contentUri?: Maybe<Scalars['String']['output']>;
  duration?: Maybe<Scalars['BigInt']['output']>;
  fastThreshold?: Maybe<Scalars['BigInt']['output']>;
  id: Scalars['UUID']['output'];
  metadata?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Proposal` that is related to this `ProposalAction`. */
  proposal?: Maybe<Proposal>;
  proposalId: Scalars['UUID']['output'];
  quorum?: Maybe<Scalars['BigInt']['output']>;
  slowThreshold?: Maybe<Scalars['BigInt']['output']>;
  targetAddress?: Maybe<Scalars['String']['output']>;
};

/**
 * A condition to be used against `ProposalAction` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type ProposalActionCondition = {
  /** Checks for equality with the object’s `actionType` field. */
  actionType?: InputMaybe<ProposalActionType>;
  /** Checks for equality with the object’s `contentId` field. */
  contentId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `contentUri` field. */
  contentUri?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `duration` field. */
  duration?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `fastThreshold` field. */
  fastThreshold?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `metadata` field. */
  metadata?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `proposalId` field. */
  proposalId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `quorum` field. */
  quorum?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `slowThreshold` field. */
  slowThreshold?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `targetAddress` field. */
  targetAddress?: InputMaybe<Scalars['String']['input']>;
};

/** A filter to be used against `ProposalAction` object types. All fields are combined with a logical ‘and.’ */
export type ProposalActionFilter = {
  /** Filter by the object’s `actionType` field. */
  actionType?: InputMaybe<ProposalActionTypeFilter>;
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<ProposalActionFilter>>;
  /** Filter by the object’s `contentUri` field. */
  contentUri?: InputMaybe<StringFilter>;
  /** Filter by the object’s `duration` field. */
  duration?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `fastThreshold` field. */
  fastThreshold?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<UuidFilter>;
  /** Negates the expression. */
  not?: InputMaybe<ProposalActionFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<ProposalActionFilter>>;
  /** Filter by the object’s `proposal` relation. */
  proposal?: InputMaybe<ProposalFilter>;
  /** Filter by the object’s `proposalId` field. */
  proposalId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `quorum` field. */
  quorum?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `slowThreshold` field. */
  slowThreshold?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `targetAddress` field. */
  targetAddress?: InputMaybe<StringFilter>;
};

export enum ProposalActionType {
  AddEditor = 'ADD_EDITOR',
  AddMember = 'ADD_MEMBER',
  Flag = 'FLAG',
  Publish = 'PUBLISH',
  RemoveEditor = 'REMOVE_EDITOR',
  RemoveMember = 'REMOVE_MEMBER',
  Unflag = 'UNFLAG',
  UnflagEditor = 'UNFLAG_EDITOR',
  Unknown = 'UNKNOWN',
  UpdateVotingSettings = 'UPDATE_VOTING_SETTINGS'
}

/** A filter to be used against ProposalActionType fields. All fields are combined with a logical ‘and.’ */
export type ProposalActionTypeFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<ProposalActionType>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<ProposalActionType>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<ProposalActionType>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<ProposalActionType>>;
  /** Equal to the specified value. */
  is?: InputMaybe<ProposalActionType>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<ProposalActionType>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<ProposalActionType>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<ProposalActionType>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<ProposalActionType>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<ProposalActionType>>;
};

/** A connection to a list of `ProposalAction` values. */
export type ProposalActionsConnection = {
  __typename?: 'ProposalActionsConnection';
  /** A list of edges which contains the `ProposalAction` and cursor to aid in pagination. */
  edges: Array<ProposalActionsEdge>;
  /** A list of `ProposalAction` objects. */
  nodes: Array<ProposalAction>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `ProposalAction` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `ProposalAction` edge in the connection. */
export type ProposalActionsEdge = {
  __typename?: 'ProposalActionsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `ProposalAction` at the end of the edge. */
  node: ProposalAction;
};

/** Methods to use when ordering `ProposalAction`. */
export enum ProposalActionsOrderBy {
  ActionTypeAsc = 'ACTION_TYPE_ASC',
  ActionTypeDesc = 'ACTION_TYPE_DESC',
  ContentIdAsc = 'CONTENT_ID_ASC',
  ContentIdDesc = 'CONTENT_ID_DESC',
  ContentUriAsc = 'CONTENT_URI_ASC',
  ContentUriDesc = 'CONTENT_URI_DESC',
  DurationAsc = 'DURATION_ASC',
  DurationDesc = 'DURATION_DESC',
  FastThresholdAsc = 'FAST_THRESHOLD_ASC',
  FastThresholdDesc = 'FAST_THRESHOLD_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  MetadataAsc = 'METADATA_ASC',
  MetadataDesc = 'METADATA_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  ProposalIdAsc = 'PROPOSAL_ID_ASC',
  ProposalIdDesc = 'PROPOSAL_ID_DESC',
  QuorumAsc = 'QUORUM_ASC',
  QuorumDesc = 'QUORUM_DESC',
  SlowThresholdAsc = 'SLOW_THRESHOLD_ASC',
  SlowThresholdDesc = 'SLOW_THRESHOLD_DESC',
  TargetAddressAsc = 'TARGET_ADDRESS_ASC',
  TargetAddressDesc = 'TARGET_ADDRESS_DESC'
}

/**
 * A condition to be used against `Proposal` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type ProposalCondition = {
  /** Checks for equality with the object’s `createdAt` field. */
  createdAt?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `endTime` field. */
  endTime?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `executedAt` field. */
  executedAt?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `proposedBy` field. */
  proposedBy?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `quorum` field. */
  quorum?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `startTime` field. */
  startTime?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `threshold` field. */
  threshold?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `votingMode` field. */
  votingMode?: InputMaybe<VotingMode>;
};

/** A filter to be used against `Proposal` object types. All fields are combined with a logical ‘and.’ */
export type ProposalFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<ProposalFilter>>;
  /** Filter by the object’s `createdAt` field. */
  createdAt?: InputMaybe<StringFilter>;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: InputMaybe<StringFilter>;
  /** Filter by the object’s `endTime` field. */
  endTime?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `executedAt` field. */
  executedAt?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<UuidFilter>;
  /** Negates the expression. */
  not?: InputMaybe<ProposalFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<ProposalFilter>>;
  /** Filter by the object’s `proposalActionsConnection` relation. */
  proposalActionsConnection?: InputMaybe<ProposalToManyProposalActionFilter>;
  /** Some related `proposalActionsConnection` exist. */
  proposalActionsConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `proposalVotesConnection` relation. */
  proposalVotesConnection?: InputMaybe<ProposalToManyProposalVoteFilter>;
  /** Some related `proposalVotesConnection` exist. */
  proposalVotesConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `proposedBy` field. */
  proposedBy?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `quorum` field. */
  quorum?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `space` relation. */
  space?: InputMaybe<SpaceFilter>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `startTime` field. */
  startTime?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `threshold` field. */
  threshold?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `votingMode` field. */
  votingMode?: InputMaybe<VotingModeFilter>;
};

/** A filter to be used against many `ProposalAction` object types. All fields are combined with a logical ‘and.’ */
export type ProposalToManyProposalActionFilter = {
  /** Every related `ProposalAction` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<ProposalActionFilter>;
  /** No related `ProposalAction` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<ProposalActionFilter>;
  /** Some related `ProposalAction` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<ProposalActionFilter>;
};

/** A filter to be used against many `ProposalVote` object types. All fields are combined with a logical ‘and.’ */
export type ProposalToManyProposalVoteFilter = {
  /** Every related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<ProposalVoteFilter>;
  /** No related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<ProposalVoteFilter>;
  /** Some related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<ProposalVoteFilter>;
};

export type ProposalVote = Node & {
  __typename?: 'ProposalVote';
  createdAt: Scalars['String']['output'];
  createdAtBlock: Scalars['String']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Proposal` that is related to this `ProposalVote`. */
  proposal?: Maybe<Proposal>;
  proposalId: Scalars['UUID']['output'];
  /** Reads a single `Space` that is related to this `ProposalVote`. */
  space?: Maybe<Space>;
  spaceId: Scalars['UUID']['output'];
  vote: VoteOption;
  voterId: Scalars['UUID']['output'];
};

/**
 * A condition to be used against `ProposalVote` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export type ProposalVoteCondition = {
  /** Checks for equality with the object’s `createdAt` field. */
  createdAt?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `proposalId` field. */
  proposalId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `vote` field. */
  vote?: InputMaybe<VoteOption>;
  /** Checks for equality with the object’s `voterId` field. */
  voterId?: InputMaybe<Scalars['UUID']['input']>;
};

/** A filter to be used against `ProposalVote` object types. All fields are combined with a logical ‘and.’ */
export type ProposalVoteFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<ProposalVoteFilter>>;
  /** Filter by the object’s `createdAt` field. */
  createdAt?: InputMaybe<StringFilter>;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: InputMaybe<StringFilter>;
  /** Negates the expression. */
  not?: InputMaybe<ProposalVoteFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<ProposalVoteFilter>>;
  /** Filter by the object’s `proposal` relation. */
  proposal?: InputMaybe<ProposalFilter>;
  /** Filter by the object’s `proposalId` field. */
  proposalId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `space` relation. */
  space?: InputMaybe<SpaceFilter>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `vote` field. */
  vote?: InputMaybe<VoteOptionFilter>;
  /** Filter by the object’s `voterId` field. */
  voterId?: InputMaybe<UuidFilter>;
};

/** A connection to a list of `ProposalVote` values. */
export type ProposalVotesConnection = {
  __typename?: 'ProposalVotesConnection';
  /** A list of edges which contains the `ProposalVote` and cursor to aid in pagination. */
  edges: Array<ProposalVotesEdge>;
  /** A list of `ProposalVote` objects. */
  nodes: Array<ProposalVote>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `ProposalVote` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `ProposalVote` edge in the connection. */
export type ProposalVotesEdge = {
  __typename?: 'ProposalVotesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `ProposalVote` at the end of the edge. */
  node: ProposalVote;
};

/** Methods to use when ordering `ProposalVote`. */
export enum ProposalVotesOrderBy {
  CreatedAtAsc = 'CREATED_AT_ASC',
  CreatedAtBlockAsc = 'CREATED_AT_BLOCK_ASC',
  CreatedAtBlockDesc = 'CREATED_AT_BLOCK_DESC',
  CreatedAtDesc = 'CREATED_AT_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  ProposalIdAsc = 'PROPOSAL_ID_ASC',
  ProposalIdDesc = 'PROPOSAL_ID_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC',
  VoterIdAsc = 'VOTER_ID_ASC',
  VoterIdDesc = 'VOTER_ID_DESC',
  VoteAsc = 'VOTE_ASC',
  VoteDesc = 'VOTE_DESC'
}

/** A connection to a list of `Proposal` values. */
export type ProposalsConnection = {
  __typename?: 'ProposalsConnection';
  /** A list of edges which contains the `Proposal` and cursor to aid in pagination. */
  edges: Array<ProposalsEdge>;
  /** A list of `Proposal` objects. */
  nodes: Array<Proposal>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Proposal` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Proposal` edge in the connection. */
export type ProposalsEdge = {
  __typename?: 'ProposalsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Proposal` at the end of the edge. */
  node: Proposal;
};

/** Methods to use when ordering `Proposal`. */
export enum ProposalsOrderBy {
  CreatedAtAsc = 'CREATED_AT_ASC',
  CreatedAtBlockAsc = 'CREATED_AT_BLOCK_ASC',
  CreatedAtBlockDesc = 'CREATED_AT_BLOCK_DESC',
  CreatedAtDesc = 'CREATED_AT_DESC',
  EndTimeAsc = 'END_TIME_ASC',
  EndTimeDesc = 'END_TIME_DESC',
  ExecutedAtAsc = 'EXECUTED_AT_ASC',
  ExecutedAtDesc = 'EXECUTED_AT_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  ProposedByAsc = 'PROPOSED_BY_ASC',
  ProposedByDesc = 'PROPOSED_BY_DESC',
  QuorumAsc = 'QUORUM_ASC',
  QuorumDesc = 'QUORUM_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC',
  StartTimeAsc = 'START_TIME_ASC',
  StartTimeDesc = 'START_TIME_DESC',
  ThresholdAsc = 'THRESHOLD_ASC',
  ThresholdDesc = 'THRESHOLD_DESC',
  VotingModeAsc = 'VOTING_MODE_ASC',
  VotingModeDesc = 'VOTING_MODE_DESC'
}

/** The root query type which gives access points into the data universe. */
export type Query = Node & {
  __typename?: 'Query';
  /** Reads a single `Editor` using its globally unique `ID`. */
  editorByNodeId?: Maybe<Editor>;
  /** Reads a set of `Editor`. */
  editors?: Maybe<Array<Editor>>;
  /** Reads and enables pagination through a set of `Editor`. */
  editorsConnection?: Maybe<EditorsConnection>;
  /** Reads a set of `Entity`. */
  entities?: Maybe<Array<Entity>>;
  /** Reads and enables pagination through a set of `Entity`. */
  entitiesConnection?: Maybe<EntitiesConnection>;
  /** Reads and enables pagination through a set of `Entity`. */
  entitiesOrderedByProperty?: Maybe<Array<Entity>>;
  /** Reads and enables pagination through a set of `Entity`. */
  entitiesOrderedByPropertyConnection?: Maybe<EntitiesConnection>;
  entity?: Maybe<Entity>;
  /** Reads a single `Entity` using its globally unique `ID`. */
  entityByNodeId?: Maybe<Entity>;
  globalScore?: Maybe<GlobalScore>;
  /** Reads a single `GlobalScore` using its globally unique `ID`. */
  globalScoreByNodeId?: Maybe<GlobalScore>;
  /** Reads a set of `GlobalScore`. */
  globalScores?: Maybe<Array<GlobalScore>>;
  /** Reads and enables pagination through a set of `GlobalScore`. */
  globalScoresConnection?: Maybe<GlobalScoresConnection>;
  localScore?: Maybe<LocalScore>;
  /** Reads a single `LocalScore` using its globally unique `ID`. */
  localScoreByNodeId?: Maybe<LocalScore>;
  /** Reads a set of `LocalScore`. */
  localScores?: Maybe<Array<LocalScore>>;
  /** Reads and enables pagination through a set of `LocalScore`. */
  localScoresConnection?: Maybe<LocalScoresConnection>;
  /** Reads a single `Member` using its globally unique `ID`. */
  memberByNodeId?: Maybe<Member>;
  /** Reads a set of `Member`. */
  members?: Maybe<Array<Member>>;
  /** Reads and enables pagination through a set of `Member`. */
  membersConnection?: Maybe<MembersConnection>;
  meta?: Maybe<Meta>;
  /** Reads a single `Meta` using its globally unique `ID`. */
  metaByNodeId?: Maybe<Meta>;
  /** Reads a set of `Meta`. */
  metas?: Maybe<Array<Meta>>;
  /** Reads and enables pagination through a set of `Meta`. */
  metasConnection?: Maybe<MetasConnection>;
  /** Fetches an object given its globally unique `ID`. */
  node?: Maybe<Node>;
  /** The root query type must be a `Node` to work well with Relay 1 mutations. This just resolves to `query`. */
  nodeId: Scalars['ID']['output'];
  /** Reads a set of `Property`. */
  properties?: Maybe<Array<Property>>;
  /** Reads and enables pagination through a set of `Property`. */
  propertiesConnection?: Maybe<PropertiesConnection>;
  property?: Maybe<Property>;
  /** Reads a single `Property` using its globally unique `ID`. */
  propertyByNodeId?: Maybe<Property>;
  proposal?: Maybe<Proposal>;
  proposalAction?: Maybe<ProposalAction>;
  /** Reads a single `ProposalAction` using its globally unique `ID`. */
  proposalActionByNodeId?: Maybe<ProposalAction>;
  /** Reads a set of `ProposalAction`. */
  proposalActions?: Maybe<Array<ProposalAction>>;
  /** Reads and enables pagination through a set of `ProposalAction`. */
  proposalActionsConnection?: Maybe<ProposalActionsConnection>;
  /** Reads a single `Proposal` using its globally unique `ID`. */
  proposalByNodeId?: Maybe<Proposal>;
  proposalVote?: Maybe<ProposalVote>;
  /** Reads a single `ProposalVote` using its globally unique `ID`. */
  proposalVoteByNodeId?: Maybe<ProposalVote>;
  /** Reads a set of `ProposalVote`. */
  proposalVotes?: Maybe<Array<ProposalVote>>;
  /** Reads and enables pagination through a set of `ProposalVote`. */
  proposalVotesConnection?: Maybe<ProposalVotesConnection>;
  /** Reads a set of `Proposal`. */
  proposals?: Maybe<Array<Proposal>>;
  /** Reads and enables pagination through a set of `Proposal`. */
  proposalsConnection?: Maybe<ProposalsConnection>;
  /**
   * Exposes the root query type nested one level down. This is helpful for Relay 1
   * which can only query top level fields if they are in a particular form.
   */
  query: Query;
  rawAction?: Maybe<RawAction>;
  /** Reads a single `RawAction` using its globally unique `ID`. */
  rawActionByNodeId?: Maybe<RawAction>;
  /** Reads a set of `RawAction`. */
  rawActions?: Maybe<Array<RawAction>>;
  /** Reads and enables pagination through a set of `RawAction`. */
  rawActionsConnection?: Maybe<RawActionsConnection>;
  relation?: Maybe<Relation>;
  /** Reads a single `Relation` using its globally unique `ID`. */
  relationByNodeId?: Maybe<Relation>;
  /** Reads a set of `Relation`. */
  relations?: Maybe<Array<Relation>>;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsConnection?: Maybe<RelationsConnection>;
  /** Reads and enables pagination through a set of `Entity`. */
  search?: Maybe<Array<Entity>>;
  /** Reads and enables pagination through a set of `Entity`. */
  searchConnection?: Maybe<EntitiesConnection>;
  space?: Maybe<Space>;
  /** Reads a single `Space` using its globally unique `ID`. */
  spaceByNodeId?: Maybe<Space>;
  spaceScore?: Maybe<SpaceScore>;
  /** Reads a single `SpaceScore` using its globally unique `ID`. */
  spaceScoreByNodeId?: Maybe<SpaceScore>;
  /** Reads a set of `SpaceScore`. */
  spaceScores?: Maybe<Array<SpaceScore>>;
  /** Reads and enables pagination through a set of `SpaceScore`. */
  spaceScoresConnection?: Maybe<SpaceScoresConnection>;
  /** Reads a set of `Space`. */
  spaces?: Maybe<Array<Space>>;
  /** Reads and enables pagination through a set of `Space`. */
  spacesConnection?: Maybe<SpacesConnection>;
  subspace?: Maybe<Subspace>;
  /** Reads a single `Subspace` using its globally unique `ID`. */
  subspaceByNodeId?: Maybe<Subspace>;
  /** Reads a set of `Subspace`. */
  subspaces?: Maybe<Array<Subspace>>;
  /** Reads and enables pagination through a set of `Subspace`. */
  subspacesConnection?: Maybe<SubspacesConnection>;
  type?: Maybe<Entity>;
  /** Reads and enables pagination through a set of `Entity`. */
  typesList?: Maybe<Array<Entity>>;
  /** Reads and enables pagination through a set of `Entity`. */
  typesListConnection?: Maybe<EntitiesConnection>;
  userVote?: Maybe<UserVote>;
  /** Reads a single `UserVote` using its globally unique `ID`. */
  userVoteByNodeId?: Maybe<UserVote>;
  userVoteByUserIdAndObjectIdAndObjectTypeAndSpaceId?: Maybe<UserVote>;
  /** Reads a set of `UserVote`. */
  userVotes?: Maybe<Array<UserVote>>;
  /** Reads and enables pagination through a set of `UserVote`. */
  userVotesConnection?: Maybe<UserVotesConnection>;
  value?: Maybe<Value>;
  /** Reads a single `Value` using its globally unique `ID`. */
  valueByNodeId?: Maybe<Value>;
  /** Reads a set of `Value`. */
  values?: Maybe<Array<Value>>;
  /** Reads and enables pagination through a set of `Value`. */
  valuesConnection?: Maybe<ValuesConnection>;
  votesCount?: Maybe<VotesCount>;
  /** Reads a single `VotesCount` using its globally unique `ID`. */
  votesCountByNodeId?: Maybe<VotesCount>;
  votesCountByObjectIdAndObjectTypeAndSpaceId?: Maybe<VotesCount>;
  /** Reads a set of `VotesCount`. */
  votesCounts?: Maybe<Array<VotesCount>>;
  /** Reads and enables pagination through a set of `VotesCount`. */
  votesCountsConnection?: Maybe<VotesCountsConnection>;
};


/** The root query type which gives access points into the data universe. */
export type QueryEditorByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryEditorsArgs = {
  condition?: InputMaybe<EditorCondition>;
  filter?: InputMaybe<EditorFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EditorsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryEditorsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<EditorCondition>;
  filter?: InputMaybe<EditorFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EditorsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryEntitiesArgs = {
  condition?: InputMaybe<EntityCondition>;
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EntitiesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryEntitiesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<EntityCondition>;
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EntitiesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryEntitiesOrderedByPropertyArgs = {
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  propertyId?: InputMaybe<Scalars['UUID']['input']>;
  sortDirection?: InputMaybe<SortOrder>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};


/** The root query type which gives access points into the data universe. */
export type QueryEntitiesOrderedByPropertyConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  propertyId?: InputMaybe<Scalars['UUID']['input']>;
  sortDirection?: InputMaybe<SortOrder>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};


/** The root query type which gives access points into the data universe. */
export type QueryEntityArgs = {
  id: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryEntityByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGlobalScoreArgs = {
  entityId: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGlobalScoreByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryGlobalScoresArgs = {
  condition?: InputMaybe<GlobalScoreCondition>;
  filter?: InputMaybe<GlobalScoreFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<GlobalScoresOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryGlobalScoresConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<GlobalScoreCondition>;
  filter?: InputMaybe<GlobalScoreFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<GlobalScoresOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryLocalScoreArgs = {
  entityId: Scalars['UUID']['input'];
  spaceId: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLocalScoreByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryLocalScoresArgs = {
  condition?: InputMaybe<LocalScoreCondition>;
  filter?: InputMaybe<LocalScoreFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LocalScoresOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryLocalScoresConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<LocalScoreCondition>;
  filter?: InputMaybe<LocalScoreFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LocalScoresOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMemberByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMembersArgs = {
  condition?: InputMaybe<MemberCondition>;
  filter?: InputMaybe<MemberFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MembersOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMembersConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MemberCondition>;
  filter?: InputMaybe<MemberFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MembersOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMetaArgs = {
  id: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMetaByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryMetasArgs = {
  condition?: InputMaybe<MetaCondition>;
  filter?: InputMaybe<MetaFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MetasOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryMetasConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MetaCondition>;
  filter?: InputMaybe<MetaFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MetasOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryNodeArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryPropertiesArgs = {
  condition?: InputMaybe<PropertyCondition>;
  filter?: InputMaybe<PropertyFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PropertiesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryPropertiesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<PropertyCondition>;
  filter?: InputMaybe<PropertyFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PropertiesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryPropertyArgs = {
  id: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryPropertyByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalArgs = {
  id: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalActionArgs = {
  id: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalActionByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalActionsArgs = {
  condition?: InputMaybe<ProposalActionCondition>;
  filter?: InputMaybe<ProposalActionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalActionsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalActionsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ProposalActionCondition>;
  filter?: InputMaybe<ProposalActionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalActionsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalVoteArgs = {
  proposalId: Scalars['UUID']['input'];
  voterId: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalVoteByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalVotesArgs = {
  condition?: InputMaybe<ProposalVoteCondition>;
  filter?: InputMaybe<ProposalVoteFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalVotesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalVotesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ProposalVoteCondition>;
  filter?: InputMaybe<ProposalVoteFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalVotesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalsArgs = {
  condition?: InputMaybe<ProposalCondition>;
  filter?: InputMaybe<ProposalFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryProposalsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ProposalCondition>;
  filter?: InputMaybe<ProposalFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryRawActionArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryRawActionByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryRawActionsArgs = {
  condition?: InputMaybe<RawActionCondition>;
  filter?: InputMaybe<RawActionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RawActionsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryRawActionsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<RawActionCondition>;
  filter?: InputMaybe<RawActionFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RawActionsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryRelationArgs = {
  id: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryRelationByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryRelationsArgs = {
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryRelationsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySearchArgs = {
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  query?: InputMaybe<Scalars['String']['input']>;
  similarityThreshold?: InputMaybe<Scalars['Float']['input']>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySearchConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  query?: InputMaybe<Scalars['String']['input']>;
  similarityThreshold?: InputMaybe<Scalars['Float']['input']>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySpaceArgs = {
  id: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySpaceByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySpaceScoreArgs = {
  spaceId: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySpaceScoreByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySpaceScoresArgs = {
  condition?: InputMaybe<SpaceScoreCondition>;
  filter?: InputMaybe<SpaceScoreFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SpaceScoresOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySpaceScoresConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SpaceScoreCondition>;
  filter?: InputMaybe<SpaceScoreFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SpaceScoresOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySpacesArgs = {
  condition?: InputMaybe<SpaceCondition>;
  filter?: InputMaybe<SpaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SpacesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySpacesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SpaceCondition>;
  filter?: InputMaybe<SpaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SpacesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySubspaceArgs = {
  childSpaceId: Scalars['UUID']['input'];
  parentSpaceId: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySubspaceByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QuerySubspacesArgs = {
  condition?: InputMaybe<SubspaceCondition>;
  filter?: InputMaybe<SubspaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SubspacesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QuerySubspacesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SubspaceCondition>;
  filter?: InputMaybe<SubspaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SubspacesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryTypeArgs = {
  id?: InputMaybe<Scalars['UUID']['input']>;
};


/** The root query type which gives access points into the data universe. */
export type QueryTypesListArgs = {
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};


/** The root query type which gives access points into the data universe. */
export type QueryTypesListConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  filter?: InputMaybe<EntityFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
};


/** The root query type which gives access points into the data universe. */
export type QueryUserVoteArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserVoteByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserVoteByUserIdAndObjectIdAndObjectTypeAndSpaceIdArgs = {
  objectId: Scalars['UUID']['input'];
  objectType: Scalars['Int']['input'];
  spaceId: Scalars['UUID']['input'];
  userId: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryUserVotesArgs = {
  condition?: InputMaybe<UserVoteCondition>;
  filter?: InputMaybe<UserVoteFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<UserVotesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryUserVotesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<UserVoteCondition>;
  filter?: InputMaybe<UserVoteFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<UserVotesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryValueArgs = {
  id: Scalars['String']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryValueByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryValuesArgs = {
  condition?: InputMaybe<ValueCondition>;
  filter?: InputMaybe<ValueFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ValuesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryValuesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ValueCondition>;
  filter?: InputMaybe<ValueFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ValuesOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryVotesCountArgs = {
  id: Scalars['Int']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryVotesCountByNodeIdArgs = {
  nodeId: Scalars['ID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryVotesCountByObjectIdAndObjectTypeAndSpaceIdArgs = {
  objectId: Scalars['UUID']['input'];
  objectType: Scalars['Int']['input'];
  spaceId: Scalars['UUID']['input'];
};


/** The root query type which gives access points into the data universe. */
export type QueryVotesCountsArgs = {
  condition?: InputMaybe<VotesCountCondition>;
  filter?: InputMaybe<VotesCountFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<VotesCountsOrderBy>>;
};


/** The root query type which gives access points into the data universe. */
export type QueryVotesCountsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<VotesCountCondition>;
  filter?: InputMaybe<VotesCountFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<VotesCountsOrderBy>>;
};

export type RawAction = Node & {
  __typename?: 'RawAction';
  actionType: Scalars['BigInt']['output'];
  actionVersion: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['Datetime']['output'];
  groupId?: Maybe<Scalars['UUID']['output']>;
  id: Scalars['Int']['output'];
  metadata?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  objectId: Scalars['UUID']['output'];
  objectType: Scalars['Int']['output'];
  sender: Scalars['String']['output'];
  spacePov: Scalars['UUID']['output'];
  txHash: Scalars['String']['output'];
};

/**
 * A condition to be used against `RawAction` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type RawActionCondition = {
  /** Checks for equality with the object’s `actionType` field. */
  actionType?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `actionVersion` field. */
  actionVersion?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `blockNumber` field. */
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `blockTimestamp` field. */
  blockTimestamp?: InputMaybe<Scalars['Datetime']['input']>;
  /** Checks for equality with the object’s `groupId` field. */
  groupId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `metadata` field. */
  metadata?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `objectId` field. */
  objectId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `objectType` field. */
  objectType?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `sender` field. */
  sender?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `spacePov` field. */
  spacePov?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `txHash` field. */
  txHash?: InputMaybe<Scalars['String']['input']>;
};

/** A filter to be used against `RawAction` object types. All fields are combined with a logical ‘and.’ */
export type RawActionFilter = {
  /** Filter by the object’s `actionType` field. */
  actionType?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `actionVersion` field. */
  actionVersion?: InputMaybe<BigIntFilter>;
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<RawActionFilter>>;
  /** Filter by the object’s `blockNumber` field. */
  blockNumber?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `blockTimestamp` field. */
  blockTimestamp?: InputMaybe<DatetimeFilter>;
  /** Filter by the object’s `groupId` field. */
  groupId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<IntFilter>;
  /** Negates the expression. */
  not?: InputMaybe<RawActionFilter>;
  /** Filter by the object’s `objectId` field. */
  objectId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `objectType` field. */
  objectType?: InputMaybe<IntFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<RawActionFilter>>;
  /** Filter by the object’s `sender` field. */
  sender?: InputMaybe<StringFilter>;
  /** Filter by the object’s `spacePov` field. */
  spacePov?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `txHash` field. */
  txHash?: InputMaybe<StringFilter>;
};

/** A connection to a list of `RawAction` values. */
export type RawActionsConnection = {
  __typename?: 'RawActionsConnection';
  /** A list of edges which contains the `RawAction` and cursor to aid in pagination. */
  edges: Array<RawActionsEdge>;
  /** A list of `RawAction` objects. */
  nodes: Array<RawAction>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `RawAction` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `RawAction` edge in the connection. */
export type RawActionsEdge = {
  __typename?: 'RawActionsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `RawAction` at the end of the edge. */
  node: RawAction;
};

/** Methods to use when ordering `RawAction`. */
export enum RawActionsOrderBy {
  ActionTypeAsc = 'ACTION_TYPE_ASC',
  ActionTypeDesc = 'ACTION_TYPE_DESC',
  ActionVersionAsc = 'ACTION_VERSION_ASC',
  ActionVersionDesc = 'ACTION_VERSION_DESC',
  BlockNumberAsc = 'BLOCK_NUMBER_ASC',
  BlockNumberDesc = 'BLOCK_NUMBER_DESC',
  BlockTimestampAsc = 'BLOCK_TIMESTAMP_ASC',
  BlockTimestampDesc = 'BLOCK_TIMESTAMP_DESC',
  GroupIdAsc = 'GROUP_ID_ASC',
  GroupIdDesc = 'GROUP_ID_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  MetadataAsc = 'METADATA_ASC',
  MetadataDesc = 'METADATA_DESC',
  Natural = 'NATURAL',
  ObjectIdAsc = 'OBJECT_ID_ASC',
  ObjectIdDesc = 'OBJECT_ID_DESC',
  ObjectTypeAsc = 'OBJECT_TYPE_ASC',
  ObjectTypeDesc = 'OBJECT_TYPE_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SenderAsc = 'SENDER_ASC',
  SenderDesc = 'SENDER_DESC',
  SpacePovAsc = 'SPACE_POV_ASC',
  SpacePovDesc = 'SPACE_POV_DESC',
  TxHashAsc = 'TX_HASH_ASC',
  TxHashDesc = 'TX_HASH_DESC'
}

export type Relation = Node & {
  __typename?: 'Relation';
  /** Reads a single `Entity` that is related to this `Relation`. */
  entity?: Maybe<Entity>;
  entityId: Scalars['UUID']['output'];
  /** Reads a single `Entity` that is related to this `Relation`. */
  fromEntity?: Maybe<Entity>;
  fromEntityId: Scalars['UUID']['output'];
  /** Reads a single `Space` that is related to this `Relation`. */
  fromSpace?: Maybe<Space>;
  fromSpaceId?: Maybe<Scalars['UUID']['output']>;
  fromVersionId?: Maybe<Scalars['UUID']['output']>;
  id: Scalars['UUID']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  position?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Space` that is related to this `Relation`. */
  space?: Maybe<Space>;
  spaceId: Scalars['UUID']['output'];
  /** Reads a single `Entity` that is related to this `Relation`. */
  toEntity?: Maybe<Entity>;
  toEntityId: Scalars['UUID']['output'];
  /** Reads a single `Space` that is related to this `Relation`. */
  toSpace?: Maybe<Space>;
  toSpaceId?: Maybe<Scalars['UUID']['output']>;
  toVersionId?: Maybe<Scalars['UUID']['output']>;
  /** Reads a single `Property` that is related to this `Relation`. */
  type?: Maybe<Property>;
  typeId: Scalars['UUID']['output'];
  verified?: Maybe<Scalars['Boolean']['output']>;
};

/**
 * A condition to be used against `Relation` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type RelationCondition = {
  /** Checks for equality with the object’s `entityId` field. */
  entityId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `fromEntityId` field. */
  fromEntityId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `fromSpaceId` field. */
  fromSpaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `fromVersionId` field. */
  fromVersionId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `position` field. */
  position?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `toEntityId` field. */
  toEntityId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `toSpaceId` field. */
  toSpaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `toVersionId` field. */
  toVersionId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `typeId` field. */
  typeId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `verified` field. */
  verified?: InputMaybe<Scalars['Boolean']['input']>;
};

/** A filter to be used against `Relation` object types. All fields are combined with a logical ‘and.’ */
export type RelationFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<RelationFilter>>;
  /** Filter by the object’s `entity` relation. */
  entity?: InputMaybe<EntityFilter>;
  /** Filter by the object’s `entityId` field. */
  entityId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `fromEntity` relation. */
  fromEntity?: InputMaybe<EntityFilter>;
  /** Filter by the object’s `fromEntityId` field. */
  fromEntityId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `fromSpace` relation. */
  fromSpace?: InputMaybe<SpaceFilter>;
  /** A related `fromSpace` exists. */
  fromSpaceExists?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `fromSpaceId` field. */
  fromSpaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `fromVersionId` field. */
  fromVersionId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<UuidFilter>;
  /** Negates the expression. */
  not?: InputMaybe<RelationFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<RelationFilter>>;
  /** Filter by the object’s `position` field. */
  position?: InputMaybe<StringFilter>;
  /** Filter by the object’s `space` relation. */
  space?: InputMaybe<SpaceFilter>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `toEntity` relation. */
  toEntity?: InputMaybe<EntityFilter>;
  /** Filter by the object’s `toEntityId` field. */
  toEntityId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `toSpace` relation. */
  toSpace?: InputMaybe<SpaceFilter>;
  /** A related `toSpace` exists. */
  toSpaceExists?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `toSpaceId` field. */
  toSpaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `toVersionId` field. */
  toVersionId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `type` relation. */
  type?: InputMaybe<PropertyFilter>;
  /** Filter by the object’s `typeId` field. */
  typeId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `verified` field. */
  verified?: InputMaybe<BooleanFilter>;
};

/** A connection to a list of `Relation` values. */
export type RelationsConnection = {
  __typename?: 'RelationsConnection';
  /** A list of edges which contains the `Relation` and cursor to aid in pagination. */
  edges: Array<RelationsEdge>;
  /** A list of `Relation` objects. */
  nodes: Array<Relation>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Relation` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Relation` edge in the connection. */
export type RelationsEdge = {
  __typename?: 'RelationsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Relation` at the end of the edge. */
  node: Relation;
};

/** Methods to use when ordering `Relation`. */
export enum RelationsOrderBy {
  EntityIdAsc = 'ENTITY_ID_ASC',
  EntityIdDesc = 'ENTITY_ID_DESC',
  FromEntityIdAsc = 'FROM_ENTITY_ID_ASC',
  FromEntityIdDesc = 'FROM_ENTITY_ID_DESC',
  FromSpaceIdAsc = 'FROM_SPACE_ID_ASC',
  FromSpaceIdDesc = 'FROM_SPACE_ID_DESC',
  FromVersionIdAsc = 'FROM_VERSION_ID_ASC',
  FromVersionIdDesc = 'FROM_VERSION_ID_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  Natural = 'NATURAL',
  PositionAsc = 'POSITION_ASC',
  PositionDesc = 'POSITION_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC',
  ToEntityIdAsc = 'TO_ENTITY_ID_ASC',
  ToEntityIdDesc = 'TO_ENTITY_ID_DESC',
  ToSpaceIdAsc = 'TO_SPACE_ID_ASC',
  ToSpaceIdDesc = 'TO_SPACE_ID_DESC',
  ToVersionIdAsc = 'TO_VERSION_ID_ASC',
  ToVersionIdDesc = 'TO_VERSION_ID_DESC',
  TypeIdAsc = 'TYPE_ID_ASC',
  TypeIdDesc = 'TYPE_ID_DESC',
  VerifiedAsc = 'VERIFIED_ASC',
  VerifiedDesc = 'VERIFIED_DESC'
}

export enum SortOrder {
  Asc = 'ASC',
  Desc = 'DESC'
}

export type Space = Node & {
  __typename?: 'Space';
  daoAddress: Scalars['String']['output'];
  /** Reads and enables pagination through a set of `Editor`. */
  editors: EditorsConnection;
  /** Reads and enables pagination through a set of `Editor`. */
  editorsList: Array<Editor>;
  id: Scalars['UUID']['output'];
  mainVotingAddress?: Maybe<Scalars['String']['output']>;
  /** Reads and enables pagination through a set of `Member`. */
  members: MembersConnection;
  /** Reads and enables pagination through a set of `Member`. */
  membersList: Array<Member>;
  membershipAddress?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  page?: Maybe<Entity>;
  personalAddress?: Maybe<Scalars['String']['output']>;
  /** Reads and enables pagination through a set of `ProposalVote`. */
  proposalVotes: Array<ProposalVote>;
  /** Reads and enables pagination through a set of `ProposalVote`. */
  proposalVotesConnection: ProposalVotesConnection;
  /** Reads and enables pagination through a set of `Proposal`. */
  proposals: Array<Proposal>;
  /** Reads and enables pagination through a set of `Proposal`. */
  proposalsConnection: ProposalsConnection;
  /** Reads and enables pagination through a set of `Relation`. */
  relations: Array<Relation>;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsByFromSpaceId: Array<Relation>;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsByFromSpaceIdConnection: RelationsConnection;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsByToSpaceId: Array<Relation>;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsByToSpaceIdConnection: RelationsConnection;
  /** Reads and enables pagination through a set of `Relation`. */
  relationsConnection: RelationsConnection;
  spaceAddress: Scalars['String']['output'];
  /** Reads and enables pagination through a set of `Subspace`. */
  subspacesByChildSpaceId: Array<Subspace>;
  /** Reads and enables pagination through a set of `Subspace`. */
  subspacesByChildSpaceIdConnection: SubspacesConnection;
  /** Reads and enables pagination through a set of `Subspace`. */
  subspacesByParentSpaceId: Array<Subspace>;
  /** Reads and enables pagination through a set of `Subspace`. */
  subspacesByParentSpaceIdConnection: SubspacesConnection;
  type: SpaceTypes;
  /** Reads and enables pagination through a set of `Value`. */
  values: Array<Value>;
  /** Reads and enables pagination through a set of `Value`. */
  valuesConnection: ValuesConnection;
};


export type SpaceEditorsArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<EditorCondition>;
  filter?: InputMaybe<EditorFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EditorsOrderBy>>;
};


export type SpaceEditorsListArgs = {
  condition?: InputMaybe<EditorCondition>;
  filter?: InputMaybe<EditorFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EditorsOrderBy>>;
};


export type SpaceMembersArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<MemberCondition>;
  filter?: InputMaybe<MemberFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MembersOrderBy>>;
};


export type SpaceMembersListArgs = {
  condition?: InputMaybe<MemberCondition>;
  filter?: InputMaybe<MemberFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MembersOrderBy>>;
};


export type SpaceProposalVotesArgs = {
  condition?: InputMaybe<ProposalVoteCondition>;
  filter?: InputMaybe<ProposalVoteFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalVotesOrderBy>>;
};


export type SpaceProposalVotesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ProposalVoteCondition>;
  filter?: InputMaybe<ProposalVoteFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalVotesOrderBy>>;
};


export type SpaceProposalsArgs = {
  condition?: InputMaybe<ProposalCondition>;
  filter?: InputMaybe<ProposalFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalsOrderBy>>;
};


export type SpaceProposalsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ProposalCondition>;
  filter?: InputMaybe<ProposalFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ProposalsOrderBy>>;
};


export type SpaceRelationsArgs = {
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type SpaceRelationsByFromSpaceIdArgs = {
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type SpaceRelationsByFromSpaceIdConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type SpaceRelationsByToSpaceIdArgs = {
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type SpaceRelationsByToSpaceIdConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type SpaceRelationsConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<RelationCondition>;
  filter?: InputMaybe<RelationFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RelationsOrderBy>>;
};


export type SpaceSubspacesByChildSpaceIdArgs = {
  condition?: InputMaybe<SubspaceCondition>;
  filter?: InputMaybe<SubspaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SubspacesOrderBy>>;
};


export type SpaceSubspacesByChildSpaceIdConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SubspaceCondition>;
  filter?: InputMaybe<SubspaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SubspacesOrderBy>>;
};


export type SpaceSubspacesByParentSpaceIdArgs = {
  condition?: InputMaybe<SubspaceCondition>;
  filter?: InputMaybe<SubspaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SubspacesOrderBy>>;
};


export type SpaceSubspacesByParentSpaceIdConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<SubspaceCondition>;
  filter?: InputMaybe<SubspaceFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SubspacesOrderBy>>;
};


export type SpaceValuesArgs = {
  condition?: InputMaybe<ValueCondition>;
  filter?: InputMaybe<ValueFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ValuesOrderBy>>;
};


export type SpaceValuesConnectionArgs = {
  after?: InputMaybe<Scalars['Cursor']['input']>;
  before?: InputMaybe<Scalars['Cursor']['input']>;
  condition?: InputMaybe<ValueCondition>;
  filter?: InputMaybe<ValueFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ValuesOrderBy>>;
};

/** A condition to be used against `Space` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type SpaceCondition = {
  /** Checks for equality with the object’s `daoAddress` field. */
  daoAddress?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `mainVotingAddress` field. */
  mainVotingAddress?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `membershipAddress` field. */
  membershipAddress?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `personalAddress` field. */
  personalAddress?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `spaceAddress` field. */
  spaceAddress?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `type` field. */
  type?: InputMaybe<SpaceTypes>;
};

/** A filter to be used against `Space` object types. All fields are combined with a logical ‘and.’ */
export type SpaceFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<SpaceFilter>>;
  /** Filter by the object’s `daoAddress` field. */
  daoAddress?: InputMaybe<StringFilter>;
  /** Filter by the object’s `editors` relation. */
  editors?: InputMaybe<SpaceToManyEditorFilter>;
  /** Some related `editors` exist. */
  editorsExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `mainVotingAddress` field. */
  mainVotingAddress?: InputMaybe<StringFilter>;
  /** Filter by the object’s `members` relation. */
  members?: InputMaybe<SpaceToManyMemberFilter>;
  /** Some related `members` exist. */
  membersExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `membershipAddress` field. */
  membershipAddress?: InputMaybe<StringFilter>;
  /** Negates the expression. */
  not?: InputMaybe<SpaceFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<SpaceFilter>>;
  /** Filter by the object’s `personalAddress` field. */
  personalAddress?: InputMaybe<StringFilter>;
  /** Filter by the object’s `proposalVotesConnection` relation. */
  proposalVotesConnection?: InputMaybe<SpaceToManyProposalVoteFilter>;
  /** Some related `proposalVotesConnection` exist. */
  proposalVotesConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `proposalsConnection` relation. */
  proposalsConnection?: InputMaybe<SpaceToManyProposalFilter>;
  /** Some related `proposalsConnection` exist. */
  proposalsConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `relationsByFromSpaceIdConnection` relation. */
  relationsByFromSpaceIdConnection?: InputMaybe<SpaceToManyRelationFilter>;
  /** Some related `relationsByFromSpaceIdConnection` exist. */
  relationsByFromSpaceIdConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `relationsByToSpaceIdConnection` relation. */
  relationsByToSpaceIdConnection?: InputMaybe<SpaceToManyRelationFilter>;
  /** Some related `relationsByToSpaceIdConnection` exist. */
  relationsByToSpaceIdConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `relationsConnection` relation. */
  relationsConnection?: InputMaybe<SpaceToManyRelationFilter>;
  /** Some related `relationsConnection` exist. */
  relationsConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `spaceAddress` field. */
  spaceAddress?: InputMaybe<StringFilter>;
  /** Filter by the object’s `subspacesByChildSpaceIdConnection` relation. */
  subspacesByChildSpaceIdConnection?: InputMaybe<SpaceToManySubspaceFilter>;
  /** Some related `subspacesByChildSpaceIdConnection` exist. */
  subspacesByChildSpaceIdConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `subspacesByParentSpaceIdConnection` relation. */
  subspacesByParentSpaceIdConnection?: InputMaybe<SpaceToManySubspaceFilter>;
  /** Some related `subspacesByParentSpaceIdConnection` exist. */
  subspacesByParentSpaceIdConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the object’s `type` field. */
  type?: InputMaybe<SpaceTypesFilter>;
  /** Filter by the object’s `valuesConnection` relation. */
  valuesConnection?: InputMaybe<SpaceToManyValueFilter>;
  /** Some related `valuesConnection` exist. */
  valuesConnectionExist?: InputMaybe<Scalars['Boolean']['input']>;
};

export type SpaceScore = Node & {
  __typename?: 'SpaceScore';
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  score: Scalars['BigFloat']['output'];
  spaceId: Scalars['UUID']['output'];
  updatedAt: Scalars['Datetime']['output'];
};

/**
 * A condition to be used against `SpaceScore` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type SpaceScoreCondition = {
  /** Checks for equality with the object’s `score` field. */
  score?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<Scalars['Datetime']['input']>;
};

/** A filter to be used against `SpaceScore` object types. All fields are combined with a logical ‘and.’ */
export type SpaceScoreFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<SpaceScoreFilter>>;
  /** Negates the expression. */
  not?: InputMaybe<SpaceScoreFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<SpaceScoreFilter>>;
  /** Filter by the object’s `score` field. */
  score?: InputMaybe<BigFloatFilter>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `updatedAt` field. */
  updatedAt?: InputMaybe<DatetimeFilter>;
};

/** A connection to a list of `SpaceScore` values. */
export type SpaceScoresConnection = {
  __typename?: 'SpaceScoresConnection';
  /** A list of edges which contains the `SpaceScore` and cursor to aid in pagination. */
  edges: Array<SpaceScoresEdge>;
  /** A list of `SpaceScore` objects. */
  nodes: Array<SpaceScore>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `SpaceScore` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `SpaceScore` edge in the connection. */
export type SpaceScoresEdge = {
  __typename?: 'SpaceScoresEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `SpaceScore` at the end of the edge. */
  node: SpaceScore;
};

/** Methods to use when ordering `SpaceScore`. */
export enum SpaceScoresOrderBy {
  Natural = 'NATURAL',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  ScoreAsc = 'SCORE_ASC',
  ScoreDesc = 'SCORE_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC',
  UpdatedAtAsc = 'UPDATED_AT_ASC',
  UpdatedAtDesc = 'UPDATED_AT_DESC'
}

/** A filter to be used against many `Editor` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyEditorFilter = {
  /** Every related `Editor` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<EditorFilter>;
  /** No related `Editor` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<EditorFilter>;
  /** Some related `Editor` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<EditorFilter>;
};

/** A filter to be used against many `Member` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyMemberFilter = {
  /** Every related `Member` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<MemberFilter>;
  /** No related `Member` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<MemberFilter>;
  /** Some related `Member` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<MemberFilter>;
};

/** A filter to be used against many `Proposal` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyProposalFilter = {
  /** Every related `Proposal` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<ProposalFilter>;
  /** No related `Proposal` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<ProposalFilter>;
  /** Some related `Proposal` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<ProposalFilter>;
};

/** A filter to be used against many `ProposalVote` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyProposalVoteFilter = {
  /** Every related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<ProposalVoteFilter>;
  /** No related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<ProposalVoteFilter>;
  /** Some related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<ProposalVoteFilter>;
};

/** A filter to be used against many `Relation` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyRelationFilter = {
  /** Every related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<RelationFilter>;
  /** No related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<RelationFilter>;
  /** Some related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<RelationFilter>;
};

/** A filter to be used against many `Subspace` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManySubspaceFilter = {
  /** Every related `Subspace` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<SubspaceFilter>;
  /** No related `Subspace` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<SubspaceFilter>;
  /** Some related `Subspace` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<SubspaceFilter>;
};

/** A filter to be used against many `Value` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyValueFilter = {
  /** Every related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: InputMaybe<ValueFilter>;
  /** No related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: InputMaybe<ValueFilter>;
  /** Some related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: InputMaybe<ValueFilter>;
};

export enum SpaceTypes {
  Personal = 'PERSONAL',
  Public = 'PUBLIC'
}

/** A filter to be used against SpaceTypes fields. All fields are combined with a logical ‘and.’ */
export type SpaceTypesFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<SpaceTypes>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<SpaceTypes>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<SpaceTypes>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<SpaceTypes>>;
  /** Equal to the specified value. */
  is?: InputMaybe<SpaceTypes>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<SpaceTypes>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<SpaceTypes>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<SpaceTypes>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<SpaceTypes>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<SpaceTypes>>;
};

/** A connection to a list of `Space` values. */
export type SpacesConnection = {
  __typename?: 'SpacesConnection';
  /** A list of edges which contains the `Space` and cursor to aid in pagination. */
  edges: Array<SpacesEdge>;
  /** A list of `Space` objects. */
  nodes: Array<Space>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Space` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Space` edge in the connection. */
export type SpacesEdge = {
  __typename?: 'SpacesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Space` at the end of the edge. */
  node: Space;
};

/** Methods to use when ordering `Space`. */
export enum SpacesOrderBy {
  DaoAddressAsc = 'DAO_ADDRESS_ASC',
  DaoAddressDesc = 'DAO_ADDRESS_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  MainVotingAddressAsc = 'MAIN_VOTING_ADDRESS_ASC',
  MainVotingAddressDesc = 'MAIN_VOTING_ADDRESS_DESC',
  MembershipAddressAsc = 'MEMBERSHIP_ADDRESS_ASC',
  MembershipAddressDesc = 'MEMBERSHIP_ADDRESS_DESC',
  Natural = 'NATURAL',
  PersonalAddressAsc = 'PERSONAL_ADDRESS_ASC',
  PersonalAddressDesc = 'PERSONAL_ADDRESS_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SpaceAddressAsc = 'SPACE_ADDRESS_ASC',
  SpaceAddressDesc = 'SPACE_ADDRESS_DESC',
  TypeAsc = 'TYPE_ASC',
  TypeDesc = 'TYPE_DESC'
}

/** A filter to be used against String fields. All fields are combined with a logical ‘and.’ */
export type StringFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<Scalars['String']['input']>;
  /** Not equal to the specified value, treating null like an ordinary value (case-insensitive). */
  distinctFromInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Ends with the specified string (case-sensitive). */
  endsWith?: InputMaybe<Scalars['String']['input']>;
  /** Ends with the specified string (case-insensitive). */
  endsWithInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<Scalars['String']['input']>;
  /** Greater than the specified value (case-insensitive). */
  greaterThanInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<Scalars['String']['input']>;
  /** Greater than or equal to the specified value (case-insensitive). */
  greaterThanOrEqualToInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Included in the specified list (case-insensitive). */
  inInsensitive?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Contains the specified string (case-sensitive). */
  includes?: InputMaybe<Scalars['String']['input']>;
  /** Contains the specified string (case-insensitive). */
  includesInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Equal to the specified value. */
  is?: InputMaybe<Scalars['String']['input']>;
  /** Equal to the specified value (case-insensitive). */
  isInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<Scalars['String']['input']>;
  /** Not equal to the specified value (case-insensitive). */
  isNotInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<Scalars['String']['input']>;
  /** Less than the specified value (case-insensitive). */
  lessThanInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<Scalars['String']['input']>;
  /** Less than or equal to the specified value (case-insensitive). */
  lessThanOrEqualToInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Matches the specified pattern (case-sensitive). An underscore (_) matches any single character; a percent sign (%) matches any sequence of zero or more characters. */
  like?: InputMaybe<Scalars['String']['input']>;
  /** Matches the specified pattern (case-insensitive). An underscore (_) matches any single character; a percent sign (%) matches any sequence of zero or more characters. */
  likeInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<Scalars['String']['input']>;
  /** Equal to the specified value, treating null like an ordinary value (case-insensitive). */
  notDistinctFromInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Does not end with the specified string (case-sensitive). */
  notEndsWith?: InputMaybe<Scalars['String']['input']>;
  /** Does not end with the specified string (case-insensitive). */
  notEndsWithInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Not included in the specified list (case-insensitive). */
  notInInsensitive?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Does not contain the specified string (case-sensitive). */
  notIncludes?: InputMaybe<Scalars['String']['input']>;
  /** Does not contain the specified string (case-insensitive). */
  notIncludesInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Does not match the specified pattern (case-sensitive). An underscore (_) matches any single character; a percent sign (%) matches any sequence of zero or more characters. */
  notLike?: InputMaybe<Scalars['String']['input']>;
  /** Does not match the specified pattern (case-insensitive). An underscore (_) matches any single character; a percent sign (%) matches any sequence of zero or more characters. */
  notLikeInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Does not start with the specified string (case-sensitive). */
  notStartsWith?: InputMaybe<Scalars['String']['input']>;
  /** Does not start with the specified string (case-insensitive). */
  notStartsWithInsensitive?: InputMaybe<Scalars['String']['input']>;
  /** Starts with the specified string (case-sensitive). */
  startsWith?: InputMaybe<Scalars['String']['input']>;
  /** Starts with the specified string (case-insensitive). */
  startsWithInsensitive?: InputMaybe<Scalars['String']['input']>;
};

export type Subspace = Node & {
  __typename?: 'Subspace';
  /** Reads a single `Space` that is related to this `Subspace`. */
  childSpace?: Maybe<Space>;
  childSpaceId: Scalars['UUID']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  /** Reads a single `Space` that is related to this `Subspace`. */
  parentSpace?: Maybe<Space>;
  parentSpaceId: Scalars['UUID']['output'];
};

/**
 * A condition to be used against `Subspace` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type SubspaceCondition = {
  /** Checks for equality with the object’s `childSpaceId` field. */
  childSpaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `parentSpaceId` field. */
  parentSpaceId?: InputMaybe<Scalars['UUID']['input']>;
};

/** A filter to be used against `Subspace` object types. All fields are combined with a logical ‘and.’ */
export type SubspaceFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<SubspaceFilter>>;
  /** Filter by the object’s `childSpace` relation. */
  childSpace?: InputMaybe<SpaceFilter>;
  /** Filter by the object’s `childSpaceId` field. */
  childSpaceId?: InputMaybe<UuidFilter>;
  /** Negates the expression. */
  not?: InputMaybe<SubspaceFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<SubspaceFilter>>;
  /** Filter by the object’s `parentSpace` relation. */
  parentSpace?: InputMaybe<SpaceFilter>;
  /** Filter by the object’s `parentSpaceId` field. */
  parentSpaceId?: InputMaybe<UuidFilter>;
};

/** A connection to a list of `Subspace` values. */
export type SubspacesConnection = {
  __typename?: 'SubspacesConnection';
  /** A list of edges which contains the `Subspace` and cursor to aid in pagination. */
  edges: Array<SubspacesEdge>;
  /** A list of `Subspace` objects. */
  nodes: Array<Subspace>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Subspace` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Subspace` edge in the connection. */
export type SubspacesEdge = {
  __typename?: 'SubspacesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Subspace` at the end of the edge. */
  node: Subspace;
};

/** Methods to use when ordering `Subspace`. */
export enum SubspacesOrderBy {
  ChildSpaceIdAsc = 'CHILD_SPACE_ID_ASC',
  ChildSpaceIdDesc = 'CHILD_SPACE_ID_DESC',
  Natural = 'NATURAL',
  ParentSpaceIdAsc = 'PARENT_SPACE_ID_ASC',
  ParentSpaceIdDesc = 'PARENT_SPACE_ID_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC'
}

/** A filter to be used against UUID fields. All fields are combined with a logical ‘and.’ */
export type UuidFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<Scalars['UUID']['input']>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<Scalars['UUID']['input']>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<Scalars['UUID']['input']>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<Scalars['UUID']['input']>>;
  /** Equal to the specified value. */
  is?: InputMaybe<Scalars['UUID']['input']>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<Scalars['UUID']['input']>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<Scalars['UUID']['input']>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<Scalars['UUID']['input']>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<Scalars['UUID']['input']>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<Scalars['UUID']['input']>>;
};

/** A filter to be used against UUID List fields. All fields are combined with a logical ‘and.’ */
export type UuidListFilter = {
  /** Any array item is equal to the specified value. */
  anyEqualTo?: InputMaybe<Scalars['UUID']['input']>;
  /** Any array item is greater than the specified value. */
  anyGreaterThan?: InputMaybe<Scalars['UUID']['input']>;
  /** Any array item is greater than or equal to the specified value. */
  anyGreaterThanOrEqualTo?: InputMaybe<Scalars['UUID']['input']>;
  /** Any array item is less than the specified value. */
  anyLessThan?: InputMaybe<Scalars['UUID']['input']>;
  /** Any array item is less than or equal to the specified value. */
  anyLessThanOrEqualTo?: InputMaybe<Scalars['UUID']['input']>;
  /** Any array item is not equal to the specified value. */
  anyNotEqualTo?: InputMaybe<Scalars['UUID']['input']>;
  /** Contained by the specified list of values. */
  containedBy?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Contains the specified list of values. */
  in?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Equal to the specified value. */
  is?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
  /** Overlaps the specified list of values. */
  overlaps?: InputMaybe<Array<InputMaybe<Scalars['UUID']['input']>>>;
};

export type UserVote = Node & {
  __typename?: 'UserVote';
  id: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  objectId: Scalars['UUID']['output'];
  objectType: Scalars['Int']['output'];
  spaceId: Scalars['UUID']['output'];
  userId: Scalars['String']['output'];
  voteType: Scalars['Int']['output'];
  votedAt: Scalars['Datetime']['output'];
};

/**
 * A condition to be used against `UserVote` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type UserVoteCondition = {
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `objectId` field. */
  objectId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `objectType` field. */
  objectType?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `userId` field. */
  userId?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `voteType` field. */
  voteType?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `votedAt` field. */
  votedAt?: InputMaybe<Scalars['Datetime']['input']>;
};

/** A filter to be used against `UserVote` object types. All fields are combined with a logical ‘and.’ */
export type UserVoteFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<UserVoteFilter>>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<IntFilter>;
  /** Negates the expression. */
  not?: InputMaybe<UserVoteFilter>;
  /** Filter by the object’s `objectId` field. */
  objectId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `objectType` field. */
  objectType?: InputMaybe<IntFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<UserVoteFilter>>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `userId` field. */
  userId?: InputMaybe<StringFilter>;
  /** Filter by the object’s `voteType` field. */
  voteType?: InputMaybe<IntFilter>;
  /** Filter by the object’s `votedAt` field. */
  votedAt?: InputMaybe<DatetimeFilter>;
};

/** A connection to a list of `UserVote` values. */
export type UserVotesConnection = {
  __typename?: 'UserVotesConnection';
  /** A list of edges which contains the `UserVote` and cursor to aid in pagination. */
  edges: Array<UserVotesEdge>;
  /** A list of `UserVote` objects. */
  nodes: Array<UserVote>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `UserVote` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `UserVote` edge in the connection. */
export type UserVotesEdge = {
  __typename?: 'UserVotesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `UserVote` at the end of the edge. */
  node: UserVote;
};

/** Methods to use when ordering `UserVote`. */
export enum UserVotesOrderBy {
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  Natural = 'NATURAL',
  ObjectIdAsc = 'OBJECT_ID_ASC',
  ObjectIdDesc = 'OBJECT_ID_DESC',
  ObjectTypeAsc = 'OBJECT_TYPE_ASC',
  ObjectTypeDesc = 'OBJECT_TYPE_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC',
  UserIdAsc = 'USER_ID_ASC',
  UserIdDesc = 'USER_ID_DESC',
  VotedAtAsc = 'VOTED_AT_ASC',
  VotedAtDesc = 'VOTED_AT_DESC',
  VoteTypeAsc = 'VOTE_TYPE_ASC',
  VoteTypeDesc = 'VOTE_TYPE_DESC'
}

export type Value = Node & {
  __typename?: 'Value';
  boolean?: Maybe<Scalars['Boolean']['output']>;
  /** Reads a single `Entity` that is related to this `Value`. */
  entity?: Maybe<Entity>;
  entityId: Scalars['UUID']['output'];
  id: Scalars['String']['output'];
  language?: Maybe<Scalars['String']['output']>;
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  number?: Maybe<Scalars['BigFloat']['output']>;
  point?: Maybe<Scalars['String']['output']>;
  /** Reads a single `Property` that is related to this `Value`. */
  property?: Maybe<Property>;
  propertyId: Scalars['UUID']['output'];
  /** Reads a single `Space` that is related to this `Value`. */
  space?: Maybe<Space>;
  spaceId: Scalars['UUID']['output'];
  string?: Maybe<Scalars['String']['output']>;
  time?: Maybe<Scalars['String']['output']>;
  unit?: Maybe<Scalars['String']['output']>;
};

/** A condition to be used against `Value` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export type ValueCondition = {
  /** Checks for equality with the object’s `boolean` field. */
  boolean?: InputMaybe<Scalars['Boolean']['input']>;
  /** Checks for equality with the object’s `entityId` field. */
  entityId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `language` field. */
  language?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `number` field. */
  number?: InputMaybe<Scalars['BigFloat']['input']>;
  /** Checks for equality with the object’s `point` field. */
  point?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `propertyId` field. */
  propertyId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `string` field. */
  string?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `time` field. */
  time?: InputMaybe<Scalars['String']['input']>;
  /** Checks for equality with the object’s `unit` field. */
  unit?: InputMaybe<Scalars['String']['input']>;
};

/** A filter to be used against `Value` object types. All fields are combined with a logical ‘and.’ */
export type ValueFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<ValueFilter>>;
  /** Filter by the object’s `boolean` field. */
  boolean?: InputMaybe<BooleanFilter>;
  /** Filter by the object’s `entity` relation. */
  entity?: InputMaybe<EntityFilter>;
  /** Filter by the object’s `entityId` field. */
  entityId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<StringFilter>;
  /** Filter by the object’s `language` field. */
  language?: InputMaybe<StringFilter>;
  /** Negates the expression. */
  not?: InputMaybe<ValueFilter>;
  /** Filter by the object’s `number` field. */
  number?: InputMaybe<BigFloatFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<ValueFilter>>;
  /** Filter by the object’s `point` field. */
  point?: InputMaybe<StringFilter>;
  /** Filter by the object’s `property` relation. */
  property?: InputMaybe<PropertyFilter>;
  /** Filter by the object’s `propertyId` field. */
  propertyId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `space` relation. */
  space?: InputMaybe<SpaceFilter>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `string` field. */
  string?: InputMaybe<StringFilter>;
  /** Filter by the object’s `time` field. */
  time?: InputMaybe<StringFilter>;
  /** Filter by the object’s `unit` field. */
  unit?: InputMaybe<StringFilter>;
};

/** A connection to a list of `Value` values. */
export type ValuesConnection = {
  __typename?: 'ValuesConnection';
  /** A list of edges which contains the `Value` and cursor to aid in pagination. */
  edges: Array<ValuesEdge>;
  /** A list of `Value` objects. */
  nodes: Array<Value>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `Value` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `Value` edge in the connection. */
export type ValuesEdge = {
  __typename?: 'ValuesEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `Value` at the end of the edge. */
  node: Value;
};

/** Methods to use when ordering `Value`. */
export enum ValuesOrderBy {
  BooleanAsc = 'BOOLEAN_ASC',
  BooleanDesc = 'BOOLEAN_DESC',
  EntityIdAsc = 'ENTITY_ID_ASC',
  EntityIdDesc = 'ENTITY_ID_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  LanguageAsc = 'LANGUAGE_ASC',
  LanguageDesc = 'LANGUAGE_DESC',
  Natural = 'NATURAL',
  NumberAsc = 'NUMBER_ASC',
  NumberDesc = 'NUMBER_DESC',
  PointAsc = 'POINT_ASC',
  PointDesc = 'POINT_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  PropertyIdAsc = 'PROPERTY_ID_ASC',
  PropertyIdDesc = 'PROPERTY_ID_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC',
  StringAsc = 'STRING_ASC',
  StringDesc = 'STRING_DESC',
  TimeAsc = 'TIME_ASC',
  TimeDesc = 'TIME_DESC',
  UnitAsc = 'UNIT_ASC',
  UnitDesc = 'UNIT_DESC'
}

export enum VoteOption {
  Abstain = 'ABSTAIN',
  No = 'NO',
  Yes = 'YES'
}

/** A filter to be used against VoteOption fields. All fields are combined with a logical ‘and.’ */
export type VoteOptionFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<VoteOption>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<VoteOption>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<VoteOption>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<VoteOption>>;
  /** Equal to the specified value. */
  is?: InputMaybe<VoteOption>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<VoteOption>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<VoteOption>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<VoteOption>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<VoteOption>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<VoteOption>>;
};

export type VotesCount = Node & {
  __typename?: 'VotesCount';
  downvotes: Scalars['BigInt']['output'];
  id: Scalars['Int']['output'];
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars['ID']['output'];
  objectId: Scalars['UUID']['output'];
  objectType: Scalars['Int']['output'];
  spaceId: Scalars['UUID']['output'];
  upvotes: Scalars['BigInt']['output'];
};

/**
 * A condition to be used against `VotesCount` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export type VotesCountCondition = {
  /** Checks for equality with the object’s `downvotes` field. */
  downvotes?: InputMaybe<Scalars['BigInt']['input']>;
  /** Checks for equality with the object’s `id` field. */
  id?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `objectId` field. */
  objectId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `objectType` field. */
  objectType?: InputMaybe<Scalars['Int']['input']>;
  /** Checks for equality with the object’s `spaceId` field. */
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  /** Checks for equality with the object’s `upvotes` field. */
  upvotes?: InputMaybe<Scalars['BigInt']['input']>;
};

/** A filter to be used against `VotesCount` object types. All fields are combined with a logical ‘and.’ */
export type VotesCountFilter = {
  /** Checks for all expressions in this list. */
  and?: InputMaybe<Array<VotesCountFilter>>;
  /** Filter by the object’s `downvotes` field. */
  downvotes?: InputMaybe<BigIntFilter>;
  /** Filter by the object’s `id` field. */
  id?: InputMaybe<IntFilter>;
  /** Negates the expression. */
  not?: InputMaybe<VotesCountFilter>;
  /** Filter by the object’s `objectId` field. */
  objectId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `objectType` field. */
  objectType?: InputMaybe<IntFilter>;
  /** Checks for any expressions in this list. */
  or?: InputMaybe<Array<VotesCountFilter>>;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: InputMaybe<UuidFilter>;
  /** Filter by the object’s `upvotes` field. */
  upvotes?: InputMaybe<BigIntFilter>;
};

/** A connection to a list of `VotesCount` values. */
export type VotesCountsConnection = {
  __typename?: 'VotesCountsConnection';
  /** A list of edges which contains the `VotesCount` and cursor to aid in pagination. */
  edges: Array<VotesCountsEdge>;
  /** A list of `VotesCount` objects. */
  nodes: Array<VotesCount>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
  /** The count of *all* `VotesCount` you could get from the connection. */
  totalCount: Scalars['Int']['output'];
};

/** A `VotesCount` edge in the connection. */
export type VotesCountsEdge = {
  __typename?: 'VotesCountsEdge';
  /** A cursor for use in pagination. */
  cursor?: Maybe<Scalars['Cursor']['output']>;
  /** The `VotesCount` at the end of the edge. */
  node: VotesCount;
};

/** Methods to use when ordering `VotesCount`. */
export enum VotesCountsOrderBy {
  DownvotesAsc = 'DOWNVOTES_ASC',
  DownvotesDesc = 'DOWNVOTES_DESC',
  IdAsc = 'ID_ASC',
  IdDesc = 'ID_DESC',
  Natural = 'NATURAL',
  ObjectIdAsc = 'OBJECT_ID_ASC',
  ObjectIdDesc = 'OBJECT_ID_DESC',
  ObjectTypeAsc = 'OBJECT_TYPE_ASC',
  ObjectTypeDesc = 'OBJECT_TYPE_DESC',
  PrimaryKeyAsc = 'PRIMARY_KEY_ASC',
  PrimaryKeyDesc = 'PRIMARY_KEY_DESC',
  SpaceIdAsc = 'SPACE_ID_ASC',
  SpaceIdDesc = 'SPACE_ID_DESC',
  UpvotesAsc = 'UPVOTES_ASC',
  UpvotesDesc = 'UPVOTES_DESC'
}

export enum VotingMode {
  Fast = 'FAST',
  Slow = 'SLOW'
}

/** A filter to be used against VotingMode fields. All fields are combined with a logical ‘and.’ */
export type VotingModeFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: InputMaybe<VotingMode>;
  /** Greater than the specified value. */
  greaterThan?: InputMaybe<VotingMode>;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: InputMaybe<VotingMode>;
  /** Included in the specified list. */
  in?: InputMaybe<Array<VotingMode>>;
  /** Equal to the specified value. */
  is?: InputMaybe<VotingMode>;
  /** Not equal to the specified value. */
  isNot?: InputMaybe<VotingMode>;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  /** Less than the specified value. */
  lessThan?: InputMaybe<VotingMode>;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: InputMaybe<VotingMode>;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: InputMaybe<VotingMode>;
  /** Not included in the specified list. */
  notIn?: InputMaybe<Array<VotingMode>>;
};

export type FullEntityFragment = { __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, updatedAt: string, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', spaceId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null, language?: string | null, unit?: string | null, property?: (
      { __typename?: 'Property' }
      & { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }
    ) | null }>, relationsList: Array<{ __typename?: 'Relation', id: any, spaceId: any, position?: string | null, verified?: boolean | null, entityId: any, toSpaceId?: any | null, fromEntity?: { __typename?: 'Entity', id: any, name?: string | null } | null, toEntity?: { __typename?: 'Entity', id: any, name?: string | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', propertyId: any, string?: string | null }> } | null, type?: { __typename?: 'Property', id: any, name?: string | null, renderableType?: any | null } | null }> } & { ' $fragmentName'?: 'FullEntityFragment' };

export type AllEntitiesQueryVariables = Exact<{
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  filter?: InputMaybe<EntityFilter>;
  orderBy?: InputMaybe<Array<EntitiesOrderBy> | EntitiesOrderBy>;
}>;


export type AllEntitiesQuery = { __typename?: 'Query', entities?: Array<{ __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, updatedAt: string, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', spaceId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null, language?: string | null, unit?: string | null, property?: (
        { __typename?: 'Property' }
        & { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }
      ) | null }>, relationsList: Array<{ __typename?: 'Relation', id: any, spaceId: any, position?: string | null, verified?: boolean | null, entityId: any, toSpaceId?: any | null, fromEntity?: { __typename?: 'Entity', id: any, name?: string | null } | null, toEntity?: { __typename?: 'Entity', id: any, name?: string | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', propertyId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null }> } | null, type?: { __typename?: 'Property', id: any, name?: string | null, renderableType?: any | null } | null }> }> | null };

export type AllEntitiesWithCountQueryVariables = Exact<{
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  filter?: InputMaybe<EntityFilter>;
  orderBy?: InputMaybe<Array<EntitiesOrderBy> | EntitiesOrderBy>;
}>;


export type AllEntitiesWithCountQuery = { __typename?: 'Query', entitiesConnection?: { __typename?: 'EntitiesConnection', totalCount: number } | null, entities?: Array<{ __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, updatedAt: string, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', spaceId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null, language?: string | null, unit?: string | null, property?: (
        { __typename?: 'Property' }
        & { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }
      ) | null }>, relationsList: Array<{ __typename?: 'Relation', id: any, spaceId: any, position?: string | null, verified?: boolean | null, entityId: any, toSpaceId?: any | null, fromEntity?: { __typename?: 'Entity', id: any, name?: string | null } | null, toEntity?: { __typename?: 'Entity', id: any, name?: string | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', propertyId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null }> } | null, type?: { __typename?: 'Property', id: any, name?: string | null, renderableType?: any | null } | null }> }> | null };

export type EntitiesBatchQueryVariables = Exact<{
  filter?: InputMaybe<EntityFilter>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type EntitiesBatchQuery = { __typename?: 'Query', entities?: Array<{ __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', spaceId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null, language?: string | null, unit?: string | null, property?: (
        { __typename?: 'Property' }
        & { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }
      ) | null }>, relationsList: Array<{ __typename?: 'Relation', id: any, spaceId: any, position?: string | null, verified?: boolean | null, entityId: any, toSpaceId?: any | null, fromEntity?: { __typename?: 'Entity', id: any, name?: string | null } | null, toEntity?: { __typename?: 'Entity', id: any, name?: string | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', propertyId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null }> } | null, type?: { __typename?: 'Property', id: any, name?: string | null, renderableType?: any | null } | null }> }> | null };

export type EntityQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type EntityQuery = { __typename?: 'Query', entity?: { __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', spaceId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null, language?: string | null, unit?: string | null, property?: (
        { __typename?: 'Property' }
        & { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }
      ) | null }>, relationsList: Array<{ __typename?: 'Relation', id: any, spaceId: any, position?: string | null, verified?: boolean | null, entityId: any, toSpaceId?: any | null, fromEntity?: { __typename?: 'Entity', id: any, name?: string | null } | null, toEntity?: { __typename?: 'Entity', id: any, name?: string | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', propertyId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null }> } | null, type?: { __typename?: 'Property', id: any, name?: string | null, renderableType?: any | null } | null }> } | null };

export type FullRelationFragment = { __typename?: 'Relation', id: any, spaceId: any, position?: string | null, verified?: boolean | null, entityId: any, toSpaceId?: any | null, entity?: { __typename?: 'Entity', id: any, name?: string | null } | null, fromEntity?: { __typename?: 'Entity', id: any, name?: string | null } | null, toEntity?: { __typename?: 'Entity', id: any, name?: string | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', propertyId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null }> } | null, type?: { __typename?: 'Property', id: any, name?: string | null, renderableType?: any | null } | null } & { ' $fragmentName'?: 'FullRelationFragment' };

export type RelationEntityRelationsQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type RelationEntityRelationsQuery = { __typename?: 'Query', relations?: Array<(
    { __typename?: 'Relation' }
    & { ' $fragmentRefs'?: { 'FullRelationFragment': FullRelationFragment } }
  )> | null };

export type EntityPageQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type EntityPageQuery = { __typename?: 'Query', entity?: { __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', spaceId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null, language?: string | null, unit?: string | null, property?: (
        { __typename?: 'Property' }
        & { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }
      ) | null }>, relationsList: Array<{ __typename?: 'Relation', id: any, spaceId: any, position?: string | null, verified?: boolean | null, entityId: any, toSpaceId?: any | null, fromEntity?: { __typename?: 'Entity', id: any, name?: string | null } | null, toEntity?: { __typename?: 'Entity', id: any, name?: string | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', propertyId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null }> } | null, type?: { __typename?: 'Property', id: any, name?: string | null, renderableType?: any | null } | null }> } | null, relations?: Array<(
    { __typename?: 'Relation' }
    & { ' $fragmentRefs'?: { 'FullRelationFragment': FullRelationFragment } }
  )> | null };

export type EntityTypesQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type EntityTypesQuery = { __typename?: 'Query', entity?: { __typename?: 'Entity', types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null } | null };

export type EntityBacklinksPageQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type EntityBacklinksPageQuery = { __typename?: 'Query', entity?: { __typename?: 'Entity', backlinksList: Array<{ __typename?: 'Relation', fromEntity?: { __typename?: 'Entity', id: any, name?: string | null, spaceIds?: Array<any | null> | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null } | null }> } | null };

export type FullSpaceFragment = { __typename?: 'Space', id: any, type: SpaceTypes, daoAddress: string, spaceAddress: string, mainVotingAddress?: string | null, membershipAddress?: string | null, personalAddress?: string | null, membersList: Array<{ __typename?: 'Member', address: string }>, editorsList: Array<{ __typename?: 'Editor', address: string }>, page?: (
    { __typename?: 'Entity' }
    & { ' $fragmentRefs'?: { 'FullEntityFragment': FullEntityFragment } }
  ) | null } & { ' $fragmentName'?: 'FullSpaceFragment' };

export type SpaceQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
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


export type SpacesQuery = { __typename?: 'Query', spaces?: Array<(
    { __typename?: 'Space' }
    & { ' $fragmentRefs'?: { 'FullSpaceFragment': FullSpaceFragment } }
  )> | null };

export type SpacesWhereMemberQueryVariables = Exact<{
  address: Scalars['String']['input'];
}>;


export type SpacesWhereMemberQuery = { __typename?: 'Query', spaces?: Array<(
    { __typename?: 'Space' }
    & { ' $fragmentRefs'?: { 'FullSpaceFragment': FullSpaceFragment } }
  )> | null };

export type PropertyFragmentFragment = { __typename?: 'Property', id: any, name?: string | null, dataType: DataTypes, renderableType?: any | null, format?: string | null, unit?: any | null, relationValueTypes?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null } & { ' $fragmentName'?: 'PropertyFragmentFragment' };

export type PropertyQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
}>;


export type PropertyQuery = { __typename?: 'Query', property?: (
    { __typename?: 'Property' }
    & { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }
  ) | null };

export type PropertiesBatchQueryVariables = Exact<{
  ids: Array<Scalars['UUID']['input']> | Scalars['UUID']['input'];
}>;


export type PropertiesBatchQuery = { __typename?: 'Query', properties?: Array<(
    { __typename?: 'Property' }
    & { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }
  )> | null };

export type ResultQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
}>;


export type ResultQuery = { __typename?: 'Query', entity?: { __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null } | null };

export type ResultsQueryVariables = Exact<{
  query: Scalars['String']['input'];
  filter?: InputMaybe<EntityFilter>;
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type ResultsQuery = { __typename?: 'Query', search?: Array<{ __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null }> | null };

export type RelationEntityMinimalQueryVariables = Exact<{
  id: Scalars['UUID']['input'];
  spaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type RelationEntityMinimalQuery = { __typename?: 'Query', relation?: { __typename?: 'Relation', id: any, entity?: { __typename?: 'Entity', id: any, name?: string | null, description?: string | null, spaceIds?: Array<any | null> | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', spaceId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null, language?: string | null, unit?: string | null, property?: { __typename?: 'Property', id: any, name?: string | null, dataType: DataTypes, renderableType?: any | null, relationValueTypes?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null } | null }>, relationsList: Array<{ __typename?: 'Relation', verified?: boolean | null, toSpaceId?: any | null, position?: string | null, spaceId: any, id: any, entityId: any, fromEntity?: { __typename?: 'Entity', id: any, name?: string | null } | null, toEntity?: { __typename?: 'Entity', id: any, name?: string | null, types?: Array<{ __typename?: 'Entity', id: any, name?: string | null }> | null, valuesList: Array<{ __typename?: 'Value', propertyId: any, string?: string | null, number?: any | null, point?: string | null, boolean?: boolean | null, time?: string | null }> } | null, type?: { __typename?: 'Property', id: any, name?: string | null, description?: string | null, renderableType?: any | null } | null }> } | null } | null };

export const FullRelationFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]} as unknown as DocumentNode<FullRelationFragment, unknown>;
export const PropertyFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<PropertyFragmentFragment, unknown>;
export const FullEntityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<FullEntityFragment, unknown>;
export const FullSpaceFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"daoAddress"}},{"kind":"Field","name":{"kind":"Name","value":"spaceAddress"}},{"kind":"Field","name":{"kind":"Name","value":"mainVotingAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membershipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"personalAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]} as unknown as DocumentNode<FullSpaceFragment, unknown>;
export const AllEntitiesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllEntities"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"EntitiesOrderBy"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AllEntitiesQuery, AllEntitiesQueryVariables>;
export const AllEntitiesWithCountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllEntitiesWithCount"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"EntitiesOrderBy"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entitiesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AllEntitiesWithCountQuery, AllEntitiesWithCountQueryVariables>;
export const EntitiesBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntitiesBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntitiesBatchQuery, EntitiesBatchQueryVariables>;
export const EntityDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Entity"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntityQuery, EntityQueryVariables>;
export const RelationEntityRelationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RelationEntityRelations"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"entityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullRelation"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]} as unknown as DocumentNode<RelationEntityRelationsQuery, RelationEntityRelationsQueryVariables>;
export const EntityPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"entityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullRelation"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]} as unknown as DocumentNode<EntityPageQuery, EntityPageQueryVariables>;
export const EntityTypesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityTypes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"types"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceIds"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"ListValue","values":[{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}]}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<EntityTypesQuery, EntityTypesQueryVariables>;
export const EntityBacklinksPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityBacklinksPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"backlinksList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<EntityBacklinksPageQuery, EntityBacklinksPageQueryVariables>;
export const SpaceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Space"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"space"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullSpace"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"daoAddress"}},{"kind":"Field","name":{"kind":"Name","value":"spaceAddress"}},{"kind":"Field","name":{"kind":"Name","value":"mainVotingAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membershipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"personalAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}}]} as unknown as DocumentNode<SpaceQuery, SpaceQueryVariables>;
export const SpacesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Spaces"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"SpaceFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaces"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullSpace"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"daoAddress"}},{"kind":"Field","name":{"kind":"Name","value":"spaceAddress"}},{"kind":"Field","name":{"kind":"Name","value":"mainVotingAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membershipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"personalAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}}]} as unknown as DocumentNode<SpacesQuery, SpacesQueryVariables>;
export const SpacesWhereMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SpacesWhereMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"address"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaces"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"members"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"some"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"address"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"address"}}}]}}]}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullSpace"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"daoAddress"}},{"kind":"Field","name":{"kind":"Name","value":"spaceAddress"}},{"kind":"Field","name":{"kind":"Name","value":"mainVotingAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membershipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"personalAddress"}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}}]} as unknown as DocumentNode<SpacesWhereMemberQuery, SpacesWhereMemberQueryVariables>;
export const PropertyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Property"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"property"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<PropertyQuery, PropertyQueryVariables>;
export const PropertiesBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PropertiesBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"ids"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"properties"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"ids"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Property"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<PropertiesBatchQuery, PropertiesBatchQueryVariables>;
export const ResultDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Result"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<ResultQuery, ResultQueryVariables>;
export const ResultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Results"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"query"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"search"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"query"},"value":{"kind":"Variable","name":{"kind":"Name","value":"query"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<ResultsQuery, ResultsQueryVariables>;
export const RelationEntityMinimalDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RelationEntityMinimal"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataType"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}},{"kind":"Field","name":{"kind":"Name","value":"relationValueTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"string"}},{"kind":"Field","name":{"kind":"Name","value":"number"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"renderableType"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<RelationEntityMinimalQuery, RelationEntityMinimalQueryVariables>;