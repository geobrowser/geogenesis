'use server';

import { Effect } from 'effect';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchBrowseSidebarData, type BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { getSpaceByAddress } from '~/core/io/queries';
import { fetchProfile } from '~/core/io/subgraph';
import { validateSpaceId } from '~/core/utils/utils';

/**
 * REST profile sometimes falls back to `spaceId === wallet` when the request fails.
 * Subgraph membership/editor filters need the real personal space id (bytes16 / UUID).
 */
async function resolveMemberSpaceId(walletAddress: string): Promise<string | null> {
  const profile = await Effect.runPromise(fetchProfile(walletAddress));
  if (validateSpaceId(profile.spaceId)) {
    return profile.spaceId;
  }
  const space = await Effect.runPromise(getSpaceByAddress(walletAddress));
  return space && validateSpaceId(space.id) ? space.id : null;
}

/**
 * @param walletAddressHint — Smart account address from the client when the session cookie
 *   is not set yet (common right after connect). Same pattern as `useSmartAccount` syncing cookies.
 */
export async function loadBrowseSidebarData(walletAddressHint?: string | null): Promise<BrowseSidebarData> {
  const cookieWallet = (await cookies()).get(WALLET_ADDRESS)?.value;
  const wallet = walletAddressHint ?? cookieWallet;
  if (!wallet) {
    return fetchBrowseSidebarData(null);
  }
  const memberSpaceId = await resolveMemberSpaceId(wallet);
  return fetchBrowseSidebarData(memberSpaceId);
}
