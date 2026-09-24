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
  BacklinksAverageEntityIdAsc = 'BACKLINKS_AVERAGE_ENTITY_ID_ASC',
  BacklinksAverageEntityIdDesc = 'BACKLINKS_AVERAGE_ENTITY_ID_DESC',
  BacklinksAverageFromEntityIdAsc = 'BACKLINKS_AVERAGE_FROM_ENTITY_ID_ASC',
  BacklinksAverageFromEntityIdDesc = 'BACKLINKS_AVERAGE_FROM_ENTITY_ID_DESC',
  BacklinksAverageFromSpaceIdAsc = 'BACKLINKS_AVERAGE_FROM_SPACE_ID_ASC',
  BacklinksAverageFromSpaceIdDesc = 'BACKLINKS_AVERAGE_FROM_SPACE_ID_DESC',
  BacklinksAverageFromVersionIdAsc = 'BACKLINKS_AVERAGE_FROM_VERSION_ID_ASC',
  BacklinksAverageFromVersionIdDesc = 'BACKLINKS_AVERAGE_FROM_VERSION_ID_DESC',
  BacklinksAverageIdAsc = 'BACKLINKS_AVERAGE_ID_ASC',
  BacklinksAverageIdDesc = 'BACKLINKS_AVERAGE_ID_DESC',
  BacklinksAverageIsSystemAsc = 'BACKLINKS_AVERAGE_IS_SYSTEM_ASC',
  BacklinksAverageIsSystemDesc = 'BACKLINKS_AVERAGE_IS_SYSTEM_DESC',
  BacklinksAveragePositionAsc = 'BACKLINKS_AVERAGE_POSITION_ASC',
  BacklinksAveragePositionDesc = 'BACKLINKS_AVERAGE_POSITION_DESC',
  BacklinksAverageSpaceIdAsc = 'BACKLINKS_AVERAGE_SPACE_ID_ASC',
  BacklinksAverageSpaceIdDesc = 'BACKLINKS_AVERAGE_SPACE_ID_DESC',
  BacklinksAverageToEntityIdAsc = 'BACKLINKS_AVERAGE_TO_ENTITY_ID_ASC',
  BacklinksAverageToEntityIdDesc = 'BACKLINKS_AVERAGE_TO_ENTITY_ID_DESC',
  BacklinksAverageToSpaceIdAsc = 'BACKLINKS_AVERAGE_TO_SPACE_ID_ASC',
  BacklinksAverageToSpaceIdDesc = 'BACKLINKS_AVERAGE_TO_SPACE_ID_DESC',
  BacklinksAverageToVersionIdAsc = 'BACKLINKS_AVERAGE_TO_VERSION_ID_ASC',
  BacklinksAverageToVersionIdDesc = 'BACKLINKS_AVERAGE_TO_VERSION_ID_DESC',
  BacklinksAverageTypeIdAsc = 'BACKLINKS_AVERAGE_TYPE_ID_ASC',
  BacklinksAverageTypeIdDesc = 'BACKLINKS_AVERAGE_TYPE_ID_DESC',
  BacklinksAverageVerifiedAsc = 'BACKLINKS_AVERAGE_VERIFIED_ASC',
  BacklinksAverageVerifiedDesc = 'BACKLINKS_AVERAGE_VERIFIED_DESC',
  BacklinksCountAsc = 'BACKLINKS_COUNT_ASC',
  BacklinksCountDesc = 'BACKLINKS_COUNT_DESC',
  BacklinksDistinctCountEntityIdAsc = 'BACKLINKS_DISTINCT_COUNT_ENTITY_ID_ASC',
  BacklinksDistinctCountEntityIdDesc = 'BACKLINKS_DISTINCT_COUNT_ENTITY_ID_DESC',
  BacklinksDistinctCountFromEntityIdAsc = 'BACKLINKS_DISTINCT_COUNT_FROM_ENTITY_ID_ASC',
  BacklinksDistinctCountFromEntityIdDesc = 'BACKLINKS_DISTINCT_COUNT_FROM_ENTITY_ID_DESC',
  BacklinksDistinctCountFromSpaceIdAsc = 'BACKLINKS_DISTINCT_COUNT_FROM_SPACE_ID_ASC',
  BacklinksDistinctCountFromSpaceIdDesc = 'BACKLINKS_DISTINCT_COUNT_FROM_SPACE_ID_DESC',
  BacklinksDistinctCountFromVersionIdAsc = 'BACKLINKS_DISTINCT_COUNT_FROM_VERSION_ID_ASC',
  BacklinksDistinctCountFromVersionIdDesc = 'BACKLINKS_DISTINCT_COUNT_FROM_VERSION_ID_DESC',
  BacklinksDistinctCountIdAsc = 'BACKLINKS_DISTINCT_COUNT_ID_ASC',
  BacklinksDistinctCountIdDesc = 'BACKLINKS_DISTINCT_COUNT_ID_DESC',
  BacklinksDistinctCountIsSystemAsc = 'BACKLINKS_DISTINCT_COUNT_IS_SYSTEM_ASC',
  BacklinksDistinctCountIsSystemDesc = 'BACKLINKS_DISTINCT_COUNT_IS_SYSTEM_DESC',
  BacklinksDistinctCountPositionAsc = 'BACKLINKS_DISTINCT_COUNT_POSITION_ASC',
  BacklinksDistinctCountPositionDesc = 'BACKLINKS_DISTINCT_COUNT_POSITION_DESC',
  BacklinksDistinctCountSpaceIdAsc = 'BACKLINKS_DISTINCT_COUNT_SPACE_ID_ASC',
  BacklinksDistinctCountSpaceIdDesc = 'BACKLINKS_DISTINCT_COUNT_SPACE_ID_DESC',
  BacklinksDistinctCountToEntityIdAsc = 'BACKLINKS_DISTINCT_COUNT_TO_ENTITY_ID_ASC',
  BacklinksDistinctCountToEntityIdDesc = 'BACKLINKS_DISTINCT_COUNT_TO_ENTITY_ID_DESC',
  BacklinksDistinctCountToSpaceIdAsc = 'BACKLINKS_DISTINCT_COUNT_TO_SPACE_ID_ASC',
  BacklinksDistinctCountToSpaceIdDesc = 'BACKLINKS_DISTINCT_COUNT_TO_SPACE_ID_DESC',
  BacklinksDistinctCountToVersionIdAsc = 'BACKLINKS_DISTINCT_COUNT_TO_VERSION_ID_ASC',
  BacklinksDistinctCountToVersionIdDesc = 'BACKLINKS_DISTINCT_COUNT_TO_VERSION_ID_DESC',
  BacklinksDistinctCountTypeIdAsc = 'BACKLINKS_DISTINCT_COUNT_TYPE_ID_ASC',
  BacklinksDistinctCountTypeIdDesc = 'BACKLINKS_DISTINCT_COUNT_TYPE_ID_DESC',
  BacklinksDistinctCountVerifiedAsc = 'BACKLINKS_DISTINCT_COUNT_VERIFIED_ASC',
  BacklinksDistinctCountVerifiedDesc = 'BACKLINKS_DISTINCT_COUNT_VERIFIED_DESC',
  BacklinksMaxEntityIdAsc = 'BACKLINKS_MAX_ENTITY_ID_ASC',
  BacklinksMaxEntityIdDesc = 'BACKLINKS_MAX_ENTITY_ID_DESC',
  BacklinksMaxFromEntityIdAsc = 'BACKLINKS_MAX_FROM_ENTITY_ID_ASC',
  BacklinksMaxFromEntityIdDesc = 'BACKLINKS_MAX_FROM_ENTITY_ID_DESC',
  BacklinksMaxFromSpaceIdAsc = 'BACKLINKS_MAX_FROM_SPACE_ID_ASC',
  BacklinksMaxFromSpaceIdDesc = 'BACKLINKS_MAX_FROM_SPACE_ID_DESC',
  BacklinksMaxFromVersionIdAsc = 'BACKLINKS_MAX_FROM_VERSION_ID_ASC',
  BacklinksMaxFromVersionIdDesc = 'BACKLINKS_MAX_FROM_VERSION_ID_DESC',
  BacklinksMaxIdAsc = 'BACKLINKS_MAX_ID_ASC',
  BacklinksMaxIdDesc = 'BACKLINKS_MAX_ID_DESC',
  BacklinksMaxIsSystemAsc = 'BACKLINKS_MAX_IS_SYSTEM_ASC',
  BacklinksMaxIsSystemDesc = 'BACKLINKS_MAX_IS_SYSTEM_DESC',
  BacklinksMaxPositionAsc = 'BACKLINKS_MAX_POSITION_ASC',
  BacklinksMaxPositionDesc = 'BACKLINKS_MAX_POSITION_DESC',
  BacklinksMaxSpaceIdAsc = 'BACKLINKS_MAX_SPACE_ID_ASC',
  BacklinksMaxSpaceIdDesc = 'BACKLINKS_MAX_SPACE_ID_DESC',
  BacklinksMaxToEntityIdAsc = 'BACKLINKS_MAX_TO_ENTITY_ID_ASC',
  BacklinksMaxToEntityIdDesc = 'BACKLINKS_MAX_TO_ENTITY_ID_DESC',
  BacklinksMaxToSpaceIdAsc = 'BACKLINKS_MAX_TO_SPACE_ID_ASC',
  BacklinksMaxToSpaceIdDesc = 'BACKLINKS_MAX_TO_SPACE_ID_DESC',
  BacklinksMaxToVersionIdAsc = 'BACKLINKS_MAX_TO_VERSION_ID_ASC',
  BacklinksMaxToVersionIdDesc = 'BACKLINKS_MAX_TO_VERSION_ID_DESC',
  BacklinksMaxTypeIdAsc = 'BACKLINKS_MAX_TYPE_ID_ASC',
  BacklinksMaxTypeIdDesc = 'BACKLINKS_MAX_TYPE_ID_DESC',
  BacklinksMaxVerifiedAsc = 'BACKLINKS_MAX_VERIFIED_ASC',
  BacklinksMaxVerifiedDesc = 'BACKLINKS_MAX_VERIFIED_DESC',
  BacklinksMinEntityIdAsc = 'BACKLINKS_MIN_ENTITY_ID_ASC',
  BacklinksMinEntityIdDesc = 'BACKLINKS_MIN_ENTITY_ID_DESC',
  BacklinksMinFromEntityIdAsc = 'BACKLINKS_MIN_FROM_ENTITY_ID_ASC',
  BacklinksMinFromEntityIdDesc = 'BACKLINKS_MIN_FROM_ENTITY_ID_DESC',
  BacklinksMinFromSpaceIdAsc = 'BACKLINKS_MIN_FROM_SPACE_ID_ASC',
  BacklinksMinFromSpaceIdDesc = 'BACKLINKS_MIN_FROM_SPACE_ID_DESC',
  BacklinksMinFromVersionIdAsc = 'BACKLINKS_MIN_FROM_VERSION_ID_ASC',
  BacklinksMinFromVersionIdDesc = 'BACKLINKS_MIN_FROM_VERSION_ID_DESC',
  BacklinksMinIdAsc = 'BACKLINKS_MIN_ID_ASC',
  BacklinksMinIdDesc = 'BACKLINKS_MIN_ID_DESC',
  BacklinksMinIsSystemAsc = 'BACKLINKS_MIN_IS_SYSTEM_ASC',
  BacklinksMinIsSystemDesc = 'BACKLINKS_MIN_IS_SYSTEM_DESC',
  BacklinksMinPositionAsc = 'BACKLINKS_MIN_POSITION_ASC',
  BacklinksMinPositionDesc = 'BACKLINKS_MIN_POSITION_DESC',
  BacklinksMinSpaceIdAsc = 'BACKLINKS_MIN_SPACE_ID_ASC',
  BacklinksMinSpaceIdDesc = 'BACKLINKS_MIN_SPACE_ID_DESC',
  BacklinksMinToEntityIdAsc = 'BACKLINKS_MIN_TO_ENTITY_ID_ASC',
  BacklinksMinToEntityIdDesc = 'BACKLINKS_MIN_TO_ENTITY_ID_DESC',
  BacklinksMinToSpaceIdAsc = 'BACKLINKS_MIN_TO_SPACE_ID_ASC',
  BacklinksMinToSpaceIdDesc = 'BACKLINKS_MIN_TO_SPACE_ID_DESC',
  BacklinksMinToVersionIdAsc = 'BACKLINKS_MIN_TO_VERSION_ID_ASC',
  BacklinksMinToVersionIdDesc = 'BACKLINKS_MIN_TO_VERSION_ID_DESC',
  BacklinksMinTypeIdAsc = 'BACKLINKS_MIN_TYPE_ID_ASC',
  BacklinksMinTypeIdDesc = 'BACKLINKS_MIN_TYPE_ID_DESC',
  BacklinksMinVerifiedAsc = 'BACKLINKS_MIN_VERIFIED_ASC',
  BacklinksMinVerifiedDesc = 'BACKLINKS_MIN_VERIFIED_DESC',
  BacklinksStddevPopulationEntityIdAsc = 'BACKLINKS_STDDEV_POPULATION_ENTITY_ID_ASC',
  BacklinksStddevPopulationEntityIdDesc = 'BACKLINKS_STDDEV_POPULATION_ENTITY_ID_DESC',
  BacklinksStddevPopulationFromEntityIdAsc = 'BACKLINKS_STDDEV_POPULATION_FROM_ENTITY_ID_ASC',
  BacklinksStddevPopulationFromEntityIdDesc = 'BACKLINKS_STDDEV_POPULATION_FROM_ENTITY_ID_DESC',
  BacklinksStddevPopulationFromSpaceIdAsc = 'BACKLINKS_STDDEV_POPULATION_FROM_SPACE_ID_ASC',
  BacklinksStddevPopulationFromSpaceIdDesc = 'BACKLINKS_STDDEV_POPULATION_FROM_SPACE_ID_DESC',
  BacklinksStddevPopulationFromVersionIdAsc = 'BACKLINKS_STDDEV_POPULATION_FROM_VERSION_ID_ASC',
  BacklinksStddevPopulationFromVersionIdDesc = 'BACKLINKS_STDDEV_POPULATION_FROM_VERSION_ID_DESC',
  BacklinksStddevPopulationIdAsc = 'BACKLINKS_STDDEV_POPULATION_ID_ASC',
  BacklinksStddevPopulationIdDesc = 'BACKLINKS_STDDEV_POPULATION_ID_DESC',
  BacklinksStddevPopulationIsSystemAsc = 'BACKLINKS_STDDEV_POPULATION_IS_SYSTEM_ASC',
  BacklinksStddevPopulationIsSystemDesc = 'BACKLINKS_STDDEV_POPULATION_IS_SYSTEM_DESC',
  BacklinksStddevPopulationPositionAsc = 'BACKLINKS_STDDEV_POPULATION_POSITION_ASC',
  BacklinksStddevPopulationPositionDesc = 'BACKLINKS_STDDEV_POPULATION_POSITION_DESC',
  BacklinksStddevPopulationSpaceIdAsc = 'BACKLINKS_STDDEV_POPULATION_SPACE_ID_ASC',
  BacklinksStddevPopulationSpaceIdDesc = 'BACKLINKS_STDDEV_POPULATION_SPACE_ID_DESC',
  BacklinksStddevPopulationToEntityIdAsc = 'BACKLINKS_STDDEV_POPULATION_TO_ENTITY_ID_ASC',
  BacklinksStddevPopulationToEntityIdDesc = 'BACKLINKS_STDDEV_POPULATION_TO_ENTITY_ID_DESC',
  BacklinksStddevPopulationToSpaceIdAsc = 'BACKLINKS_STDDEV_POPULATION_TO_SPACE_ID_ASC',
  BacklinksStddevPopulationToSpaceIdDesc = 'BACKLINKS_STDDEV_POPULATION_TO_SPACE_ID_DESC',
  BacklinksStddevPopulationToVersionIdAsc = 'BACKLINKS_STDDEV_POPULATION_TO_VERSION_ID_ASC',
  BacklinksStddevPopulationToVersionIdDesc = 'BACKLINKS_STDDEV_POPULATION_TO_VERSION_ID_DESC',
  BacklinksStddevPopulationTypeIdAsc = 'BACKLINKS_STDDEV_POPULATION_TYPE_ID_ASC',
  BacklinksStddevPopulationTypeIdDesc = 'BACKLINKS_STDDEV_POPULATION_TYPE_ID_DESC',
  BacklinksStddevPopulationVerifiedAsc = 'BACKLINKS_STDDEV_POPULATION_VERIFIED_ASC',
  BacklinksStddevPopulationVerifiedDesc = 'BACKLINKS_STDDEV_POPULATION_VERIFIED_DESC',
  BacklinksStddevSampleEntityIdAsc = 'BACKLINKS_STDDEV_SAMPLE_ENTITY_ID_ASC',
  BacklinksStddevSampleEntityIdDesc = 'BACKLINKS_STDDEV_SAMPLE_ENTITY_ID_DESC',
  BacklinksStddevSampleFromEntityIdAsc = 'BACKLINKS_STDDEV_SAMPLE_FROM_ENTITY_ID_ASC',
  BacklinksStddevSampleFromEntityIdDesc = 'BACKLINKS_STDDEV_SAMPLE_FROM_ENTITY_ID_DESC',
  BacklinksStddevSampleFromSpaceIdAsc = 'BACKLINKS_STDDEV_SAMPLE_FROM_SPACE_ID_ASC',
  BacklinksStddevSampleFromSpaceIdDesc = 'BACKLINKS_STDDEV_SAMPLE_FROM_SPACE_ID_DESC',
  BacklinksStddevSampleFromVersionIdAsc = 'BACKLINKS_STDDEV_SAMPLE_FROM_VERSION_ID_ASC',
  BacklinksStddevSampleFromVersionIdDesc = 'BACKLINKS_STDDEV_SAMPLE_FROM_VERSION_ID_DESC',
  BacklinksStddevSampleIdAsc = 'BACKLINKS_STDDEV_SAMPLE_ID_ASC',
  BacklinksStddevSampleIdDesc = 'BACKLINKS_STDDEV_SAMPLE_ID_DESC',
  BacklinksStddevSampleIsSystemAsc = 'BACKLINKS_STDDEV_SAMPLE_IS_SYSTEM_ASC',
  BacklinksStddevSampleIsSystemDesc = 'BACKLINKS_STDDEV_SAMPLE_IS_SYSTEM_DESC',
  BacklinksStddevSamplePositionAsc = 'BACKLINKS_STDDEV_SAMPLE_POSITION_ASC',
  BacklinksStddevSamplePositionDesc = 'BACKLINKS_STDDEV_SAMPLE_POSITION_DESC',
  BacklinksStddevSampleSpaceIdAsc = 'BACKLINKS_STDDEV_SAMPLE_SPACE_ID_ASC',
  BacklinksStddevSampleSpaceIdDesc = 'BACKLINKS_STDDEV_SAMPLE_SPACE_ID_DESC',
  BacklinksStddevSampleToEntityIdAsc = 'BACKLINKS_STDDEV_SAMPLE_TO_ENTITY_ID_ASC',
  BacklinksStddevSampleToEntityIdDesc = 'BACKLINKS_STDDEV_SAMPLE_TO_ENTITY_ID_DESC',
  BacklinksStddevSampleToSpaceIdAsc = 'BACKLINKS_STDDEV_SAMPLE_TO_SPACE_ID_ASC',
  BacklinksStddevSampleToSpaceIdDesc = 'BACKLINKS_STDDEV_SAMPLE_TO_SPACE_ID_DESC',
  BacklinksStddevSampleToVersionIdAsc = 'BACKLINKS_STDDEV_SAMPLE_TO_VERSION_ID_ASC',
  BacklinksStddevSampleToVersionIdDesc = 'BACKLINKS_STDDEV_SAMPLE_TO_VERSION_ID_DESC',
  BacklinksStddevSampleTypeIdAsc = 'BACKLINKS_STDDEV_SAMPLE_TYPE_ID_ASC',
  BacklinksStddevSampleTypeIdDesc = 'BACKLINKS_STDDEV_SAMPLE_TYPE_ID_DESC',
  BacklinksStddevSampleVerifiedAsc = 'BACKLINKS_STDDEV_SAMPLE_VERIFIED_ASC',
  BacklinksStddevSampleVerifiedDesc = 'BACKLINKS_STDDEV_SAMPLE_VERIFIED_DESC',
  BacklinksSumEntityIdAsc = 'BACKLINKS_SUM_ENTITY_ID_ASC',
  BacklinksSumEntityIdDesc = 'BACKLINKS_SUM_ENTITY_ID_DESC',
  BacklinksSumFromEntityIdAsc = 'BACKLINKS_SUM_FROM_ENTITY_ID_ASC',
  BacklinksSumFromEntityIdDesc = 'BACKLINKS_SUM_FROM_ENTITY_ID_DESC',
  BacklinksSumFromSpaceIdAsc = 'BACKLINKS_SUM_FROM_SPACE_ID_ASC',
  BacklinksSumFromSpaceIdDesc = 'BACKLINKS_SUM_FROM_SPACE_ID_DESC',
  BacklinksSumFromVersionIdAsc = 'BACKLINKS_SUM_FROM_VERSION_ID_ASC',
  BacklinksSumFromVersionIdDesc = 'BACKLINKS_SUM_FROM_VERSION_ID_DESC',
  BacklinksSumIdAsc = 'BACKLINKS_SUM_ID_ASC',
  BacklinksSumIdDesc = 'BACKLINKS_SUM_ID_DESC',
  BacklinksSumIsSystemAsc = 'BACKLINKS_SUM_IS_SYSTEM_ASC',
  BacklinksSumIsSystemDesc = 'BACKLINKS_SUM_IS_SYSTEM_DESC',
  BacklinksSumPositionAsc = 'BACKLINKS_SUM_POSITION_ASC',
  BacklinksSumPositionDesc = 'BACKLINKS_SUM_POSITION_DESC',
  BacklinksSumSpaceIdAsc = 'BACKLINKS_SUM_SPACE_ID_ASC',
  BacklinksSumSpaceIdDesc = 'BACKLINKS_SUM_SPACE_ID_DESC',
  BacklinksSumToEntityIdAsc = 'BACKLINKS_SUM_TO_ENTITY_ID_ASC',
  BacklinksSumToEntityIdDesc = 'BACKLINKS_SUM_TO_ENTITY_ID_DESC',
  BacklinksSumToSpaceIdAsc = 'BACKLINKS_SUM_TO_SPACE_ID_ASC',
  BacklinksSumToSpaceIdDesc = 'BACKLINKS_SUM_TO_SPACE_ID_DESC',
  BacklinksSumToVersionIdAsc = 'BACKLINKS_SUM_TO_VERSION_ID_ASC',
  BacklinksSumToVersionIdDesc = 'BACKLINKS_SUM_TO_VERSION_ID_DESC',
  BacklinksSumTypeIdAsc = 'BACKLINKS_SUM_TYPE_ID_ASC',
  BacklinksSumTypeIdDesc = 'BACKLINKS_SUM_TYPE_ID_DESC',
  BacklinksSumVerifiedAsc = 'BACKLINKS_SUM_VERIFIED_ASC',
  BacklinksSumVerifiedDesc = 'BACKLINKS_SUM_VERIFIED_DESC',
  BacklinksVariancePopulationEntityIdAsc = 'BACKLINKS_VARIANCE_POPULATION_ENTITY_ID_ASC',
  BacklinksVariancePopulationEntityIdDesc = 'BACKLINKS_VARIANCE_POPULATION_ENTITY_ID_DESC',
  BacklinksVariancePopulationFromEntityIdAsc = 'BACKLINKS_VARIANCE_POPULATION_FROM_ENTITY_ID_ASC',
  BacklinksVariancePopulationFromEntityIdDesc = 'BACKLINKS_VARIANCE_POPULATION_FROM_ENTITY_ID_DESC',
  BacklinksVariancePopulationFromSpaceIdAsc = 'BACKLINKS_VARIANCE_POPULATION_FROM_SPACE_ID_ASC',
  BacklinksVariancePopulationFromSpaceIdDesc = 'BACKLINKS_VARIANCE_POPULATION_FROM_SPACE_ID_DESC',
  BacklinksVariancePopulationFromVersionIdAsc = 'BACKLINKS_VARIANCE_POPULATION_FROM_VERSION_ID_ASC',
  BacklinksVariancePopulationFromVersionIdDesc = 'BACKLINKS_VARIANCE_POPULATION_FROM_VERSION_ID_DESC',
  BacklinksVariancePopulationIdAsc = 'BACKLINKS_VARIANCE_POPULATION_ID_ASC',
  BacklinksVariancePopulationIdDesc = 'BACKLINKS_VARIANCE_POPULATION_ID_DESC',
  BacklinksVariancePopulationIsSystemAsc = 'BACKLINKS_VARIANCE_POPULATION_IS_SYSTEM_ASC',
  BacklinksVariancePopulationIsSystemDesc = 'BACKLINKS_VARIANCE_POPULATION_IS_SYSTEM_DESC',
  BacklinksVariancePopulationPositionAsc = 'BACKLINKS_VARIANCE_POPULATION_POSITION_ASC',
  BacklinksVariancePopulationPositionDesc = 'BACKLINKS_VARIANCE_POPULATION_POSITION_DESC',
  BacklinksVariancePopulationSpaceIdAsc = 'BACKLINKS_VARIANCE_POPULATION_SPACE_ID_ASC',
  BacklinksVariancePopulationSpaceIdDesc = 'BACKLINKS_VARIANCE_POPULATION_SPACE_ID_DESC',
  BacklinksVariancePopulationToEntityIdAsc = 'BACKLINKS_VARIANCE_POPULATION_TO_ENTITY_ID_ASC',
  BacklinksVariancePopulationToEntityIdDesc = 'BACKLINKS_VARIANCE_POPULATION_TO_ENTITY_ID_DESC',
  BacklinksVariancePopulationToSpaceIdAsc = 'BACKLINKS_VARIANCE_POPULATION_TO_SPACE_ID_ASC',
  BacklinksVariancePopulationToSpaceIdDesc = 'BACKLINKS_VARIANCE_POPULATION_TO_SPACE_ID_DESC',
  BacklinksVariancePopulationToVersionIdAsc = 'BACKLINKS_VARIANCE_POPULATION_TO_VERSION_ID_ASC',
  BacklinksVariancePopulationToVersionIdDesc = 'BACKLINKS_VARIANCE_POPULATION_TO_VERSION_ID_DESC',
  BacklinksVariancePopulationTypeIdAsc = 'BACKLINKS_VARIANCE_POPULATION_TYPE_ID_ASC',
  BacklinksVariancePopulationTypeIdDesc = 'BACKLINKS_VARIANCE_POPULATION_TYPE_ID_DESC',
  BacklinksVariancePopulationVerifiedAsc = 'BACKLINKS_VARIANCE_POPULATION_VERIFIED_ASC',
  BacklinksVariancePopulationVerifiedDesc = 'BACKLINKS_VARIANCE_POPULATION_VERIFIED_DESC',
  BacklinksVarianceSampleEntityIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_ENTITY_ID_ASC',
  BacklinksVarianceSampleEntityIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_ENTITY_ID_DESC',
  BacklinksVarianceSampleFromEntityIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_FROM_ENTITY_ID_ASC',
  BacklinksVarianceSampleFromEntityIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_FROM_ENTITY_ID_DESC',
  BacklinksVarianceSampleFromSpaceIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_FROM_SPACE_ID_ASC',
  BacklinksVarianceSampleFromSpaceIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_FROM_SPACE_ID_DESC',
  BacklinksVarianceSampleFromVersionIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_FROM_VERSION_ID_ASC',
  BacklinksVarianceSampleFromVersionIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_FROM_VERSION_ID_DESC',
  BacklinksVarianceSampleIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_ID_ASC',
  BacklinksVarianceSampleIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_ID_DESC',
  BacklinksVarianceSampleIsSystemAsc = 'BACKLINKS_VARIANCE_SAMPLE_IS_SYSTEM_ASC',
  BacklinksVarianceSampleIsSystemDesc = 'BACKLINKS_VARIANCE_SAMPLE_IS_SYSTEM_DESC',
  BacklinksVarianceSamplePositionAsc = 'BACKLINKS_VARIANCE_SAMPLE_POSITION_ASC',
  BacklinksVarianceSamplePositionDesc = 'BACKLINKS_VARIANCE_SAMPLE_POSITION_DESC',
  BacklinksVarianceSampleSpaceIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_SPACE_ID_ASC',
  BacklinksVarianceSampleSpaceIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_SPACE_ID_DESC',
  BacklinksVarianceSampleToEntityIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_TO_ENTITY_ID_ASC',
  BacklinksVarianceSampleToEntityIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_TO_ENTITY_ID_DESC',
  BacklinksVarianceSampleToSpaceIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_TO_SPACE_ID_ASC',
  BacklinksVarianceSampleToSpaceIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_TO_SPACE_ID_DESC',
  BacklinksVarianceSampleToVersionIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_TO_VERSION_ID_ASC',
  BacklinksVarianceSampleToVersionIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_TO_VERSION_ID_DESC',
  BacklinksVarianceSampleTypeIdAsc = 'BACKLINKS_VARIANCE_SAMPLE_TYPE_ID_ASC',
  BacklinksVarianceSampleTypeIdDesc = 'BACKLINKS_VARIANCE_SAMPLE_TYPE_ID_DESC',
  BacklinksVarianceSampleVerifiedAsc = 'BACKLINKS_VARIANCE_SAMPLE_VERIFIED_ASC',
  BacklinksVarianceSampleVerifiedDesc = 'BACKLINKS_VARIANCE_SAMPLE_VERIFIED_DESC',
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
  RelationsAverageEntityIdAsc = 'RELATIONS_AVERAGE_ENTITY_ID_ASC',
  RelationsAverageEntityIdDesc = 'RELATIONS_AVERAGE_ENTITY_ID_DESC',
  RelationsAverageFromEntityIdAsc = 'RELATIONS_AVERAGE_FROM_ENTITY_ID_ASC',
  RelationsAverageFromEntityIdDesc = 'RELATIONS_AVERAGE_FROM_ENTITY_ID_DESC',
  RelationsAverageFromSpaceIdAsc = 'RELATIONS_AVERAGE_FROM_SPACE_ID_ASC',
  RelationsAverageFromSpaceIdDesc = 'RELATIONS_AVERAGE_FROM_SPACE_ID_DESC',
  RelationsAverageFromVersionIdAsc = 'RELATIONS_AVERAGE_FROM_VERSION_ID_ASC',
  RelationsAverageFromVersionIdDesc = 'RELATIONS_AVERAGE_FROM_VERSION_ID_DESC',
  RelationsAverageIdAsc = 'RELATIONS_AVERAGE_ID_ASC',
  RelationsAverageIdDesc = 'RELATIONS_AVERAGE_ID_DESC',
  RelationsAverageIsSystemAsc = 'RELATIONS_AVERAGE_IS_SYSTEM_ASC',
  RelationsAverageIsSystemDesc = 'RELATIONS_AVERAGE_IS_SYSTEM_DESC',
  RelationsAveragePositionAsc = 'RELATIONS_AVERAGE_POSITION_ASC',
  RelationsAveragePositionDesc = 'RELATIONS_AVERAGE_POSITION_DESC',
  RelationsAverageSpaceIdAsc = 'RELATIONS_AVERAGE_SPACE_ID_ASC',
  RelationsAverageSpaceIdDesc = 'RELATIONS_AVERAGE_SPACE_ID_DESC',
  RelationsAverageToEntityIdAsc = 'RELATIONS_AVERAGE_TO_ENTITY_ID_ASC',
  RelationsAverageToEntityIdDesc = 'RELATIONS_AVERAGE_TO_ENTITY_ID_DESC',
  RelationsAverageToSpaceIdAsc = 'RELATIONS_AVERAGE_TO_SPACE_ID_ASC',
  RelationsAverageToSpaceIdDesc = 'RELATIONS_AVERAGE_TO_SPACE_ID_DESC',
  RelationsAverageToVersionIdAsc = 'RELATIONS_AVERAGE_TO_VERSION_ID_ASC',
  RelationsAverageToVersionIdDesc = 'RELATIONS_AVERAGE_TO_VERSION_ID_DESC',
  RelationsAverageTypeIdAsc = 'RELATIONS_AVERAGE_TYPE_ID_ASC',
  RelationsAverageTypeIdDesc = 'RELATIONS_AVERAGE_TYPE_ID_DESC',
  RelationsAverageVerifiedAsc = 'RELATIONS_AVERAGE_VERIFIED_ASC',
  RelationsAverageVerifiedDesc = 'RELATIONS_AVERAGE_VERIFIED_DESC',
  RelationsByTypeIdConnectionAverageEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionAverageEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionAverageFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionAverageFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionAverageFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionAverageFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionAverageFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionAverageFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionAverageIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_ID_ASC',
  RelationsByTypeIdConnectionAverageIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_ID_DESC',
  RelationsByTypeIdConnectionAverageIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionAverageIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionAveragePositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_POSITION_ASC',
  RelationsByTypeIdConnectionAveragePositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_POSITION_DESC',
  RelationsByTypeIdConnectionAverageSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_SPACE_ID_ASC',
  RelationsByTypeIdConnectionAverageSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_SPACE_ID_DESC',
  RelationsByTypeIdConnectionAverageToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionAverageToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionAverageToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionAverageToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionAverageToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionAverageToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionAverageTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_TYPE_ID_ASC',
  RelationsByTypeIdConnectionAverageTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_TYPE_ID_DESC',
  RelationsByTypeIdConnectionAverageVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_VERIFIED_ASC',
  RelationsByTypeIdConnectionAverageVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_AVERAGE_VERIFIED_DESC',
  RelationsByTypeIdConnectionCountAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_COUNT_ASC',
  RelationsByTypeIdConnectionCountDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_COUNT_DESC',
  RelationsByTypeIdConnectionDistinctCountEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionDistinctCountIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionDistinctCountPositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_POSITION_ASC',
  RelationsByTypeIdConnectionDistinctCountPositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_POSITION_DESC',
  RelationsByTypeIdConnectionDistinctCountSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_SPACE_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_SPACE_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_TYPE_ID_ASC',
  RelationsByTypeIdConnectionDistinctCountTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_TYPE_ID_DESC',
  RelationsByTypeIdConnectionDistinctCountVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_VERIFIED_ASC',
  RelationsByTypeIdConnectionDistinctCountVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_DISTINCT_COUNT_VERIFIED_DESC',
  RelationsByTypeIdConnectionMaxEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionMaxEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionMaxFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionMaxFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionMaxFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionMaxFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionMaxFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionMaxFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionMaxIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_ID_ASC',
  RelationsByTypeIdConnectionMaxIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_ID_DESC',
  RelationsByTypeIdConnectionMaxIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionMaxIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionMaxPositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_POSITION_ASC',
  RelationsByTypeIdConnectionMaxPositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_POSITION_DESC',
  RelationsByTypeIdConnectionMaxSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_SPACE_ID_ASC',
  RelationsByTypeIdConnectionMaxSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_SPACE_ID_DESC',
  RelationsByTypeIdConnectionMaxToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionMaxToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionMaxToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionMaxToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionMaxToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionMaxToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionMaxTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_TYPE_ID_ASC',
  RelationsByTypeIdConnectionMaxTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_TYPE_ID_DESC',
  RelationsByTypeIdConnectionMaxVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_VERIFIED_ASC',
  RelationsByTypeIdConnectionMaxVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MAX_VERIFIED_DESC',
  RelationsByTypeIdConnectionMinEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionMinEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionMinFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionMinFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionMinFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionMinFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionMinFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionMinFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionMinIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_ID_ASC',
  RelationsByTypeIdConnectionMinIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_ID_DESC',
  RelationsByTypeIdConnectionMinIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionMinIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionMinPositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_POSITION_ASC',
  RelationsByTypeIdConnectionMinPositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_POSITION_DESC',
  RelationsByTypeIdConnectionMinSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_SPACE_ID_ASC',
  RelationsByTypeIdConnectionMinSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_SPACE_ID_DESC',
  RelationsByTypeIdConnectionMinToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionMinToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionMinToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionMinToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionMinToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionMinToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionMinTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_TYPE_ID_ASC',
  RelationsByTypeIdConnectionMinTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_TYPE_ID_DESC',
  RelationsByTypeIdConnectionMinVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_VERIFIED_ASC',
  RelationsByTypeIdConnectionMinVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_MIN_VERIFIED_DESC',
  RelationsByTypeIdConnectionStddevPopulationEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionStddevPopulationIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionStddevPopulationPositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_POSITION_ASC',
  RelationsByTypeIdConnectionStddevPopulationPositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_POSITION_DESC',
  RelationsByTypeIdConnectionStddevPopulationSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_SPACE_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_SPACE_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_TYPE_ID_ASC',
  RelationsByTypeIdConnectionStddevPopulationTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_TYPE_ID_DESC',
  RelationsByTypeIdConnectionStddevPopulationVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_VERIFIED_ASC',
  RelationsByTypeIdConnectionStddevPopulationVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_POPULATION_VERIFIED_DESC',
  RelationsByTypeIdConnectionStddevSampleEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionStddevSampleIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionStddevSamplePositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_POSITION_ASC',
  RelationsByTypeIdConnectionStddevSamplePositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_POSITION_DESC',
  RelationsByTypeIdConnectionStddevSampleSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_SPACE_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_SPACE_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_TYPE_ID_ASC',
  RelationsByTypeIdConnectionStddevSampleTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_TYPE_ID_DESC',
  RelationsByTypeIdConnectionStddevSampleVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_VERIFIED_ASC',
  RelationsByTypeIdConnectionStddevSampleVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_STDDEV_SAMPLE_VERIFIED_DESC',
  RelationsByTypeIdConnectionSumEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionSumEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionSumFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionSumFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionSumFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionSumFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionSumFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionSumFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionSumIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_ID_ASC',
  RelationsByTypeIdConnectionSumIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_ID_DESC',
  RelationsByTypeIdConnectionSumIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionSumIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionSumPositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_POSITION_ASC',
  RelationsByTypeIdConnectionSumPositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_POSITION_DESC',
  RelationsByTypeIdConnectionSumSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionSumSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionSumToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionSumToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionSumToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionSumToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionSumToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionSumToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionSumTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_TYPE_ID_ASC',
  RelationsByTypeIdConnectionSumTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_TYPE_ID_DESC',
  RelationsByTypeIdConnectionSumVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_VERIFIED_ASC',
  RelationsByTypeIdConnectionSumVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_SUM_VERIFIED_DESC',
  RelationsByTypeIdConnectionVariancePopulationEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionVariancePopulationIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionVariancePopulationPositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_POSITION_ASC',
  RelationsByTypeIdConnectionVariancePopulationPositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_POSITION_DESC',
  RelationsByTypeIdConnectionVariancePopulationSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_SPACE_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_SPACE_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_TYPE_ID_ASC',
  RelationsByTypeIdConnectionVariancePopulationTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_TYPE_ID_DESC',
  RelationsByTypeIdConnectionVariancePopulationVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_VERIFIED_ASC',
  RelationsByTypeIdConnectionVariancePopulationVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_POPULATION_VERIFIED_DESC',
  RelationsByTypeIdConnectionVarianceSampleEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleFromEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_FROM_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleFromEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_FROM_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleFromSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_FROM_SPACE_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleFromSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_FROM_SPACE_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleFromVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_FROM_VERSION_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleFromVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_FROM_VERSION_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleIsSystemAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_IS_SYSTEM_ASC',
  RelationsByTypeIdConnectionVarianceSampleIsSystemDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_IS_SYSTEM_DESC',
  RelationsByTypeIdConnectionVarianceSamplePositionAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_POSITION_ASC',
  RelationsByTypeIdConnectionVarianceSamplePositionDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_POSITION_DESC',
  RelationsByTypeIdConnectionVarianceSampleSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_SPACE_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_SPACE_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleToEntityIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_TO_ENTITY_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleToEntityIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_TO_ENTITY_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleToSpaceIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_TO_SPACE_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleToSpaceIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_TO_SPACE_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleToVersionIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_TO_VERSION_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleToVersionIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_TO_VERSION_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleTypeIdAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_TYPE_ID_ASC',
  RelationsByTypeIdConnectionVarianceSampleTypeIdDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_TYPE_ID_DESC',
  RelationsByTypeIdConnectionVarianceSampleVerifiedAsc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_VERIFIED_ASC',
  RelationsByTypeIdConnectionVarianceSampleVerifiedDesc = 'RELATIONS_BY_TYPE_ID_CONNECTION_VARIANCE_SAMPLE_VERIFIED_DESC',
  RelationsCountAsc = 'RELATIONS_COUNT_ASC',
  RelationsCountDesc = 'RELATIONS_COUNT_DESC',
  RelationsDistinctCountEntityIdAsc = 'RELATIONS_DISTINCT_COUNT_ENTITY_ID_ASC',
  RelationsDistinctCountEntityIdDesc = 'RELATIONS_DISTINCT_COUNT_ENTITY_ID_DESC',
  RelationsDistinctCountFromEntityIdAsc = 'RELATIONS_DISTINCT_COUNT_FROM_ENTITY_ID_ASC',
  RelationsDistinctCountFromEntityIdDesc = 'RELATIONS_DISTINCT_COUNT_FROM_ENTITY_ID_DESC',
  RelationsDistinctCountFromSpaceIdAsc = 'RELATIONS_DISTINCT_COUNT_FROM_SPACE_ID_ASC',
  RelationsDistinctCountFromSpaceIdDesc = 'RELATIONS_DISTINCT_COUNT_FROM_SPACE_ID_DESC',
  RelationsDistinctCountFromVersionIdAsc = 'RELATIONS_DISTINCT_COUNT_FROM_VERSION_ID_ASC',
  RelationsDistinctCountFromVersionIdDesc = 'RELATIONS_DISTINCT_COUNT_FROM_VERSION_ID_DESC',
  RelationsDistinctCountIdAsc = 'RELATIONS_DISTINCT_COUNT_ID_ASC',
  RelationsDistinctCountIdDesc = 'RELATIONS_DISTINCT_COUNT_ID_DESC',
  RelationsDistinctCountIsSystemAsc = 'RELATIONS_DISTINCT_COUNT_IS_SYSTEM_ASC',
  RelationsDistinctCountIsSystemDesc = 'RELATIONS_DISTINCT_COUNT_IS_SYSTEM_DESC',
  RelationsDistinctCountPositionAsc = 'RELATIONS_DISTINCT_COUNT_POSITION_ASC',
  RelationsDistinctCountPositionDesc = 'RELATIONS_DISTINCT_COUNT_POSITION_DESC',
  RelationsDistinctCountSpaceIdAsc = 'RELATIONS_DISTINCT_COUNT_SPACE_ID_ASC',
  RelationsDistinctCountSpaceIdDesc = 'RELATIONS_DISTINCT_COUNT_SPACE_ID_DESC',
  RelationsDistinctCountToEntityIdAsc = 'RELATIONS_DISTINCT_COUNT_TO_ENTITY_ID_ASC',
  RelationsDistinctCountToEntityIdDesc = 'RELATIONS_DISTINCT_COUNT_TO_ENTITY_ID_DESC',
  RelationsDistinctCountToSpaceIdAsc = 'RELATIONS_DISTINCT_COUNT_TO_SPACE_ID_ASC',
  RelationsDistinctCountToSpaceIdDesc = 'RELATIONS_DISTINCT_COUNT_TO_SPACE_ID_DESC',
  RelationsDistinctCountToVersionIdAsc = 'RELATIONS_DISTINCT_COUNT_TO_VERSION_ID_ASC',
  RelationsDistinctCountToVersionIdDesc = 'RELATIONS_DISTINCT_COUNT_TO_VERSION_ID_DESC',
  RelationsDistinctCountTypeIdAsc = 'RELATIONS_DISTINCT_COUNT_TYPE_ID_ASC',
  RelationsDistinctCountTypeIdDesc = 'RELATIONS_DISTINCT_COUNT_TYPE_ID_DESC',
  RelationsDistinctCountVerifiedAsc = 'RELATIONS_DISTINCT_COUNT_VERIFIED_ASC',
  RelationsDistinctCountVerifiedDesc = 'RELATIONS_DISTINCT_COUNT_VERIFIED_DESC',
  RelationsMaxEntityIdAsc = 'RELATIONS_MAX_ENTITY_ID_ASC',
  RelationsMaxEntityIdDesc = 'RELATIONS_MAX_ENTITY_ID_DESC',
  RelationsMaxFromEntityIdAsc = 'RELATIONS_MAX_FROM_ENTITY_ID_ASC',
  RelationsMaxFromEntityIdDesc = 'RELATIONS_MAX_FROM_ENTITY_ID_DESC',
  RelationsMaxFromSpaceIdAsc = 'RELATIONS_MAX_FROM_SPACE_ID_ASC',
  RelationsMaxFromSpaceIdDesc = 'RELATIONS_MAX_FROM_SPACE_ID_DESC',
  RelationsMaxFromVersionIdAsc = 'RELATIONS_MAX_FROM_VERSION_ID_ASC',
  RelationsMaxFromVersionIdDesc = 'RELATIONS_MAX_FROM_VERSION_ID_DESC',
  RelationsMaxIdAsc = 'RELATIONS_MAX_ID_ASC',
  RelationsMaxIdDesc = 'RELATIONS_MAX_ID_DESC',
  RelationsMaxIsSystemAsc = 'RELATIONS_MAX_IS_SYSTEM_ASC',
  RelationsMaxIsSystemDesc = 'RELATIONS_MAX_IS_SYSTEM_DESC',
  RelationsMaxPositionAsc = 'RELATIONS_MAX_POSITION_ASC',
  RelationsMaxPositionDesc = 'RELATIONS_MAX_POSITION_DESC',
  RelationsMaxSpaceIdAsc = 'RELATIONS_MAX_SPACE_ID_ASC',
  RelationsMaxSpaceIdDesc = 'RELATIONS_MAX_SPACE_ID_DESC',
  RelationsMaxToEntityIdAsc = 'RELATIONS_MAX_TO_ENTITY_ID_ASC',
  RelationsMaxToEntityIdDesc = 'RELATIONS_MAX_TO_ENTITY_ID_DESC',
  RelationsMaxToSpaceIdAsc = 'RELATIONS_MAX_TO_SPACE_ID_ASC',
  RelationsMaxToSpaceIdDesc = 'RELATIONS_MAX_TO_SPACE_ID_DESC',
  RelationsMaxToVersionIdAsc = 'RELATIONS_MAX_TO_VERSION_ID_ASC',
  RelationsMaxToVersionIdDesc = 'RELATIONS_MAX_TO_VERSION_ID_DESC',
  RelationsMaxTypeIdAsc = 'RELATIONS_MAX_TYPE_ID_ASC',
  RelationsMaxTypeIdDesc = 'RELATIONS_MAX_TYPE_ID_DESC',
  RelationsMaxVerifiedAsc = 'RELATIONS_MAX_VERIFIED_ASC',
  RelationsMaxVerifiedDesc = 'RELATIONS_MAX_VERIFIED_DESC',
  RelationsMinEntityIdAsc = 'RELATIONS_MIN_ENTITY_ID_ASC',
  RelationsMinEntityIdDesc = 'RELATIONS_MIN_ENTITY_ID_DESC',
  RelationsMinFromEntityIdAsc = 'RELATIONS_MIN_FROM_ENTITY_ID_ASC',
  RelationsMinFromEntityIdDesc = 'RELATIONS_MIN_FROM_ENTITY_ID_DESC',
  RelationsMinFromSpaceIdAsc = 'RELATIONS_MIN_FROM_SPACE_ID_ASC',
  RelationsMinFromSpaceIdDesc = 'RELATIONS_MIN_FROM_SPACE_ID_DESC',
  RelationsMinFromVersionIdAsc = 'RELATIONS_MIN_FROM_VERSION_ID_ASC',
  RelationsMinFromVersionIdDesc = 'RELATIONS_MIN_FROM_VERSION_ID_DESC',
  RelationsMinIdAsc = 'RELATIONS_MIN_ID_ASC',
  RelationsMinIdDesc = 'RELATIONS_MIN_ID_DESC',
  RelationsMinIsSystemAsc = 'RELATIONS_MIN_IS_SYSTEM_ASC',
  RelationsMinIsSystemDesc = 'RELATIONS_MIN_IS_SYSTEM_DESC',
  RelationsMinPositionAsc = 'RELATIONS_MIN_POSITION_ASC',
  RelationsMinPositionDesc = 'RELATIONS_MIN_POSITION_DESC',
  RelationsMinSpaceIdAsc = 'RELATIONS_MIN_SPACE_ID_ASC',
  RelationsMinSpaceIdDesc = 'RELATIONS_MIN_SPACE_ID_DESC',
  RelationsMinToEntityIdAsc = 'RELATIONS_MIN_TO_ENTITY_ID_ASC',
  RelationsMinToEntityIdDesc = 'RELATIONS_MIN_TO_ENTITY_ID_DESC',
  RelationsMinToSpaceIdAsc = 'RELATIONS_MIN_TO_SPACE_ID_ASC',
  RelationsMinToSpaceIdDesc = 'RELATIONS_MIN_TO_SPACE_ID_DESC',
  RelationsMinToVersionIdAsc = 'RELATIONS_MIN_TO_VERSION_ID_ASC',
  RelationsMinToVersionIdDesc = 'RELATIONS_MIN_TO_VERSION_ID_DESC',
  RelationsMinTypeIdAsc = 'RELATIONS_MIN_TYPE_ID_ASC',
  RelationsMinTypeIdDesc = 'RELATIONS_MIN_TYPE_ID_DESC',
  RelationsMinVerifiedAsc = 'RELATIONS_MIN_VERIFIED_ASC',
  RelationsMinVerifiedDesc = 'RELATIONS_MIN_VERIFIED_DESC',
  RelationsStddevPopulationEntityIdAsc = 'RELATIONS_STDDEV_POPULATION_ENTITY_ID_ASC',
  RelationsStddevPopulationEntityIdDesc = 'RELATIONS_STDDEV_POPULATION_ENTITY_ID_DESC',
  RelationsStddevPopulationFromEntityIdAsc = 'RELATIONS_STDDEV_POPULATION_FROM_ENTITY_ID_ASC',
  RelationsStddevPopulationFromEntityIdDesc = 'RELATIONS_STDDEV_POPULATION_FROM_ENTITY_ID_DESC',
  RelationsStddevPopulationFromSpaceIdAsc = 'RELATIONS_STDDEV_POPULATION_FROM_SPACE_ID_ASC',
  RelationsStddevPopulationFromSpaceIdDesc = 'RELATIONS_STDDEV_POPULATION_FROM_SPACE_ID_DESC',
  RelationsStddevPopulationFromVersionIdAsc = 'RELATIONS_STDDEV_POPULATION_FROM_VERSION_ID_ASC',
  RelationsStddevPopulationFromVersionIdDesc = 'RELATIONS_STDDEV_POPULATION_FROM_VERSION_ID_DESC',
  RelationsStddevPopulationIdAsc = 'RELATIONS_STDDEV_POPULATION_ID_ASC',
  RelationsStddevPopulationIdDesc = 'RELATIONS_STDDEV_POPULATION_ID_DESC',
  RelationsStddevPopulationIsSystemAsc = 'RELATIONS_STDDEV_POPULATION_IS_SYSTEM_ASC',
  RelationsStddevPopulationIsSystemDesc = 'RELATIONS_STDDEV_POPULATION_IS_SYSTEM_DESC',
  RelationsStddevPopulationPositionAsc = 'RELATIONS_STDDEV_POPULATION_POSITION_ASC',
  RelationsStddevPopulationPositionDesc = 'RELATIONS_STDDEV_POPULATION_POSITION_DESC',
  RelationsStddevPopulationSpaceIdAsc = 'RELATIONS_STDDEV_POPULATION_SPACE_ID_ASC',
  RelationsStddevPopulationSpaceIdDesc = 'RELATIONS_STDDEV_POPULATION_SPACE_ID_DESC',
  RelationsStddevPopulationToEntityIdAsc = 'RELATIONS_STDDEV_POPULATION_TO_ENTITY_ID_ASC',
  RelationsStddevPopulationToEntityIdDesc = 'RELATIONS_STDDEV_POPULATION_TO_ENTITY_ID_DESC',
  RelationsStddevPopulationToSpaceIdAsc = 'RELATIONS_STDDEV_POPULATION_TO_SPACE_ID_ASC',
  RelationsStddevPopulationToSpaceIdDesc = 'RELATIONS_STDDEV_POPULATION_TO_SPACE_ID_DESC',
  RelationsStddevPopulationToVersionIdAsc = 'RELATIONS_STDDEV_POPULATION_TO_VERSION_ID_ASC',
  RelationsStddevPopulationToVersionIdDesc = 'RELATIONS_STDDEV_POPULATION_TO_VERSION_ID_DESC',
  RelationsStddevPopulationTypeIdAsc = 'RELATIONS_STDDEV_POPULATION_TYPE_ID_ASC',
  RelationsStddevPopulationTypeIdDesc = 'RELATIONS_STDDEV_POPULATION_TYPE_ID_DESC',
  RelationsStddevPopulationVerifiedAsc = 'RELATIONS_STDDEV_POPULATION_VERIFIED_ASC',
  RelationsStddevPopulationVerifiedDesc = 'RELATIONS_STDDEV_POPULATION_VERIFIED_DESC',
  RelationsStddevSampleEntityIdAsc = 'RELATIONS_STDDEV_SAMPLE_ENTITY_ID_ASC',
  RelationsStddevSampleEntityIdDesc = 'RELATIONS_STDDEV_SAMPLE_ENTITY_ID_DESC',
  RelationsStddevSampleFromEntityIdAsc = 'RELATIONS_STDDEV_SAMPLE_FROM_ENTITY_ID_ASC',
  RelationsStddevSampleFromEntityIdDesc = 'RELATIONS_STDDEV_SAMPLE_FROM_ENTITY_ID_DESC',
  RelationsStddevSampleFromSpaceIdAsc = 'RELATIONS_STDDEV_SAMPLE_FROM_SPACE_ID_ASC',
  RelationsStddevSampleFromSpaceIdDesc = 'RELATIONS_STDDEV_SAMPLE_FROM_SPACE_ID_DESC',
  RelationsStddevSampleFromVersionIdAsc = 'RELATIONS_STDDEV_SAMPLE_FROM_VERSION_ID_ASC',
  RelationsStddevSampleFromVersionIdDesc = 'RELATIONS_STDDEV_SAMPLE_FROM_VERSION_ID_DESC',
  RelationsStddevSampleIdAsc = 'RELATIONS_STDDEV_SAMPLE_ID_ASC',
  RelationsStddevSampleIdDesc = 'RELATIONS_STDDEV_SAMPLE_ID_DESC',
  RelationsStddevSampleIsSystemAsc = 'RELATIONS_STDDEV_SAMPLE_IS_SYSTEM_ASC',
  RelationsStddevSampleIsSystemDesc = 'RELATIONS_STDDEV_SAMPLE_IS_SYSTEM_DESC',
  RelationsStddevSamplePositionAsc = 'RELATIONS_STDDEV_SAMPLE_POSITION_ASC',
  RelationsStddevSamplePositionDesc = 'RELATIONS_STDDEV_SAMPLE_POSITION_DESC',
  RelationsStddevSampleSpaceIdAsc = 'RELATIONS_STDDEV_SAMPLE_SPACE_ID_ASC',
  RelationsStddevSampleSpaceIdDesc = 'RELATIONS_STDDEV_SAMPLE_SPACE_ID_DESC',
  RelationsStddevSampleToEntityIdAsc = 'RELATIONS_STDDEV_SAMPLE_TO_ENTITY_ID_ASC',
  RelationsStddevSampleToEntityIdDesc = 'RELATIONS_STDDEV_SAMPLE_TO_ENTITY_ID_DESC',
  RelationsStddevSampleToSpaceIdAsc = 'RELATIONS_STDDEV_SAMPLE_TO_SPACE_ID_ASC',
  RelationsStddevSampleToSpaceIdDesc = 'RELATIONS_STDDEV_SAMPLE_TO_SPACE_ID_DESC',
  RelationsStddevSampleToVersionIdAsc = 'RELATIONS_STDDEV_SAMPLE_TO_VERSION_ID_ASC',
  RelationsStddevSampleToVersionIdDesc = 'RELATIONS_STDDEV_SAMPLE_TO_VERSION_ID_DESC',
  RelationsStddevSampleTypeIdAsc = 'RELATIONS_STDDEV_SAMPLE_TYPE_ID_ASC',
  RelationsStddevSampleTypeIdDesc = 'RELATIONS_STDDEV_SAMPLE_TYPE_ID_DESC',
  RelationsStddevSampleVerifiedAsc = 'RELATIONS_STDDEV_SAMPLE_VERIFIED_ASC',
  RelationsStddevSampleVerifiedDesc = 'RELATIONS_STDDEV_SAMPLE_VERIFIED_DESC',
  RelationsSumEntityIdAsc = 'RELATIONS_SUM_ENTITY_ID_ASC',
  RelationsSumEntityIdDesc = 'RELATIONS_SUM_ENTITY_ID_DESC',
  RelationsSumFromEntityIdAsc = 'RELATIONS_SUM_FROM_ENTITY_ID_ASC',
  RelationsSumFromEntityIdDesc = 'RELATIONS_SUM_FROM_ENTITY_ID_DESC',
  RelationsSumFromSpaceIdAsc = 'RELATIONS_SUM_FROM_SPACE_ID_ASC',
  RelationsSumFromSpaceIdDesc = 'RELATIONS_SUM_FROM_SPACE_ID_DESC',
  RelationsSumFromVersionIdAsc = 'RELATIONS_SUM_FROM_VERSION_ID_ASC',
  RelationsSumFromVersionIdDesc = 'RELATIONS_SUM_FROM_VERSION_ID_DESC',
  RelationsSumIdAsc = 'RELATIONS_SUM_ID_ASC',
  RelationsSumIdDesc = 'RELATIONS_SUM_ID_DESC',
  RelationsSumIsSystemAsc = 'RELATIONS_SUM_IS_SYSTEM_ASC',
  RelationsSumIsSystemDesc = 'RELATIONS_SUM_IS_SYSTEM_DESC',
  RelationsSumPositionAsc = 'RELATIONS_SUM_POSITION_ASC',
  RelationsSumPositionDesc = 'RELATIONS_SUM_POSITION_DESC',
  RelationsSumSpaceIdAsc = 'RELATIONS_SUM_SPACE_ID_ASC',
  RelationsSumSpaceIdDesc = 'RELATIONS_SUM_SPACE_ID_DESC',
  RelationsSumToEntityIdAsc = 'RELATIONS_SUM_TO_ENTITY_ID_ASC',
  RelationsSumToEntityIdDesc = 'RELATIONS_SUM_TO_ENTITY_ID_DESC',
  RelationsSumToSpaceIdAsc = 'RELATIONS_SUM_TO_SPACE_ID_ASC',
  RelationsSumToSpaceIdDesc = 'RELATIONS_SUM_TO_SPACE_ID_DESC',
  RelationsSumToVersionIdAsc = 'RELATIONS_SUM_TO_VERSION_ID_ASC',
  RelationsSumToVersionIdDesc = 'RELATIONS_SUM_TO_VERSION_ID_DESC',
  RelationsSumTypeIdAsc = 'RELATIONS_SUM_TYPE_ID_ASC',
  RelationsSumTypeIdDesc = 'RELATIONS_SUM_TYPE_ID_DESC',
  RelationsSumVerifiedAsc = 'RELATIONS_SUM_VERIFIED_ASC',
  RelationsSumVerifiedDesc = 'RELATIONS_SUM_VERIFIED_DESC',
  RelationsVariancePopulationEntityIdAsc = 'RELATIONS_VARIANCE_POPULATION_ENTITY_ID_ASC',
  RelationsVariancePopulationEntityIdDesc = 'RELATIONS_VARIANCE_POPULATION_ENTITY_ID_DESC',
  RelationsVariancePopulationFromEntityIdAsc = 'RELATIONS_VARIANCE_POPULATION_FROM_ENTITY_ID_ASC',
  RelationsVariancePopulationFromEntityIdDesc = 'RELATIONS_VARIANCE_POPULATION_FROM_ENTITY_ID_DESC',
  RelationsVariancePopulationFromSpaceIdAsc = 'RELATIONS_VARIANCE_POPULATION_FROM_SPACE_ID_ASC',
  RelationsVariancePopulationFromSpaceIdDesc = 'RELATIONS_VARIANCE_POPULATION_FROM_SPACE_ID_DESC',
  RelationsVariancePopulationFromVersionIdAsc = 'RELATIONS_VARIANCE_POPULATION_FROM_VERSION_ID_ASC',
  RelationsVariancePopulationFromVersionIdDesc = 'RELATIONS_VARIANCE_POPULATION_FROM_VERSION_ID_DESC',
  RelationsVariancePopulationIdAsc = 'RELATIONS_VARIANCE_POPULATION_ID_ASC',
  RelationsVariancePopulationIdDesc = 'RELATIONS_VARIANCE_POPULATION_ID_DESC',
  RelationsVariancePopulationIsSystemAsc = 'RELATIONS_VARIANCE_POPULATION_IS_SYSTEM_ASC',
  RelationsVariancePopulationIsSystemDesc = 'RELATIONS_VARIANCE_POPULATION_IS_SYSTEM_DESC',
  RelationsVariancePopulationPositionAsc = 'RELATIONS_VARIANCE_POPULATION_POSITION_ASC',
  RelationsVariancePopulationPositionDesc = 'RELATIONS_VARIANCE_POPULATION_POSITION_DESC',
  RelationsVariancePopulationSpaceIdAsc = 'RELATIONS_VARIANCE_POPULATION_SPACE_ID_ASC',
  RelationsVariancePopulationSpaceIdDesc = 'RELATIONS_VARIANCE_POPULATION_SPACE_ID_DESC',
  RelationsVariancePopulationToEntityIdAsc = 'RELATIONS_VARIANCE_POPULATION_TO_ENTITY_ID_ASC',
  RelationsVariancePopulationToEntityIdDesc = 'RELATIONS_VARIANCE_POPULATION_TO_ENTITY_ID_DESC',
  RelationsVariancePopulationToSpaceIdAsc = 'RELATIONS_VARIANCE_POPULATION_TO_SPACE_ID_ASC',
  RelationsVariancePopulationToSpaceIdDesc = 'RELATIONS_VARIANCE_POPULATION_TO_SPACE_ID_DESC',
  RelationsVariancePopulationToVersionIdAsc = 'RELATIONS_VARIANCE_POPULATION_TO_VERSION_ID_ASC',
  RelationsVariancePopulationToVersionIdDesc = 'RELATIONS_VARIANCE_POPULATION_TO_VERSION_ID_DESC',
  RelationsVariancePopulationTypeIdAsc = 'RELATIONS_VARIANCE_POPULATION_TYPE_ID_ASC',
  RelationsVariancePopulationTypeIdDesc = 'RELATIONS_VARIANCE_POPULATION_TYPE_ID_DESC',
  RelationsVariancePopulationVerifiedAsc = 'RELATIONS_VARIANCE_POPULATION_VERIFIED_ASC',
  RelationsVariancePopulationVerifiedDesc = 'RELATIONS_VARIANCE_POPULATION_VERIFIED_DESC',
  RelationsVarianceSampleEntityIdAsc = 'RELATIONS_VARIANCE_SAMPLE_ENTITY_ID_ASC',
  RelationsVarianceSampleEntityIdDesc = 'RELATIONS_VARIANCE_SAMPLE_ENTITY_ID_DESC',
  RelationsVarianceSampleFromEntityIdAsc = 'RELATIONS_VARIANCE_SAMPLE_FROM_ENTITY_ID_ASC',
  RelationsVarianceSampleFromEntityIdDesc = 'RELATIONS_VARIANCE_SAMPLE_FROM_ENTITY_ID_DESC',
  RelationsVarianceSampleFromSpaceIdAsc = 'RELATIONS_VARIANCE_SAMPLE_FROM_SPACE_ID_ASC',
  RelationsVarianceSampleFromSpaceIdDesc = 'RELATIONS_VARIANCE_SAMPLE_FROM_SPACE_ID_DESC',
  RelationsVarianceSampleFromVersionIdAsc = 'RELATIONS_VARIANCE_SAMPLE_FROM_VERSION_ID_ASC',
  RelationsVarianceSampleFromVersionIdDesc = 'RELATIONS_VARIANCE_SAMPLE_FROM_VERSION_ID_DESC',
  RelationsVarianceSampleIdAsc = 'RELATIONS_VARIANCE_SAMPLE_ID_ASC',
  RelationsVarianceSampleIdDesc = 'RELATIONS_VARIANCE_SAMPLE_ID_DESC',
  RelationsVarianceSampleIsSystemAsc = 'RELATIONS_VARIANCE_SAMPLE_IS_SYSTEM_ASC',
  RelationsVarianceSampleIsSystemDesc = 'RELATIONS_VARIANCE_SAMPLE_IS_SYSTEM_DESC',
  RelationsVarianceSamplePositionAsc = 'RELATIONS_VARIANCE_SAMPLE_POSITION_ASC',
  RelationsVarianceSamplePositionDesc = 'RELATIONS_VARIANCE_SAMPLE_POSITION_DESC',
  RelationsVarianceSampleSpaceIdAsc = 'RELATIONS_VARIANCE_SAMPLE_SPACE_ID_ASC',
  RelationsVarianceSampleSpaceIdDesc = 'RELATIONS_VARIANCE_SAMPLE_SPACE_ID_DESC',
  RelationsVarianceSampleToEntityIdAsc = 'RELATIONS_VARIANCE_SAMPLE_TO_ENTITY_ID_ASC',
  RelationsVarianceSampleToEntityIdDesc = 'RELATIONS_VARIANCE_SAMPLE_TO_ENTITY_ID_DESC',
  RelationsVarianceSampleToSpaceIdAsc = 'RELATIONS_VARIANCE_SAMPLE_TO_SPACE_ID_ASC',
  RelationsVarianceSampleToSpaceIdDesc = 'RELATIONS_VARIANCE_SAMPLE_TO_SPACE_ID_DESC',
  RelationsVarianceSampleToVersionIdAsc = 'RELATIONS_VARIANCE_SAMPLE_TO_VERSION_ID_ASC',
  RelationsVarianceSampleToVersionIdDesc = 'RELATIONS_VARIANCE_SAMPLE_TO_VERSION_ID_DESC',
  RelationsVarianceSampleTypeIdAsc = 'RELATIONS_VARIANCE_SAMPLE_TYPE_ID_ASC',
  RelationsVarianceSampleTypeIdDesc = 'RELATIONS_VARIANCE_SAMPLE_TYPE_ID_DESC',
  RelationsVarianceSampleVerifiedAsc = 'RELATIONS_VARIANCE_SAMPLE_VERIFIED_ASC',
  RelationsVarianceSampleVerifiedDesc = 'RELATIONS_VARIANCE_SAMPLE_VERIFIED_DESC',
  RelationsWhereEntityAverageEntityIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_ENTITY_ID_ASC',
  RelationsWhereEntityAverageEntityIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_ENTITY_ID_DESC',
  RelationsWhereEntityAverageFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_FROM_ENTITY_ID_ASC',
  RelationsWhereEntityAverageFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_FROM_ENTITY_ID_DESC',
  RelationsWhereEntityAverageFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_FROM_SPACE_ID_ASC',
  RelationsWhereEntityAverageFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_FROM_SPACE_ID_DESC',
  RelationsWhereEntityAverageFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_FROM_VERSION_ID_ASC',
  RelationsWhereEntityAverageFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_FROM_VERSION_ID_DESC',
  RelationsWhereEntityAverageIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_ID_ASC',
  RelationsWhereEntityAverageIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_ID_DESC',
  RelationsWhereEntityAverageIsSystemAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_IS_SYSTEM_ASC',
  RelationsWhereEntityAverageIsSystemDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_IS_SYSTEM_DESC',
  RelationsWhereEntityAveragePositionAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_POSITION_ASC',
  RelationsWhereEntityAveragePositionDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_POSITION_DESC',
  RelationsWhereEntityAverageSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_SPACE_ID_ASC',
  RelationsWhereEntityAverageSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_SPACE_ID_DESC',
  RelationsWhereEntityAverageToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_TO_ENTITY_ID_ASC',
  RelationsWhereEntityAverageToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_TO_ENTITY_ID_DESC',
  RelationsWhereEntityAverageToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_TO_SPACE_ID_ASC',
  RelationsWhereEntityAverageToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_TO_SPACE_ID_DESC',
  RelationsWhereEntityAverageToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_TO_VERSION_ID_ASC',
  RelationsWhereEntityAverageToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_TO_VERSION_ID_DESC',
  RelationsWhereEntityAverageTypeIdAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_TYPE_ID_ASC',
  RelationsWhereEntityAverageTypeIdDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_TYPE_ID_DESC',
  RelationsWhereEntityAverageVerifiedAsc = 'RELATIONS_WHERE_ENTITY_AVERAGE_VERIFIED_ASC',
  RelationsWhereEntityAverageVerifiedDesc = 'RELATIONS_WHERE_ENTITY_AVERAGE_VERIFIED_DESC',
  RelationsWhereEntityCountAsc = 'RELATIONS_WHERE_ENTITY_COUNT_ASC',
  RelationsWhereEntityCountDesc = 'RELATIONS_WHERE_ENTITY_COUNT_DESC',
  RelationsWhereEntityDistinctCountEntityIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_ENTITY_ID_ASC',
  RelationsWhereEntityDistinctCountEntityIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_ENTITY_ID_DESC',
  RelationsWhereEntityDistinctCountFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_FROM_ENTITY_ID_ASC',
  RelationsWhereEntityDistinctCountFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_FROM_ENTITY_ID_DESC',
  RelationsWhereEntityDistinctCountFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_FROM_SPACE_ID_ASC',
  RelationsWhereEntityDistinctCountFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_FROM_SPACE_ID_DESC',
  RelationsWhereEntityDistinctCountFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_FROM_VERSION_ID_ASC',
  RelationsWhereEntityDistinctCountFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_FROM_VERSION_ID_DESC',
  RelationsWhereEntityDistinctCountIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_ID_ASC',
  RelationsWhereEntityDistinctCountIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_ID_DESC',
  RelationsWhereEntityDistinctCountIsSystemAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_IS_SYSTEM_ASC',
  RelationsWhereEntityDistinctCountIsSystemDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_IS_SYSTEM_DESC',
  RelationsWhereEntityDistinctCountPositionAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_POSITION_ASC',
  RelationsWhereEntityDistinctCountPositionDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_POSITION_DESC',
  RelationsWhereEntityDistinctCountSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_SPACE_ID_ASC',
  RelationsWhereEntityDistinctCountSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_SPACE_ID_DESC',
  RelationsWhereEntityDistinctCountToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_TO_ENTITY_ID_ASC',
  RelationsWhereEntityDistinctCountToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_TO_ENTITY_ID_DESC',
  RelationsWhereEntityDistinctCountToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_TO_SPACE_ID_ASC',
  RelationsWhereEntityDistinctCountToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_TO_SPACE_ID_DESC',
  RelationsWhereEntityDistinctCountToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_TO_VERSION_ID_ASC',
  RelationsWhereEntityDistinctCountToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_TO_VERSION_ID_DESC',
  RelationsWhereEntityDistinctCountTypeIdAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_TYPE_ID_ASC',
  RelationsWhereEntityDistinctCountTypeIdDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_TYPE_ID_DESC',
  RelationsWhereEntityDistinctCountVerifiedAsc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_VERIFIED_ASC',
  RelationsWhereEntityDistinctCountVerifiedDesc = 'RELATIONS_WHERE_ENTITY_DISTINCT_COUNT_VERIFIED_DESC',
  RelationsWhereEntityMaxEntityIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_ENTITY_ID_ASC',
  RelationsWhereEntityMaxEntityIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_ENTITY_ID_DESC',
  RelationsWhereEntityMaxFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_FROM_ENTITY_ID_ASC',
  RelationsWhereEntityMaxFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_FROM_ENTITY_ID_DESC',
  RelationsWhereEntityMaxFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_FROM_SPACE_ID_ASC',
  RelationsWhereEntityMaxFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_FROM_SPACE_ID_DESC',
  RelationsWhereEntityMaxFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_FROM_VERSION_ID_ASC',
  RelationsWhereEntityMaxFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_FROM_VERSION_ID_DESC',
  RelationsWhereEntityMaxIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_ID_ASC',
  RelationsWhereEntityMaxIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_ID_DESC',
  RelationsWhereEntityMaxIsSystemAsc = 'RELATIONS_WHERE_ENTITY_MAX_IS_SYSTEM_ASC',
  RelationsWhereEntityMaxIsSystemDesc = 'RELATIONS_WHERE_ENTITY_MAX_IS_SYSTEM_DESC',
  RelationsWhereEntityMaxPositionAsc = 'RELATIONS_WHERE_ENTITY_MAX_POSITION_ASC',
  RelationsWhereEntityMaxPositionDesc = 'RELATIONS_WHERE_ENTITY_MAX_POSITION_DESC',
  RelationsWhereEntityMaxSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_SPACE_ID_ASC',
  RelationsWhereEntityMaxSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_SPACE_ID_DESC',
  RelationsWhereEntityMaxToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_TO_ENTITY_ID_ASC',
  RelationsWhereEntityMaxToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_TO_ENTITY_ID_DESC',
  RelationsWhereEntityMaxToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_TO_SPACE_ID_ASC',
  RelationsWhereEntityMaxToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_TO_SPACE_ID_DESC',
  RelationsWhereEntityMaxToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_TO_VERSION_ID_ASC',
  RelationsWhereEntityMaxToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_TO_VERSION_ID_DESC',
  RelationsWhereEntityMaxTypeIdAsc = 'RELATIONS_WHERE_ENTITY_MAX_TYPE_ID_ASC',
  RelationsWhereEntityMaxTypeIdDesc = 'RELATIONS_WHERE_ENTITY_MAX_TYPE_ID_DESC',
  RelationsWhereEntityMaxVerifiedAsc = 'RELATIONS_WHERE_ENTITY_MAX_VERIFIED_ASC',
  RelationsWhereEntityMaxVerifiedDesc = 'RELATIONS_WHERE_ENTITY_MAX_VERIFIED_DESC',
  RelationsWhereEntityMinEntityIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_ENTITY_ID_ASC',
  RelationsWhereEntityMinEntityIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_ENTITY_ID_DESC',
  RelationsWhereEntityMinFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_FROM_ENTITY_ID_ASC',
  RelationsWhereEntityMinFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_FROM_ENTITY_ID_DESC',
  RelationsWhereEntityMinFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_FROM_SPACE_ID_ASC',
  RelationsWhereEntityMinFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_FROM_SPACE_ID_DESC',
  RelationsWhereEntityMinFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_FROM_VERSION_ID_ASC',
  RelationsWhereEntityMinFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_FROM_VERSION_ID_DESC',
  RelationsWhereEntityMinIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_ID_ASC',
  RelationsWhereEntityMinIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_ID_DESC',
  RelationsWhereEntityMinIsSystemAsc = 'RELATIONS_WHERE_ENTITY_MIN_IS_SYSTEM_ASC',
  RelationsWhereEntityMinIsSystemDesc = 'RELATIONS_WHERE_ENTITY_MIN_IS_SYSTEM_DESC',
  RelationsWhereEntityMinPositionAsc = 'RELATIONS_WHERE_ENTITY_MIN_POSITION_ASC',
  RelationsWhereEntityMinPositionDesc = 'RELATIONS_WHERE_ENTITY_MIN_POSITION_DESC',
  RelationsWhereEntityMinSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_SPACE_ID_ASC',
  RelationsWhereEntityMinSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_SPACE_ID_DESC',
  RelationsWhereEntityMinToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_TO_ENTITY_ID_ASC',
  RelationsWhereEntityMinToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_TO_ENTITY_ID_DESC',
  RelationsWhereEntityMinToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_TO_SPACE_ID_ASC',
  RelationsWhereEntityMinToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_TO_SPACE_ID_DESC',
  RelationsWhereEntityMinToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_TO_VERSION_ID_ASC',
  RelationsWhereEntityMinToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_TO_VERSION_ID_DESC',
  RelationsWhereEntityMinTypeIdAsc = 'RELATIONS_WHERE_ENTITY_MIN_TYPE_ID_ASC',
  RelationsWhereEntityMinTypeIdDesc = 'RELATIONS_WHERE_ENTITY_MIN_TYPE_ID_DESC',
  RelationsWhereEntityMinVerifiedAsc = 'RELATIONS_WHERE_ENTITY_MIN_VERIFIED_ASC',
  RelationsWhereEntityMinVerifiedDesc = 'RELATIONS_WHERE_ENTITY_MIN_VERIFIED_DESC',
  RelationsWhereEntityStddevPopulationEntityIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_ENTITY_ID_ASC',
  RelationsWhereEntityStddevPopulationEntityIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_ENTITY_ID_DESC',
  RelationsWhereEntityStddevPopulationFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_FROM_ENTITY_ID_ASC',
  RelationsWhereEntityStddevPopulationFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_FROM_ENTITY_ID_DESC',
  RelationsWhereEntityStddevPopulationFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_FROM_SPACE_ID_ASC',
  RelationsWhereEntityStddevPopulationFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_FROM_SPACE_ID_DESC',
  RelationsWhereEntityStddevPopulationFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_FROM_VERSION_ID_ASC',
  RelationsWhereEntityStddevPopulationFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_FROM_VERSION_ID_DESC',
  RelationsWhereEntityStddevPopulationIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_ID_ASC',
  RelationsWhereEntityStddevPopulationIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_ID_DESC',
  RelationsWhereEntityStddevPopulationIsSystemAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_IS_SYSTEM_ASC',
  RelationsWhereEntityStddevPopulationIsSystemDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_IS_SYSTEM_DESC',
  RelationsWhereEntityStddevPopulationPositionAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_POSITION_ASC',
  RelationsWhereEntityStddevPopulationPositionDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_POSITION_DESC',
  RelationsWhereEntityStddevPopulationSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_SPACE_ID_ASC',
  RelationsWhereEntityStddevPopulationSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_SPACE_ID_DESC',
  RelationsWhereEntityStddevPopulationToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_TO_ENTITY_ID_ASC',
  RelationsWhereEntityStddevPopulationToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_TO_ENTITY_ID_DESC',
  RelationsWhereEntityStddevPopulationToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_TO_SPACE_ID_ASC',
  RelationsWhereEntityStddevPopulationToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_TO_SPACE_ID_DESC',
  RelationsWhereEntityStddevPopulationToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_TO_VERSION_ID_ASC',
  RelationsWhereEntityStddevPopulationToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_TO_VERSION_ID_DESC',
  RelationsWhereEntityStddevPopulationTypeIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_TYPE_ID_ASC',
  RelationsWhereEntityStddevPopulationTypeIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_TYPE_ID_DESC',
  RelationsWhereEntityStddevPopulationVerifiedAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_VERIFIED_ASC',
  RelationsWhereEntityStddevPopulationVerifiedDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_POPULATION_VERIFIED_DESC',
  RelationsWhereEntityStddevSampleEntityIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_ENTITY_ID_ASC',
  RelationsWhereEntityStddevSampleEntityIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_ENTITY_ID_DESC',
  RelationsWhereEntityStddevSampleFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_FROM_ENTITY_ID_ASC',
  RelationsWhereEntityStddevSampleFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_FROM_ENTITY_ID_DESC',
  RelationsWhereEntityStddevSampleFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_FROM_SPACE_ID_ASC',
  RelationsWhereEntityStddevSampleFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_FROM_SPACE_ID_DESC',
  RelationsWhereEntityStddevSampleFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_FROM_VERSION_ID_ASC',
  RelationsWhereEntityStddevSampleFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_FROM_VERSION_ID_DESC',
  RelationsWhereEntityStddevSampleIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_ID_ASC',
  RelationsWhereEntityStddevSampleIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_ID_DESC',
  RelationsWhereEntityStddevSampleIsSystemAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_IS_SYSTEM_ASC',
  RelationsWhereEntityStddevSampleIsSystemDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_IS_SYSTEM_DESC',
  RelationsWhereEntityStddevSamplePositionAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_POSITION_ASC',
  RelationsWhereEntityStddevSamplePositionDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_POSITION_DESC',
  RelationsWhereEntityStddevSampleSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_SPACE_ID_ASC',
  RelationsWhereEntityStddevSampleSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_SPACE_ID_DESC',
  RelationsWhereEntityStddevSampleToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_TO_ENTITY_ID_ASC',
  RelationsWhereEntityStddevSampleToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_TO_ENTITY_ID_DESC',
  RelationsWhereEntityStddevSampleToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_TO_SPACE_ID_ASC',
  RelationsWhereEntityStddevSampleToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_TO_SPACE_ID_DESC',
  RelationsWhereEntityStddevSampleToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_TO_VERSION_ID_ASC',
  RelationsWhereEntityStddevSampleToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_TO_VERSION_ID_DESC',
  RelationsWhereEntityStddevSampleTypeIdAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_TYPE_ID_ASC',
  RelationsWhereEntityStddevSampleTypeIdDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_TYPE_ID_DESC',
  RelationsWhereEntityStddevSampleVerifiedAsc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_VERIFIED_ASC',
  RelationsWhereEntityStddevSampleVerifiedDesc = 'RELATIONS_WHERE_ENTITY_STDDEV_SAMPLE_VERIFIED_DESC',
  RelationsWhereEntitySumEntityIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_ENTITY_ID_ASC',
  RelationsWhereEntitySumEntityIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_ENTITY_ID_DESC',
  RelationsWhereEntitySumFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_FROM_ENTITY_ID_ASC',
  RelationsWhereEntitySumFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_FROM_ENTITY_ID_DESC',
  RelationsWhereEntitySumFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_FROM_SPACE_ID_ASC',
  RelationsWhereEntitySumFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_FROM_SPACE_ID_DESC',
  RelationsWhereEntitySumFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_FROM_VERSION_ID_ASC',
  RelationsWhereEntitySumFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_FROM_VERSION_ID_DESC',
  RelationsWhereEntitySumIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_ID_ASC',
  RelationsWhereEntitySumIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_ID_DESC',
  RelationsWhereEntitySumIsSystemAsc = 'RELATIONS_WHERE_ENTITY_SUM_IS_SYSTEM_ASC',
  RelationsWhereEntitySumIsSystemDesc = 'RELATIONS_WHERE_ENTITY_SUM_IS_SYSTEM_DESC',
  RelationsWhereEntitySumPositionAsc = 'RELATIONS_WHERE_ENTITY_SUM_POSITION_ASC',
  RelationsWhereEntitySumPositionDesc = 'RELATIONS_WHERE_ENTITY_SUM_POSITION_DESC',
  RelationsWhereEntitySumSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_SPACE_ID_ASC',
  RelationsWhereEntitySumSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_SPACE_ID_DESC',
  RelationsWhereEntitySumToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_TO_ENTITY_ID_ASC',
  RelationsWhereEntitySumToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_TO_ENTITY_ID_DESC',
  RelationsWhereEntitySumToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_TO_SPACE_ID_ASC',
  RelationsWhereEntitySumToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_TO_SPACE_ID_DESC',
  RelationsWhereEntitySumToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_TO_VERSION_ID_ASC',
  RelationsWhereEntitySumToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_TO_VERSION_ID_DESC',
  RelationsWhereEntitySumTypeIdAsc = 'RELATIONS_WHERE_ENTITY_SUM_TYPE_ID_ASC',
  RelationsWhereEntitySumTypeIdDesc = 'RELATIONS_WHERE_ENTITY_SUM_TYPE_ID_DESC',
  RelationsWhereEntitySumVerifiedAsc = 'RELATIONS_WHERE_ENTITY_SUM_VERIFIED_ASC',
  RelationsWhereEntitySumVerifiedDesc = 'RELATIONS_WHERE_ENTITY_SUM_VERIFIED_DESC',
  RelationsWhereEntityVariancePopulationEntityIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_ENTITY_ID_ASC',
  RelationsWhereEntityVariancePopulationEntityIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_ENTITY_ID_DESC',
  RelationsWhereEntityVariancePopulationFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_FROM_ENTITY_ID_ASC',
  RelationsWhereEntityVariancePopulationFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_FROM_ENTITY_ID_DESC',
  RelationsWhereEntityVariancePopulationFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_FROM_SPACE_ID_ASC',
  RelationsWhereEntityVariancePopulationFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_FROM_SPACE_ID_DESC',
  RelationsWhereEntityVariancePopulationFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_FROM_VERSION_ID_ASC',
  RelationsWhereEntityVariancePopulationFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_FROM_VERSION_ID_DESC',
  RelationsWhereEntityVariancePopulationIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_ID_ASC',
  RelationsWhereEntityVariancePopulationIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_ID_DESC',
  RelationsWhereEntityVariancePopulationIsSystemAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_IS_SYSTEM_ASC',
  RelationsWhereEntityVariancePopulationIsSystemDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_IS_SYSTEM_DESC',
  RelationsWhereEntityVariancePopulationPositionAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_POSITION_ASC',
  RelationsWhereEntityVariancePopulationPositionDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_POSITION_DESC',
  RelationsWhereEntityVariancePopulationSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_SPACE_ID_ASC',
  RelationsWhereEntityVariancePopulationSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_SPACE_ID_DESC',
  RelationsWhereEntityVariancePopulationToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_TO_ENTITY_ID_ASC',
  RelationsWhereEntityVariancePopulationToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_TO_ENTITY_ID_DESC',
  RelationsWhereEntityVariancePopulationToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_TO_SPACE_ID_ASC',
  RelationsWhereEntityVariancePopulationToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_TO_SPACE_ID_DESC',
  RelationsWhereEntityVariancePopulationToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_TO_VERSION_ID_ASC',
  RelationsWhereEntityVariancePopulationToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_TO_VERSION_ID_DESC',
  RelationsWhereEntityVariancePopulationTypeIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_TYPE_ID_ASC',
  RelationsWhereEntityVariancePopulationTypeIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_TYPE_ID_DESC',
  RelationsWhereEntityVariancePopulationVerifiedAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_VERIFIED_ASC',
  RelationsWhereEntityVariancePopulationVerifiedDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_POPULATION_VERIFIED_DESC',
  RelationsWhereEntityVarianceSampleEntityIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_ENTITY_ID_ASC',
  RelationsWhereEntityVarianceSampleEntityIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_ENTITY_ID_DESC',
  RelationsWhereEntityVarianceSampleFromEntityIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_FROM_ENTITY_ID_ASC',
  RelationsWhereEntityVarianceSampleFromEntityIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_FROM_ENTITY_ID_DESC',
  RelationsWhereEntityVarianceSampleFromSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_FROM_SPACE_ID_ASC',
  RelationsWhereEntityVarianceSampleFromSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_FROM_SPACE_ID_DESC',
  RelationsWhereEntityVarianceSampleFromVersionIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_FROM_VERSION_ID_ASC',
  RelationsWhereEntityVarianceSampleFromVersionIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_FROM_VERSION_ID_DESC',
  RelationsWhereEntityVarianceSampleIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_ID_ASC',
  RelationsWhereEntityVarianceSampleIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_ID_DESC',
  RelationsWhereEntityVarianceSampleIsSystemAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_IS_SYSTEM_ASC',
  RelationsWhereEntityVarianceSampleIsSystemDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_IS_SYSTEM_DESC',
  RelationsWhereEntityVarianceSamplePositionAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_POSITION_ASC',
  RelationsWhereEntityVarianceSamplePositionDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_POSITION_DESC',
  RelationsWhereEntityVarianceSampleSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_SPACE_ID_ASC',
  RelationsWhereEntityVarianceSampleSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_SPACE_ID_DESC',
  RelationsWhereEntityVarianceSampleToEntityIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_TO_ENTITY_ID_ASC',
  RelationsWhereEntityVarianceSampleToEntityIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_TO_ENTITY_ID_DESC',
  RelationsWhereEntityVarianceSampleToSpaceIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_TO_SPACE_ID_ASC',
  RelationsWhereEntityVarianceSampleToSpaceIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_TO_SPACE_ID_DESC',
  RelationsWhereEntityVarianceSampleToVersionIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_TO_VERSION_ID_ASC',
  RelationsWhereEntityVarianceSampleToVersionIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_TO_VERSION_ID_DESC',
  RelationsWhereEntityVarianceSampleTypeIdAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_TYPE_ID_ASC',
  RelationsWhereEntityVarianceSampleTypeIdDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_TYPE_ID_DESC',
  RelationsWhereEntityVarianceSampleVerifiedAsc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_VERIFIED_ASC',
  RelationsWhereEntityVarianceSampleVerifiedDesc = 'RELATIONS_WHERE_ENTITY_VARIANCE_SAMPLE_VERIFIED_DESC',
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
  /** Filter by the object’s `commentScore` field. */
  commentScore?: BigFloatFilter | null | undefined;
  /** Filter by the object’s `commenters` field. */
  commenters?: BigIntFilter | null | undefined;
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
  /** Aggregates across related `Relation` match the filter criteria. */
  aggregates?: RelationAggregatesFilter | null | undefined;
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

