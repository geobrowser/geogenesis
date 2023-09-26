import { ClientCore } from '@aragon/sdk-client-common';

import { GeoPluginContext } from '../context';

export class MyPluginClientCore extends ClientCore {
  public geoPluginPluginAddress: string;
  public geoPluginRepoAddress: string;

  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);
    this.geoPluginPluginAddress = pluginContext.geoPluginPluginAddress;
    this.geoPluginRepoAddress = pluginContext.geoPluginRepoAddress;
  }
}
