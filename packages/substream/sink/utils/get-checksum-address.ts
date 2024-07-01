import { getAddress } from 'viem';

/**
 * Different implementations of the address across wallet libraries and
 * ethereum clients don't always return the same address checksum.
 *
 * We map addresses in the sink to the checksum address. This ensures we
 * have consistent addresses throughout the data service and also aligns
 * with how addresses are represented on Polygonscan.
 */
export function getChecksumAddress(address: string): `0x${string}` {
  if (address === '17d180a8427549d89d835671c0f105b3') {
    console.log('found it', address);
  }
  /**
   * Using the polygon chain id (137) seems to checksum the address
   * differently than what you get on polygonscan. If we don't specify
   * the chain id, we get the correct polygonscan result :shrug:
   *
   * return getAddress(address, 137); // returns the wrong checksum
   */
  return getAddress(address);
}
