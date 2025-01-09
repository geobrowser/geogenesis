import type { Triple } from '~/core/types';

import { getImageHash } from '../utils';

export function stringValue(triple?: Triple) {
  if (!triple) return null;

  return triple.value.type === 'TEXT' ? triple.value.value : null;
}

// Get the image triple value from an image path
// this converts the raw image string from ipfs.uploadFile into the appropriate
// format for storing in the triple
// e.g., https://api.thegraph.com/ipfs/api/v0/cat?arg=HASH -> ipfs://HASH
export function toImageValue(rawValue: string) {
  // The CIDv0 decoding algorithm checks for length 46 and starts with 'Qm'
  // We check for length 53 to account for the `ipfs://` prefix
  if (rawValue.startsWith('ipfs://Qm') && rawValue.length === 53) {
    return rawValue;
  } else if (rawValue.includes('ipfs') && rawValue.includes('?arg=')) {
    return `ipfs://${getImageHash(rawValue)}`;
  } else {
    return '';
  }
}
