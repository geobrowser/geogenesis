'use client';

import { WagmiProvider, getGeoChain, useGeoLogin } from '@geogenesis/auth';
import { createGeoWalletConfig, createMockConfig } from '@geogenesis/auth/wallet';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { Button } from '~/design-system/button';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { Environment } from '../environment';

const CHAIN = getGeoChain('TESTNET');

const realWalletConfig = createGeoWalletConfig({
  chain: CHAIN,
  rpcUrl: Environment.getConfig().rpc,
  walletConnectProjectId: Environment.variables.walletConnectProjectId,
});

const mockConfig = createMockConfig(CHAIN);

const isTestEnv = process.env.NEXT_PUBLIC_IS_TEST_ENV === 'true';
const config = isTestEnv ? mockConfig : realWalletConfig;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider reconnectOnMount config={config}>
      {children}
    </WagmiProvider>
  );
}

export function GeoConnectButton() {
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  const resetOnboarding = () => {
    setName('');
    setTopicId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
  };

  // Reset is done on the explicit sign-in click below. Doing it here too
  // would wipe the user's in-progress onboarding state if Privy fires
  // onComplete on session restoration (e.g. when opening a new tab), which
  // then syncs the cleared atoms back to the original tab via localStorage.
  const { login } = useGeoLogin({});

  const onLogin = () => {
    resetOnboarding();
    login();
  };

  return <Button onClick={onLogin}>Sign in</Button>;
}
