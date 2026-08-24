/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
/** A filter to be used against BigFloat fields. All fields are combined with a logical ‘and.’ */
export type BigFloatFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: any;
  /** Greater than the specified value. */
  greaterThan?: any;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: any;
  /** Included in the specified list. */
  in?: Array<any> | null | undefined;
  /** Equal to the specified value. */
  is?: any;
  /** Not equal to the specified value. */
  isNot?: any;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: any;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: any;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: any;
  /** Not included in the specified list. */
  notIn?: Array<any> | null | undefined;
};

/** A filter to be used against BigInt fields. All fields are combined with a logical ‘and.’ */
export type BigIntFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: any;
  /** Greater than the specified value. */
  greaterThan?: any;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: any;
  /** Included in the specified list. */
  in?: Array<any> | null | undefined;
  /** Equal to the specified value. */
  is?: any;
  /** Not equal to the specified value. */
  isNot?: any;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: any;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: any;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: any;
  /** Not included in the specified list. */
  notIn?: Array<any> | null | undefined;
};

/** A filter to be used against Boolean fields. All fields are combined with a logical ‘and.’ */
export type BooleanFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: boolean | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: boolean | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: boolean | null | undefined;
  /** Included in the specified list. */
  in?: Array<boolean> | null | undefined;
  /** Equal to the specified value. */
  is?: boolean | null | undefined;
  /** Not equal to the specified value. */
  isNot?: boolean | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: boolean | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: boolean | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: boolean | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<boolean> | null | undefined;
};

/** A filter to be used against Datetime fields. All fields are combined with a logical ‘and.’ */
export type DatetimeFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: any;
  /** Greater than the specified value. */
  greaterThan?: any;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: any;
  /** Included in the specified list. */
  in?: Array<any> | null | undefined;
  /** Equal to the specified value. */
  is?: any;
  /** Not equal to the specified value. */
  isNot?: any;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: any;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: any;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: any;
  /** Not included in the specified list. */
  notIn?: Array<any> | null | undefined;
};

/** A filter to be used against `Editor` object types. All fields are combined with a logical ‘and.’ */
export type EditorFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<EditorFilter> | null | undefined;
  /** Filter by the object’s `memberSpaceId` field. */
  memberSpaceId?: UuidFilter | null | undefined;
  /** Negates the expression. */
  not?: EditorFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<EditorFilter> | null | undefined;
  /** Filter by the object’s `space` relation. */
  space?: SpaceFilter | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
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
  QualityScoreAsc = 'QUALITY_SCORE_ASC',
  QualityScoreDesc = 'QUALITY_SCORE_DESC',
  RankingScoreAsc = 'RANKING_SCORE_ASC',
  RankingScoreDesc = 'RANKING_SCORE_DESC',
  UpdatedAtAsc = 'UPDATED_AT_ASC',
  UpdatedAtBlockAsc = 'UPDATED_AT_BLOCK_ASC',
  UpdatedAtBlockDesc = 'UPDATED_AT_BLOCK_DESC',
  UpdatedAtDesc = 'UPDATED_AT_DESC'
}

/** A filter to be used against `Entity` object types. All fields are combined with a logical ‘and.’ */
export type EntityFilter = {
  /** Filter by the object’s `agrees` field. */
  agrees?: BigIntFilter | null | undefined;
  /** Checks for all expressions in this list. */
  and?: Array<EntityFilter> | null | undefined;
  /** Filter by the object’s `backlinks` relation. */
  backlinks?: EntityToManyRelationFilter | null | undefined;
  /** Some related `backlinks` exist. */
  backlinksExist?: boolean | null | undefined;
  /** Filter by the object’s `createdAt` field. */
  createdAt?: StringFilter | null | undefined;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: StringFilter | null | undefined;
  /** Filter by the object’s `description` field. */
  description?: StringFilter | null | undefined;
  /** Filter by the object’s `disagrees` field. */
  disagrees?: BigIntFilter | null | undefined;
  /** Filter by the object’s `downvotes` field. */
  downvotes?: BigIntFilter | null | undefined;
  /** Filter by the object’s `id` field. */
  id?: UuidFilter | null | undefined;
  /** Filter by the object’s `intrinsicScore` field. */
  intrinsicScore?: BigFloatFilter | null | undefined;
  /** Filter by the object’s `name` field. */
  name?: StringFilter | null | undefined;
  /** Negates the expression. */
  not?: EntityFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<EntityFilter> | null | undefined;
  /** Filter by the object’s `participationScore` field. */
  participationScore?: BigFloatFilter | null | undefined;
  /** Filter by the object’s `qualityScore` field. */
  qualityScore?: BigFloatFilter | null | undefined;
  /** Filter by the object’s `rankingScore` field. */
  rankingScore?: BigFloatFilter | null | undefined;
  /** Filter by the object’s `relations` relation. */
  relations?: EntityToManyRelationFilter | null | undefined;
  /** Filter by the object’s `relationsByTypeIdConnection` relation. */
  relationsByTypeIdConnection?: EntityToManyRelationFilter | null | undefined;
  /** Some related `relationsByTypeIdConnection` exist. */
  relationsByTypeIdConnectionExist?: boolean | null | undefined;
  /** Some related `relations` exist. */
  relationsExist?: boolean | null | undefined;
  /** Filter by the object’s `relationsWhereEntity` relation. */
  relationsWhereEntity?: EntityToManyRelationFilter | null | undefined;
  /** Some related `relationsWhereEntity` exist. */
  relationsWhereEntityExist?: boolean | null | undefined;
  /** Filter by the object’s `spaceIds` field. */
  spaceIds?: UuidListFilter | null | undefined;
  /** Filter by the object’s `spacesByTopicIdConnection` relation. */
  spacesByTopicIdConnection?: EntityToManySpaceFilter | null | undefined;
  /** Some related `spacesByTopicIdConnection` exist. */
  spacesByTopicIdConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `subspaceTopicsByTopicIdConnection` relation. */
  subspaceTopicsByTopicIdConnection?: EntityToManySubspaceTopicFilter | null | undefined;
  /** Some related `subspaceTopicsByTopicIdConnection` exist. */
  subspaceTopicsByTopicIdConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `systemTypeIds` field. */
  systemTypeIds?: UuidListFilter | null | undefined;
  /** Filter by the object’s `typeIds` field. */
  typeIds?: UuidListFilter | null | undefined;
  /** Filter by the object’s `updatedAt` field. */
  updatedAt?: StringFilter | null | undefined;
  /** Filter by the object’s `updatedAtBlock` field. */
  updatedAtBlock?: StringFilter | null | undefined;
  /** Filter by the object’s `upvotes` field. */
  upvotes?: BigIntFilter | null | undefined;
  /** Filter by the object’s `values` relation. */
  values?: EntityToManyValueFilter | null | undefined;
  /** Filter by the object’s `valuesByPropertyIdConnection` relation. */
  valuesByPropertyIdConnection?: EntityToManyValueFilter | null | undefined;
  /** Some related `valuesByPropertyIdConnection` exist. */
  valuesByPropertyIdConnectionExist?: boolean | null | undefined;
  /** Some related `values` exist. */
  valuesExist?: boolean | null | undefined;
};

