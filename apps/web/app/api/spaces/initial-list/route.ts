import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';

type InitialSpaceRow = {
  id: string;
  name: string;
  image: string | null;
};

export async function GET() {
  const cookieWallet = (await cookies()).get(WALLET_ADDRESS)?.value;
  const memberSpaceId = cookieWallet ? await resolveMemberSpaceFromWalletSafe(cookieWallet) : null;

  const browse = await fetchBrowseSidebarData(memberSpaceId);
  const ordered = [...browse.featured, ...browse.editorOf, ...browse.memberOf];

  const spaces = ordered
    .filter((row, index) => ordered.findIndex(r => r.id === row.id) === index)
    .map<InitialSpaceRow>(row => ({
      id: row.id,
      name: row.name,
      image: row.image,
    }));

  return NextResponse.json({ spaces });
}
