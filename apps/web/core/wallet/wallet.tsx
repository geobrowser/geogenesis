'use client';

import { WagmiProvider, createGeoWalletConfig, createMockConfig, getGeoChain, useGeoLogin } from '@geogenesis/auth';
import { useSetAtom } from 'jotai';

import * as React from 'react';

import { Button } from '~/design-system/button';

import { avatarAtom, entityIdAtom, nameAtom, spaceIdAtom, stepAtom } from '~/partials/onboarding/dialog';

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
  const setEntityId = useSetAtom(entityIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  const resetOnboarding = () => {
    setName('');
    setEntityId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
  };

  const { login } = useGeoLogin({
    onComplete: () => {
      resetOnboarding();
    },
  });

  const onLogin = () => {
    resetOnboarding();
    login();
  };

  return <Button onClick={onLogin}>Sign in</Button>;
}
