import { SYSTEM_IDS } from '@geogenesis/sdk';

import type { AppEntityValue, Triple } from '~/core/types';

import { getImageHash } from '../utils';

export function nameOfEntityValue(triple?: Triple) {
  if (!triple) return null;

  return triple.value.type === 'ENTITY' ? triple.value.name : null;
}

export function entityValue(triple: Triple) {
  if (!triple) return null;

  return triple.value.type === 'ENTITY' ? triple.value.value : null;
}

export function stringValue(triple?: Triple) {
  if (!triple) return null;

  return triple.value.type === 'TEXT' ? triple.value.value : null;
}

export function urlValue(triple?: Triple) {
  if (!triple) return null;

  return triple.value.type === 'URL' ? triple.value.value : null;
}

export function timeValue(triple?: Triple) {
  if (!triple) return null;

  return triple.value.type === 'TIME' ? triple.value.value : null;
}

export function imageValue(triple: Triple) {
  return triple.value.type === 'IMAGE' ? triple.value.image : null;
}

// Get the image triple value from an image path
// this converts the raw image string from `this.storageClient.uploadFile` into the appropriate
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

export function isRelationValueType(t: Triple): t is Triple & { value: AppEntityValue } {
  return t.value.type === 'ENTITY' && t.attributeId === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE;
}

export function isRelationValue(t: Triple): t is Triple & { value: AppEntityValue } {
  return t.value.type === 'ENTITY';
}

export function idsForEntityorCollectionItems(t: Triple) {
  let typeTripleContents: string[] = [];

  if (t.value.type === 'COLLECTION') {
    typeTripleContents = t.value.items.map(i => i.entity.id);
  }

  if (t.value.type === 'ENTITY') {
    typeTripleContents = [t.value.value];
  }

  return typeTripleContents;
}

export function entitiesForEntityOrCollectionItems(t: Triple) {
  if (t.value.type === 'ENTITY') {
    return [{ id: t.value.value, name: t.value.name }];
  }

  if (t.value.type === 'COLLECTION') {
    return t.value.items.map(i => ({
      id: i.entity.id,
      name: i.entity.name,
    }));
  }

  return null;
}
