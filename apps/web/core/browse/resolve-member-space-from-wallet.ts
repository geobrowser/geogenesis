import { Effect } from 'effect';

import { getSpaceByAddress } from '~/core/io/queries';
import { fetchProfile } from '~/core/io/subgraph';
import { validateSpaceId } from '~/core/utils/utils';

/**
 * Resolves the member (personal) space id for subgraph / membership queries.
 * Mirrors browse sidebar resolution so explore and nav stay consistent.
 */
export async function resolveMemberSpaceFromWallet(walletAddress: string): Promise<string | null> {
  const profile = await Effect.runPromise(fetchProfile(walletAddress));
  if (validateSpaceId(profile.spaceId)) {
    return profile.spaceId;
  }
  const space = await Effect.runPromise(getSpaceByAddress(walletAddress));
  return space && validateSpaceId(space.id) ? space.id : null;
}

/**
 * Same as {@link resolveMemberSpaceFromWallet} but never throws (subgraph / network errors).
 * Used when resolving the wallet must not break pages or API routes that can still serve data.
 */
export async function resolveMemberSpaceFromWalletSafe(walletAddress: string): Promise<string | null> {
  try {
    return await resolveMemberSpaceFromWallet(walletAddress);
  } catch {
    return null;
  }
}
