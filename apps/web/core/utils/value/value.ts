import { SYSTEM_IDS } from '@geogenesis/ids';

import type { EntityValue, Triple } from '~/core/types';

import { getImageHash } from '../utils';

export function nameOfEntityValue(triple?: Triple) {
  if (!triple) return null;

  return triple?.value?.type === 'entity' ? triple.value.name : null;
}

export function stringValue(triple?: Triple) {
  if (!triple) return null;

  return triple?.value?.type === 'string' ? triple.value.value : null;
}

export function urlValue(triple?: Triple) {
  if (!triple) return null;

  return triple?.value?.type === 'url' ? triple.value.value : null;
}

export function dateValue(triple?: Triple) {
  if (!triple) return null;

  return triple?.value?.type === 'date' ? triple.value.value : null;
}

export function imageValue(triple: Triple) {
  return triple?.value?.type === 'image' ? triple.value.value : null;
}

// Get the image triple value from an image path
// this converts the raw image string from `this.storageClient.uploadFile` into the appropriate
// format for storing in the triple
// e.g., https://api.thegraph.com/ipfs/api/v0/cat?arg=HASH -> ipfs://HASH
export function toImageValue(rawValue: string) {
  if (rawValue.includes('ipfs') && rawValue.includes('?arg=')) {
    return `ipfs://${getImageHash(rawValue)}`;
  } else {
    return '';
  }
}

export function isRelationValueType(t: Triple): t is Triple & { value: EntityValue } {
  return t.value.type === 'entity' && t.attributeId === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE;
}
