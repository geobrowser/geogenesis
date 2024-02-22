'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
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

// import { Cookie } from '../cookie';

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
    transports: {
      [polygon.id]: http(process.env.NEXT_PUBLIC_RPC_URL!),
    },
    // These connectors are based on how `connectkit` configures them internally when using
    // their default configuration.
    // https://github.com/family/connectkit/blob/47984040867a15ff8cbfdcdea534ad662c2d405e/packages/connectkit/src/defaultConfig.ts#L173
    connectors: [
      injected({
        target: 'metaMask',
        shimDisconnect: true,
      }),
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

  return <WagmiProvider config={walletConfig}>{children}</WagmiProvider>;
}

export function GeoConnectButton() {
  const { address } = useAccount();
  const { login, logout, user } = usePrivy();
  const { disconnect } = useDisconnect();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

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

  // We're still using wagmi for contract calls instead of Privy. This means that
  // we need to keep the wagmi wallet state in sync with Privy as the user logs
  // in and out.
  //
  // Currently we put all login/logout side-effects here. Normally we'd put these
  // in the event handler we use for login/logout, but since there's lots of state
  // from both privy and wagmi that updates on login/logout, there's not a clean
  // way to have all of the data we need in one event handler without data being stale.
  //
  // @TODO: Maybe a state machine is better
  React.useEffect(() => {
    const addWalletToWagmi = async (address?: string) => {
      const wallet = wallets.find(w => w.address === address);
      console.log('wallet', { wallets, wallet });

      if (wallet !== undefined) {
        // Cookie.onConnectionChange('connect', wallet.address);
        resetOnboarding();
        await setActiveWallet(wallet);
      }
    };

    if (user?.wallet?.address) {
      addWalletToWagmi(user.wallet.address);
    } else {
      // Cookie.onConnectionChange('disconnect', '');
      disconnect();
      resetOnboarding();
    }
  }, [user?.wallet?.address, wallets]);

  if (!address) {
    return (
      <Button
        onClick={
          isTestEnv
            ? () => {
                console.log('Test environment detected: using mock wallet');
                login();
              }
            : () => {
                login();
              }
        }
        variant="secondary"
      >
        <Wallet />
        Log in
      </Button>
    );
  }

  return (
    <button
      onClick={() => {
        logout();
      }}
      className="m-0 flex w-full cursor-pointer items-center border-none bg-transparent p-0"
    >
      <DisconnectWallet />
      <Spacer width={8} />
      <p className="text-button">Log out</p>
    </button>
  );
}
