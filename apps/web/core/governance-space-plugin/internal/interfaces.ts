export interface IGeoPluginClientMethods {
  isMember(address: string): Promise<boolean>;
}
export interface IGeoPluginClient {
  methods: IGeoPluginClientMethods;
  // encoding: IGeoPluginClientEncoding;
}
