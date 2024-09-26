import { NETWORK_IDS } from '@geobrowser/gdk/ids';
import md5 from 'md5';
import { v4 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { createSpaceId } from './id';

const ADDRESS = '0x72332Cd2bA2f7f0B52EC198b4C6faa0ee57CAe89';

describe('createSpaceId', () => {
  it('creates a hash that matches md5 spec', () => {
    const ours = createSpaceId({ network: NETWORK_IDS.GEO, address: ADDRESS });
    const theirs = createIdFromUniqueString(`${NETWORK_IDS.GEO}:${ADDRESS}`);

    expect(ours).toEqual(theirs);
  });
});

function createIdFromUniqueString(text: string) {
  const hashed = md5(text);
  const bytes = hexToBytesArray(hashed);
  const uuid = v4({ random: bytes });
  return stripDashes(uuid);
}

function hexToBytesArray(hex: string) {
  const bytes: number[] = [];

  for (let character = 0; character < hex.length; character += 2) {
    bytes.push(parseInt(hex.slice(character, character + 2), 16));
  }

  return bytes;
}

// Helper function for createIdFromUniqueString
function stripDashes(uuid: string) {
  return uuid.split('-').join('');
}
