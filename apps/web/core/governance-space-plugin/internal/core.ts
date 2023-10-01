import { GeoPluginContext } from '../context';
import { GeoPluginClientMethods } from './client';
import { IGeoPluginClient, IGeoPluginClientMethods } from './interfaces';

export class GeoPluginClientCore implements IGeoPluginClient {
  public methods: IGeoPluginClientMethods;

  constructor(pluginContext: GeoPluginContext) {
    this.methods = new GeoPluginClientMethods(pluginContext);
  }
}
