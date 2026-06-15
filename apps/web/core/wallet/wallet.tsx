'use client';

import { WagmiProvider, getGeoChain, useGeoLogin } from '@geogenesis/auth';
import { createGeoWalletConfig, createLocalDevConfig, createMockConfig } from '@geogenesis/auth/wallet';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import {
  WagmiProvider as StandardWagmiProvider,
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from 'wagmi';

import { Button } from '~/design-system/button';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { trackPrivyAuth } from '../analytics';
import { Environment } from '../environment';

const isTestEnv = Environment.variables.isTestEnv;
const isLocalDev = Environment.variables.isLocalDev;

const CHAIN = isLocalDev ? getGeoChain('LOCAL', Environment.getConfig().rpc) : getGeoChain('TESTNET');
const LOCAL_CHAIN_ID = CHAIN.id;

const realWalletConfig = createGeoWalletConfig({
  chain: CHAIN,
  rpcUrl: Environment.getConfig().rpc,
  walletConnectProjectId: Environment.variables.walletConnectProjectId,
});

const mockConfig = createMockConfig(CHAIN);

const localDevConfig = isLocalDev ? createLocalDevConfig({ chain: CHAIN, rpcUrl: Environment.getConfig().rpc }) : null;

const activeConfig = isLocalDev && localDevConfig ? localDevConfig : isTestEnv ? mockConfig : realWalletConfig;

const config = activeConfig as unknown as React.ComponentProps<typeof WagmiProvider>['config'];

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Local-dev mode skips Privy entirely; mount the standard wagmi WagmiProvider so we
  // don't require PrivyProvider above us. Privy's WagmiProvider calls useWallets internally
  // and crashes without the Privy context.
  if (isLocalDev) {
    return (
      <StandardWagmiProvider reconnectOnMount config={activeConfig}>
        {children}
      </StandardWagmiProvider>
    );
  }

  return (
    <WagmiProvider reconnectOnMount config={config}>
      {children}
    </WagmiProvider>
  );
}

function LocalDevConnectButton() {
  const { connectors, connect, isPending, error } = useConnect();
  const { isConnected, address, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  if (isConnected && chainId !== LOCAL_CHAIN_ID) {
    return (
      <Button onClick={() => switchChain({ chainId: LOCAL_CHAIN_ID })} disabled={isSwitching}>
        {isSwitching ? 'Switching…' : switchError ? 'Switch failed — retry' : `Switch to chain ${LOCAL_CHAIN_ID}`}
      </Button>
    );
  }

  if (isConnected) {
    return (
      <Button onClick={() => disconnect()} variant="secondary">
        {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Disconnect'}
      </Button>
    );
  }

  const handleClick = () => {
    // Wallet preference: EIP-6963-discovered (real extensions) first, in order
    // MetaMask → Rabby → any other → windowProvider fallback. Picking windowProvider
    // first picks whichever extension last set window.ethereum — usually wrong when
    // multiple wallets are installed.
    const connector =
      connectors.find(c => c.id === 'io.metamask') ??
      connectors.find(c => c.id === 'io.rabby') ??
      connectors.find(c => c.type === 'injected' && c.id !== 'windowProvider') ??
      connectors.find(c => c.id === 'windowProvider') ??
      connectors[0];

    if (!connector) {
      return;
    }

    connect({ connector, chainId: LOCAL_CHAIN_ID });
  };

  return (
    <Button onClick={handleClick} disabled={isPending}>
      {error ? 'Connect failed — retry' : isPending ? 'Connecting…' : 'Connect Wallet'}
    </Button>
  );
}

function PrivyConnectButton() {
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
  const { login } = useGeoLogin({
    onComplete: args => trackPrivyAuth(args, { auth_flow: 'manual_login' }),
  });

  const onLogin = () => {
    resetOnboarding();
    login();
  };

  return <Button onClick={onLogin}>Log in</Button>;
}

export function GeoConnectButton() {
  return isLocalDev ? <LocalDevConnectButton /> : <PrivyConnectButton />;
}