/** A filter to be used against many `Relation` object types. All fields are combined with a logical ‘and.’ */
export type EntityToManyRelationFilter = {
  /** Every related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: RelationFilter | null | undefined;
  /** No related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: RelationFilter | null | undefined;
  /** Some related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: RelationFilter | null | undefined;
};

/** A filter to be used against many `Space` object types. All fields are combined with a logical ‘and.’ */
export type EntityToManySpaceFilter = {
  /** Every related `Space` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: SpaceFilter | null | undefined;
  /** No related `Space` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: SpaceFilter | null | undefined;
  /** Some related `Space` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: SpaceFilter | null | undefined;
};

/** A filter to be used against many `SubspaceTopic` object types. All fields are combined with a logical ‘and.’ */
export type EntityToManySubspaceTopicFilter = {
  /** Every related `SubspaceTopic` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: SubspaceTopicFilter | null | undefined;
  /** No related `SubspaceTopic` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: SubspaceTopicFilter | null | undefined;
  /** Some related `SubspaceTopic` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: SubspaceTopicFilter | null | undefined;
};

/** A filter to be used against many `Value` object types. All fields are combined with a logical ‘and.’ */
export type EntityToManyValueFilter = {
  /** Every related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ValueFilter | null | undefined;
  /** No related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ValueFilter | null | undefined;
  /** Some related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ValueFilter | null | undefined;
};

/** A filter to be used against Float fields. All fields are combined with a logical ‘and.’ */
export type FloatFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: number | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: number | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: number | null | undefined;
  /** Included in the specified list. */
  in?: Array<number> | null | undefined;
  /** Equal to the specified value. */
  is?: number | null | undefined;
  /** Not equal to the specified value. */
  isNot?: number | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: number | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: number | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: number | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<number> | null | undefined;
};

/** A filter to be used against Int fields. All fields are combined with a logical ‘and.’ */
export type IntFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: number | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: number | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: number | null | undefined;
  /** Included in the specified list. */
  in?: Array<number> | null | undefined;
  /** Equal to the specified value. */
  is?: number | null | undefined;
  /** Not equal to the specified value. */
  isNot?: number | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: number | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: number | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: number | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<number> | null | undefined;
};

/** A filter to be used against JSON fields. All fields are combined with a logical ‘and.’ */
export type JsonFilter = {
  /** Contained by the specified JSON. */
  containedBy?: any;
  /** Contains all of the specified keys. */
  containsAllKeys?: Array<string> | null | undefined;
  /** Contains any of the specified keys. */
  containsAnyKeys?: Array<string> | null | undefined;
  /** Contains the specified key. */
  containsKey?: string | null | undefined;
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: any;
  /** Greater than the specified value. */
  greaterThan?: any;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: any;
  /** Contains the specified JSON. */
  in?: any;
  /** Equal to the specified value. */
  is?: any;
  /** Not equal to the specified value. */
  isNot?: any;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: any;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: any;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: any;
  /** Not included in the specified list. */
  notIn?: Array<any> | null | undefined;
};

/** A filter to be used against `Member` object types. All fields are combined with a logical ‘and.’ */
export type MemberFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<MemberFilter> | null | undefined;
  /** Filter by the object’s `memberSpaceId` field. */
  memberSpaceId?: UuidFilter | null | undefined;
  /** Negates the expression. */
  not?: MemberFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<MemberFilter> | null | undefined;
  /** Filter by the object’s `space` relation. */
  space?: SpaceFilter | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
};

/** A filter to be used against `ProposalAction` object types. All fields are combined with a logical ‘and.’ */
export type ProposalActionFilter = {
  /** Filter by the object’s `actionType` field. */
  actionType?: ProposalActionTypeFilter | null | undefined;
  /** Checks for all expressions in this list. */
  and?: Array<ProposalActionFilter> | null | undefined;
  /** Filter by the object’s `contentUri` field. */
  contentUri?: StringFilter | null | undefined;
  /** Filter by the object’s `disableFastPathAccessForNewMembers` field. */
  disableFastPathAccessForNewMembers?: BooleanFilter | null | undefined;
  /** Filter by the object’s `duration` field. */
  duration?: BigIntFilter | null | undefined;
  /** Filter by the object’s `executionGracePeriod` field. */
  executionGracePeriod?: BigIntFilter | null | undefined;
  /** Filter by the object’s `fastThreshold` field. */
  fastThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `flatSupportThreshold` field. */
  flatSupportThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `index` field. */
  index?: IntFilter | null | undefined;
  /** Negates the expression. */
  not?: ProposalActionFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<ProposalActionFilter> | null | undefined;
  /** Filter by the object’s `partialPercentageSupportThreshold` field. */
  partialPercentageSupportThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `proposalId` field. */
  proposalId?: UuidFilter | null | undefined;
  /** Filter by the object’s `proposalVersion` field. */
  proposalVersion?: IntFilter | null | undefined;
  /** Filter by the object’s `proposalVersionByProposalIdAndProposalVersion` relation. */
  proposalVersionByProposalIdAndProposalVersion?: ProposalVersionFilter | null | undefined;
  /** Filter by the object’s `quorum` field. */
  quorum?: BigIntFilter | null | undefined;
  /** Filter by the object’s `slowThreshold` field. */
  slowThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `targetId` field. */
  targetId?: UuidFilter | null | undefined;
  /** Filter by the object’s `universalPercentageSupportThreshold` field. */
  universalPercentageSupportThreshold?: BigIntFilter | null | undefined;
};

export enum ProposalActionType {
  AddEditor = 'ADD_EDITOR',
  AddMember = 'ADD_MEMBER',
  Flag = 'FLAG',
  Publish = 'PUBLISH',
  RemoveEditor = 'REMOVE_EDITOR',
  RemoveMember = 'REMOVE_MEMBER',
  SetTopic = 'SET_TOPIC',
  SubspaceRelated = 'SUBSPACE_RELATED',
  SubspaceTopicDeclared = 'SUBSPACE_TOPIC_DECLARED',
  SubspaceTopicRemoved = 'SUBSPACE_TOPIC_REMOVED',
  SubspaceUnrelated = 'SUBSPACE_UNRELATED',
  SubspaceUnverified = 'SUBSPACE_UNVERIFIED',
  SubspaceVerified = 'SUBSPACE_VERIFIED',
  Unflag = 'UNFLAG',
  UnflagEditor = 'UNFLAG_EDITOR',
  Unknown = 'UNKNOWN',
  UnsetTopic = 'UNSET_TOPIC',
  UpdateVotingSettings = 'UPDATE_VOTING_SETTINGS'
}

/** A filter to be used against ProposalActionType fields. All fields are combined with a logical ‘and.’ */
export type ProposalActionTypeFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: ProposalActionType | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: ProposalActionType | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: ProposalActionType | null | undefined;
  /** Included in the specified list. */
  in?: Array<ProposalActionType> | null | undefined;
  /** Equal to the specified value. */
  is?: ProposalActionType | null | undefined;
  /** Not equal to the specified value. */
  isNot?: ProposalActionType | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: ProposalActionType | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: ProposalActionType | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: ProposalActionType | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<ProposalActionType> | null | undefined;
};

/** A filter to be used against `Proposal` object types. All fields are combined with a logical ‘and.’ */
export type ProposalFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<ProposalFilter> | null | undefined;
  /** Filter by the object’s `createdAt` field. */
  createdAt?: StringFilter | null | undefined;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: StringFilter | null | undefined;
  /** Filter by the object’s `currentVersion` field. */
  currentVersion?: IntFilter | null | undefined;
  /** Filter by the object’s `executedAt` field. */
  executedAt?: BigIntFilter | null | undefined;
  /** Filter by the object’s `id` field. */
  id?: UuidFilter | null | undefined;
  /** Negates the expression. */
  not?: ProposalFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<ProposalFilter> | null | undefined;
  /** Filter by the object’s `proposalTallyQueue` relation. */
  proposalTallyQueue?: ProposalTallyQueueFilter | null | undefined;
  /** A related `proposalTallyQueue` exists. */
  proposalTallyQueueExists?: boolean | null | undefined;
  /** Filter by the object’s `proposalVersionsConnection` relation. */
  proposalVersionsConnection?: ProposalToManyProposalVersionFilter | null | undefined;
  /** Some related `proposalVersionsConnection` exist. */
  proposalVersionsConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `proposedBy` field. */
  proposedBy?: UuidFilter | null | undefined;
  /** Filter by the object’s `space` relation. */
  space?: SpaceFilter | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `unexecutableAt` field. */
  unexecutableAt?: BigIntFilter | null | undefined;
};

/** A filter to be used against `ProposalTallyQueue` object types. All fields are combined with a logical ‘and.’ */
export type ProposalTallyQueueFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<ProposalTallyQueueFilter> | null | undefined;
  /** Negates the expression. */
  not?: ProposalTallyQueueFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<ProposalTallyQueueFilter> | null | undefined;
  /** Filter by the object’s `proposal` relation. */
  proposal?: ProposalFilter | null | undefined;
  /** Filter by the object’s `proposalId` field. */
  proposalId?: UuidFilter | null | undefined;
  /** Filter by the object’s `queuedAt` field. */
  queuedAt?: DatetimeFilter | null | undefined;
};