/** A filter to be used against aggregates of `Relation` object types. */
export type RelationAggregatesFilter = {
  /** Distinct count aggregate over matching `Relation` objects. */
  distinctCount?: RelationDistinctCountAggregateFilter | null | undefined;
  /** A filter that must pass for the relevant `Relation` object to be included within the aggregate. */
  filter?: RelationFilter | null | undefined;
};

export type RelationDistinctCountAggregateFilter = {
  entityId?: BigIntFilter | null | undefined;
  fromEntityId?: BigIntFilter | null | undefined;
  fromSpaceId?: BigIntFilter | null | undefined;
  fromVersionId?: BigIntFilter | null | undefined;
  id?: BigIntFilter | null | undefined;
  isSystem?: BigIntFilter | null | undefined;
  position?: BigIntFilter | null | undefined;
  spaceId?: BigIntFilter | null | undefined;
  toEntityId?: BigIntFilter | null | undefined;
  toSpaceId?: BigIntFilter | null | undefined;
  toVersionId?: BigIntFilter | null | undefined;
  typeId?: BigIntFilter | null | undefined;
  verified?: BigIntFilter | null | undefined;
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
  /** Aggregates across related `Relation` match the filter criteria. */
  aggregates?: RelationAggregatesFilter | null | undefined;
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


export type EntitiesBatchQuery = { entities: Array<{ id: any, name: string | null, description: string | null, spaceIds: Array<any> | null, createdAt: string, updatedAt: string, allValuesList: Array<{ spaceId: any, propertyId: any }>, allRelationsList: Array<{ spaceId: any }>, relations: { totalCount: number }, types: Array<{ id: any, name: string | null }> | null, valuesList: Array<{ ' $fragmentRefs'?: { 'EntityValueFieldsFragment': EntityValueFieldsFragment } }>, relationsList: Array<{ ' $fragmentRefs'?: { 'RelationFieldsFragment': RelationFieldsFragment } }> }> | null };

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
  first?: number | null | undefined;
  after?: any;
}>;


