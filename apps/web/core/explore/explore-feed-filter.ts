import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';
import { topicsRelationFilter } from '~/core/topics/browse/topic-feed-filter';

import { EXPLORE_ENTITY_NAME_PROPERTY_ID } from './explore-constants';
import { claimsRequireDebateTagFilter } from './explore-debate-tag-filter';

export type ExploreTime = 'today' | 'week' | 'month' | 'year' | 'all';

const SYSTEM_TYPE_PROPERTY_ID = '88b3d6ad288c529ca2120e1c24819185';
const SYSTEM_ENTITY_ID = '2ff7ea098b9e50bc9be78a0cafa268d0';
const DATA_BLOCK_TYPE_ID = 'b8803a8665de412bbb357e0c84adf473';
const TEXT_BLOCK_TYPE_ID = '76474f2f00894e77a0410b39fb17d0bf';

export const FEED_EXCLUDED_RELATIONS_FILTER = {
  relations: {
    none: {
      or: [
        { typeId: { is: SYSTEM_TYPE_PROPERTY_ID }, toEntityId: { is: SYSTEM_ENTITY_ID } },
        {
          typeId: { is: SystemIds.TYPES_PROPERTY },
          toEntityId: { in: [DATA_BLOCK_TYPE_ID, TEXT_BLOCK_TYPE_ID] },
        },
      ],
    },
  },
} satisfies EntityFilter;

export function timeThresholdSec(filter: ExploreTime): number | null {
  const now = Math.floor(Date.now() / 1000);
  switch (filter) {
    case 'today':
      return now - 86400;
    case 'week':
      return now - 7 * 86400;
    case 'month':
      return now - 30 * 86400;
    case 'year':
      return now - 365 * 86400;
    case 'all':
    default:
      return null;
  }
}

export function combineEntityFilters(...filters: Array<EntityFilter | undefined>): EntityFilter | undefined {
  const present = filters.filter((filter): filter is EntityFilter => filter !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return { and: present };
}

export function buildExploreFeedFilter(args: {
  spaceIds: string[];
  time: ExploreTime;
  typeIds?: readonly string[];
  topicIds?: readonly string[];
  requireName?: boolean;
  requireDebateTagOnClaims?: boolean;
  includeEntityScopeInFilter?: boolean;
  entityFilter?: EntityFilter;
}): EntityFilter {
  const t = timeThresholdSec(args.time);
  const base: EntityFilter = {
    ...FEED_EXCLUDED_RELATIONS_FILTER,
    ...(args.requireDebateTagOnClaims ? claimsRequireDebateTagFilter(args.spaceIds) : {}),
    ...topicsRelationFilter(args.topicIds ?? []),
    ...(args.includeEntityScopeInFilter
      ? {
          spaceIds: { overlaps: [...args.spaceIds] },
          ...(args.typeIds?.length ? { typeIds: { overlaps: [...args.typeIds] } } : {}),
        }
      : {}),
    ...(args.requireName !== false
      ? {
          values: {
            some: {
              spaceId: { in: args.spaceIds },
              propertyId: { is: EXPLORE_ENTITY_NAME_PROPERTY_ID },
              text: { isNull: false, isNot: '' },
            },
          },
        }
      : {}),
    ...(t != null ? { createdAt: { greaterThanOrEqualTo: String(t) } } : {}),
  };
  return combineEntityFilters(base, args.entityFilter) ?? base;
}

export function buildExploreTopicFacetFilter(args: {
  spaceIds: string[];
  time: ExploreTime;
  typeIds?: readonly string[];
  topicIds?: readonly string[];
  requireDebateTagOnClaims?: boolean;
}): RelationFilter {
  const t = timeThresholdSec(args.time);
  const fromEntity: EntityFilter = {
    ...(args.requireDebateTagOnClaims ? claimsRequireDebateTagFilter(args.spaceIds) : {}),
    ...topicsRelationFilter(args.topicIds ?? []),
    ...(args.typeIds?.length ? { typeIds: { overlaps: [...args.typeIds] } } : {}),
    ...(t != null ? { createdAt: { greaterThanOrEqualTo: String(t) } } : {}),
  };
  return {
    typeId: { is: TOPICS_PROPERTY_ID },
    spaceId: { in: [...args.spaceIds] },
    fromEntity,
  };
}
