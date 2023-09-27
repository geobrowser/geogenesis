import { ClientCore } from '@aragon/sdk-client-common';

import { GeoPluginContext } from '../context';

export class GeoPluginClientCore extends ClientCore {
  public geoSpacePluginAddress: string;
  public geoSpacePluginRepoAddress: string;

  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);
    this.geoSpacePluginAddress = pluginContext.geoSpacePluginAddress;
    this.geoSpacePluginRepoAddress = pluginContext.geoSpacePluginRepoAddress;
    console.log('plugin context', pluginContext);
  }
}
