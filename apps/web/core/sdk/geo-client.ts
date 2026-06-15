import { GeoTestnetConfig, createGeoClient, defineGeoNetworkConfig } from '@geoprotocol/geo-sdk';

import { Environment } from '../environment';

const buildLocalNetworkConfig = () => {
  const config = Environment.getConfig();
  const contracts = Environment.variables.localContracts;

  if (!contracts) {
    throw new Error('Local-dev SDK config requires NEXT_PUBLIC_SPACE_REGISTRY_ADDRESS and NEXT_PUBLIC_DAO_SPACE_FACTORY_ADDRESS');
  }

  // The SDK appends paths like /ipfs/upload-edit at the origin level, so strip a trailing
  // /graphql off the configured api endpoint.
  const apiOrigin = config.api.replace(/\/graphql\/?$/, '');

  return defineGeoNetworkConfig({
    id: 'LOCAL',
    name: 'Local Geo',
    apiOrigin,
    chain: {
      id: Number(config.chainId),
      name: 'Geo Local',
      rpcUrl: config.rpc,
    },
    contracts: {
      SPACE_REGISTRY_ADDRESS: contracts.spaceRegistry,
      DAO_SPACE_FACTORY_ADDRESS: contracts.daoSpaceFactory,
    },
  });
};

const network = Environment.variables.isLocalDev ? buildLocalNetworkConfig() : GeoTestnetConfig;

export const geo = createGeoClient({ network });
