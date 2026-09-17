import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { EntityFilter } from '~/core/gql/graphql';

/**
 * The topics filter, ANDed: an entity reaches the feed only if it carries EVERY selected topic
 * (co-occurrence), so counts narrow as topics are added.
 */
export function topicFilterClauses(topicIds?: readonly string[]): EntityFilter {
  if (!topicIds || topicIds.length === 0) return {};
  return {
    and: topicIds.map(id => ({
      relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: id } } },
    })),
  };
}
