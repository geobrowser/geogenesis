import { GeoPluginContext } from '../context';
import { GeoPluginClientEncoding, GeoPluginClientMethods } from './client';
import { IGeoPluginClient, IGeoPluginClientEncoding, IGeoPluginClientMethods } from './interfaces';

export class GeoPluginClientCore implements IGeoPluginClient {
  public methods: IGeoPluginClientMethods;
  public encoding: IGeoPluginClientEncoding;

  constructor(pluginContext: GeoPluginContext) {
    this.methods = new GeoPluginClientMethods(pluginContext);
    this.encoding = new GeoPluginClientEncoding(pluginContext);
  }
}
