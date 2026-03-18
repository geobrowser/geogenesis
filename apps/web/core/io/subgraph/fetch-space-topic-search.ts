import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';

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

const MAX_SPACE_TOPIC_SEARCH_RESULTS = 10;

export interface SpaceTopicSearchResult extends TopicUsage {
  description: string | null;
  image: string;
}

interface SearchNode {
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
  search: SearchNode[];
}

const spaceTopicSearchQuery = (query: string) => `
  {
    search(query: ${JSON.stringify(query)}, first: ${MAX_SPACE_TOPIC_SEARCH_RESULTS}) {
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
`;

export async function fetchSpaceTopicSearch(
  query: string,
  signal?: AbortController['signal']
): Promise<SpaceTopicSearchResult[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    return [];
  }

  const queryEffect = graphql<NetworkResult>({
    query: spaceTopicSearchQuery(trimmedQuery),
    endpoint: Environment.getConfig().api,
    signal,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch topic search results for query ${trimmedQuery}`);
        throw new Error(`Failed to fetch topic search results for query ${trimmedQuery}`);
    }
  }

  return resultOrError.right.search.map(result => ({
    id: result.id,
    name: result.name ?? PLACEHOLDER_TOPIC_NAME,
    description: result.description,
    image: resolveSpaceImage(result.relationsList),
    spaces: mergeTopicUsageSpaces(result.spacesByTopicIdConnection.nodes),
    spacesCount: result.spacesByTopicIdConnection.totalCount,
  }));
}
