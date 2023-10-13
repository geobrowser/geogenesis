import { ContextState, OverriddenState } from '@aragon/sdk-client-common';

export type GeoPersonalSpaceAdminPluginContextState = ContextState & {
  geoPersonalSpaceAdminPluginAddress: string;
  geoPersonalSpaceAdminPluginRepoAddress: string;
};

export type GeoPersonalSpaceAdminPluginOverriddenState = OverriddenState & {
  [key in keyof GeoPersonalSpaceAdminPluginContextState]: boolean;
};
