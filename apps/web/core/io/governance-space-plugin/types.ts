import { ContextParams, VersionTag } from '@aragon/sdk-client-common';

export type GeoPluginContextParams = ContextParams & {
  geoSpacePluginAddress?: string;
  geoMemberAccessPluginAddress?: string;
  geoMainVotingPluginAddress?: string;

  geoSpacePluginRepoAddress?: string;
  geoMemberAccessPluginRepoAddress?: string;
  geoMainVotingPluginRepoAddress?: string;
};

export type PrepareInstallationParams = {
  daoAddressOrEns: string;
  version?: VersionTag;
  settings: {
    number: bigint;
  };
};
