import { GeoPluginContext } from './context';
import { IGeoPluginClient } from './internal';
import { GeoPluginClientCore } from './internal/core';

export class GeoPluginClient extends GeoPluginClientCore implements IGeoPluginClient {
  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);
  }
}
