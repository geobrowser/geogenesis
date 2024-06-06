import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { graphql } from '~/core/io/subgraph/graphql';
import { Entity } from '~/core/utils/entity';

import { Spaces } from '~/partials/spaces/spaces';

import { cachedFetchSpace } from '../cached-fetch-space';

export default async function SpacesPage({ params }: { params: { id: string } }) {
  const spaceId = params.id;
  const space = await cachedFetchSpace(spaceId);

  if (!space) return null;

  // assumes the order is deterministic
  const address = space.admins[0];
  const spaces = await getSpaces(address);

  return <Spaces spaces={spaces} />;
}

export type SpaceData = {
  id: string;
  name: string;
  image: string | null;
};

const getSpaces = async (address: string) => {
  const spaceAddresses = await getSpacesWhereEditor(address);

  const allSpaces = await Promise.all(spaceAddresses.map(spaceId => cachedFetchSpace(spaceId)));

  const spaces = allSpaces
    .map(space => {
      if (!space) return null;

      const entity = space?.spaceConfig;
      const id = space.id;
      const name = entity?.name ?? '';
      const image = Entity.cover(entity?.triples) ?? Entity.avatar(entity?.triples) ?? null;

      return {
        id,
        name,
        image,
      };
    })
    .filter(Boolean) as Array<SpaceData>;

  return spaces.sort((a, b) => (a.name < b.name ? -1 : 1));
};

const getSpacesWhereEditor = async (address?: string): Promise<string[]> => {
  if (!address) return [];

  const substreamQuery = `{
    spaces(filter: { spaceEditors: { some: { accountId: { equalTo: "${address}" } } } }) {
      nodes {
        id
      }
    }
  }`;

  const permissionlessSpacesEffect = graphql<{ spaces: { nodes: { id: string }[] } }>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: substreamQuery,
  });

  const spacesWhereEditor = await Effect.runPromise(Effect.either(permissionlessSpacesEffect));

  if (Either.isLeft(spacesWhereEditor)) {
    const error = spacesWhereEditor.left;

    switch (error._tag) {
      case 'GraphqlRuntimeError':
        console.error(`Encountered runtime graphql error in getSpacesWhereEditor.`, error.message);
        break;

      default:
        console.error(`${error._tag}: Unable to fetch spaces where editor`);
        break;
    }

    return [];
  }

  return spacesWhereEditor.right.spaces.nodes.map(space => space.id);
};
