import type { IngestionLink } from '~/core/chat/ingestion-link';

import { TEMPLATE_ONTOLOGY } from '../ontology';

/**
 * For a page whose Sources section reads its own `Sources` relation (News story, Claim, Event,
 * Post): a pasted source becomes page --Sources--> source (GEO-3819).
 */
export function sourcesIngestionLink(
  entityId: string,
  entityName: string | null | undefined,
  spaceId: string | undefined
): IngestionLink {
  return {
    targetEntityId: entityId,
    ...(spaceId ? { targetSpaceId: spaceId } : {}),
    targetEntityName: entityName ?? null,
    propertyId: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
    propertyName: 'Sources',
    direction: 'target-to-source',
  };
}

/**
 * For a Topic, whose "Evidence" lists the entities tagged with it: a pasted source becomes
 * source --Topics--> topic (GEO-3819).
 */
export function topicCoverageIngestionLink(
  topicId: string,
  topicName: string | null | undefined,
  spaceId: string | undefined
): IngestionLink {
  return {
    targetEntityId: topicId,
    ...(spaceId ? { targetSpaceId: spaceId } : {}),
    targetEntityName: topicName ?? null,
    propertyId: TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
    propertyName: 'Topics',
    direction: 'source-to-target',
  };
}
