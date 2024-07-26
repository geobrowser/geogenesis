'use client';

import { useLogin, useLogout, usePrivy, useWallets } from '@privy-io/react-auth';
import { WagmiProvider, createConfig, useSetActiveWallet } from '@privy-io/wagmi';
import { useSetAtom } from 'jotai';
import { createPublicClient, http } from 'viem';

import * as React from 'react';

import { coinbaseWallet, injected, mock, walletConnect } from 'wagmi/connectors';

import { Button } from '~/design-system/button';
import { DisconnectWallet } from '~/design-system/icons/disconnect-wallet';

import {
  accountTypeAtom,
  avatarAtom,
  nameAtom,
  profileIdAtom,
  spaceAddressAtom,
  stepAtom,
} from '~/partials/onboarding/dialog';

import { Cookie } from '../cookie';
import { CONDUIT_TESTNET } from './conduit-chain';

// const LOCAL_CHAIN: Chain = {
//   id: Number(Environment.options.development.chainId),
//   name: 'Geo Genesis Dev', // Human-readable name
//   network: 'ethereum', // Internal network name
//   nativeCurrency: {
//     name: 'Ethereum',
//     symbol: 'ETH',
//     decimals: 18,
//   },
//   rpcUrls: {
//     default: {
//       http: [Environment.options.development.rpc],
//     },
//     public: {
//       http: [Environment.options.development.rpc],
//     },
//   },
// };

export const publicClient = createPublicClient({
  chain: CONDUIT_TESTNET,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL!, { batch: true }),
});

const realWalletConfig = createConfig({
  chains: [CONDUIT_TESTNET],
  // This enables us to use a single injected connector but handle multiple wallet
  // extensions within the browser.
  multiInjectedProviderDiscovery: true,
  transports: {
    [CONDUIT_TESTNET.id]: http(process.env.NEXT_PUBLIC_RPC_URL!),
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
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
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
  chains: [CONDUIT_TESTNET],
  transports: {
    [CONDUIT_TESTNET.id]: http(),
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
  const { user } = usePrivy();
  const { wallets } = useWallets();

  const setAccountType = useSetAtom(accountTypeAtom);
  const setName = useSetAtom(nameAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceAddress = useSetAtom(spaceAddressAtom);
  const setProfileId = useSetAtom(profileIdAtom);
  const setStep = useSetAtom(stepAtom);

  const resetOnboarding = () => {
    setAccountType(null);
    setName('');
    setAvatar('');
    setSpaceAddress('');
    setProfileId('');
    setStep('start');
  };

  const { login } = useLogin({
    onComplete: async user => {
      const userWallet = user.wallet;
      console.log('user wallet', userWallet);

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
    console.log('on login');
    // logout();
    // return;
    resetOnboarding();
    login();
  };

  const { logout } = useLogout({
    onSuccess: async () => {
      console.log('disconnecting');
      await Cookie.onConnectionChange({ type: 'disconnect' });
      resetOnboarding();
    },
  });

  if (!user) {
    return (
      <Button onClick={onLogin}>
        {/* <Wallet color="white" /> */}
        Sign in
      </Button>
    );
  }

  return (
    <button
      onClick={logout}
      className="m-0 flex w-full cursor-pointer items-center justify-between border-none bg-transparent p-0"
    >
      <p className="text-button">Sign out</p>
      <DisconnectWallet />
    </button>
  );
}
