import { cookies } from 'next/headers';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';

import { ExplorePage } from '~/partials/explore/explore-page';

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

export default async function ExploreRoutePage() {
  const wallet = (await cookies()).get(WALLET_ADDRESS)?.value;
  let memberSpaceId: string | null = null;
  let browse: BrowseSidebarData;
  try {
    memberSpaceId = wallet ? await resolveMemberSpaceFromWalletSafe(wallet) : null;
    browse = await fetchBrowseSidebarData(memberSpaceId);
  } catch {
    try {
      browse = await fetchBrowseSidebarData(null);
    } catch {
      browse = {
        featured: [],
        editorOf: [],
        memberOf: [],
        documentationImage: null,
        personalSpaceId: null,
      };
    }
  }

  const seen = new Set<string>();
  const initialSpaceOptions: { value: string; label: string }[] = [];
  for (const row of [...browse.featured, ...browse.editorOf, ...browse.memberOf]) {
    const k = normId(row.id);
    if (seen.has(k)) continue;
    seen.add(k);
    initialSpaceOptions.push({ value: row.id, label: row.name });
  }

  return <ExplorePage initialSpaceOptions={initialSpaceOptions} />;
}
