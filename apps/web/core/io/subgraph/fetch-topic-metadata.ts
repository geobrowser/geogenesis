import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { entityHomeSpaceId } from '~/core/utils/space/entity-home-space';

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
  type TopicUsage,
  type TopicUsageSpaceNode,
  mergeTopicUsageSpaces,
} from './topic-space-usage';

interface TopicMetadataNode {
  id: string;
  name: string | null;
  description: string | null;
  spaceIds: string[] | null;
  /** The topic's name in every space that names it: where it is published, rather than cited. */
  names?: { spaceId: string; text: string | null }[];
  relationsList: SpaceImageRelationNode[];
  spacesByTopicIdConnection: {
    totalCount: number;
    nodes: TopicUsageSpaceNode[];
  };
}

interface TopicMetadataResult {
  entities: TopicMetadataNode[];
}

export type TopicMetadata = {
  name: string | null;
  description: string | null;
  image: string;
  spaces: TopicUsage['spaces'];
  spacesCount: number;
  /**
   * The space the topic's own page is in, by `entityHomeSpaceId`: a space that names it, before one
   * that merely cites it. `spaces` are something else: spaces whose topic it is.
   */
  homeSpaceId: string | null;
};

const topicMetadataQuery = (topicIds: string[]) => `
  {
    entities(filter: { id: { in: [${topicIds.map(id => JSON.stringify(id)).join(', ')}] } }, first: ${topicIds.length}) {
      id
      name
      description
      spaceIds
      names: valuesList(filter: { propertyId: { is: ${JSON.stringify(SystemIds.NAME_PROPERTY)} } }) {
        spaceId
        text
      }
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
`;

export async function fetchTopicMetadata(topicIds: string[]): Promise<Map<string, TopicMetadata>> {
  if (topicIds.length === 0) {
    return new Map();
  }

  const result = await Effect.runPromise(
    Effect.either(
      graphql<TopicMetadataResult>({
        query: topicMetadataQuery(topicIds),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.warn('Failed to resolve topic metadata', result.left);
    return new Map();
  }

  return new Map(
    result.right.entities.map(entity => [
      entity.id,
      {
        name: entity.name,
        description: entity.description,
        image: resolveSpaceImage(entity.relationsList),
        spaces: mergeTopicUsageSpaces(entity.spacesByTopicIdConnection.nodes),
        spacesCount: entity.spacesByTopicIdConnection.totalCount,
        homeSpaceId: entityHomeSpaceId({
          spaces: entity.spaceIds ?? [],
          values: (entity.names ?? []).map(name => ({
            property: { id: SystemIds.NAME_PROPERTY },
            spaceId: name.spaceId,
            value: name.text,
          })),
        }),
      },
    ])
  );
}