/** A filter to be used against many `ProposalVersion` object types. All fields are combined with a logical ‘and.’ */
export type ProposalToManyProposalVersionFilter = {
  /** Every related `ProposalVersion` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ProposalVersionFilter | null | undefined;
  /** No related `ProposalVersion` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ProposalVersionFilter | null | undefined;
  /** Some related `ProposalVersion` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ProposalVersionFilter | null | undefined;
};

/** A filter to be used against `ProposalVersion` object types. All fields are combined with a logical ‘and.’ */
export type ProposalVersionFilter = {
  /** Filter by the object’s `abstainCount` field. */
  abstainCount?: BigIntFilter | null | undefined;
  /** Checks for all expressions in this list. */
  and?: Array<ProposalVersionFilter> | null | undefined;
  /** Filter by the object’s `endTime` field. */
  endTime?: BigIntFilter | null | undefined;
  /** Filter by the object’s `executeBy` field. */
  executeBy?: BigIntFilter | null | undefined;
  /** Filter by the object’s `flatSupportThreshold` field. */
  flatSupportThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `name` field. */
  name?: StringFilter | null | undefined;
  /** Filter by the object’s `noCount` field. */
  noCount?: BigIntFilter | null | undefined;
  /** Negates the expression. */
  not?: ProposalVersionFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<ProposalVersionFilter> | null | undefined;
  /** Filter by the object’s `partialPercentageSupportThreshold` field. */
  partialPercentageSupportThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `proposal` relation. */
  proposal?: ProposalFilter | null | undefined;
  /** Filter by the object’s `proposalActionsByProposalIdAndProposalVersionConnection` relation. */
  proposalActionsByProposalIdAndProposalVersionConnection?: ProposalVersionToManyProposalActionFilter | null | undefined;
  /** Some related `proposalActionsByProposalIdAndProposalVersionConnection` exist. */
  proposalActionsByProposalIdAndProposalVersionConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `proposalId` field. */
  proposalId?: UuidFilter | null | undefined;
  /** Filter by the object’s `proposalVersion` field. */
  proposalVersion?: IntFilter | null | undefined;
  /** Filter by the object’s `proposalVotesByProposalIdAndProposalVersionConnection` relation. */
  proposalVotesByProposalIdAndProposalVersionConnection?: ProposalVersionToManyProposalVoteFilter | null | undefined;
  /** Some related `proposalVotesByProposalIdAndProposalVersionConnection` exist. */
  proposalVotesByProposalIdAndProposalVersionConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `quorum` field. */
  quorum?: BigIntFilter | null | undefined;
  /** Filter by the object’s `startTime` field. */
  startTime?: BigIntFilter | null | undefined;
  /** Filter by the object’s `threshold` field. */
  threshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `universalPercentageSupportThreshold` field. */
  universalPercentageSupportThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `versionCreatedAt` field. */
  versionCreatedAt?: StringFilter | null | undefined;
  /** Filter by the object’s `versionCreatedAtBlock` field. */
  versionCreatedAtBlock?: StringFilter | null | undefined;
  /** Filter by the object’s `votingMode` field. */
  votingMode?: VotingModeFilter | null | undefined;
  /** Filter by the object’s `yesCount` field. */
  yesCount?: BigIntFilter | null | undefined;
};

/** A filter to be used against many `ProposalAction` object types. All fields are combined with a logical ‘and.’ */
export type ProposalVersionToManyProposalActionFilter = {
  /** Every related `ProposalAction` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ProposalActionFilter | null | undefined;
  /** No related `ProposalAction` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ProposalActionFilter | null | undefined;
  /** Some related `ProposalAction` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ProposalActionFilter | null | undefined;
};

/** A filter to be used against many `ProposalVote` object types. All fields are combined with a logical ‘and.’ */
export type ProposalVersionToManyProposalVoteFilter = {
  /** Every related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ProposalVoteFilter | null | undefined;
  /** No related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ProposalVoteFilter | null | undefined;
  /** Some related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ProposalVoteFilter | null | undefined;
};

/** A filter to be used against `ProposalVote` object types. All fields are combined with a logical ‘and.’ */
export type ProposalVoteFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<ProposalVoteFilter> | null | undefined;
  /** Filter by the object’s `createdAt` field. */
  createdAt?: StringFilter | null | undefined;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: StringFilter | null | undefined;
  /** Negates the expression. */
  not?: ProposalVoteFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<ProposalVoteFilter> | null | undefined;
  /** Filter by the object’s `proposalId` field. */
  proposalId?: UuidFilter | null | undefined;
  /** Filter by the object’s `proposalVersion` field. */
  proposalVersion?: IntFilter | null | undefined;
  /** Filter by the object’s `proposalVersionByProposalIdAndProposalVersion` relation. */
  proposalVersionByProposalIdAndProposalVersion?: ProposalVersionFilter | null | undefined;
  /** Filter by the object’s `space` relation. */
  space?: SpaceFilter | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `vote` field. */
  vote?: VoteOptionFilter | null | undefined;
  /** Filter by the object’s `voterId` field. */
  voterId?: UuidFilter | null | undefined;
};

/** A filter to be used against `Relation` object types. All fields are combined with a logical ‘and.’ */
export type RelationFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<RelationFilter> | null | undefined;
  /** Filter by the object’s `entity` relation. */
  entity?: EntityFilter | null | undefined;
  /** Filter by the object’s `entityId` field. */
  entityId?: UuidFilter | null | undefined;
  /** Filter by the object’s `fromEntity` relation. */
  fromEntity?: EntityFilter | null | undefined;
  /** Filter by the object’s `fromEntityId` field. */
  fromEntityId?: UuidFilter | null | undefined;
  /** Filter by the object’s `fromSpace` relation. */
  fromSpace?: SpaceFilter | null | undefined;
  /** A related `fromSpace` exists. */
  fromSpaceExists?: boolean | null | undefined;
  /** Filter by the object’s `fromSpaceId` field. */
  fromSpaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `fromVersionId` field. */
  fromVersionId?: UuidFilter | null | undefined;
  /** Filter by the object’s `id` field. */
  id?: UuidFilter | null | undefined;
  /** Filter by the object’s `isSystem` field. */
  isSystem?: BooleanFilter | null | undefined;
  /** Negates the expression. */
  not?: RelationFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<RelationFilter> | null | undefined;
  /** Filter by the object’s `position` field. */
  position?: StringFilter | null | undefined;
  /** Filter by the object’s `space` relation. */
  space?: SpaceFilter | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `toEntity` relation. */
  toEntity?: EntityFilter | null | undefined;
  /** Filter by the object’s `toEntityId` field. */
  toEntityId?: UuidFilter | null | undefined;
  /** Filter by the object’s `toSpace` relation. */
  toSpace?: SpaceFilter | null | undefined;
  /** A related `toSpace` exists. */
  toSpaceExists?: boolean | null | undefined;
  /** Filter by the object’s `toSpaceId` field. */
  toSpaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `toVersionId` field. */
  toVersionId?: UuidFilter | null | undefined;
  /** Filter by the object’s `typeEntity` relation. */
  typeEntity?: EntityFilter | null | undefined;
  /** Filter by the object’s `typeId` field. */
  typeId?: UuidFilter | null | undefined;
  /** Filter by the object’s `verified` field. */
  verified?: BooleanFilter | null | undefined;
};

/** A filter to be used against `Space` object types. All fields are combined with a logical ‘and.’ */
export type SpaceFilter = {
  /** Filter by the object’s `address` field. */
  address?: StringFilter | null | undefined;
  /** Checks for all expressions in this list. */
  and?: Array<SpaceFilter> | null | undefined;
  /** Filter by the object’s `editors` relation. */
  editors?: SpaceToManyEditorFilter | null | undefined;
  /** Some related `editors` exist. */
  editorsExist?: boolean | null | undefined;
  /** Filter by the object’s `id` field. */
  id?: UuidFilter | null | undefined;
  /** Filter by the object’s `members` relation. */
  members?: SpaceToManyMemberFilter | null | undefined;
  /** Some related `members` exist. */
  membersExist?: boolean | null | undefined;
  /** Negates the expression. */
  not?: SpaceFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<SpaceFilter> | null | undefined;
  /** Filter by the object’s `proposalVotesConnection` relation. */
  proposalVotesConnection?: SpaceToManyProposalVoteFilter | null | undefined;
  /** Some related `proposalVotesConnection` exist. */
  proposalVotesConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `proposalsConnection` relation. */
  proposalsConnection?: SpaceToManyProposalFilter | null | undefined;
  /** Some related `proposalsConnection` exist. */
  proposalsConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `relationsByFromSpaceIdConnection` relation. */
  relationsByFromSpaceIdConnection?: SpaceToManyRelationFilter | null | undefined;
  /** Some related `relationsByFromSpaceIdConnection` exist. */
  relationsByFromSpaceIdConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `relationsByToSpaceIdConnection` relation. */
  relationsByToSpaceIdConnection?: SpaceToManyRelationFilter | null | undefined;
  /** Some related `relationsByToSpaceIdConnection` exist. */
  relationsByToSpaceIdConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `relationsConnection` relation. */
  relationsConnection?: SpaceToManyRelationFilter | null | undefined;
  /** Some related `relationsConnection` exist. */
  relationsConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `spaceVotingSetting` relation. */
  spaceVotingSetting?: SpaceVotingSettingFilter | null | undefined;
  /** A related `spaceVotingSetting` exists. */
  spaceVotingSettingExists?: boolean | null | undefined;
  /** Filter by the object’s `subspaceTopicsConnection` relation. */
  subspaceTopicsConnection?: SpaceToManySubspaceTopicFilter | null | undefined;
  /** Some related `subspaceTopicsConnection` exist. */
  subspaceTopicsConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `subspacesByChildSpaceIdConnection` relation. */
  subspacesByChildSpaceIdConnection?: SpaceToManySubspaceFilter | null | undefined;
  /** Some related `subspacesByChildSpaceIdConnection` exist. */
  subspacesByChildSpaceIdConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `subspacesByParentSpaceIdConnection` relation. */
  subspacesByParentSpaceIdConnection?: SpaceToManySubspaceFilter | null | undefined;
  /** Some related `subspacesByParentSpaceIdConnection` exist. */
  subspacesByParentSpaceIdConnectionExist?: boolean | null | undefined;
  /** Filter by the object’s `topic` relation. */
  topic?: EntityFilter | null | undefined;
  /** A related `topic` exists. */
  topicExists?: boolean | null | undefined;
  /** Filter by the object’s `topicId` field. */
  topicId?: UuidFilter | null | undefined;
  /** Filter by the object’s `type` field. */
  type?: SpaceTypesFilter | null | undefined;
  /** Filter by the object’s `valuesConnection` relation. */
  valuesConnection?: SpaceToManyValueFilter | null | undefined;
  /** Some related `valuesConnection` exist. */
  valuesConnectionExist?: boolean | null | undefined;
};

/** A filter to be used against many `Editor` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyEditorFilter = {
  /** Every related `Editor` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: EditorFilter | null | undefined;
  /** No related `Editor` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: EditorFilter | null | undefined;
  /** Some related `Editor` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: EditorFilter | null | undefined;
};

/** A filter to be used against many `Member` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyMemberFilter = {
  /** Every related `Member` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: MemberFilter | null | undefined;
  /** No related `Member` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: MemberFilter | null | undefined;
  /** Some related `Member` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: MemberFilter | null | undefined;
};

/** A filter to be used against many `Proposal` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyProposalFilter = {
  /** Every related `Proposal` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ProposalFilter | null | undefined;
  /** No related `Proposal` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ProposalFilter | null | undefined;
  /** Some related `Proposal` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ProposalFilter | null | undefined;
};

/** A filter to be used against many `ProposalVote` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyProposalVoteFilter = {
  /** Every related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ProposalVoteFilter | null | undefined;
  /** No related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ProposalVoteFilter | null | undefined;
  /** Some related `ProposalVote` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ProposalVoteFilter | null | undefined;
};

/** A filter to be used against many `Relation` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyRelationFilter = {
  /** Every related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: RelationFilter | null | undefined;
  /** No related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: RelationFilter | null | undefined;
  /** Some related `Relation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: RelationFilter | null | undefined;
};

/** A filter to be used against many `Subspace` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManySubspaceFilter = {
  /** Every related `Subspace` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: SubspaceFilter | null | undefined;
  /** No related `Subspace` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: SubspaceFilter | null | undefined;
  /** Some related `Subspace` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: SubspaceFilter | null | undefined;
};

/** A filter to be used against many `SubspaceTopic` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManySubspaceTopicFilter = {
  /** Every related `SubspaceTopic` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: SubspaceTopicFilter | null | undefined;
  /** No related `SubspaceTopic` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: SubspaceTopicFilter | null | undefined;
  /** Some related `SubspaceTopic` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: SubspaceTopicFilter | null | undefined;
};

/** A filter to be used against many `Value` object types. All fields are combined with a logical ‘and.’ */
export type SpaceToManyValueFilter = {
  /** Every related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ValueFilter | null | undefined;
  /** No related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ValueFilter | null | undefined;
  /** Some related `Value` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ValueFilter | null | undefined;
};

export enum SpaceTypes {
  Dao = 'DAO',
  Personal = 'PERSONAL'
}

/** A filter to be used against SpaceTypes fields. All fields are combined with a logical ‘and.’ */
export type SpaceTypesFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: SpaceTypes | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: SpaceTypes | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: SpaceTypes | null | undefined;
  /** Included in the specified list. */
  in?: Array<SpaceTypes> | null | undefined;
  /** Equal to the specified value. */
  is?: SpaceTypes | null | undefined;
  /** Not equal to the specified value. */
  isNot?: SpaceTypes | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: SpaceTypes | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: SpaceTypes | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: SpaceTypes | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<SpaceTypes> | null | undefined;
};

/** A filter to be used against `SpaceVotingSetting` object types. All fields are combined with a logical ‘and.’ */
export type SpaceVotingSettingFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<SpaceVotingSettingFilter> | null | undefined;
  /** Filter by the object’s `disableFastPathAccessForNewMembers` field. */
  disableFastPathAccessForNewMembers?: BooleanFilter | null | undefined;
  /** Filter by the object’s `duration` field. */
  duration?: BigIntFilter | null | undefined;
  /** Filter by the object’s `executionGracePeriod` field. */
  executionGracePeriod?: BigIntFilter | null | undefined;
  /** Filter by the object’s `flatSupportThreshold` field. */
  flatSupportThreshold?: BigIntFilter | null | undefined;
  /** Negates the expression. */
  not?: SpaceVotingSettingFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<SpaceVotingSettingFilter> | null | undefined;
  /** Filter by the object’s `partialPercentageSupportThreshold` field. */
  partialPercentageSupportThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `quorum` field. */
  quorum?: BigIntFilter | null | undefined;
  /** Filter by the object’s `space` relation. */
  space?: SpaceFilter | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `universalPercentageSupportThreshold` field. */
  universalPercentageSupportThreshold?: BigIntFilter | null | undefined;
  /** Filter by the object’s `updatedAt` field. */
  updatedAt?: StringFilter | null | undefined;
  /** Filter by the object’s `updatedAtBlock` field. */
  updatedAtBlock?: StringFilter | null | undefined;
};

