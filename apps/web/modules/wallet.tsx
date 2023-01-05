import styled from '@emotion/styled';
import { Chain, configureChains, createClient, useDisconnect, WagmiConfig } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';
import { Config } from './config';
import { Link } from './design-system/icons/link';
import { Unlink } from './design-system/icons/unlink';
import { Spacer } from './design-system/spacer';
import { Text } from './design-system/text';
import { ConnectKitProvider, ConnectKitButton, getDefaultClient } from 'connectkit';

// const LOCAL_CHAIN: Chain = {
//   id: Number(Config.options.development.chainId),
//   name: 'Geo Genesis Dev', // Human-readable name
//   network: 'ethereum', // Internal network name
//   nativeCurrency: {
//     name: 'Ethereum',
//     symbol: 'ETH',
//     decimals: 18,
//   },
//   rpcUrls: {
//     default: {
//       http: [Config.options.development.rpc]
//     }
//   },
// };

const TESTNET_CHAIN: Chain = {
  id: Number(Config.options.testnet.chainId),
  name: 'Polygon Mumbai', // Human-readable name
  network: 'mumbai', // Internal network name
  nativeCurrency: {
    name: 'Polygon Mumbai',
    symbol: 'MATIC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [Config.options.testnet.rpc],
    },
  },
};

const DEFAULT_CHAIN: Chain = {
  id: Number(Config.options.production.chainId),
  name: 'Polygon', // Human-readable name
  network: 'polygon', // Internal network name
  nativeCurrency: {
    name: 'Polygon Mumbai',
    symbol: 'MATIC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [Config.options.production.rpc],
    },
  },
};

const { chains, provider, webSocketProvider } = configureChains([DEFAULT_CHAIN, TESTNET_CHAIN], [publicProvider()]);

const wagmiClient = createClient({
  ...getDefaultClient({
    appName: 'Geo Genesis',
    chains,
    webSocketProvider,
    provider,
    autoConnect: true,
  }),
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiConfig client={wagmiClient}>
      <ConnectKitProvider>{children}</ConnectKitProvider>
    </WagmiConfig>
  );
}

const StyledConnectButton = styled.button(props => ({
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: props.theme.colors.ctaPrimary,
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  padding: 0,
  margin: 0,
}));

export function GeoConnectButton() {
  // There's currently no mechanisms in connectkit to handle disconnecting their APIs.
  // It uses wagmi internally so we can escape-hatch into wagmi-land to disconnect.
  const { disconnect } = useDisconnect();

  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected }) => {
        return (
          // We're using an anonymous function for disconnect to appease the TS gods.
          <StyledConnectButton onClick={isConnected ? () => disconnect() : show}>
            {isConnected ? <Unlink /> : <Link />}
            <Spacer width={8} />
            <Text color="ctaPrimary" variant="button">
              {isConnected ? 'Disconnect wallet' : 'Connect wallet'}
            </Text>
          </StyledConnectButton>
        );
      }}
    </ConnectKitButton.Custom>
  );
}
