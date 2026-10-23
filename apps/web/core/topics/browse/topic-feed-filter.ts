import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { EntityFilter } from '~/core/gql/graphql';
import { normId } from '~/core/utils/norm-id';

/**
 * Every feed entity, including a Debate, carries its own Topics relations.
 * The page topic is mandatory; extra topic selections narrow the feed with AND semantics.
 */
export function topicFeedFilter(topicId: string, selectedTopicIds: readonly string[] = []): EntityFilter {
  return topicsRelationFilter([topicId, ...selectedTopicIds])!;
}

/**
 * Entities carrying a Topics relation to every one of `topicIds`, or `undefined` for none.
 *
 * The space-scoped feed has no page topic, so its filter is only the reader's topic selections —
 * and with nothing selected it is no filter at all rather than an empty `and`.
 */
export function topicsRelationFilter(topicIds: readonly string[]): EntityFilter | undefined {
  const unique = [...new Map(topicIds.map(id => [normId(id), id])).values()];
  if (unique.length === 0) return undefined;

  return {
    and: unique.map(id => ({
      relations: {
        some: {
          typeId: { is: TOPICS_PROPERTY_ID },
          toEntityId: { is: id },
        },
      },
    })),
  };
}
