import { Context, ContextCore } from '@aragon/sdk-client-common';

import { GEO_PERSONAL_SPACE_PLUGIN_REPO_ADDRESS, GEO_PERSONAL_SPACE_PLUGIN_REPO_ADDRESS } from '../../constants';
import { GeoPersonalSpacePluginContextState, GeoPersonalSpacePluginOverriddenState } from './internal/types';
import { GeoPersonalSpacePluginContextParams } from './types';

export class GeoPersonalSpacePluginContext extends ContextCore {
  protected state: GeoPersonalSpacePluginContextState = this.state;

  protected overriden: GeoPersonalSpacePluginOverriddenState = this.overriden;
  constructor(contextParams?: Partial<GeoPersonalSpacePluginContextParams>, aragonContext?: Context) {
    super();

    if (aragonContext) {
      Object.assign(this, aragonContext);
    }

    if (contextParams) {
      this.set(contextParams);
    }
  }

  public set(contextParams: GeoPersonalSpacePluginContextParams) {
    super.set(contextParams);
    // set the default values for the new params
    this.setDefaults();

    // Personal Space Plugin:
    if (contextParams.geoPersonalSpacePluginAddress) {
      this.state.geoPersonalSpacePluginAddress = contextParams.geoPersonalSpacePluginAddress;
      this.overriden.geoPersonalSpacePluginAddress = true;
    }
  }

  private setDefaults() {
    // Optional: Set any settings that may have a default value here

    if (!this.overriden.geoPersonalSpacePluginRepoAddress) {
      this.state.geoPersonalSpacePluginRepoAddress = GEO_PERSONAL_SPACE_PLUGIN_REPO_ADDRESS;
    }
  }

  get geoPersonalSpacePluginAddress(): string {
    return this.state.geoPersonalSpacePluginAddress;
  }

  get geoPersonalSpacePluginRepoAddress(): string {
    return this.state.geoPersonalSpacePluginRepoAddress;
  }
}
