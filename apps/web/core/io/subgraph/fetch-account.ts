import { Profile } from '~/core/types';

import { fetchProfile } from './fetch-profile';

export interface FetchAccountOptions {
  address: string;
  signal?: AbortController['signal'];
}

export async function fetchAccount(options: FetchAccountOptions): Promise<{ address: string; profile: Profile }> {
  const profile = await fetchProfile({ walletAddress: options.address });

  return {
    address: options.address,
    profile,
  };
}
