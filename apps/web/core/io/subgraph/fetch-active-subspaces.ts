import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';

interface SubspaceNode {
  childSpaceId: string;
  type: string;
}

interface SubspacesResult {
  subspaces: SubspaceNode[];
}

interface SpaceNode {
  id: string;
  page: {
    name: string | null;
  } | null;
}

interface SpacesResult {
  spaces: SpaceNode[];
}

const SPACE_QUERY_BATCH_SIZE = 100;

export interface ActiveSubspace {
  id: string;
  name: string;
  relationType: 'verified' | 'related';
}

const activeSubspacesQuery = (spaceId: string) => `
  {
    subspaces(filter: { parentSpaceId: { is: ${JSON.stringify(spaceId)} }, type: { in: [VERIFIED, RELATED] } }) {
      childSpaceId
      type
    }
  }
`;

const spacesByIdsQuery = (spaceIds: string[]) => `
  {
    spaces(filter: { id: { in: ${JSON.stringify(spaceIds)} } }) {
      id
      page {
        name
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

function chunkIds(ids: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];

  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  return chunks;
}

export async function fetchActiveSubspaces(spaceId: string): Promise<ActiveSubspace[]> {
  if (!validateSpaceId(spaceId)) {
    throw new Error(`Invalid space ID provided for active subspaces fetch: ${spaceId}`);
  }

  const subspacesResultOrError = await Effect.runPromise(
    Effect.either(
      graphql<SubspacesResult>({
        query: activeSubspacesQuery(spaceId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(subspacesResultOrError)) {
    const error = subspacesResultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch active subspaces for space ${spaceId}`);
        throw new Error(`Failed to fetch active subspaces for space ${spaceId}`);
    }
  }

  const subspaces = subspacesResultOrError.right.subspaces;
  if (subspaces.length === 0) return [];

  const uniqueSpaceIds = Array.from(new Set(subspaces.map(subspace => subspace.childSpaceId)));

  const namesBySpaceId = new Map<string, string>();
  const idChunks = chunkIds(uniqueSpaceIds, SPACE_QUERY_BATCH_SIZE);

  for (const idChunk of idChunks) {
    const spacesResultOrError = await Effect.runPromise(
      Effect.either(
        graphql<SpacesResult>({
          query: spacesByIdsQuery(idChunk),
          endpoint: Environment.getConfig().api,
        })
      )
    );

    if (Either.isLeft(spacesResultOrError)) {
      const error = spacesResultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          throw error;
        default:
          console.error(`${error._tag}: Unable to fetch active subspace names for space ${spaceId}`);
          throw new Error(`Failed to fetch active subspace names for space ${spaceId}`);
      }
    }

    for (const space of spacesResultOrError.right.spaces) {
      namesBySpaceId.set(space.id, space.page?.name ?? 'Untitled');
    }
  }

  return subspaces
    .map(subspace => {
      const relationType = parseSubspaceType(subspace.type);

      if (!relationType) {
        console.error(`Unknown subspace relation type "${subspace.type}" for parent space ${spaceId}`);
        return null;
      }

      return {
        id: subspace.childSpaceId,
        name: namesBySpaceId.get(subspace.childSpaceId) ?? 'Untitled',
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
