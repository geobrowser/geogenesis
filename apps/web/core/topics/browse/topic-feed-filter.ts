import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { EntityFilter } from '~/core/gql/graphql';
import { normId } from '~/core/utils/norm-id';

/**
 * One topic predicate for the mixed rabbit-hole feed.
 *
 * Most rows carry Topics directly. Debates are the exception: they point to the claim they argued,
 * and that claim carries the topic. Keeping both paths in one predicate lets every sort use the
 * same scope rather than merging independently ranked lists in the browser.
 */
function directTopicMatch(topicId: string): EntityFilter {
  return {
    relations: {
      some: {
        typeId: { is: TOPICS_PROPERTY_ID },
        toEntityId: { is: topicId },
      },
    },
  };
}

function debateTopicMatch(topicId: string): EntityFilter {
  return {
    relations: {
      some: {
        typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
        toEntity: {
          relations: {
            some: {
              typeId: { is: TOPICS_PROPERTY_ID },
              toEntityId: { is: topicId },
            },
          },
        },
      },
    },
  };
}

function topicMatch(topicId: string): EntityFilter {
  return {
    or: [directTopicFeedFilter(topicId), debateTopicFeedFilter(topicId)],
  };
}

function uniqueTopicIds(topicId: string, selectedTopicIds: readonly string[]) {
  return [...new Map([topicId, ...selectedTopicIds].map(id => [normId(id), id])).values()];
}

/** Fast path for non-Debate entities, which carry Topics directly. */
export function directTopicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  return {
    and: [
      // A Debate's Topics are inherited from the Claim it debates. Ignore any direct Topic
      // relation on the Debate itself so every caller gets that rule without restating it.
      { not: { typeIds: { overlaps: [DEBATE_TYPE_ID] } } },
      ...uniqueTopicIds(topicId, selectedTopicIds).map(directTopicMatch),
    ],
  };
}

/** Fast path for Debates, whose Topics are inherited through their debated Claims. */
export function debateTopicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  return {
    and: [
      { typeIds: { overlaps: [DEBATE_TYPE_ID] } },
      ...uniqueTopicIds(topicId, selectedTopicIds).map(debateTopicMatch),
    ],
  };
}

/** The page topic is mandatory; extra topic selections narrow the feed with AND semantics. */
export function topicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  const topicIds = uniqueTopicIds(topicId, selectedTopicIds);
  return {
    and: topicIds.map(topicMatch),
  };
}

export type TopicFeedPopulationScope = {
  kind: 'direct' | 'debate';
  typeIds: string[];
  entityFilter: EntityFilter;
};

/**
 * The two disjoint branches that make up a Topic feed.
 *
 * Keeping this split in one place matters both for correctness and query planning: direct entities
 * carry Topics themselves, while Debates inherit Topics through their Claim. Feed ranking and
 * facets use these same branches so neither can quietly define a different population.
 */
export function topicFeedPopulationScopes(
  topicId: string,
  selectedTopicIds: readonly string[],
  typeIds: readonly string[]
): TopicFeedPopulationScope[] {
  const directTypeIds = typeIds.filter(id => normId(id) !== normId(DEBATE_TYPE_ID));
  const includesDebates = typeIds.some(id => normId(id) === normId(DEBATE_TYPE_ID));

  return [
    ...(directTypeIds.length > 0
      ? [
          {
            kind: 'direct' as const,
            typeIds: directTypeIds,
            entityFilter: directTopicFeedFilter(topicId, selectedTopicIds),
          },
        ]
      : []),
    ...(includesDebates
      ? [
          {
            kind: 'debate' as const,
            typeIds: [DEBATE_TYPE_ID],
            entityFilter: debateTopicFeedFilter(topicId, selectedTopicIds),
          },
        ]
      : []),
  ];
}
