'use client';

import { useLogin, useLogout, usePrivy, useWallets } from '@privy-io/react-auth';
import { WagmiProvider, createConfig, useSetActiveWallet } from '@privy-io/wagmi';
import { useSetAtom } from 'jotai';
import { http } from 'viem';
import { polygon } from 'viem/chains';

import * as React from 'react';

import { useAccount, useDisconnect } from 'wagmi';
import { coinbaseWallet, injected, mock, walletConnect } from 'wagmi/connectors';

import { Button } from '~/design-system/button';
import { DisconnectWallet } from '~/design-system/icons/disconnect-wallet';
import { Wallet } from '~/design-system/icons/wallet';
import { Spacer } from '~/design-system/spacer';

import {
  accountTypeAtom,
  avatarAtom,
  nameAtom,
  profileIdAtom,
  spaceAddressAtom,
  stepAtom,
} from '~/partials/onboarding/dialog';

import { Cookie } from '../cookie';

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

const getRealWalletConfig = (ethereum?: any) =>
  createConfig({
    chains: [polygon],
    // This enables us to use a single injected connector but handle multiple wallet
    // extensions within the browser.
    multiInjectedProviderDiscovery: true,
    transports: {
      [polygon.id]: http(process.env.NEXT_PUBLIC_RPC_URL!),
    },
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
            provider: ethereum ? ethereum : undefined,
          };
        },
        shimDisconnect: true,
      }),
    ],
  });

const mockConfig = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(),
  },
  connectors: [
    mock({
      accounts: ['0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'],
    }),
  ],
});

const isTestEnv = process.env.NEXT_PUBLIC_IS_TEST_ENV === 'true';

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const ethereum = typeof window !== 'undefined' ? window?.ethereum : undefined;

  const walletConfig = React.useMemo(() => {
    return isTestEnv ? mockConfig : getRealWalletConfig(ethereum);
  }, [isTestEnv, ethereum]);

  return (
    <WagmiProvider reconnectOnMount config={walletConfig}>
      {children}
    </WagmiProvider>
  );
}

export function GeoConnectButton() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  const resetOnboarding = () => {
    setAccountType(null);
    setName('');
    setAvatar('');
    setSpaceAddress('');
    setProfileId('');
    setStep('start');
  };

  // We're still using wagmi for contract calls instead of Privy. This means that
  // we need to keep the wagmi wallet state in sync with Privy as the user logs
  // in and out.
  const { login } = useLogin({
    onComplete: async user => {
      const wallet = wallets.find(wallet => wallet.address === user?.wallet?.address);

      if (wallet) {
        // setActiveWallet is a privy-specific API for connecting any of the
        // privy-aware wallets to wagmi's store.
        // https://docs.privy.io/reference/sdk/wagmi/functions/useSetActiveWallet#setactivewallet%23function-usesetactivewallet
        resetOnboarding();
        await Cookie.onConnectionChange({ type: 'connect', address: user?.wallet?.address as `0x${string}` });
        await setActiveWallet(wallet);
      }
    },
  });

  const { disconnectAsync } = useDisconnect();

  const { logout } = useLogout({
    onSuccess: async () => {
      resetOnboarding();
      await disconnectAsync();
      await Cookie.onConnectionChange({ type: 'disconnect' });
    },
  });

  const setAccountType = useSetAtom(accountTypeAtom);
  const setName = useSetAtom(nameAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceAddress = useSetAtom(spaceAddressAtom);
  const setProfileId = useSetAtom(profileIdAtom);
  const setStep = useSetAtom(stepAtom);

  if (!user) {
    return (
      <Button onClick={login} variant="secondary">
        <Wallet />
        Log in
      </Button>
    );
  }

  return (
    <button onClick={logout} className="m-0 flex w-full cursor-pointer items-center border-none bg-transparent p-0">
      <DisconnectWallet />
      <Spacer width={8} />
      <p className="text-button">Log out</p>
    </button>
  );
}
