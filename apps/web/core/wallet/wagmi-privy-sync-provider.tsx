'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

import { useAccount, useAccountEffect } from 'wagmi';

import { Cookie } from '../cookie';

// This handles reconnecting the user to the wagmi store when they refresh the page.
// Page refreshes can happen programatically either through fast refresh, data revalidation,
// or just normal revisits to Geo.
export function WagmiPrivySyncProvider() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  useAccountEffect({
    onConnect: async wallet => {
      if (wallet.address === user?.wallet?.address) {
        console.log('connected effect', { wallet, wallets, isReconnected: wallet.isReconnected });
        await Cookie.onConnectionChange({ type: 'connect', address: wallet.address });
        await setActiveWallet(wallets[0]);
      }
    },
    onDisconnect: async () => {
      console.log('disconnected effect');
      await Cookie.onConnectionChange({ type: 'disconnect' });
    },
  });

  return null;
}
