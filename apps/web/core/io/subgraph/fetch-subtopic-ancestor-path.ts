import { Effect, Either } from 'effect';

import { SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';
import { Environment } from '~/core/environment';
import { validateEntityId, validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';
import { PLACEHOLDER_TOPIC_NAME } from './topic-space-usage';

export type SubtopicPathSegment = {
  id: string;
  name: string;
};

interface ParentLookupResult {
  entity: {
    id: string;
    name: string | null;
    parents: {
      nodes: Array<{
        fromEntity: { id: string; name: string | null } | null;
      }>;
    } | null;
  } | null;
}

const buildParentQuery = (entityId: string, spaceId: string) => `
  {
    entity(id: ${JSON.stringify(entityId)}) {
      id
      name
      parents: backlinks(
        filter: {
          typeId: { is: ${JSON.stringify(SUBTOPIC_RELATION_TYPE_ID)} }
          spaceId: { is: ${JSON.stringify(spaceId)} }
        }
        first: 1
      ) {
        nodes {
          fromEntity {
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

async function fetchParentSegment(
  entityId: string,
  spaceId: string
): Promise<{ entity: SubtopicPathSegment; parentId: string | null }> {
  const queryEffect = graphql<ParentLookupResult>({
    query: buildParentQuery(entityId, spaceId),
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    throw new Error(`Failed to fetch subtopic parent for ${entityId}`);
  }

  const entity = resultOrError.right?.entity;
  const parent = entity?.parents?.nodes?.[0]?.fromEntity;

  return {
    entity: {
      id: entity?.id ?? entityId,
      name: resolveName(entity?.name),
    },
    parentId: parent?.id ?? null,
  };
}

export async function fetchSubtopicAncestorPath(
  entityId: string,
  rootEntityId: string,
  spaceId: string
): Promise<SubtopicPathSegment[]> {
  if (!validateEntityId(entityId) || !validateEntityId(rootEntityId) || !validateSpaceId(spaceId)) {
    return [];
  }

  const segmentsBottomUp: SubtopicPathSegment[] = [];
  const visited = new Set<string>();
  let currentId: string | null = entityId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const { entity, parentId } = await fetchParentSegment(currentId, spaceId);
    segmentsBottomUp.push(entity);

    if (currentId === rootEntityId) {
      break;
    }

    currentId = parentId;
  }

  return segmentsBottomUp.reverse();
}

export function formatSubtopicPath(segments: SubtopicPathSegment[]): string {
  return segments.map(segment => segment.name).join(' > ');
}