/** A filter to be used against String fields. All fields are combined with a logical ‘and.’ */
export type StringFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: string | null | undefined;
  /** Not equal to the specified value, treating null like an ordinary value (case-insensitive). */
  distinctFromInsensitive?: string | null | undefined;
  /** Ends with the specified string (case-sensitive). */
  endsWith?: string | null | undefined;
  /** Ends with the specified string (case-insensitive). */
  endsWithInsensitive?: string | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: string | null | undefined;
  /** Greater than the specified value (case-insensitive). */
  greaterThanInsensitive?: string | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: string | null | undefined;
  /** Greater than or equal to the specified value (case-insensitive). */
  greaterThanOrEqualToInsensitive?: string | null | undefined;
  /** Included in the specified list. */
  in?: Array<string> | null | undefined;
  /** Included in the specified list (case-insensitive). */
  inInsensitive?: Array<string> | null | undefined;
  /** Contains the specified string (case-sensitive). */
  includes?: string | null | undefined;
  /** Contains the specified string (case-insensitive). */
  includesInsensitive?: string | null | undefined;
  /** Equal to the specified value. */
  is?: string | null | undefined;
  /** Equal to the specified value (case-insensitive). */
  isInsensitive?: string | null | undefined;
  /** Not equal to the specified value. */
  isNot?: string | null | undefined;
  /** Not equal to the specified value (case-insensitive). */
  isNotInsensitive?: string | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: string | null | undefined;
  /** Less than the specified value (case-insensitive). */
  lessThanInsensitive?: string | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: string | null | undefined;
  /** Less than or equal to the specified value (case-insensitive). */
  lessThanOrEqualToInsensitive?: string | null | undefined;
  /** Matches the specified pattern (case-sensitive). An underscore (_) matches any single character; a percent sign (%) matches any sequence of zero or more characters. */
  like?: string | null | undefined;
  /** Matches the specified pattern (case-insensitive). An underscore (_) matches any single character; a percent sign (%) matches any sequence of zero or more characters. */
  likeInsensitive?: string | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: string | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value (case-insensitive). */
  notDistinctFromInsensitive?: string | null | undefined;
  /** Does not end with the specified string (case-sensitive). */
  notEndsWith?: string | null | undefined;
  /** Does not end with the specified string (case-insensitive). */
  notEndsWithInsensitive?: string | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<string> | null | undefined;
  /** Not included in the specified list (case-insensitive). */
  notInInsensitive?: Array<string> | null | undefined;
  /** Does not contain the specified string (case-sensitive). */
  notIncludes?: string | null | undefined;
  /** Does not contain the specified string (case-insensitive). */
  notIncludesInsensitive?: string | null | undefined;
  /** Does not match the specified pattern (case-sensitive). An underscore (_) matches any single character; a percent sign (%) matches any sequence of zero or more characters. */
  notLike?: string | null | undefined;
  /** Does not match the specified pattern (case-insensitive). An underscore (_) matches any single character; a percent sign (%) matches any sequence of zero or more characters. */
  notLikeInsensitive?: string | null | undefined;
  /** Does not start with the specified string (case-sensitive). */
  notStartsWith?: string | null | undefined;
  /** Does not start with the specified string (case-insensitive). */
  notStartsWithInsensitive?: string | null | undefined;
  /** Starts with the specified string (case-sensitive). */
  startsWith?: string | null | undefined;
  /** Starts with the specified string (case-insensitive). */
  startsWithInsensitive?: string | null | undefined;
};

