'use client';

import { useLogin, useWallets } from '@privy-io/react-auth';
import { WagmiProvider, createConfig, useSetActiveWallet } from '@privy-io/wagmi';
import { useSetAtom } from 'jotai';
import { http } from 'viem';

import * as React from 'react';

import { coinbaseWallet, injected, mock, walletConnect } from 'wagmi/connectors';

import { Button } from '~/design-system/button';

import { avatarAtom, entityIdAtom, nameAtom, spaceIdAtom, stepAtom } from '~/partials/onboarding/dialog';

import { Environment } from '../environment';
import { GEOGENESIS } from './geo-chain';

const realWalletConfig = createConfig({
  chains: [GEOGENESIS],
  // This enables us to use a single injected connector but handle multiple wallet
  // extensions within the browser.
  multiInjectedProviderDiscovery: true,
  transports: {
    [GEOGENESIS.id]: http(Environment.getConfig().rpc),
  },
  ssr: true,
  connectors: [
    coinbaseWallet({
      chainId: 137,
      appName: 'Geo Genesis',
      appLogoUrl: 'https://geobrowser.io/static/favicon-64x64.png',
      headlessMode: true,
    }),
    walletConnect({
      showQrModal: true,
      projectId: Environment.variables.walletConnectProjectId,
      metadata: {
        name: 'Geo Genesis',
        description: "Browse and organize the world's public knowledge and information in a decentralized way.",
        url: 'https://geobrowser.io',
        icons: ['https://geobrowser.io/static/favicon-64x64.png'],
      },
    }),
    injected({
      target() {
        return {
          id: 'windowProvider',
          name: 'Window Provider',
          provider: w => w?.ethereum,
        };
      },
      shimDisconnect: true,
    }),
  ],
});

const mockConfig = createConfig({
  chains: [GEOGENESIS],
  transports: {
    [GEOGENESIS.id]: http(),
  },
  connectors: [
    mock({
      accounts: ['0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'],
    }),
  ],
});

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
  const { setActiveWallet } = useSetActiveWallet();
  const { wallets } = useWallets();

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

  const { login } = useLogin({
    onComplete: async user => {
      const userWallet = user.user.wallet;

      if (userWallet !== undefined) {
        const wallet = wallets.find(wallet => wallet.address === userWallet.address);

        if (wallet) {
          // @TODO: Make wallet from smart account...? Right now we set it in `useSmartAccount`
          await setActiveWallet(wallet);
        }

        resetOnboarding();
      }
    },
  });

  const onLogin = () => {
    resetOnboarding();
    login();
  };

  return <Button onClick={onLogin}>Sign in</Button>;
}
