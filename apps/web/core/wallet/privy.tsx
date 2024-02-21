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
import { zeroAddress } from 'viem';

import * as React from 'react';

// import { polygon } from 'viem/chains';
import { useAccount, useAccountEffect, useConfig, useDisconnect } from 'wagmi';

import { Cookie } from '../cookie';
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

export function TransactionTest() {
  const config = useConfig();
  const { address } = useAccount();

  if (!address) return;

  return <button onClick={() => registerGeoProfile(config, zeroAddress)}>Deploy</button>;
}
