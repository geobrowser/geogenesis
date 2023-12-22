import { getAddress } from 'viem';

const POLYGON_CHAIN_ID = 137;

export function getChecksumAddress(address: string): string {
  return getAddress(address, POLYGON_CHAIN_ID);
}
