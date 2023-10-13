import { ClientCore, PluginInstallItem, getNamedTypesFromMetadata } from '@aragon/sdk-client-common';
import { SpacePluginSetupAbi } from '@geogenesis/contracts';
import { encodeFunctionData, hexToBytes } from 'viem';

import { GEO_PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS } from '~/core/constants';

import { personalSpaceAdminPluginAbi } from '../../abis';
import { GeoPersonalSpacePluginContext } from '../../context';

export class GeoPluginClientEncoding extends ClientCore {
  private geoPersonalSpacePluginAddress: string;

  constructor(pluginContext: GeoPersonalSpacePluginContext) {
    super(pluginContext);

    this.geoPersonalSpacePluginAddress = pluginContext.geoPersonalSpaceAdminPluginAddress;
  }

  // Personal Space Plugin: Functions

  public getPersonalSpacePluginInstallItem(params): PluginInstallItem {
    console.log('incoming params', params);
    // const hexBytes = defaultAbiCoder.encode(getNamedTypesFromMetadata(SpacePluginSetupAbi), [
    //   votingSettingsToContract(params),
    // ]);

    const namedMetadata = getNamedTypesFromMetadata(SpacePluginSetupAbi);
    console.log('named metadata', namedMetadata);
    const hexBytes = '123';

    // const hexBytes = encodeAbiParameters(
    //   getNamedTypesFromMetadata(SpacePluginSetupAbi),
    //   votingSettingsToContract(params)
    // );

    return {
      id: GEO_PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS,
      data: hexToBytes(hexBytes as `0x${string}`),
    };
  }

  // public async initalizePersonalSpacePlugin(daoAddress: `0x${string}`, firstBlockContentUri: string) {
  //   const initalizeData = encodeFunctionData({
  //     abi: personalSpaceAdminPluginAbi,
  //     functionName: 'initialize',
  //     args: [daoAddress, firstBlockContentUri],
  //   });
  //   return initalizeData;
  // }
}
