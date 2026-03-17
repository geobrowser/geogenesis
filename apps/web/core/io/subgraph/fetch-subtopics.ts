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

const MAX_SUBTOPIC_AVATARS = 3;

interface TopicUsageSpaceNode {
  id: string;
  page: {
    name: string | null;
    relationsList: SpaceImageRelationNode[];
  } | null;
}

interface SubtopicNode {
  topicId: string;
  topic: {
    name: string | null;
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

export interface Subtopic {
  id: string;
  name: string;
  spaces: {
    id: string;
    name: string;
    image: string;
  }[];
  spacesCount: number;
}

function isPlaceholderName(name: string) {
  return name === 'Untitled';
}

function isPlaceholderImage(image: string) {
  return image === '/placeholder.png';
}

function toUsageSpace(space: TopicUsageSpaceNode): Subtopic['spaces'][number] {
  return {
    id: space.id,
    name: space.page?.name ?? 'Untitled',
    image: resolveSpaceImage(space.page?.relationsList ?? []),
  };
}

function mergeSpaces(spaces: TopicUsageSpaceNode[]) {
  const spacesById = new Map<string, Subtopic['spaces'][number]>();

  for (const space of spaces) {
    const nextSpace = toUsageSpace(space);
    const existingSpace = spacesById.get(space.id);

    if (!existingSpace) {
      spacesById.set(space.id, nextSpace);
      continue;
    }

    spacesById.set(space.id, {
      id: existingSpace.id,
      name:
        isPlaceholderName(existingSpace.name) && !isPlaceholderName(nextSpace.name)
          ? nextSpace.name
          : existingSpace.name,
      image:
        isPlaceholderImage(existingSpace.image) && !isPlaceholderImage(nextSpace.image)
          ? nextSpace.image
          : existingSpace.image,
    });
  }

  return Array.from(spacesById.values()).slice(0, MAX_SUBTOPIC_AVATARS);
}

const subtopicsQuery = (spaceId: string) => `
  {
    subspaceTopicsConnection(filter: { spaceId: { is: ${JSON.stringify(spaceId)} } }) {
      nodes {
        topicId
        topic {
          name
          spacesByTopicIdConnection(first: ${MAX_SUBTOPIC_AVATARS}) {
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

export async function fetchSubtopics(spaceId: string): Promise<Subtopic[]> {
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

  const nodes = resultOrError.right.subspaceTopicsConnection.nodes;
  const subtopicsById = new Map<string, { name: string; spaces: TopicUsageSpaceNode[]; spacesCount: number }>();

  for (const node of nodes) {
    const existingSubtopic = subtopicsById.get(node.topicId);
    const nextName = node.topic?.name ?? 'Untitled';
    const nextSpaces = node.topic?.spacesByTopicIdConnection.nodes ?? [];
    const nextSpacesCount = node.topic?.spacesByTopicIdConnection.totalCount ?? 0;

    if (!existingSubtopic) {
      subtopicsById.set(node.topicId, {
        name: nextName,
        spaces: [...nextSpaces],
        spacesCount: nextSpacesCount,
      });
      continue;
    }

    if (isPlaceholderName(existingSubtopic.name) && !isPlaceholderName(nextName)) {
      existingSubtopic.name = nextName;
    }

    existingSubtopic.spaces.push(...nextSpaces);
    existingSubtopic.spacesCount = Math.max(existingSubtopic.spacesCount, nextSpacesCount);
  }

  return Array.from(subtopicsById.entries()).map(([id, subtopic]) => {
    const spaces = mergeSpaces(subtopic.spaces);

    return {
      id,
      name: subtopic.name,
      spaces,
      spacesCount: subtopic.spacesCount,
    };
  });
}
