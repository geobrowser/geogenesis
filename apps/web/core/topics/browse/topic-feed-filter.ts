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
    or: [
      {
        and: [
          // A Debate's Topics are inherited from the Claim it debates. Ignore any direct Topic
          // relation on the Debate itself so the feed and its facet counts cannot disagree about
          // which subject the Debate belongs to.
          { not: { typeIds: { overlaps: [DEBATE_TYPE_ID] } } },
          directTopicMatch(topicId),
        ],
      },
      {
        and: [{ typeIds: { overlaps: [DEBATE_TYPE_ID] } }, debateTopicMatch(topicId)],
      },
    ],
  };
}

function uniqueTopicIds(topicId: string, selectedTopicIds: readonly string[]) {
  return [...new Map([topicId, ...selectedTopicIds].map(id => [normId(id), id])).values()];
}

/** Fast path for non-Debate entities, which carry Topics directly. */
export function directTopicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  return { and: uniqueTopicIds(topicId, selectedTopicIds).map(directTopicMatch) };
}

/** Fast path for Debates, whose Topics are inherited through their debated Claims. */
export function debateTopicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  return { and: uniqueTopicIds(topicId, selectedTopicIds).map(debateTopicMatch) };
}

/** The page topic is mandatory; extra topic selections narrow the feed with AND semantics. */
export function topicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  const topicIds = uniqueTopicIds(topicId, selectedTopicIds);
  return {
    and: topicIds.map(topicMatch),
  };
}
