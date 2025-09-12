import { createConfig } from "@privy-io/wagmi";
import type { Chain } from "viem";
import { http } from "viem";
import { coinbaseWallet, injected, mock, walletConnect } from "wagmi/connectors";

export type GeoWalletConfigParams = {
	chain: Chain;
	rpcUrl: string;
	walletConnectProjectId: string;
};

export const createGeoWalletConfig = ({
	chain,
	rpcUrl: rpc,
	walletConnectProjectId,
}: GeoWalletConfigParams) => {
	return createConfig({
		chains: [chain],
		// This enables us to use a single injected connector but handle multiple wallet
		// extensions within the browser.
		multiInjectedProviderDiscovery: true,
		transports: {
			[chain.id]: http(rpc),
		},
		ssr: true,
		connectors: [
			coinbaseWallet({
				chainId: 137,
				appName: "Geo Genesis",
				appLogoUrl: "https://geobrowser.io/static/favicon-64x64.png",
				headlessMode: true,
			}),
			walletConnect({
				showQrModal: true,
				projectId: walletConnectProjectId,
				metadata: {
					name: "Geo Genesis",
					description:
						"Browse and organize the world's public knowledge and information in a decentralized way.",
					url: "https://geobrowser.io",
					icons: ["https://geobrowser.io/static/favicon-64x64.png"],
				},
			}),
			injected({
				target() {
					return {
						id: "windowProvider",
						name: "Window Provider",
						provider: (w) => w?.ethereum,
					};
				},
				shimDisconnect: true,
			}),
		],
	});
};

export const createMockConfig = (chain: Chain, queryClient?: QueryClient) => createConfig({
  chains: [chain],
  transports: {
    [chain.id]: http(),
  },
  queryClient,
  connectors: [
    mock({
      accounts: ['0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'],
    }),
  ],
});
