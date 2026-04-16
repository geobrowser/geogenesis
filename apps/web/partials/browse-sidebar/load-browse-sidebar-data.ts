'use server';

import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { resolveMemberSpaceFromWallet } from '~/core/browse/resolve-member-space-from-wallet';
import { fetchBrowseSidebarData, type BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';

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
  const memberSpaceId = await resolveMemberSpaceFromWallet(wallet);
  return fetchBrowseSidebarData(memberSpaceId);
}
