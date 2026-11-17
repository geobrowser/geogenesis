'use server';

import { type BrowseSidebarData, fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWallet } from '~/core/browse/resolve-member-space-from-wallet';
import { readWalletSession } from '~/core/cookie/wallet-session';

/**
 * @param walletAddressHint — Smart account address from the client when the session cookie
 *   is not set yet (common right after connect). Same pattern as `useSmartAccount` syncing cookies.
 */
export async function loadBrowseSidebarData(walletAddressHint?: string | null): Promise<BrowseSidebarData> {
  const cookieWallet = await readWalletSession();
  const wallet = walletAddressHint ?? cookieWallet;
  if (!wallet) {
    return fetchBrowseSidebarData(null);
  }
  const memberSpaceId = await resolveMemberSpaceFromWallet(wallet);
  return fetchBrowseSidebarData(memberSpaceId);
}
