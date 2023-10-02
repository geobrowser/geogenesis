import { GeoPluginContext } from './context';
import { GeoPluginClientMethods, IGeoPluginClient } from './internal';
import { GeoPluginClientCore } from './internal/core';

export class GeoPluginClient extends GeoPluginClientCore implements IGeoPluginClient {
  public methods: GeoPluginClientMethods;
  constructor(pluginContext: GeoPluginContext) {
    console.log('plugin context', pluginContext);
    super(pluginContext);
    this.methods = new GeoPluginClientMethods(pluginContext);
  }
}
