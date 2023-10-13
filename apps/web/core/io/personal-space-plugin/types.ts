import { ContextParams, VersionTag } from '@aragon/sdk-client-common';

export type GeoPersonalSpaceAdminPluginContextParams = ContextParams & {
  geoPersonalSpaceAdminPluginAddress?: string;
  geoPersonalSpaceAdminPluginRepoAddress?: string;
};

export type PrepareInstallationParams = {
  daoAddressOrEns: string;
  version?: VersionTag;
  settings: {
    number: bigint;
  };
};
