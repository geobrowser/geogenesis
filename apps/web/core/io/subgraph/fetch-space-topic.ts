import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  resolveSpaceImage,
  type SpaceImageRelationNode,
} from './space-image';
import {
  MAX_TOPIC_USAGE_AVATARS,
  mergeTopicUsageSpaces,
  PLACEHOLDER_TOPIC_NAME,
  type TopicUsage,
  type TopicUsageSpaceNode,
} from './topic-space-usage';

export interface SpaceTopic extends TopicUsage {
  description: string | null;
  image: string;
}

interface TopicNode {
  id: string;
  name: string | null;
  description: string | null;
  relationsList: SpaceImageRelationNode[];
  spacesByTopicIdConnection: {
    totalCount: number;
    nodes: TopicUsageSpaceNode[];
  };
}

interface NetworkResult {
  space: {
    topic: TopicNode | null;
  } | null;
}

const spaceTopicQuery = (spaceId: string) => `
  {
    space(id: ${JSON.stringify(spaceId)}) {
      topic {
        id
        name
        description
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
`;

export async function fetchSpaceTopic(spaceId: string): Promise<SpaceTopic | null> {
  if (!validateSpaceId(spaceId)) {
    throw new Error(`Invalid space ID provided for space topic fetch: ${spaceId}`);
  }

  const resultOrError = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: spaceTopicQuery(spaceId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch current topic for space ${spaceId}`);
        throw new Error(`Failed to fetch current topic for space ${spaceId}`);
    }
  }

  const topic = resultOrError.right.space?.topic;

  if (!topic) {
    return null;
  }

  return {
    id: topic.id,
    name: topic.name ?? PLACEHOLDER_TOPIC_NAME,
    description: topic.description,
    image: resolveSpaceImage(topic.relationsList),
    spaces: mergeTopicUsageSpaces(topic.spacesByTopicIdConnection.nodes),
    spacesCount: topic.spacesByTopicIdConnection.totalCount,
  };
}
