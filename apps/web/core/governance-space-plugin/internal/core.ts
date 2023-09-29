import { GeoPluginContext } from '../context';
import { GeoPluginClientMethods } from './client';

export class GeoPluginClientCore {
  public methods: GeoPluginClientMethods;

  constructor(pluginContext: GeoPluginContext) {
    this.methods = new GeoPluginClientMethods(pluginContext);
  }
}
