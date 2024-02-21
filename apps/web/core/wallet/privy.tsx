'use client';

import { PrivyProvider as Privy, PrivyClientConfig, User, usePrivy } from '@privy-io/react-auth';
import { polygon } from 'viem/chains';

import { useAccount, useConfig, useWalletClient } from 'wagmi';

import { registerGeoProfile } from '../io/publish';

const config: PrivyClientConfig = {
  defaultChain: polygon,
  embeddedWallets: {
    noPromptOnSignature: false,
    priceDisplay: {
      primary: 'fiat-currency',
      secondary: 'native-token',
    },
    // should enable this once we don't prompt on signature
    // waitForTransactionConfirmation: true,
  },
};

// This method will be passed to the PrivyProvider as a callback
// that runs after successful login.
const onLogin = (user: User) => {
  console.log(`User ${user.id} logged in!`);
};

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <Privy appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} onSuccess={onLogin} config={config}>
      {children}
    </Privy>
  );
}

export function LoginButton() {
  const { login, logout, user } = usePrivy();

  return <button onClick={user ? logout : login}>{user ? 'Logout' : 'Login'}</button>;
}

export function TransactionTest() {
  const config = useConfig();
  const account = useAccount();

  if (!config) return;

  console.log('data', { account, config });

  return <button onClick={() => registerGeoProfile(config, '0xTestTestTestTestTestTestTestTestTestTe')}>Deploy</button>;
}
