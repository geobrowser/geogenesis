import { Context, ContextCore } from '@aragon/sdk-client-common';

import { DEFAULT_GEO_SPACE_PLUGIN_ADDRESS, DEFAULT_GEO_SPACE_PLUGIN_REPO_ADDRESS } from '../constants';
import { GeoPluginContextState, GeoPluginOverriddenState } from './internal/types';
import { GeoPluginContextParams } from './types';

export class GeoPluginContext extends ContextCore {
  protected state: GeoPluginContextState = this.state;

  // this typo is inherited from the original property name
  protected overriden: GeoPluginOverriddenState = this.overriden;
  constructor(contextParams?: Partial<GeoPluginContextParams>, aragonContext?: Context) {
    super();

    if (aragonContext) {
      Object.assign(this, aragonContext);
    }

    if (contextParams) {
      console.log('context params', contextParams);
      this.set(contextParams);
    }
  }

  public set(contextParams: GeoPluginContextParams) {
    super.set(contextParams);
    // set the default values for the new params
    this.setDefaults();
    if (contextParams.geoSpacePluginAddress) {
      this.state.geoSpacePluginAddress = contextParams.geoSpacePluginAddress;
      this.overriden.geoSpacePluginAddress = true;
    }

    if (contextParams.geoSpacePluginRepoAddress) {
      this.state.geoSpacePluginRepoAddress = contextParams.geoSpacePluginRepoAddress;
      this.overriden.geoSpacePluginRepoAddress = true;
    }
  }

  private setDefaults() {
    if (!this.overriden.geoSpacePluginAddress) {
      this.state.geoSpacePluginAddress = DEFAULT_GEO_SPACE_PLUGIN_ADDRESS;
      this.state.geoSpacePluginRepoAddress = DEFAULT_GEO_SPACE_PLUGIN_REPO_ADDRESS;
    }
  }

  get geoSpacePluginAddress(): string {
    return this.state.geoSpacePluginAddress;
  }

  get geoSpacePluginRepoAddress(): string {
    return this.state.geoSpacePluginRepoAddress;
  }
}
