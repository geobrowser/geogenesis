import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { EntityFilter } from '~/core/gql/graphql';

/**
 * One topic predicate for the mixed rabbit-hole feed.
 *
 * Most rows carry Topics directly. Debates are the exception: they point to the claim they argued,
 * and that claim carries the topic. Keeping both paths in one predicate lets every sort use the
 * same scope rather than merging independently ranked lists in the browser.
 */
function topicMatch(topicId: string): EntityFilter {
  return {
    or: [
      {
        relations: {
          some: {
            typeId: { is: TOPICS_PROPERTY_ID },
            toEntityId: { is: topicId },
          },
        },
      },
      {
        and: [
          { typeIds: { overlaps: [DEBATE_TYPE_ID] } },
          {
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
          },
        ],
      },
    ],
  };
}

/** The page topic is mandatory; extra topic selections narrow the feed with AND semantics. */
export function topicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  return {
    and: [topicMatch(topicId), ...selectedTopicIds.filter(id => id !== topicId).map(topicMatch)],
  };
}
