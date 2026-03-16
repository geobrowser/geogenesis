import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import { Effect, Either } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';

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

interface ChildSpaceNode {
  id: string;
  page: {
    name: string | null;
    description: string | null;
    relationsList: RelationNode[];
  } | null;
}

interface SubspaceNode {
  childSpaceId: string;
  type: string;
  childSpace: ChildSpaceNode | null;
}

interface SubspacesResult {
  subspaces: SubspaceNode[];
}

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
      childSpace {
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

  const resultOrError = await Effect.runPromise(
    Effect.either(
      graphql<SubspacesResult>({
        query: activeSubspacesQuery(spaceId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch active subspaces for space ${spaceId}`);
        throw new Error(`Failed to fetch active subspaces for space ${spaceId}`);
    }
  }

  const subspaces = resultOrError.right.subspaces;

  return subspaces
    .map(subspace => {
      const relationType = parseSubspaceType(subspace.type);

      if (!relationType) {
        console.error(`Unknown subspace relation type "${subspace.type}" for parent space ${spaceId}`);
        return null;
      }

      const page = subspace.childSpace?.page;

      return {
        id: subspace.childSpaceId,
        name: page?.name ?? 'Untitled',
        description: page?.description ?? null,
        image: resolveSpaceImage(page?.relationsList ?? []),
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
