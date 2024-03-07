'use client';

import { useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';
import { useCookies } from 'react-cookie';

import * as React from 'react';

import { useAccount } from 'wagmi';

import { WALLET_ADDRESS } from '../cookie';

// @NOTE: Privy currently doesn't reconnect the wallet in wagmi correctly whenever the app
// router reloads or revalidates server data programatically. This can happen when revalidating
// cache data, calling router.refresh, set cookies, in dev mode with fast-refresh, etc.
//
// The privy integration isn't open source so we're can't inspect what's actually going wrong.
// Hopefully they eventually fix this and we don't have to manually reconnect the wallet.
export function WagmiPrivySyncProvider() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const [cookie] = useCookies([WALLET_ADDRESS]);

  const walletForConnectedAddress = React.useMemo(() => {
    return wallets.find(w => w.address === cookie.walletAddress);
  }, [cookie.walletAddress, wallets]);

  React.useEffect(() => {
    if (cookie.walletAddress !== address) {
      if (walletForConnectedAddress) {
        (async () => {
          console.log('Geo: Synchronizing selected wallet with wagmi x Privy', walletForConnectedAddress);
          await setActiveWallet(walletForConnectedAddress);
        })();
      }
    }
  }, [cookie.walletAddress, address, walletForConnectedAddress]);

  return null;
}
