import { getAddress } from 'viem';

export function getChecksumAddress(address: string): string {
  // Using the polygon chain id (137) seems to checksum the address
  // in a way that's different than what you get on polygonscan. If
  // we don't specify the chain id, we get the correct polygonscan
  // result.
  return getAddress(address);
}
