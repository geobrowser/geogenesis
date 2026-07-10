import { Effect, Either } from 'effect';

import { SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';
import { Environment } from '~/core/environment';
import { validateEntityId, validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';
import { PLACEHOLDER_TOPIC_NAME } from './topic-space-usage';

export type SubtopicChild = {
  id: string;
  name: string;
  relationId: string;
};

interface NetworkResult {
  entity: {
    subtopics: {
      nodes: Array<{
        id: string;
        toEntity: { id: string; name: string | null } | null;
      }>;
    } | null;
  } | null;
}

const MAX_SUBTOPIC_CHILDREN = 500;

const buildQuery = (parentEntityId: string, spaceId: string) => `
  {
    entity(id: ${JSON.stringify(parentEntityId)}) {
      subtopics: relations(
        filter: {
          typeId: { is: ${JSON.stringify(SUBTOPIC_RELATION_TYPE_ID)} }
          spaceId: { is: ${JSON.stringify(spaceId)} }
        }
        first: ${MAX_SUBTOPIC_CHILDREN}
      ) {
        nodes {
          id
          toEntity {
            id
            name
          }
        }
      }
    }
  }
`;

function resolveName(name: string | null | undefined): string {
  if (!name || !name.trim()) return PLACEHOLDER_TOPIC_NAME;
  return name;
}

/**
 * Returns immediate subtopic children of `parentEntityId` via Subtopics relations
 */
export async function fetchSubtopicChildren(parentEntityId: string, spaceId: string): Promise<SubtopicChild[]> {
  if (!validateEntityId(parentEntityId)) {
    throw new Error(`Invalid entity ID provided for subtopic children fetch: ${parentEntityId}`);
  }

  if (!validateSpaceId(spaceId)) {
    throw new Error(`Invalid space ID provided for subtopic children fetch: ${spaceId}`);
  }

  const queryEffect = graphql<NetworkResult>({
    query: buildQuery(parentEntityId, spaceId),
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch subtopic children for ${parentEntityId} in space ${spaceId}`);
        throw new Error(`Failed to fetch subtopic children for entity ${parentEntityId}`);
    }
  }

  const nodes = resultOrError.right?.entity?.subtopics?.nodes ?? [];
  const childrenById = new Map<string, SubtopicChild>();

  for (const node of nodes) {
    const child = node.toEntity;
    if (!child?.id || !node.id) continue;

    childrenById.set(child.id, {
      id: child.id,
      name: resolveName(child.name),
      relationId: node.id,
    });
  }

  return Array.from(childrenById.values()).sort((a, b) => a.name.localeCompare(b.name));
}