/** A filter to be used against `Subspace` object types. All fields are combined with a logical ‘and.’ */
export type SubspaceFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<SubspaceFilter> | null | undefined;
  /** Filter by the object’s `childSpace` relation. */
  childSpace?: SpaceFilter | null | undefined;
  /** Filter by the object’s `childSpaceId` field. */
  childSpaceId?: UuidFilter | null | undefined;
  /** Negates the expression. */
  not?: SubspaceFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<SubspaceFilter> | null | undefined;
  /** Filter by the object’s `parentSpace` relation. */
  parentSpace?: SpaceFilter | null | undefined;
  /** Filter by the object’s `parentSpaceId` field. */
  parentSpaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `type` field. */
  type?: SubspaceTypeFilter | null | undefined;
};

/** A filter to be used against `SubspaceTopic` object types. All fields are combined with a logical ‘and.’ */
export type SubspaceTopicFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<SubspaceTopicFilter> | null | undefined;
  /** Negates the expression. */
  not?: SubspaceTopicFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<SubspaceTopicFilter> | null | undefined;
  /** Filter by the object’s `space` relation. */
  space?: SpaceFilter | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `topic` relation. */
  topic?: EntityFilter | null | undefined;
  /** Filter by the object’s `topicId` field. */
  topicId?: UuidFilter | null | undefined;
};

export enum SubspaceType {
  Related = 'RELATED',
  Verified = 'VERIFIED'
}

/** A filter to be used against SubspaceType fields. All fields are combined with a logical ‘and.’ */
export type SubspaceTypeFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: SubspaceType | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: SubspaceType | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: SubspaceType | null | undefined;
  /** Included in the specified list. */
  in?: Array<SubspaceType> | null | undefined;
  /** Equal to the specified value. */
  is?: SubspaceType | null | undefined;
  /** Not equal to the specified value. */
  isNot?: SubspaceType | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: SubspaceType | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: SubspaceType | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: SubspaceType | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<SubspaceType> | null | undefined;
};

/** A filter to be used against Time fields. All fields are combined with a logical ‘and.’ */
export type TimeFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: any;
  /** Greater than the specified value. */
  greaterThan?: any;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: any;
  /** Included in the specified list. */
  in?: Array<any> | null | undefined;
  /** Equal to the specified value. */
  is?: any;
  /** Not equal to the specified value. */
  isNot?: any;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: any;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: any;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: any;
  /** Not included in the specified list. */
  notIn?: Array<any> | null | undefined;
};

/** A filter to be used against UUID fields. All fields are combined with a logical ‘and.’ */
export type UuidFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: any;
  /** Greater than the specified value. */
  greaterThan?: any;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: any;
  /** Included in the specified list. */
  in?: Array<any> | null | undefined;
  /** Equal to the specified value. */
  is?: any;
  /** Not equal to the specified value. */
  isNot?: any;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: any;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: any;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: any;
  /** Not included in the specified list. */
  notIn?: Array<any> | null | undefined;
};

/** A filter to be used against UUID List fields. All fields are combined with a logical ‘and.’ */
export type UuidListFilter = {
  /** Any array item is equal to the specified value. */
  anyEqualTo?: any;
  /** Any array item is greater than the specified value. */
  anyGreaterThan?: any;
  /** Any array item is greater than or equal to the specified value. */
  anyGreaterThanOrEqualTo?: any;
  /** Any array item is less than the specified value. */
  anyLessThan?: any;
  /** Any array item is less than or equal to the specified value. */
  anyLessThanOrEqualTo?: any;
  /** Any array item is not equal to the specified value. */
  anyNotEqualTo?: any;
  /** Contained by the specified list of values. */
  containedBy?: Array<any> | null | undefined;
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: Array<any> | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: Array<any> | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: Array<any> | null | undefined;
  /** Contains the specified list of values. */
  in?: Array<any> | null | undefined;
  /** Equal to the specified value. */
  is?: Array<any> | null | undefined;
  /** Not equal to the specified value. */
  isNot?: Array<any> | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: Array<any> | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: Array<any> | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: Array<any> | null | undefined;
  /** Overlaps the specified list of values. */
  overlaps?: Array<any> | null | undefined;
};

/** A filter to be used against `UserVote` object types. All fields are combined with a logical ‘and.’ */
export type UserVoteFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<UserVoteFilter> | null | undefined;
  /** Negates the expression. */
  not?: UserVoteFilter | null | undefined;
  /** Filter by the object’s `objectId` field. */
  objectId?: UuidFilter | null | undefined;
  /** Filter by the object’s `objectType` field. */
  objectType?: IntFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<UserVoteFilter> | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `userId` field. */
  userId?: UuidFilter | null | undefined;
  /** Filter by the object’s `voteKind` field. */
  voteKind?: IntFilter | null | undefined;
  /** Filter by the object’s `voteType` field. */
  voteType?: IntFilter | null | undefined;
  /** Filter by the object’s `votedAt` field. */
  votedAt?: DatetimeFilter | null | undefined;
};

/** A filter to be used against `Value` object types. All fields are combined with a logical ‘and.’ */
export type ValueFilter = {
  /** Checks for all expressions in this list. */
  and?: Array<ValueFilter> | null | undefined;
  /** Filter by the object’s `boolean` field. */
  boolean?: BooleanFilter | null | undefined;
  /** Filter by the object’s `date` field. */
  date?: StringFilter | null | undefined;
  /** Filter by the object’s `datetime` field. */
  datetime?: StringFilter | null | undefined;
  /** Filter by the object’s `datetimeUtc` field. */
  datetimeUtc?: DatetimeFilter | null | undefined;
  /** Filter by the object’s `decimal` field. */
  decimal?: BigFloatFilter | null | undefined;
  /** Filter by the object’s `embedding` field. */
  embedding?: JsonFilter | null | undefined;
  /** Filter by the object’s `entity` relation. */
  entity?: EntityFilter | null | undefined;
  /** Filter by the object’s `entityId` field. */
  entityId?: UuidFilter | null | undefined;
  /** Filter by the object’s `float` field. */
  float?: FloatFilter | null | undefined;
  /** Filter by the object’s `id` field. */
  id?: StringFilter | null | undefined;
  /** Filter by the object’s `integer` field. */
  integer?: BigIntFilter | null | undefined;
  /** Filter by the object’s `language` field. */
  language?: StringFilter | null | undefined;
  /** Negates the expression. */
  not?: ValueFilter | null | undefined;
  /** Checks for any expressions in this list. */
  or?: Array<ValueFilter> | null | undefined;
  /** Filter by the object’s `point` field. */
  point?: StringFilter | null | undefined;
  /** Filter by the object’s `propertyEntity` relation. */
  propertyEntity?: EntityFilter | null | undefined;
  /** Filter by the object’s `propertyId` field. */
  propertyId?: UuidFilter | null | undefined;
  /** Filter by the object’s `rect` field. */
  rect?: StringFilter | null | undefined;
  /** Filter by the object’s `schedule` field. */
  schedule?: JsonFilter | null | undefined;
  /** Filter by the object’s `space` relation. */
  space?: SpaceFilter | null | undefined;
  /** Filter by the object’s `spaceId` field. */
  spaceId?: UuidFilter | null | undefined;
  /** Filter by the object’s `text` field. */
  text?: StringFilter | null | undefined;
  /** Filter by the object’s `time` field. */
  time?: StringFilter | null | undefined;
  /** Filter by the object’s `timeUtc` field. */
  timeUtc?: TimeFilter | null | undefined;
  /** Filter by the object’s `unit` field. */
  unit?: StringFilter | null | undefined;
};

export enum VoteOption {
  Abstain = 'ABSTAIN',
  No = 'NO',
  Yes = 'YES'
}

