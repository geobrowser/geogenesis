import {
  PrepareInstallationParams,
  PrepareInstallationStepValue,
  prepareGenericInstallation,
} from '@aragon/sdk-client-common';
import { createPublicClient, http } from 'viem';
import { goerli } from 'viem/chains';

import { MEMBER_ACCESS_PLUGIN_ADDRESS, MEMBER_ACCESS_PLUGIN_SETUP_ADDRESS } from '~/core/constants';

import { mainVotingPluginAbi, memberAccessPluginAbi, spacePluginAbi, spacePluginSetupAbi } from '../../abis';
import { GeoPluginClientCore } from '../core';

// @TODO: use our existing public client
export const publicClient = createPublicClient({
  chain: goerli,
  transport: http(),
});

export class GeoPluginClientMethods extends GeoPluginClientCore {
  public async *prepareInstallation(params: PrepareInstallationParams): AsyncGenerator<PrepareInstallationStepValue> {
    yield* prepareGenericInstallation(this.web3, {
      daoAddressOrEns: params.daoAddressOrEns,
      pluginRepo: this.myPluginRepoAddress,
      version: params.version,
      installationAbi: BUILD_METADATA.pluginSetup.prepareInstallation.inputs,
      installationParams: [params.settings.number],
    });
  }
}

/* space plugin setup */

/* space plugin */

// reads

// writes

/* member access plugin setup */

const memberAccessPluginSetupAddress = MEMBER_ACCESS_PLUGIN_SETUP_ADDRESS;

/*member access plugin */
const memberAccessPluginAddress = MEMBER_ACCESS_PLUGIN_ADDRESS;

// writes

/* main voting plugin setup  */

/* main voting plugin */

// reads
