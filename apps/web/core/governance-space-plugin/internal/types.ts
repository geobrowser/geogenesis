import { ContextParams, ContextState, OverriddenState } from '@aragon/sdk-client-common';

export type GeoPluginContextParams = ContextParams & {
  // optional so we can set default values for the parameter
  geoPluginAddress?: string;
  geoPluginRepoAddress?: string;
  // add custom params
};

export type GeoPluginContextState = ContextState & {
  // extend the Context state with a new state for storing
  // the new parameters
  geoPluginPluginAddress: string;
  geoPluginRepoAddress: string;
};

export type GeoPluginOverriddenState = OverriddenState & {
  [key in keyof GeoPluginContextState]: boolean;
};