export type RelationsByToEntityIdsQuery = { relationsConnection: { nodes: Array<{ id: any, toEntityId: any, spaceId: any, fromEntityId: any }>, pageInfo: { hasNextPage: boolean, endCursor: any } } | null };

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

export type SpaceRolesForParticipantsQueryVariables = Exact<{
  spaceId: any;
  participantSpaceIds?: Array<any> | any | null | undefined;
  first: number;
}>;


export type SpaceRolesForParticipantsQuery = { space: { editorsList: Array<{ memberSpaceId: any }>, membersList: Array<{ memberSpaceId: any }> } | null };

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

export type UserHasVoteOfKindQueryVariables = Exact<{
  userId: any;
  voteKinds?: Array<number> | number | null | undefined;
}>;


export type UserHasVoteOfKindQuery = { userVotes: Array<{ userId: any }> | null };

export type UserDebateParticipationQueryVariables = Exact<{
  personalSpaceId: any;
  sidePropertyIds?: Array<any> | any | null | undefined;
}>;


export type UserDebateParticipationQuery = { relations: Array<{ id: any }> | null };

export type UserEntityVotesByTypeQueryVariables = Exact<{
  userId: any;
  voteType: number;
  objectType: number;
  first: number;
  offset: number;
}>;


export type UserEntityVotesByTypeQuery = { userVotes: Array<{ objectId: any, voteKind: number, votedAt: any }> | null };

