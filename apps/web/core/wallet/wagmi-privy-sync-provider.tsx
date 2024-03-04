'use client';

import { ConnectedWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

import * as React from 'react';

import { useAccount } from 'wagmi';

import { Cookie } from '../cookie';

// This handles reconnecting the user to the wagmi store when they refresh the page.
// Page refreshes can happen programatically either through fast refresh, data revalidation,
// or just normal revisits to Geo.
export function WagmiPrivySyncProvider() {
  const { address } = useAccount();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  const walletForPrivy = React.useMemo(
    () => wallets.find(wallet => wallet.address === user?.wallet?.address),
    [wallets, user?.wallet?.address]
  );

  React.useEffect(() => {
    async function syncWagmi(wallet: ConnectedWallet) {
      await setActiveWallet(wallet);
    }

    // We only sync wagmi if we don't already have an address set. For some reason if
    // we call setActiveWallet with the same wallet as the current active wallet, it
    // will disconnect it. I guess that somewhat makes sense, but it's not documented
    // anywhere and their implementation isn't open source. I just discovered it by luck.
    if (walletForPrivy && !address) {
      console.log('Geo: Syncing wagmi with Privy for wallet address', walletForPrivy?.address);
      syncWagmi(walletForPrivy);
    }
  }, [walletForPrivy?.address, address]);

  return null;
}
