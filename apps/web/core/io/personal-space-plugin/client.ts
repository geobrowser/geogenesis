import { GeoPersonalSpacePluginContext } from './context';
import {
  GeoPersonalSpacePluginClientEncoding,
  GeoPersonalSpacePluginClientMethods,
  IGeoPersonalSpacePluginClient,
} from './internal';
import { GeoPersonalSpacePluginClientCore } from './internal/core';

export class GeoPersonalSpacePluginClient
  extends GeoPersonalSpacePluginClientCore
  implements IGeoPersonalSpacePluginClient
{
  public methods: GeoPersonalSpacePluginClientMethods;
  public encoding: GeoPersonalSpacePluginClientEncoding;
  constructor(pluginContext: GeoPersonalSpacePluginContext) {
    super(pluginContext);
    this.methods = new GeoPersonalSpacePluginClientMethods(pluginContext);
    this.encoding = new GeoPersonalSpacePluginClientEncoding(pluginContext);
  }
}
