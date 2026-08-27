import { createGeoClient } from '@geoprotocol/geo-sdk';

import { GEO_NETWORK } from './geo-network';

export const geo = createGeoClient({ network: GEO_NETWORK });

// Omit must distribute over the blob|url union or it collapses to the common keys.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type CreateGeoImageParams = DistributiveOmit<Parameters<typeof geo.images.create>[0], 'alternativeGateway'>;

// The testnet API's primary IPFS gateway is unreliable, so testnet uploads route
// through the alternative gateway endpoint — a quirk of the network, not of any
// call site, which is why the flag is decided here rather than passed in.
const USE_ALTERNATIVE_GATEWAY = GEO_NETWORK.id === 'TESTNET';

/**
 * Network-aware wrapper for image/video uploads that also mints the image entity
 * ops. Use this when the upload feeds the graph.
 */
export function createGeoImage(params: CreateGeoImageParams) {
  return geo.images.create({ ...params, alternativeGateway: USE_ALTERNATIVE_GATEWAY });
}

type UploadGeoImageParams = DistributiveOmit<Parameters<typeof geo.storage.uploadImage>[0], 'alternativeGateway'>;

/**
 * Network-aware raw image upload — returns the CID without creating graph ops.
 * For callers that just need a CID to hand to a deploy chain (space avatars).
 *
 * Goes through the client bound to GEO_NETWORK, so the upload always targets the
 * configured network. The deprecated `Ipfs.uploadImage` free function takes the
 * network as a positional argument and was being called with a hardcoded
 * 'TESTNET' — which silently pinned mainnet uploads to testnet infrastructure.
 */
export function uploadGeoImage(params: UploadGeoImageParams) {
  return geo.storage.uploadImage({ ...params, alternativeGateway: USE_ALTERNATIVE_GATEWAY });
}
