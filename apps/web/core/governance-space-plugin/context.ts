import { Context, ContextCore } from '@aragon/sdk-client-common';

import {
  DEFAULT_GEO_MAIN_VOTING_PLUGIN_REPO_ADDRESS,
  DEFAULT_GEO_MEMBER_ACCESS_PLUGIN_REPO_ADDRESS,
  DEFAULT_GEO_SPACE_PLUGIN_REPO_ADDRESS,
} from '../constants';
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
      console.log('context params', contextParams);
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
    if (contextParams.geoMemberAccessPluginAddress) {
      this.state.geoMemberAccessPluginAddress = contextParams.geoMemberAccessPluginAddress;
      this.overriden.geoMemberAccessPluginAddress = true;
    }

    // Main Voting Plugin:
    if (contextParams.geoMainVotingPluginAddress) {
      this.state.geoMainVotingPluginAddress = contextParams.geoMainVotingPluginAddress;
      this.overriden.geoMainVotingPluginAddress = true;
    }
  }

  private setDefaults() {
    // Optional: Set any settings that may have a default value here

    if (!this.overriden.geoSpacePluginRepoAddress) {
      this.state.geoSpacePluginRepoAddress = DEFAULT_GEO_SPACE_PLUGIN_REPO_ADDRESS;
    }
    if (!this.overriden.geoMemberAccessPluginRepoAddress) {
      this.state.geoMemberAccessPluginRepoAddress = DEFAULT_GEO_MEMBER_ACCESS_PLUGIN_REPO_ADDRESS;
    }
    if (!this.overriden.geoMainVotingPluginRepoAddress) {
      this.state.geoMainVotingPluginRepoAddress = DEFAULT_GEO_MAIN_VOTING_PLUGIN_REPO_ADDRESS;
    }
  }

  get geoSpacePluginAddress(): string {
    return this.state.geoSpacePluginAddress;
  }

  get geoMemberAccessPluginAddress(): string {
    return this.state.geoMemberAccessPluginAddress;
  }

  get geoMainVotingPluginAddress(): string {
    return this.state.geoMainVotingPluginAddress;
  }

  get geoSpacePluginRepoAddress(): string {
    return this.state.geoSpacePluginRepoAddress;
  }

  get geoMemberAccessPluginRepoAddress(): string {
    return this.state.geoMemberAccessPluginRepoAddress;
  }

  get geoMainVotingPluginRepoAddress(): string {
    return this.state.geoMainVotingPluginRepoAddress;
  }
}
