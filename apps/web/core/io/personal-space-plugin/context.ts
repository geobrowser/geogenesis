import { Context, ContextCore } from '@aragon/sdk-client-common';

import { GEO_PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS } from '../../constants';
import { GeoPersonalSpaceAdminPluginContextState, GeoPersonalSpaceAdminPluginOverriddenState } from './internal/types';
import { GeoPersonalSpaceAdminPluginContextParams } from './types';

export class GeoPersonalSpacePluginContext extends ContextCore {
  protected state: GeoPersonalSpaceAdminPluginContextState = this.state;

  protected overriden: GeoPersonalSpaceAdminPluginOverriddenState = this.overriden;
  constructor(contextParams?: Partial<GeoPersonalSpaceAdminPluginContextParams>, aragonContext?: Context) {
    super();

    if (aragonContext) {
      Object.assign(this, aragonContext);
    }

    if (contextParams) {
      this.set(contextParams);
    }
  }

  public set(contextParams: GeoPersonalSpaceAdminPluginContextParams) {
    super.set(contextParams);

    this.setDefaults();

    if (contextParams.geoPersonalSpaceAdminPluginAddress) {
      this.state.geoPersonalSpaceAdminPluginAddress = contextParams.geoPersonalSpaceAdminPluginAddress;
      this.overriden.geoPersonalSpaceAdminPluginAddress = true;
    }
  }

  private setDefaults() {
    if (!this.overriden.geoPersonalSpaceAdminPluginRepoAddress) {
      this.state.geoPersonalSpaceAdminPluginRepoAddress = GEO_PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS;
    }
  }

  get geoPersonalSpaceAdminPluginAddress(): string {
    return this.state.geoPersonalSpaceAdminPluginAddress;
  }

  get geoPersonalSpaceAdminPluginRepoAddress(): string {
    return this.state.geoPersonalSpaceAdminPluginRepoAddress;
  }
}
