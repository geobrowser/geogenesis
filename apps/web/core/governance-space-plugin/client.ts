import { GeoPluginContext } from './context';
import { IGeoPluginClient } from './internal';
import { GeoPluginClientCore } from './internal/core';

export class GeoPluginClient extends GeoPluginClientCore implements IGeoPluginClient {
  // public methods: IMyPluginClientMethods;
  // public estimation: IMyPluginClientEstimation;
  // public encoding: IMyPluginClientEncoding;
  // public decoding: IMyPluginClientDecoding;

  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);
  }
}
