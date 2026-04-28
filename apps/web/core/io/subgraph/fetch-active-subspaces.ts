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

interface SubspaceNode {
  childSpaceId: string;
  type: string;
}

interface SubspacesResult {
  subspaces: SubspaceNode[];
}

interface ChildSpaceNode {
  id: string;
  page: {
    name: string | null;
    description: string | null;
    relationsList: SpaceImageRelationNode[];
  } | null;
}

interface ChildSpacesResult {
  spaces: ChildSpaceNode[];
}

export interface ActiveSubspace {
  id: string;
  name: string;
  description: string | null;
  image: string;
  relationType: 'verified' | 'related';
}

const subspacesQuery = (spaceId: string) => `
  {
    subspaces(filter: { parentSpaceId: { is: ${JSON.stringify(spaceId)} }, type: { in: [VERIFIED, RELATED] } }) {
      childSpaceId
      type
    }
  }
`;

const childSpacesQuery = (spaceIds: string[]) => `
  {
    spaces(filter: { id: { in: [${spaceIds.map(id => JSON.stringify(id)).join(', ')}] } }) {
      id
      page {
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
      }
    }
  }
`;

function parseSubspaceType(type: string): ActiveSubspace['relationType'] | null {
  if (type === 'VERIFIED') {
    return 'verified';
  }

  if (type === 'RELATED') {
    return 'related';
  }

  return null;
}

export async function fetchActiveSubspaces(spaceId: string): Promise<ActiveSubspace[]> {
  if (!validateSpaceId(spaceId)) {
    throw new Error(`Invalid space ID provided for active subspaces fetch: ${spaceId}`);
  }

  const endpoint = Environment.getConfig().api;

  const subspacesResult = await Effect.runPromise(
    Effect.either(
      graphql<SubspacesResult>({
        query: subspacesQuery(spaceId),
        endpoint,
      })
    )
  );

  if (Either.isLeft(subspacesResult)) {
    const error = subspacesResult.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch active subspaces for space ${spaceId}`);
        throw new Error(`Failed to fetch active subspaces for space ${spaceId}`);
    }
  }

  const subspaces = subspacesResult.right.subspaces;

  if (subspaces.length === 0) {
    return [];
  }

  const childSpaceIds = [...new Set(subspaces.map(s => s.childSpaceId))];

  const childSpacesResult = await Effect.runPromise(
    Effect.either(
      graphql<ChildSpacesResult>({
        query: childSpacesQuery(childSpaceIds),
        endpoint,
      })
    )
  );

  if (Either.isLeft(childSpacesResult)) {
    const error = childSpacesResult.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch child spaces for parent space ${spaceId}`);
        throw new Error(`Failed to fetch active subspaces for space ${spaceId}`);
    }
  }

  const pagesById = new Map(childSpacesResult.right.spaces.map(space => [space.id, space.page]));

  return subspaces
    .map(subspace => {
      const relationType = parseSubspaceType(subspace.type);

      if (!relationType) {
        console.error(`Unknown subspace relation type "${subspace.type}" for parent space ${spaceId}`);
        return null;
      }

      const page = pagesById.get(subspace.childSpaceId);

      return {
        id: subspace.childSpaceId,
        name: page?.name ?? 'Untitled',
        description: page?.description ?? null,
        image: resolveSpaceImage(page?.relationsList ?? [], subspace.childSpaceId),
        relationType,
      };
    })
    .filter((subspace): subspace is ActiveSubspace => subspace !== null)
    .sort((a, b) => {
      if (a.name === b.name) {
        return a.relationType.localeCompare(b.relationType);
      }

      return a.name.localeCompare(b.name);
    });
}
