'use server';

import { Effect } from 'effect';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchBrowseSidebarData, type BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchProfile } from '~/core/io/subgraph';

export async function loadBrowseSidebarData(): Promise<BrowseSidebarData> {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const person = connectedAddress ? await Effect.runPromise(fetchProfile(connectedAddress)) : null;
  return fetchBrowseSidebarData(person?.spaceId);
}