/** A filter to be used against VoteOption fields. All fields are combined with a logical ‘and.’ */
export type VoteOptionFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: VoteOption | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: VoteOption | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: VoteOption | null | undefined;
  /** Included in the specified list. */
  in?: Array<VoteOption> | null | undefined;
  /** Equal to the specified value. */
  is?: VoteOption | null | undefined;
  /** Not equal to the specified value. */
  isNot?: VoteOption | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: VoteOption | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: VoteOption | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: VoteOption | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<VoteOption> | null | undefined;
};

export enum VotingMode {
  Fast = 'FAST',
  Slow = 'SLOW'
}

/** A filter to be used against VotingMode fields. All fields are combined with a logical ‘and.’ */
export type VotingModeFilter = {
  /** Not equal to the specified value, treating null like an ordinary value. */
  distinctFrom?: VotingMode | null | undefined;
  /** Greater than the specified value. */
  greaterThan?: VotingMode | null | undefined;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: VotingMode | null | undefined;
  /** Included in the specified list. */
  in?: Array<VotingMode> | null | undefined;
  /** Equal to the specified value. */
  is?: VotingMode | null | undefined;
  /** Not equal to the specified value. */
  isNot?: VotingMode | null | undefined;
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: boolean | null | undefined;
  /** Less than the specified value. */
  lessThan?: VotingMode | null | undefined;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: VotingMode | null | undefined;
  /** Equal to the specified value, treating null like an ordinary value. */
  notDistinctFrom?: VotingMode | null | undefined;
  /** Not included in the specified list. */
  notIn?: Array<VotingMode> | null | undefined;
};

export type RelationToEntityFragment = { id: any, name: string | null, types: Array<{ id: any }> | null, valuesList: Array<{ spaceId: any, propertyId: any, text: string | null }> } & { ' $fragmentName'?: 'RelationToEntityFragment' };

export type EntityValueFieldsFragment = { spaceId: any, text: string | null, integer: any, float: number | null, point: any, boolean: boolean | null, time: any, language: any, unit: string | null, datetime: any, date: any, decimal: any, schedule: any, property: { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } } | null } & { ' $fragmentName'?: 'EntityValueFieldsFragment' };

export type RelationFieldsFragment = { id: any, spaceId: any, position: string | null, verified: boolean | null, entityId: any, toSpaceId: any, fromEntity: { id: any, name: string | null } | null, toEntity: { ' $fragmentRefs'?: { 'RelationToEntityFragment': RelationToEntityFragment } } | null, type: { id: any, name: string | null } | null } & { ' $fragmentName'?: 'RelationFieldsFragment' };

export type FullEntityFragment = { id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, createdAt: string, createdAtBlock: string, updatedAt: string, types: Array<{ id: any, name: string | null }> | null, valuesList: Array<{ ' $fragmentRefs'?: { 'EntityValueFieldsFragment': EntityValueFieldsFragment } }>, relationsList: Array<{ ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }> } & { ' $fragmentName'?: 'FullEntityFragment' };

export type AllEntitiesQueryVariables = Exact<{
  spaceId?: any;
  spaceIds?: UuidFilter | null | undefined;
  typeId?: any;
  typeIds?: UuidFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
  filter?: EntityFilter | null | undefined;
  orderBy?: Array<EntitiesOrderBy> | EntitiesOrderBy | null | undefined;
}>;


export type AllEntitiesQuery = { entities: Array<{ id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, updatedAt: string, types: Array<{ id: any, name: string | null }> | null, allValuesList: Array<{ spaceId: any, propertyId: any }>, allRelationsList: Array<{ spaceId: any }>, valuesList: Array<{ ' $fragmentRefs'?: { 'EntityValueFieldsFragment': EntityValueFieldsFragment } }>, relationsList: Array<{ ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }> }> | null };

export type EntitiesBatchQueryVariables = Exact<{
  filter?: EntityFilter | null | undefined;
  spaceId?: any;
}>;


export type EntitiesBatchQuery = { entities: Array<{ id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, types: Array<{ id: any, name: string | null }> | null, valuesList: Array<{ ' $fragmentRefs'?: { 'EntityValueFieldsFragment': EntityValueFieldsFragment } }>, relationsList: Array<{ ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }> }> | null };

export type EntitySpacesBatchQueryVariables = Exact<{
  filter?: EntityFilter | null | undefined;
}>;


export type EntitySpacesBatchQuery = { entities: Array<{ id: any, spaceIds: Array<any> | null, allValuesList: Array<{ spaceId: any, propertyId: any }>, allRelationsList: Array<{ spaceId: any }> }> | null };

export type EntityQueryVariables = Exact<{
  id: any;
  spaceId?: any;
  cursor?: any;
}>;


export type EntityQuery = { entity: { id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, updatedAt: string, types: Array<{ id: any, name: string | null }> | null, allValuesList: Array<{ spaceId: any, propertyId: any }>, allRelationsList: Array<{ spaceId: any }>, valuesList: Array<{ ' $fragmentRefs'?: { 'EntityValueFieldsFragment': EntityValueFieldsFragment } }>, relations: { pageInfo: { hasNextPage: boolean, endCursor: any }, nodes: Array<{ ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }> } } | null };

export type EntityRelationsPageQueryVariables = Exact<{
  id: any;
  spaceId?: any;
  cursor?: any;
}>;


export type EntityRelationsPageQuery = { entity: { relations: { pageInfo: { hasNextPage: boolean, endCursor: any }, nodes: Array<{ ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }> } } | null };

export type FullRelationFragment = (
  { entity: { id: any, name: string | null } | null }
  & { ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }
) & { ' $fragmentName'?: 'FullRelationFragment' };

export type RelationEntityRelationsQueryVariables = Exact<{
  id: any;
  spaceId?: any;
}>;


export type RelationEntityRelationsQuery = { relations: Array<{ ' $fragmentRefs'?: { 'FullRelationFragment': FullRelationFragment } }> | null };

export type RelationsByToEntityIdsQueryVariables = Exact<{
  toEntityIds: Array<any> | any;
  typeId?: any;
  spaceId?: any;
}>;


export type RelationsByToEntityIdsQuery = { relations: Array<{ id: any, toEntityId: any, spaceId: any, fromEntityId: any }> | null };

export type RelationsByFromEntityIdQueryVariables = Exact<{
  fromEntityId: any;
  typeId: any;
  spaceId: any;
}>;


export type RelationsByFromEntityIdQuery = { relations: Array<{ ' $fragmentRefs'?: { 'FullRelationFragment': FullRelationFragment } }> | null };

export type EntityPageQueryVariables = Exact<{
  id: any;
  spaceId?: any;
}>;


export type EntityPageQuery = { entity: { id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, types: Array<{ id: any, name: string | null }> | null, allValuesList: Array<{ spaceId: any, propertyId: any }>, allRelationsList: Array<{ spaceId: any }>, valuesList: Array<{ ' $fragmentRefs'?: { 'EntityValueFieldsFragment': EntityValueFieldsFragment } }>, relationsList: Array<{ ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }> } | null, relations: Array<{ ' $fragmentRefs'?: { 'FullRelationFragment': FullRelationFragment } }> | null };

export type EntityTypesQueryVariables = Exact<{
  id: any;
  spaceId?: any;
}>;


export type EntityTypesQuery = { entity: { types: Array<{ id: any, name: string | null }> | null } | null };

export type EntityExistsQueryVariables = Exact<{
  id: any;
}>;


export type EntityExistsQuery = { entity: { id: any } | null };

export type EntityCommentReplyBacklinksPageQueryVariables = Exact<{
  id: any;
  replyToTypeId: any;
  commentTypeId: any;
  first: number;
  offset: number;
}>;


export type EntityCommentReplyBacklinksPageQuery = { entity: { backlinksList: Array<{ fromEntity: { id: any } | null }> } | null };

export type EntitiesBatchForCommentsQueryVariables = Exact<{
  filter?: EntityFilter | null | undefined;
}>;


export type EntitiesBatchForCommentsQuery = { entities: Array<{ id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, createdAt: string, updatedAt: string, types: Array<{ id: any, name: string | null }> | null, valuesList: Array<{ ' $fragmentRefs'?: { 'EntityValueFieldsFragment': EntityValueFieldsFragment } }>, relationsList: Array<{ ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }> }> | null };

export type EntityBacklinksPageQueryVariables = Exact<{
  id: any;
  spaceId?: any;
}>;


export type EntityBacklinksPageQuery = { entity: { backlinksList: Array<{ spaceId: any, fromEntity: { id: any, name: string | null, spaceIds: Array<any> | null, types: Array<{ id: any, name: string | null, spaceIds: Array<any> | null }> | null } | null }> } | null };

