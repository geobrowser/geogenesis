'use client';

import { PrivyProvider as Privy, PrivyClientConfig, User } from '@privy-io/react-auth';
import { zeroAddress } from 'viem';
import { polygon } from 'viem/chains';

import * as React from 'react';

import { useAccount, useConfig } from 'wagmi';

import { registerGeoProfile } from '../io/publish';

const config: PrivyClientConfig = {
  defaultChain: polygon,
  supportedChains: [polygon],

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
