import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { ExploreCompletePopulationScope } from '~/core/explore/fetch-explore-feed';
import type { EntityFilter } from '~/core/gql/graphql';
import { normId } from '~/core/utils/norm-id';

/**
 * Every feed entity, including a Debate, carries its own Topics relations.
 * The page topic is mandatory; extra topic selections narrow the feed with AND semantics.
 */
export function topicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  const topicIds = [...new Map([topicId, ...selectedTopicIds].map(id => [normId(id), id])).values()];
  return {
    and: topicIds.map(id => ({
      relations: {
        some: {
          typeId: { is: TOPICS_PROPERTY_ID },
          toEntityId: { is: id },
        },
      },
    })),
  };
}

/** One population query shared by feed ranking and composition counts. */
export function topicFeedPopulationScopes(
  topicId: string,
  selectedTopicIds: readonly string[],
  typeIds: readonly string[]
): ExploreCompletePopulationScope[] {
  return typeIds.length > 0
    ? [
        {
          typeIds: [...typeIds],
          entityFilter: topicFeedFilter(topicId, selectedTopicIds),
          relationFilter: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: topicId } },
        },
      ]
    : [];
}
