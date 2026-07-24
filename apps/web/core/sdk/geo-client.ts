import { createGeoClient } from '@geoprotocol/geo-sdk';

import { GEO_NETWORK } from './geo-network';

export const geo = createGeoClient({ network: GEO_NETWORK });

// Omit must distribute over the blob|url union or it collapses to the common keys.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type CreateGeoImageParams = DistributiveOmit<Parameters<typeof geo.images.create>[0], 'alternativeGateway'>;

/**
 * Network-aware wrapper for image/video uploads. The testnet API's primary
 * IPFS gateway is unreliable, so testnet uploads route through the alternative
 * gateway endpoint — a quirk of the network, not of any call site, which is
 * why the flag is decided here.
 */
export function createGeoImage(params: CreateGeoImageParams) {
  return geo.images.create({ ...params, alternativeGateway: GEO_NETWORK.id === 'TESTNET' });
}
