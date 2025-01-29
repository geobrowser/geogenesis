import { fetchOnchainProfileByEntityId } from '~/core/io/fetch-onchain-profile-by-entity-id';
import { fetchSpacesWhereEditor } from '~/core/io/subgraph/fetch-spaces-where-editor';

import { Spaces } from '~/partials/spaces/spaces';

import { cachedFetchSpace } from '../cached-fetch-space';

export default async function SpacesPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const spaceId = params.id;
  const space = await cachedFetchSpace(spaceId);

  if (!space || !space.spaceConfig) return null;

  const personEntityId = space.spaceConfig.id;
  const address = await getAddress(personEntityId);

  if (!address) return null;

  const spaces = await getSpaces(address);

  return <Spaces spaces={spaces} />;
}

export type SpaceData = {
  id: string;
  name: string;
  image: string;
};

const getAddress = async (id: string) => {
  const onChainProfile = await fetchOnchainProfileByEntityId(id);

  if (!onChainProfile) return null;

  const address = onChainProfile.accountId;

  return address;
};

const getSpaces = async (address: string) => {
  const spacesWhereEditor = await fetchSpacesWhereEditor(address);

  const spaces = spacesWhereEditor
    .map(space => {
      if (!space || !space.spaceConfig) return null;

      const entity = space.spaceConfig;
      const id = space.id;
      const name = entity.name ?? '';
      const image = entity.image;

      return {
        id,
        name,
        image,
      };
    })
    .filter(Boolean) as Array<SpaceData>;

  return spaces.sort((a, b) => (a.name < b.name ? -1 : 1));
};
