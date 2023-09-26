import { ContextParams, VersionTag } from '@aragon/sdk-client-common';

export type GeoPluginContextParams = ContextParams & {
  geoSpacePluginAddress: string;
  geoSpacePluginRepoAddress: string;
  geoMainVotingPluginAddress: string;
  geoMainVotingPluginRepoAddress: string;
  geoMemberAccessPluginAddress: string;
  geoMemberAccessPluginRepoAddress: string;
};

export type PrepareInstallationParams = {
  daoAddressOrEns: string;
  version?: VersionTag;
  settings: {
    number: bigint;
  };
};
