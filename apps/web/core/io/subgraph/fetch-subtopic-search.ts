import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { validateEntityId } from '~/core/utils/utils';

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

const MAX_SUBTOPIC_SEARCH_RESULTS = 10;

export interface SubtopicSearchResult extends TopicUsage {
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
  entityLookup?: SearchNode[];
}

const SEARCH_NODE_FIELDS = `
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
`;

const subtopicSearchQuery = (query: string, maybeEntityId: string | null) => `
  {
    search(query: ${JSON.stringify(query)}, first: ${MAX_SUBTOPIC_SEARCH_RESULTS}) {
      ${SEARCH_NODE_FIELDS}
    }
    ${
      maybeEntityId
        ? `entityLookup: entities(filter: { id: { in: [${JSON.stringify(maybeEntityId)}] } }) {
      ${SEARCH_NODE_FIELDS}
    }`
        : ''
    }
  }
`;

export async function fetchSubtopicSearch(
  query: string,
  signal?: AbortController['signal']
): Promise<SubtopicSearchResult[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    return [];
  }

  const maybeEntityId = validateEntityId(trimmedQuery) ? trimmedQuery : null;

  const queryEffect = graphql<NetworkResult>({
    query: subtopicSearchQuery(trimmedQuery, maybeEntityId),
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
        console.error(`${error._tag}: Unable to fetch subtopic search results for query ${trimmedQuery}`);
        throw new Error(`Failed to fetch subtopic search results for query ${trimmedQuery}`);
    }
  }

  const toResult = (node: SearchNode): SubtopicSearchResult => ({
    id: node.id,
    name: node.name ?? PLACEHOLDER_TOPIC_NAME,
    description: node.description,
    image: resolveSpaceImage(node.relationsList),
    spaces: mergeTopicUsageSpaces(node.spacesByTopicIdConnection.nodes),
    spacesCount: node.spacesByTopicIdConnection.totalCount,
  });

  const searchResults = resultOrError.right.search.map(toResult);
  const entityLookupResults = (resultOrError.right.entityLookup ?? []).map(toResult);

  const seen = new Set<string>();
  const merged: SubtopicSearchResult[] = [];
  for (const result of [...entityLookupResults, ...searchResults]) {
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    merged.push(result);
  }

  return merged;
}
