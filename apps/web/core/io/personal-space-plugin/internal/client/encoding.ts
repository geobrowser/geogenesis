import { ClientCore } from '@aragon/sdk-client-common';
import { encodeAbiParameters, hexToBytes } from 'viem';

import { GEO_PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS } from '~/core/constants';

import { GeoPersonalSpacePluginContext } from '../../context';

export class GeoPersonalSpacePluginClientEncoding extends ClientCore {
  private geoPersonalSpacePluginAddress: string;

  constructor(pluginContext: GeoPersonalSpacePluginContext) {
    super(pluginContext);

    this.geoPersonalSpacePluginAddress = pluginContext.geoPersonalSpaceAdminPluginAddress;
  }

  // Personal Space Plugin: Functions
  static getPersonalSpacePluginInstallItem(params: { initialEditorAddress: string }) {
    // Define the ABI for the prepareInstallation function's inputs
    const prepareInstallationInputs = [
      {
        name: '_initialEditorAddress',
        type: 'address',
        internalType: 'address',
        description: 'The address of the first address to be granted the editor permission.',
      },
    ];

    console.log('params', params);

    console.log('prepare installation inputs:', prepareInstallationInputs);

    if (!prepareInstallationInputs) {
      throw new Error('Could not find inputs for prepareInstallation in the ABI');
    }

    // Encode the data using encodeAbiParameters
    const encodedData = encodeAbiParameters(prepareInstallationInputs, [params.initialEditorAddress]);

    return {
      id: GEO_PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS, // Assuming you have this constant defined somewhere
      data: hexToBytes(encodedData),
    };
  }
}