export const RelationToEntityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}}]} as unknown as DocumentNode<RelationToEntityFragment, unknown>;
export const RelationFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}}]} as unknown as DocumentNode<RelationFieldsFragment, unknown>;
export const FullRelationFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<FullRelationFragment, unknown>;
export const PropertyFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}}]} as unknown as DocumentNode<PropertyFragmentFragment, unknown>;
export const EntityValueFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}}]} as unknown as DocumentNode<EntityValueFieldsFragment, unknown>;
export const FullEntityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<FullEntityFragment, unknown>;
export const FullSpaceFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullSpace"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Space"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"topicId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spaceVotingSetting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"flatSupportThreshold"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullEntity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]} as unknown as DocumentNode<FullSpaceFragment, unknown>;
export const AllEntitiesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllEntities"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceIds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUIDFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeIds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUIDFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"EntitiesOrderBy"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orderBy"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceIds"}}},{"kind":"Argument","name":{"kind":"Name","value":"typeId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}}},{"kind":"Argument","name":{"kind":"Name","value":"typeIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AllEntitiesQuery, AllEntitiesQueryVariables>;
export const EntitiesBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntitiesBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntitiesBatchQuery, EntitiesBatchQueryVariables>;
export const EntitySpacesBatchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntitySpacesBatch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"EntityFilter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}}]}}]}}]} as unknown as DocumentNode<EntitySpacesBatchQuery, EntitySpacesBatchQueryVariables>;
export const EntityDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Entity"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Cursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"spaceIds"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allValuesList"},"name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"allRelationsList"},"name":{"kind":"Name","value":"relationsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"EntityValueFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"500"}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PropertyFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PropertyInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"dataTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeId"}},{"kind":"Field","name":{"kind":"Name","value":"renderableTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"format"}},{"kind":"Field","name":{"kind":"Name","value":"isType"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"EntityValueFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Value"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"property"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PropertyFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"integer"}},{"kind":"Field","name":{"kind":"Name","value":"float"}},{"kind":"Field","name":{"kind":"Name","value":"point"}},{"kind":"Field","name":{"kind":"Name","value":"boolean"}},{"kind":"Field","name":{"kind":"Name","value":"time"}},{"kind":"Field","name":{"kind":"Name","value":"language"}},{"kind":"Field","name":{"kind":"Name","value":"unit"}},{"kind":"Field","name":{"kind":"Name","value":"datetime"}},{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"decimal"}},{"kind":"Field","name":{"kind":"Name","value":"schedule"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntityQuery, EntityQueryVariables>;
export const EntityRelationsPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EntityRelationsPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Cursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entity"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"500"}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EntityRelationsPageQuery, EntityRelationsPageQueryVariables>;
export const RelationEntityRelationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RelationEntityRelations"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"entityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"FullRelation"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationToEntity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Entity"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"types"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"valuesList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"propertyId"}},{"kind":"Field","name":{"kind":"Name","value":"text"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RelationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"verified"}},{"kind":"Field","name":{"kind":"Name","value":"entityId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toEntity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationToEntity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"toSpaceId"}},{"kind":"Field","name":{"kind":"Name","value":"type"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"FullRelation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Relation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"RelationFields"}},{"kind":"Field","name":{"kind":"Name","value":"entity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<RelationEntityRelationsQuery, RelationEntityRelationsQueryVariables>;
export const RelationsByToEntityIdsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RelationsByToEntityIds"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"toEntityIds"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Cursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relationsConnection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"toEntityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"toEntityIds"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"typeId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"spaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"toEntityId"}},{"kind":"Field","name":{"kind":"Name","value":"spaceId"}},{"kind":"Field","name":{"kind":"Name","value":"fromEntityId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}}]} as unknown as DocumentNode<RelationsByToEntityIdsQuery, RelationsByToEntityIdsQueryVariables>;
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
export const SpaceRolesForParticipantsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SpaceRolesForParticipants"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"participantSpaceIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"space"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"editorsList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"memberSpaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"participantSpaceIds"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}},{"kind":"Field","name":{"kind":"Name","value":"membersList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"memberSpaceId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"participantSpaceIds"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"memberSpaceId"}}]}}]}}]}}]} as unknown as DocumentNode<SpaceRolesForParticipantsQuery, SpaceRolesForParticipantsQueryVariables>;
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
export const UserHasVoteOfKindDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserHasVoteOfKind"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"voteKinds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userVotes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"userId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"voteKind"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"voteKinds"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}}]}}]}}]} as unknown as DocumentNode<UserHasVoteOfKindQuery, UserHasVoteOfKindQueryVariables>;
export const UserDebateParticipationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserDebateParticipation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"personalSpaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sidePropertyIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"relations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"toEntityId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is"},"value":{"kind":"Variable","name":{"kind":"Name","value":"personalSpaceId"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"typeId"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"in"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sidePropertyIds"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UserDebateParticipationQuery, UserDebateParticipationQueryVariables>;
export const UserEntityVotesByTypeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserEntityVotesByType"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"voteType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userVotes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"voteType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"voteType"}}},{"kind":"ObjectField","name":{"kind":"Name","value":"objectType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectType"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"VOTED_AT_DESC"},{"kind":"EnumValue","value":"OBJECT_ID_ASC"}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"objectId"}},{"kind":"Field","name":{"kind":"Name","value":"voteKind"}},{"kind":"Field","name":{"kind":"Name","value":"votedAt"}}]}}]}}]} as unknown as DocumentNode<UserEntityVotesByTypeQuery, UserEntityVotesByTypeQueryVariables>;