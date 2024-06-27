import { createGeoId } from '@geogenesis/sdk';
import { createHash } from 'crypto';
import { v4 } from 'uuid';

export function createActionId(): string {
  return createGeoId();
}

export function createVersionId({ proposalId, entityId }: { proposalId: string; entityId: string }): string {
  return `${proposalId}:${entityId}`;
}

export function createSpaceId({ network, address }: { network: string; address: string }) {
  return createIdFromUniqueString(`${network}:${address}`);
}

function createIdFromUniqueString(text: string) {
  const hashed = createHash('md5').update(text).digest('hex');
  const bytes = hexToBytesArray(hashed);
  const uuid = v4({ random: bytes });
  const id = stripDashes(uuid);

  return id;
}

function hexToBytesArray(hex: string) {
  let bytes = [];
  for (let c = 0; c < hex.length; c += 2) bytes.push(parseInt(hex.substr(c, 2), 16));
  return bytes;
}

// Helper function for createIdFromUniqueString
function stripDashes(uuid: string) {
  return uuid.split('-').join('');
}
