import { validateSpaceId } from '~/core/utils/utils';

import { fetchSubtopicChildren } from './fetch-subtopic-children';
import { fetchTopicMetadata } from './fetch-topic-metadata';
import { PLACEHOLDER_TOPIC_NAME, type TopicUsage } from './topic-space-usage';

/**
 * Returns first-level subtopics of a space's subtopic tree
 */
export async function fetchSubtopics(spaceId: string, rootEntityId: string): Promise<TopicUsage[]> {
  if (!validateSpaceId(spaceId)) {
    throw new Error(`Invalid space ID provided for subtopics fetch: ${spaceId}`);
  }

  const children = await fetchSubtopicChildren(rootEntityId, spaceId);

  if (children.length === 0) {
    return [];
  }

  const metadataById = await fetchTopicMetadata(children.map(child => child.id));

  return children
    .map(child => {
      const metadata = metadataById.get(child.id);

      return {
        id: child.id,
        name: metadata?.name ?? child.name ?? PLACEHOLDER_TOPIC_NAME,
        image: metadata?.image ?? '',
        spaces: metadata?.spaces ?? [],
        spacesCount: metadata?.spacesCount ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
