import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import { Effect, Either } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
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

interface ValueNode {
  propertyId: string;
  text: string | null;
}

interface RelationNode {
  typeId: string;
  toEntity: {
    valuesList: ValueNode[];
  } | null;
}

interface SpaceNode {
  id: string;
  page: {
    name: string | null;
    description: string | null;
    relationsList: RelationNode[];
  } | null;
}

interface SpacesResult {
  spaces: SpaceNode[];
}

const SPACE_QUERY_BATCH_SIZE = 100;

const toHex = (uuid: string) => uuid.replace(/-/g, '');

const AVATAR_PROPERTY_ID = toHex(ContentIds.AVATAR_PROPERTY);
const COVER_PROPERTY_ID = toHex(SystemIds.COVER_PROPERTY);
const IMAGE_URL_PROPERTY_ID = toHex(SystemIds.IMAGE_URL_PROPERTY);

function resolveSpaceImage(relations: RelationNode[]): string {
  const avatar = relations.find(r => r.typeId === AVATAR_PROPERTY_ID);
  const avatarUrl = avatar?.toEntity?.valuesList.find(v => v.propertyId === IMAGE_URL_PROPERTY_ID)?.text;
  if (avatarUrl) return avatarUrl;

  const cover = relations.find(r => r.typeId === COVER_PROPERTY_ID);
  const coverUrl = cover?.toEntity?.valuesList.find(v => v.propertyId === IMAGE_URL_PROPERTY_ID)?.text;
  if (coverUrl) return coverUrl;

  return PLACEHOLDER_SPACE_IMAGE;
}

export interface ActiveSubspace {
  id: string;
  name: string;
  description: string | null;
  image: string;
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

  const spaceMetaById = new Map<string, { name: string; description: string | null; image: string }>();
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
          console.error(`${error._tag}: Unable to fetch active subspace metadata for space ${spaceId}`);
          throw new Error(`Failed to fetch active subspace metadata for space ${spaceId}`);
      }
    }

    for (const space of spacesResultOrError.right.spaces) {
      spaceMetaById.set(space.id, {
        name: space.page?.name ?? 'Untitled',
        description: space.page?.description ?? null,
        image: resolveSpaceImage(space.page?.relationsList ?? []),
      });
    }
  }

  return subspaces
    .map(subspace => {
      const relationType = parseSubspaceType(subspace.type);

      if (!relationType) {
        console.error(`Unknown subspace relation type "${subspace.type}" for parent space ${spaceId}`);
        return null;
      }

      const meta = spaceMetaById.get(subspace.childSpaceId);

      return {
        id: subspace.childSpaceId,
        name: meta?.name ?? 'Untitled',
        description: meta?.description ?? null,
        image: meta?.image ?? PLACEHOLDER_SPACE_IMAGE,
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
