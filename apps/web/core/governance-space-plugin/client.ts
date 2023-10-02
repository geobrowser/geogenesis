import { GeoPluginContext } from './context';
import { GeoPluginClientEncoding, GeoPluginClientMethods, IGeoPluginClient } from './internal';
import { GeoPluginClientCore } from './internal/core';

export class GeoPluginClient extends GeoPluginClientCore implements IGeoPluginClient {
  public methods: GeoPluginClientMethods;
  public encoding: GeoPluginClientEncoding;
  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);
    this.methods = new GeoPluginClientMethods(pluginContext);
    this.encoding = new GeoPluginClientEncoding(pluginContext);
  }
}
