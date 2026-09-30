import { Effect } from 'effect';
import { cookies } from 'next/headers';

import { getSpaceAccessById } from '~/core/access/space-access';
import { readWalletCookieLowercase } from '~/core/cookie/wallet-session';
import { getSpaceByAddress } from '~/core/io/queries';

const normalizeId = (id: string) => id.replace(/-/g, '').toLowerCase();


// The wallet cookie is httpOnly + sameSite=lax (set on connect), so its presence
// is a trustworthy "logged-in" signal for the browser publish/share flow.
export async function getRequestWallet(): Promise<string | null> {
  const store = await cookies();
  return readWalletCookieLowercase(store);
}

// True when the wallet's personal space can edit the target space. Used to ensure
// a caller may only generate personal OG images for a rank they actually own.
export async function walletCanEditSpace(wallet: string, spaceId: string): Promise<boolean> {
  try {
    const personalSpace = await Effect.runPromise(getSpaceByAddress(wallet));
    const personalSpaceId = personalSpace ? normalizeId(personalSpace.id) : null;
    if (!personalSpaceId) return false;
    const access = await Effect.runPromise(getSpaceAccessById(normalizeId(spaceId), personalSpaceId));
    return access.canEdit;
  } catch (error) {
    console.error('[ranking-og/auth] walletCanEditSpace failed', error);
    return false;
  }
}
