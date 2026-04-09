import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  type SpaceImageRelationNode,
  resolveSpaceImage,
} from './space-image';
import {
  MAX_TOPIC_USAGE_AVATARS,
  PLACEHOLDER_TOPIC_NAME,
  type TopicUsage,
  type TopicUsageSpaceNode,
  mergeTopicUsageSpaces,
} from './topic-space-usage';

interface SubtopicNode {
  topicId: string;
  topic: {
    name: string | null;
    relationsList: SpaceImageRelationNode[];
    spacesByTopicIdConnection: {
      totalCount: number;
      nodes: TopicUsageSpaceNode[];
    };
  } | null;
}

interface NetworkResult {
  subspaceTopicsConnection: {
    nodes: SubtopicNode[];
  };
}

function isPlaceholderName(name: string) {
  return name === PLACEHOLDER_TOPIC_NAME;
}

const subtopicsQuery = (spaceId: string) => `
  {
    subspaceTopicsConnection(filter: { spaceId: { is: ${JSON.stringify(spaceId)} } }) {
      nodes {
        topicId
        topic {
          name
          relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
            typeId
            toEntity {
              valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
                propertyId
                text
              }
            }
          }
          spacesByTopicIdConnection(first: ${MAX_TOPIC_USAGE_AVATARS}) {
            totalCount
            nodes {
              id
              page {
                name
                relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
                  typeId
                  toEntity {
                    valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
                      propertyId
                      text
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function fetchSubtopics(spaceId: string): Promise<TopicUsage[]> {
  if (!validateSpaceId(spaceId)) {
    throw new Error(`Invalid space ID provided for subtopics fetch: ${spaceId}`);
  }

  const queryEffect = graphql<NetworkResult>({
    query: subtopicsQuery(spaceId),
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch subtopics for space ${spaceId}`);
        throw new Error(`Failed to fetch subtopics for space ${spaceId}`);
    }
  }

  const nodes = resultOrError.right?.subspaceTopicsConnection?.nodes ?? [];
  const subtopicsById = new Map<
    string,
    { name: string; image: string; spaces: TopicUsageSpaceNode[]; spacesCount: number }
  >();

  for (const node of nodes) {
    const existingSubtopic = subtopicsById.get(node.topicId);
    const nextName = node.topic?.name ?? PLACEHOLDER_TOPIC_NAME;
    const nextImage = resolveSpaceImage(node.topic?.relationsList ?? []);
    const nextSpaces = node.topic?.spacesByTopicIdConnection.nodes ?? [];
    const nextSpacesCount = node.topic?.spacesByTopicIdConnection.totalCount ?? 0;

    if (!existingSubtopic) {
      subtopicsById.set(node.topicId, {
        name: nextName,
        image: nextImage,
        spaces: [...nextSpaces],
        spacesCount: nextSpacesCount,
      });
      continue;
    }

    if (isPlaceholderName(existingSubtopic.name) && !isPlaceholderName(nextName)) {
      existingSubtopic.name = nextName;
    }

    if (existingSubtopic.image === '' && nextImage !== '') {
      existingSubtopic.image = nextImage;
    }

    existingSubtopic.spaces.push(...nextSpaces);
    existingSubtopic.spacesCount = Math.max(existingSubtopic.spacesCount, nextSpacesCount);
  }

  return Array.from(subtopicsById.entries())
    .map(([id, subtopic]) => {
      const spaces = mergeTopicUsageSpaces(subtopic.spaces);

      return {
        id,
        name: subtopic.name,
        image: subtopic.image,
        spaces,
        spacesCount: subtopic.spacesCount,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
