// Privy Auth exports
export { usePrivy, useLogout, PrivyProvider, PrivyClientConfig } from "@privy-io/react-auth";

// Privy Wagmi exports  
export { WagmiProvider } from "@privy-io/wagmi";

// Wagmi hooks - these should work with Privy's WagmiProvider
export { useAccountEffect, useWalletClient } from 'wagmi';

export { generateSmartAccount } from "./src/account.js";
export { getGeoChain } from "./src/chain.js";
export { useGeoLogin } from "./src/use-login.js";
export { createGeoWalletConfig, createMockConfig } from "./src/wallet-config.js";
