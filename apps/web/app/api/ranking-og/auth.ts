import { cookies } from 'next/headers';

import { Effect } from 'effect';

import { getSpaceAccessById } from '~/core/access/space-access';
import { WALLET_ADDRESS } from '~/core/cookie';
import { getSpaceByAddress } from '~/core/io/queries';

const normalizeId = (id: string) => id.replace(/-/g, '').toLowerCase();

function parseWalletCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(lower) ? lower : null;
}

// The wallet cookie is httpOnly + sameSite=lax (set on connect), so its presence
// is a trustworthy "logged-in" signal for the browser publish/share flow.
export async function getRequestWallet(): Promise<string | null> {
  const store = await cookies();
  return parseWalletCookie(store.get(WALLET_ADDRESS)?.value);
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
