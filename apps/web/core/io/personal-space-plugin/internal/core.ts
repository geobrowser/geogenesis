import {
  IGeoPluginClient,
  IGeoPluginClientEncoding,
  IGeoPluginClientMethods,
} from '../../governance-space-plugin/internal';
import { GeoPersonalSpacePluginContext } from '../context';
import { GeoPersonalSpacePluginClientEncoding, GeoPersonalSpacePluginClientMethods } from './client';
import {
  IGeoPersonalSpacePluginClient,
  IGeoPersonalSpacePluginClientEncoding,
  IGeoPersonalSpacePluginClientMethods,
} from './interfaces';

export class GeoPersonalSpacePluginClientCore implements IGeoPersonalSpacePluginClient {
  public methods: IGeoPersonalSpacePluginClientMethods;
  public encoding: IGeoPersonalSpacePluginClientEncoding;

  constructor(pluginContext: GeoPersonalSpacePluginContext) {
    this.methods = new GeoPersonalSpacePluginClientMethods(pluginContext);
    this.encoding = new GeoPersonalSpacePluginClientEncoding(pluginContext);
  }
}
