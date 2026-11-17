'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { setWalletSessionRefresh } from './sync-wallet-cookie';

/** Lets `syncWalletCookie` re-render the page once a new session makes the server see the user. */
export function WalletSessionRefresher() {
  const router = useRouter();
  React.useEffect(() => {
    setWalletSessionRefresh(() => router.refresh());
    return () => setWalletSessionRefresh(null);
  }, [router]);
  return null;
}
