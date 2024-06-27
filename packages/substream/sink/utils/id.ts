import { createGeoId } from '@geogenesis/sdk';
import { createHash } from 'crypto';
import { v4 } from 'uuid';

export function createActionId(): string {
  return createGeoId();
}

export function createVersionId({ proposalId, entityId }: { proposalId: string; entityId: string }): string {
  return `${proposalId}:${entityId}`;
}

/**
 * A space's id is derived from the contract address of the DAO and the network the DAO is deployed to.
 * Users can import or fork a space from any network and import the contents of the original space into
 * the new one that they're creating.
 */
export function createSpaceId({ network, address }: { network: string; address: string }) {
  return createIdFromUniqueString(`${network}:${address}`);
}

function createIdFromUniqueString(text: string) {
  const hashed = createHash('md5').update(text).digest('hex');
  const bytes = hexToBytesArray(hashed);
  const uuid = v4({ random: bytes });
  return stripDashes(uuid);
}

function hexToBytesArray(hex: string) {
  let bytes: number[] = [];

  for (let character = 0; character < hex.length; character += 2) {
    bytes.push(parseInt(hex.slice(character, character + 2), 16));
  }

  return bytes;
}

// Helper function for createIdFromUniqueString
function stripDashes(uuid: string) {
  return uuid.split('-').join('');
}
