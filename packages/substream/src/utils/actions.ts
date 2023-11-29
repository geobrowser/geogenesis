import { DESCRIPTION, NAME, TYPES } from '../constants/system-ids.js';
import { type Action, type UriData, ZodAction } from '../zod.js';
import { ipfsFetch } from './ipfs.js';

export async function fetchIpfsContent(uri: string): Promise<UriData | null> {
  if (uri.startsWith('data:application/json;base64,')) {
    const base64 = uri.split(',')[1]!; // we can cast with bang because we know a base64 string will always have a second element
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    return decoded;
  }

  if (uri.startsWith('ipfs://')) {
    const fetched = await ipfsFetch(uri);
    return fetched;
  }

  return null;
}

export function isValidAction(action: Action): action is Action {
  return ZodAction.safeParse(action).success;
}