export type FullSpaceFragment = { id: any, type: SpaceTypes, address: string, topicId: any, topic: { ' $fragmentRefs'?: { 'FullEntityFragment': FullEntityFragment } } | null, members: { totalCount: number }, membersList: Array<{ memberSpaceId: any }>, editors: { totalCount: number }, editorsList: Array<{ memberSpaceId: any }>, spaceVotingSetting: { flatSupportThreshold: any } | null, page: { ' $fragmentRefs'?: { 'FullEntityFragment': FullEntityFragment } } | null } & { ' $fragmentName'?: 'FullSpaceFragment' };

export type SpaceQueryVariables = Exact<{
  id: any;
}>;


export type SpaceQuery = { space: { ' $fragmentRefs'?: { 'FullSpaceFragment': FullSpaceFragment } } | null };

export type SpacesQueryVariables = Exact<{
  filter?: SpaceFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type SpacesQuery = { spaces: Array<{ ' $fragmentRefs'?: { 'FullSpaceFragment': FullSpaceFragment } }> | null };

export type SpacesWhereMemberQueryVariables = Exact<{
  memberSpaceId: any;
}>;


export type SpacesWhereMemberQuery = { spaces: Array<{ ' $fragmentRefs'?: { 'FullSpaceFragment': FullSpaceFragment } }> | null };

export type IsMemberOfSpaceQueryVariables = Exact<{
  spaceId: any;
  memberSpaceId: any;
}>;


export type IsMemberOfSpaceQuery = { space: { membersList: Array<{ memberSpaceId: any }> } | null };

export type IsEditorOfSpaceQueryVariables = Exact<{
  spaceId: any;
  memberSpaceId: any;
}>;


export type IsEditorOfSpaceQuery = { space: { editorsList: Array<{ memberSpaceId: any }> } | null };

export type SpaceMembersPageQueryVariables = Exact<{
  spaceId: any;
  first: number;
  offset: number;
}>;


export type SpaceMembersPageQuery = { space: { members: { totalCount: number }, membersList: Array<{ memberSpaceId: any }> } | null };

export type SpaceEditorsPageQueryVariables = Exact<{
  spaceId: any;
  first: number;
  offset: number;
}>;


export type SpaceEditorsPageQuery = { space: { editors: { totalCount: number }, editorsList: Array<{ memberSpaceId: any }> } | null };

export type PropertyFragmentFragment = { id: any, name: string | null, dataTypeId: any, dataTypeName: string | null, renderableTypeId: any, renderableTypeName: string | null, format: string | null, isType: boolean | null } & { ' $fragmentName'?: 'PropertyFragmentFragment' };

export type PropertyQueryVariables = Exact<{
  id: any;
}>;


export type PropertyQuery = { property: { ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } } | null };

export type PropertiesBatchQueryVariables = Exact<{
  ids: Array<any> | any;
}>;


export type PropertiesBatchQuery = { properties: Array<{ ' $fragmentRefs'?: { 'PropertyFragmentFragment': PropertyFragmentFragment } }> | null };

export type EntityNamesQueryVariables = Exact<{
  filter?: EntityFilter | null | undefined;
}>;


export type EntityNamesQuery = { entities: Array<{ id: any, name: string | null }> | null };

export type ResultQueryVariables = Exact<{
  id: any;
}>;


export type ResultQuery = { entity: { id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, types: Array<{ id: any, name: string | null }> | null } | null };

