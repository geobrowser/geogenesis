import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';

import { graphql } from './graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  type SpaceImageRelationNode,
  resolveSpaceImage,
} from './space-image';

// Same anchor as fetch-root-topics — keep these in sync.
const TAG_PROPERTY_ID = '257090341ba5406f94e4d4af90042fba';
const CURATED_TOPIC_TAG_ID = '7f796eb5bfc5449c98649bf7d996a2ca';

// Bound the dropdown. 50 is more than enough at current testnet scale (~6
// spaces with curated topics) and keeps the request cheap as the data grows.
const SPACE_OPTIONS_PAGE_SIZE = 50;

const PLACEHOLDER_SPACE_NAME = 'Untitled space';

export interface TopicSpaceOption {
  id: string;
  name: string;
  image: string;
}

interface SpaceNode {
  id: string;
  page: {
    name: string | null;
    relationsList: SpaceImageRelationNode[];
  } | null;
}

interface NetworkResult {
  spacesConnection: {
    nodes: SpaceNode[];
  };
}

// Find spaces that contain at least one curated-topic-tag relation — i.e.,
// spaces where someone has tagged an entity as a curated topic. Independent of
// how many curated topics live in each space; gives the dropdown a complete
// view that isn't bounded by the topic-list page size.
const SPACES_QUERY = `
  {
    spacesConnection(
      filter: {
        relationsConnection: {
          some: {
            typeId: { is: ${JSON.stringify(TAG_PROPERTY_ID)} },
            toEntityId: { is: ${JSON.stringify(CURATED_TOPIC_TAG_ID)} }
          }
        }
      },
      first: ${SPACE_OPTIONS_PAGE_SIZE}
    ) {
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
`;

export async function fetchTopicSpaceOptions(): Promise<TopicSpaceOption[]> {
  const queryEffect = graphql<NetworkResult>({
    query: SPACES_QUERY,
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch topic space options`);
    return [];
  }

  const nodes = resultOrError.right?.spacesConnection?.nodes ?? [];

  return nodes
    .map<TopicSpaceOption>(node => ({
      id: node.id,
      name: node.page?.name?.trim() ? node.page.name : PLACEHOLDER_SPACE_NAME,
      image: resolveSpaceImage(node.page?.relationsList ?? [], node.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
