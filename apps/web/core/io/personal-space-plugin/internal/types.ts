import { ContextState, OverriddenState } from '@aragon/sdk-client-common';

export type GeoPersonalSpacePluginContextState = ContextState & {
  geoPersonalSpacePluginAddress: string;
  geoPersonalSpacePluginRepoAddress: string;
};

export type GeoPersonalSpacePluginOverriddenState = OverriddenState & {
  [key in keyof GeoPersonalSpacePluginContextState]: boolean;
};
