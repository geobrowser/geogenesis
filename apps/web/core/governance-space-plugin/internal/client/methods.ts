import {
  ClientCore,
  PrepareInstallationParams,
  PrepareInstallationStepValue,
  prepareGenericInstallation,
} from '@aragon/sdk-client-common';
import { createPublicClient, http } from 'viem';
import { goerli } from 'viem/chains';

import { MEMBER_ACCESS_PLUGIN_ADDRESS, MEMBER_ACCESS_PLUGIN_SETUP_ADDRESS } from '~/core/constants';

import { mainVotingPluginAbi, memberAccessPluginAbi, spacePluginAbi, spacePluginSetupAbi } from '../../abis';
import { GeoPluginContext } from '../../context';
import { GeoPluginClientCore } from '../core';

// @TODO: use our existing public client
export const publicClient = createPublicClient({
  chain: goerli,
  transport: http(),
});

export class GeoPluginClientMethods extends ClientCore {
  private geoSpacePluginAddress: string;
  private geoMemberAccessPluginAddress: string;
  private geoMainVotingPluginAddress: string;

  private geoSpacePluginRepoAddress: string;
  private geoMemberAccessPluginRepoAddress: string;
  private geoMainVotingPluginRepoAddress: string;

  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);

    // Plugin addresses
    this.geoSpacePluginAddress = pluginContext.geoSpacePluginAddress;
    this.geoMemberAccessPluginAddress = pluginContext.geoMemberAccessPluginAddress;
    this.geoMainVotingPluginAddress = pluginContext.geoMainVotingPluginAddress;

    // Plugin repo addresses
    this.geoSpacePluginRepoAddress = pluginContext.geoSpacePluginRepoAddress;
    this.geoMemberAccessPluginRepoAddress = pluginContext.geoMemberAccessPluginRepoAddress;
    this.geoMainVotingPluginRepoAddress = pluginContext.geoMainVotingPluginRepoAddress;
  }
}

/* space plugin setup */

/* space plugin */

// reads

// writes

/* member access plugin setup */

/*member access plugin */

// writes

/* main voting plugin setup  */

/* main voting plugin */

// reads
