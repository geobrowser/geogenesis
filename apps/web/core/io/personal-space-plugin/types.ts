import { ContextParams, VersionTag } from '@aragon/sdk-client-common';

export type GeoPersonalSpacePluginContextParams = ContextParams & {
  geoPersonalSpacePluginAddress?: string;
  geoPersonalSpacePluginRepoAddress?: string;
};

export type PrepareInstallationParams = {
  daoAddressOrEns: string;
  version?: VersionTag;
  settings: {
    number: bigint;
  };
};
