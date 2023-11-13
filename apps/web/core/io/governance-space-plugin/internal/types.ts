import { ContextState, OverriddenState } from '@aragon/sdk-client-common';

export type GeoPluginContextState = ContextState & {
  // include all but personal space, can be separate
  geoSpacePluginAddress: string;
  geoSpacePluginRepoAddress: string;
  geoGovernancePluginAddress: string;
  geoGovernancePluginRepoAddress: string;
};

export type GeoPluginOverriddenState = OverriddenState & {
  [key in keyof GeoPluginContextState]: boolean;
};
