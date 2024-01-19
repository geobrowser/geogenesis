import { Context, ContextCore } from '@aragon/sdk-client-common';

import { GEO_GOVERNANCE_PLUGIN_REPO_ADDRESS, GEO_SPACE_PLUGIN_REPO_ADDRESS } from '../../constants';
import { GeoPluginContextState, GeoPluginOverriddenState } from './internal/types';
import { GeoPluginContextParams } from './types';

export class GeoPluginContext extends ContextCore {
  protected state: GeoPluginContextState = this.state;

  protected overriden: GeoPluginOverriddenState = this.overriden;
  constructor(contextParams?: Partial<GeoPluginContextParams>, aragonContext?: Context) {
    super();

    if (aragonContext) {
      Object.assign(this, aragonContext);
    }

    if (contextParams) {
      this.set(contextParams);
    }
  }

  public set(contextParams: GeoPluginContextParams) {
    super.set(contextParams);
    // set the default values for the new params
    this.setDefaults();

    // Space Plugin:
    if (contextParams.geoSpacePluginAddress) {
      this.state.geoSpacePluginAddress = contextParams.geoSpacePluginAddress;
      this.overriden.geoSpacePluginAddress = true;
    }

    // Member Access Plugin:
    if (contextParams.geoGovernancePluginAddress) {
      this.state.geoGovernancePluginAddress = contextParams.geoGovernancePluginAddress;
      this.overriden.geoGovernancePluginAddress = true;
    }
  }

  private setDefaults() {
    // Optional: Set any settings that may have a default value here

    if (!this.overriden.geoSpacePluginRepoAddress) {
      this.state.geoSpacePluginRepoAddress = GEO_SPACE_PLUGIN_REPO_ADDRESS;
    }

    if (!this.overriden.geoGovernancePluginRepoAddress) {
      this.state.geoGovernancePluginRepoAddress = GEO_GOVERNANCE_PLUGIN_REPO_ADDRESS;
    }
  }

  get geoSpacePluginAddress(): string {
    return this.state.geoSpacePluginAddress;
  }

  get geoGovernancePluginAddress(): string {
    return this.state.geoGovernancePluginAddress;
  }

  get geoSpacePluginRepoAddress(): string {
    return this.state.geoSpacePluginRepoAddress;
  }

  get geoGovernancePluginRepoAddress(): string {
    return this.state.geoGovernancePluginRepoAddress;
  }

  // @TODO: Remove these
  get geoMemberAccessPluginAddress(): string {
    return this.state.geoMemberAccessPluginAddress;
  }

  get geoMemberAccessPluginRepoAddress(): string {
    return this.state.geoMemberAccessPluginRepoAddress;
  }

  get geoMainVotingPluginAddress(): string {
    return this.state.geoMainVotingPluginAddress;
  }

  get geoMainVotingPluginRepoAddress(): string {
    return this.state.geoMainVotingPluginRepoAddress;
  }
}
