import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { OmitStrict, Profile } from '~/core/types';

type EditorsForSpace = {
  firstThreeEditors: OmitStrict<Profile, 'coverUrl'>[];
  allEditors: OmitStrict<Profile, 'coverUrl'>[];
  totalEditors: number;
  isEditor: boolean;
};

export async function getEditorsForSpace(spaceId: string, connectedAddress?: string): Promise<EditorsForSpace> {
  let config = Params.getConfigFromParams({}, undefined);
  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });
  let usePermissionlessSpace = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: spaceId });
    if (space) usePermissionlessSpace = true;
  }

  if (usePermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  // For now we use editors for both editors and members until we have the new membership
  // model in place.
  const maybeEditorsProfiles = await Promise.all(
    space.editors.map(editor => Subgraph.fetchProfile({ endpoint: config.subgraph, address: editor }))
  );

  const profiles = maybeEditorsProfiles.flatMap(p => (p ? [p] : []));

  const allEditors = profiles.map(profile => ({
    id: profile[1].id,
    avatarUrl: profile[1].avatarUrl,
    name: profile[1].name,
    address: profile[1].address,
    profileLink: profile[1].profileLink,
  }));

  const firstThreeEditors = allEditors.slice(0, 3);

  return {
    firstThreeEditors,
    allEditors,

    // For now an editor might not have a profile, so we only show the count
    // for editor with profiles.
    totalEditors: profiles.length,
    isEditor: connectedAddress ? space.editors.includes(connectedAddress) : false,
  };
}
