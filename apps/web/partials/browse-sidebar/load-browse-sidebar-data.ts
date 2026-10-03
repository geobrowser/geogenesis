'use server';

import { cookies } from 'next/headers';

import { type BrowseSidebarData, fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWallet } from '~/core/browse/resolve-member-space-from-wallet';
import { readWalletCookie } from '~/core/cookie/wallet-session';

/**
 * @param walletAddressHint — Smart account address from the client, for the moments before the
 *   wallet session exists (right after connect, while the server verifies the Privy login).
 *   Taking it on trust is deliberate and safe: it only picks whose sidebar to build, and
 *   everything in a sidebar is public graph data the browser can already fetch for any space
 *   through `fetchBrowseSidebarData`. Anything that grants access must use the verified session
 *   instead (GEO-3107).
 */
export async function loadBrowseSidebarData(walletAddressHint?: string | null): Promise<BrowseSidebarData> {
  const cookieWallet = readWalletCookie(await cookies());
  const wallet = walletAddressHint ?? cookieWallet;
  if (!wallet) {
    return fetchBrowseSidebarData(null);
  }
  const memberSpaceId = await resolveMemberSpaceFromWallet(wallet);
  return fetchBrowseSidebarData(memberSpaceId);
}