export type ResultsQueryVariables = Exact<{
  query: string;
  filter?: EntityFilter | null | undefined;
  spaceId?: any;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type ResultsQuery = { search: Array<{ id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, types: Array<{ id: any, name: string | null }> | null }> | null };

export type EntitiesPageQueryVariables = Exact<{
  filter?: EntityFilter | null | undefined;
  first: number;
  offset: number;
}>;


export type EntitiesPageQuery = { entities: Array<{ id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, types: Array<{ id: any, name: string | null }> | null }> | null };

export type ImportNameValuesQueryVariables = Exact<{
  propertyId: any;
  texts?: Array<string> | string | null | undefined;
  first?: number | null | undefined;
  entityFilter?: EntityFilter | null | undefined;
}>;


export type ImportNameValuesQuery = { values: Array<{ id: string, text: string | null, spaceId: any, entity: { id: any, name: string | null, typeIds: Array<any> | null, backlinks: { totalCount: number }, relations: { totalCount: number } } | null }> | null };

export type EntityTiebreakerBatchQueryVariables = Exact<{
  filter?: EntityFilter | null | undefined;
}>;


export type EntityTiebreakerBatchQuery = { entities: Array<{ id: any, createdAt: string, backlinks: { totalCount: number }, relations: { totalCount: number }, values: { totalCount: number } }> | null };

export type RelationEntityMinimalQueryVariables = Exact<{
  id: any;
  spaceId?: any;
}>;


export type RelationEntityMinimalQuery = { relation: { id: any, entity: { id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, types: Array<{ id: any, name: string | null }> | null, allValuesList: Array<{ spaceId: any, propertyId: any }>, allRelationsList: Array<{ spaceId: any }>, valuesList: Array<{ spaceId: any, text: string | null, integer: any, float: number | null, point: any, boolean: boolean | null, time: any, language: any, unit: string | null, datetime: any, date: any, decimal: any, schedule: any, property: { id: any, name: string | null, dataTypeId: any, dataTypeName: string | null, renderableTypeId: any, renderableTypeName: string | null, format: string | null } | null }>, relationsList: Array<{ verified: boolean | null, toSpaceId: any, position: string | null, spaceId: any, id: any, entityId: any, fromEntity: { id: any, name: string | null } | null, toEntity: { ' $fragmentRefs'?: { 'RelationToEntityFragment': RelationToEntityFragment } } | null, type: { id: any, name: string | null, description: string | null } | null }> } | null } | null };

export type EntityResponseCountsQueryVariables = Exact<{
  objectId: any;
  objectType: number;
  spaceId: any;
  voteKind: number;
}>;


export type EntityResponseCountsQuery = { votesCountByObjectIdAndObjectTypeAndSpaceIdAndVoteKind: { positive: any, negative: any, voteKind: number } | null };

export type UserEntityResponseQueryVariables = Exact<{
  userId: any;
  objectId: any;
  objectType: number;
  spaceId: any;
  voteKind: number;
}>;


export type UserEntityResponseQuery = { userVoteByUserIdAndObjectIdAndObjectTypeAndSpaceIdAndVoteKind: { voteType: number } | null };

export type EntityRespondersQueryVariables = Exact<{
  objectId: any;
  objectType: number;
  spaceId: any;
  voteKind: number;
}>;


export type EntityRespondersQuery = { userVotes: Array<{ userId: any, voteType: number }> | null };

export type ClaimResponseSummariesQueryVariables = Exact<{
  filter: UserVoteFilter;
  first: number;
  offset: number;
}>;


export type ClaimResponseSummariesQuery = { userVotes: Array<{ userId: any, objectId: any, voteType: number, voteKind: number }> | null };

export type UserHasEntityVoteQueryVariables = Exact<{
  userId: any;
}>;


export type UserHasEntityVoteQuery = { userVotes: Array<{ userId: any }> | null };

export type UserEntityVotesByTypeQueryVariables = Exact<{
  userId: any;
  voteType: number;
  objectType: number;
  first: number;
  after?: any;
}>;


export type UserEntityVotesByTypeQuery = { userVotesConnection: { nodes: Array<{ objectId: any, voteKind: number, votedAt: any }>, pageInfo: { hasNextPage: boolean, endCursor: any } } | null };

export const RelationToEntityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}}]} as unknown as DocumentNode<RelationToEntityFragment, unknown>;
export const RelationFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}}]} as unknown as DocumentNode<RelationFieldsFragment, unknown>;
export const FullRelationFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<FullRelationFragment, unknown>;
export const PropertyFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}}]} as unknown as DocumentNode<PropertyFragmentFragment, unknown>;
export const EntityValueFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}}]} as unknown as DocumentNode<EntityValueFieldsFragment, unknown>;
export const FullEntityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<FullEntityFragment, unknown>;
export const FullSpaceFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"topicId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spaceVotingSetting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"flatSupportThreshold"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]} as unknown as DocumentNode<FullSpaceFragment, unknown>;
export const AllEntitiesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllEntities"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceIds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUIDFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeIds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUIDFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"EntitiesOrderBy"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceIds"}}},{"kind":"Argument","name":{"kind":"Name","value":"typeId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}}},{"kind":"Argument","name":{"kind":"Name","value":"typeIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AllEntitiesQuery, AllEntitiesQueryVariables>;
export const EntitiesBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntitiesBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntitiesBatchQuery, EntitiesBatchQueryVariables>;
export const EntitySpacesBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntitySpacesBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}}]}}]}}]} as unknown as DocumentNode<EntitySpacesBatchQuery, EntitySpacesBatchQueryVariables>;
export const EntityDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Entity"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Cursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"500"}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntityQuery, EntityQueryVariables>;
export const EntityRelationsPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityRelationsPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Cursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"500"}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntityRelationsPageQuery, EntityRelationsPageQueryVariables>;
export const RelationEntityRelationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RelationEntityRelations"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"entityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullRelation"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<RelationEntityRelationsQuery, RelationEntityRelationsQueryVariables>;
export const RelationsByToEntityIdsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RelationsByToEntityIds"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"toEntityIds"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"toEntityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"toEntityIds"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"typeId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"toEntityId"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntityId"}}]}}]}}]} as unknown as DocumentNode<RelationsByToEntityIdsQuery, RelationsByToEntityIdsQueryVariables>;
export const RelationsByFromEntityIdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RelationsByFromEntityId"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"fromEntityId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"fromEntityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"fromEntityId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"typeId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullRelation"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<RelationsByFromEntityIdQuery, RelationsByFromEntityIdQueryVariables>;
export const EntityPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"entityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullRelation"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntityPageQuery, EntityPageQueryVariables>;
export const EntityTypesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityTypes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"types"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceIds"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"anyEqualTo"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<EntityTypesQuery, EntityTypesQueryVariables>;
export const EntityExistsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityExists"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<EntityExistsQuery, EntityExistsQueryVariables>;
export const EntityCommentReplyBacklinksPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityCommentReplyBacklinksPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"replyToTypeId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"commentTypeId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"backlinksList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"typeId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"replyToTypeId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"fromEntity"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"typeIds"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"overlaps"},"value":{"kind":"ListValue","values":[{"kind":"Variable","name":{"kind":"Name","value":"commentTypeId"}}]}}]}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]}}]} as unknown as DocumentNode<EntityCommentReplyBacklinksPageQuery, EntityCommentReplyBacklinksPageQueryVariables>;
export const EntitiesBatchForCommentsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntitiesBatchForComments"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntitiesBatchForCommentsQuery, EntitiesBatchForCommentsQueryVariables>;
export const EntityBacklinksPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityBacklinksPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"backlinksList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<EntityBacklinksPageQuery, EntityBacklinksPageQueryVariables>;
export const SpaceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Space"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"space"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullSpace"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"topicId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spaceVotingSetting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"flatSupportThreshold"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}}]} as unknown as DocumentNode<SpaceQuery, SpaceQueryVariables>;
export const SpacesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Spaces"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"SpaceFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaces"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullSpace"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"topicId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spaceVotingSetting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"flatSupportThreshold"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}}]} as unknown as DocumentNode<SpacesQuery, SpacesQueryVariables>;
export const SpacesWhereMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SpacesWhereMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"memberSpaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaces"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"members"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"some"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"memberSpaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"memberSpaceId"}}}]}}]}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullSpace"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"topicId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spaceVotingSetting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"flatSupportThreshold"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}}]} as unknown as DocumentNode<SpacesWhereMemberQuery, SpacesWhereMemberQueryVariables>;
export const IsMemberOfSpaceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"IsMemberOfSpace"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"memberSpaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"space"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"membersList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"memberSpaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"memberSpaceId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}}]}}]}}]} as unknown as DocumentNode<IsMemberOfSpaceQuery, IsMemberOfSpaceQueryVariables>;
export const IsEditorOfSpaceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"IsEditorOfSpace"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"memberSpaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"space"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"memberSpaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"memberSpaceId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}}]}}]}}]} as unknown as DocumentNode<IsEditorOfSpaceQuery, IsEditorOfSpaceQueryVariables>;
export const SpaceMembersPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SpaceMembersPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"space"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}}]}}]}}]} as unknown as DocumentNode<SpaceMembersPageQuery, SpaceMembersPageQueryVariables>;
export const SpaceEditorsPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SpaceEditorsPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"space"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"editors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}}]}}]}}]} as unknown as DocumentNode<SpaceEditorsPageQuery, SpaceEditorsPageQueryVariables>;
export const PropertyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Property"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"property"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}}]} as unknown as DocumentNode<PropertyQuery, PropertyQueryVariables>;
export const PropertiesBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PropertiesBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"ids"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"properties"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"ids"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}}]} as unknown as DocumentNode<PropertiesBatchQuery, PropertiesBatchQueryVariables>;
export const EntityNamesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityNames"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntityNamesQuery, EntityNamesQueryVariables>;
export const ResultDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Result"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<ResultQuery, ResultQueryVariables>;
export const ResultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Results"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"query"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"search"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"query"},"value":{"kind":"Variable","name":{"kind":"Name","value":"query"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<ResultsQuery, ResultsQueryVariables>;
export const EntitiesPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntitiesPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<EntitiesPageQuery, EntitiesPageQueryVariables>;
export const ImportNameValuesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImportNameValues"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"propertyId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"texts"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"entityFilter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"values"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"propertyId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"propertyId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"text"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"inInsensitive"},"value":{"kind":"Variable","name":{"kind":"Name","value":"texts"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"entity"},"value":{"kind":"Variable","name":{"kind":"Name","value":"entityFilter"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"typeIds"}},{"kind":"Field","name":{"kind":"Name","value":"backlinks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}}]}}]}}]} as unknown as DocumentNode<ImportNameValuesQuery, ImportNameValuesQueryVariables>;
export const EntityTiebreakerBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityTiebreakerBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"backlinks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"values"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}}]}}]} as unknown as DocumentNode<EntityTiebreakerBatchQuery, EntityTiebreakerBatchQueryVariables>;
export const RelationEntityMinimalDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RelationEntityMinimal"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}}]} as unknown as DocumentNode<RelationEntityMinimalQuery, RelationEntityMinimalQueryVariables>;
export const EntityResponseCountsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityResponseCounts"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"voteKind"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"votesCountByObjectIdAndObjectTypeAndSpaceIdAndVoteKind"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objectId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectId"}}},{"kind":"Argument","name":{"kind":"Name","value":"objectType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"voteKind"},"value":{"kind":"Variable","name":{"kind":"Name","value":"voteKind"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"positive"}},{"kind":"Field","name":{"kind":"Name","value":"negative"}},{"kind":"Field","name":{"kind":"Name","value":"voteKind"}}]}}]}}]} as unknown as DocumentNode<EntityResponseCountsQuery, EntityResponseCountsQueryVariables>;
export const UserEntityResponseDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserEntityResponse"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"voteKind"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userVoteByUserIdAndObjectIdAndObjectTypeAndSpaceIdAndVoteKind"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"objectId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectId"}}},{"kind":"Argument","name":{"kind":"Name","value":"objectType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"voteKind"},"value":{"kind":"Variable","name":{"kind":"Name","value":"voteKind"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voteType"}}]}}]}}]} as unknown as DocumentNode<UserEntityResponseQuery, UserEntityResponseQueryVariables>;
export const EntityRespondersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityResponders"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"voteKind"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userVotes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"objectId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectId"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"objectType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"voteKind"},"value":{"kind":"Variable","name":{"kind":"Name","value":"voteKind"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"voteType"}}]}}]}}]} as unknown as DocumentNode<EntityRespondersQuery, EntityRespondersQueryVariables>;
export const ClaimResponseSummariesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ClaimResponseSummaries"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UserVoteFilter"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userVotes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"OBJECT_ID_ASC"},{"kind":"EnumValue","value":"VOTE_KIND_ASC"},{"kind":"EnumValue","value":"USER_ID_ASC"}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"objectId"}},{"kind":"Field","name":{"kind":"Name","value":"voteType"}},{"kind":"Field","name":{"kind":"Name","value":"voteKind"}}]}}]}}]} as unknown as DocumentNode<ClaimResponseSummariesQuery, ClaimResponseSummariesQueryVariables>;
export const UserHasEntityVoteDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserHasEntityVote"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userVotes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}}]}}]}}]} as unknown as DocumentNode<UserHasEntityVoteQuery, UserHasEntityVoteQueryVariables>;
export const UserEntityVotesByTypeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserEntityVotesByType"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"voteType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Cursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userVotesConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}},{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"voteType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"voteType"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"objectType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"objectId"}},{"kind":"Field","name":{"kind":"Name","value":"voteKind"}},{"kind":"Field","name":{"kind":"Name","value":"votedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}}]} as unknown as DocumentNode<UserEntityVotesByTypeQuery, UserEntityVotesByTypeQueryVariables>;
