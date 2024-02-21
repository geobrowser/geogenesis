'use client';

// import { ConnectKitButton } from 'connectkit';
// import { useSetAtom } from 'jotai';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { http } from 'viem';

import * as React from 'react';

import { useConnect, useDisconnect } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { coinbaseWallet, injected, mock, walletConnect } from 'wagmi/connectors';

// import { Button } from '~/design-system/button';
// import { DisconnectWallet } from '~/design-system/icons/disconnect-wallet';
// import { Wallet } from '~/design-system/icons/wallet';
// import { Spacer } from '~/design-system/spacer';
// import {
//   accountTypeAtom,
//   avatarAtom,
//   nameAtom,
//   profileIdAtom,
//   spaceAddressAtom,
//   stepAtom,
// } from '~/partials/onboarding/dialog';
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

// const customTransport = custom({
//   rpc: (chain: Chain): { http: string; webSocket?: string } => {
//     if (chain.id === polygon.id) {
//       return {
//         http: process.env.NEXT_PUBLIC_RPC_URL!,
//         webSocket: process.env.NEXT_PUBLIC_WSS_URL!,
//       };
//     }

//     if (chain.id === polygonMumbai.id) {
//       return {
//         http: polygonMumbai.rpcUrls.default.http[0],
//       };
//     }

//     if (chain.id === LOCAL_CHAIN.id) {
//       return {
//         http: LOCAL_CHAIN.rpcUrls.default.http[0],
//       };
//     }

//     return {
//       http: polygon.rpcUrls.default.http[0],
//     };
//   },
// }),

// const getMockWalletClient = () =>
//   createWalletClient({
//     transport: http(polygon.rpcUrls.default.http[0]),
//     chain: polygon,
//     account: '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24',
//     key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
//     pollingInterval: 100,
//   });

// const getMockPublicClient = () => {
//   return createPublicClient({
//     transport: http(polygon.rpcUrls.default.http[0]),
//     chain: polygon,
//     pollingInterval: 100,
//   });
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
  const onConnect = React.useCallback(({ address }: { address?: string }) => {
    if (!address) {
      return;
    }

    Cookie.onConnectionChange('connect', address);
  }, []);

  const onDisconnect = React.useCallback(() => {
    Cookie.onConnectionChange('disconnect', '');
  }, []);

  const ethereum = typeof window !== 'undefined' ? window?.ethereum : undefined;

  const walletConfig = React.useMemo(() => {
    return isTestEnv ? mockConfig : getRealWalletConfig(ethereum);
  }, [isTestEnv, ethereum]);

  return (
    <WagmiProvider config={walletConfig}>
      {/* <ConnectKitProvider onConnect={onConnect} onDisconnect={onDisconnect}> */}
      {children}
      {/* </ConnectKitProvider> */}
    </WagmiProvider>
  );
}

export function GeoConnectButton() {
  return null;
  // There's currently no mechanisms in connectkit to handle disconnecting their APIs
  // without going through the modal. It uses wagmi internally so we can escape-hatch
  // into wagmi-land to disconnect.
  // const { disconnect } = useDisconnect();
  // const { connect } = useConnect();

  // const setAccountType = useSetAtom(accountTypeAtom);
  // const setName = useSetAtom(nameAtom);
  // const setAvatar = useSetAtom(avatarAtom);
  // const setSpaceAddress = useSetAtom(spaceAddressAtom);
  // const setProfileId = useSetAtom(profileIdAtom);
  // const setStep = useSetAtom(stepAtom);

  // const resetOnboarding = () => {
  //   setAccountType(null);
  //   setName('');
  //   setAvatar('');
  //   setSpaceAddress('');
  //   setProfileId('');
  //   setStep('start');
  // };

  // return (
  //   <ConnectKitButton.Custom>
  //     {({ show, isConnected }) => {
  //       if (!isConnected) {
  //         return (
  //           <Button
  //             onClick={
  //               isTestEnv
  //                 ? () => {
  //                   console.log('Test environment detected: using mock wallet');
  //                   connect({
  //                     connector: mockConfig.connectors[0],
  //                     chainId: polygon.id,
  //                   });
  //                 }
  //                 : () => {
  //                   resetOnboarding();
  //                   show?.();
  //                 }
  //             }
  //             variant="secondary"
  //           >
  //             <Wallet />
  //             Connect
  //           </Button>
  //         );
  //       }

  //       return (
  //         // We're using an anonymous function for disconnect to appease the TS gods.
  //         <button
  //           onClick={() => {
  //             resetOnboarding();
  //             disconnect();
  //           }}
  //           className="m-0 flex w-full cursor-pointer items-center border-none bg-transparent p-0"
  //         >
  //           <DisconnectWallet />
  //           <Spacer width={8} />
  //           <p className="text-button">Disconnect</p>
  //         </button>
  //       );
  //     }}
  //   </ConnectKitButton.Custom>
  // );
}
