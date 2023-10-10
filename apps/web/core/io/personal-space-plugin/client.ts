import { GeoPluginClientEncoding, GeoPluginClientMethods, IGeoPluginClient } from '../governance-space-plugin/internal';
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
  public methods: GeoPluginClientMethods;
  public encoding: GeoPluginClientEncoding;
  constructor(pluginContext: GeoPersonalSpacePluginContext) {
    super(pluginContext);
    this.methods = new GeoPersonalSpacePluginClientMethods(pluginContext);
    this.encoding = new GeoPersonalSpacePluginClientEncoding(pluginContext);
  }
}
