import { GeoPluginContext } from '../context';
import { GeoPluginClientMethods } from './client';
import { IGeoPluginClientMethods } from './interfaces';

export class GeoPluginClientCore {
  public methods: IGeoPluginClientMethods;

  constructor(pluginContext: GeoPluginContext) {
    this.methods = new GeoPluginClientMethods(pluginContext);
  }
}
