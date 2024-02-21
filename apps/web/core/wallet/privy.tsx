'use client';

import {
  ConnectedWallet,
  PrivyProvider as Privy,
  PrivyClientConfig,
  User,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

import * as React from 'react';

// import { polygon } from 'viem/chains';
import { useAccount, useAccountEffect, useConfig } from 'wagmi';

import { registerGeoProfile } from '../io/publish';

const config: PrivyClientConfig = {
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
    requireUserPasswordOnCreate: true,
    noPromptOnSignature: false,
  },
  loginMethods: ['wallet', 'email', 'sms'],
  appearance: {
    showWalletLoginFirst: true,
  },

  // These are handled by wagmi
  // defaultChain: polygon,
  // supportedChains: [polygon],
  // embeddedWallets: {
  //   noPromptOnSignature: false,
  //   priceDisplay: {
  //     primary: 'fiat-currency',
  //     secondary: 'native-token',
  //   },
  // should enable this once we don't prompt on signature
  // waitForTransactionConfirmation: true,
  // },
};

// This method will be passed to the PrivyProvider as a callback
// that runs after successful login.
const onLogin = async (user: User) => {
  console.log(`User ${user.id} logged in!`);
};

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <Privy appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} onSuccess={user => onLogin(user)} config={config}>
      {children}
    </Privy>
  );
}

export function LoginButton() {
  const { login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  React.useEffect(() => {
    if (user?.wallet?.address) {
      const addWalletToWagmi = async () => {
        const wallet = wallets.find(w => w.address === user.wallet?.address);

        if (wallet) {
          await setActiveWallet(wallet);
        }
      };

      addWalletToWagmi();
    }
  }, [user?.wallet?.address, wallets]);

  return <button onClick={user ? logout : login}>{user ? 'Logout' : 'Login'}</button>;
}

export function TransactionTest() {
  const config = useConfig();
  const { address } = useAccount();

  if (!address) return;

  return <button onClick={() => registerGeoProfile(config, '0xTestTestTestTestTestTestTestTestTestTe')}>Deploy</button>;
}
