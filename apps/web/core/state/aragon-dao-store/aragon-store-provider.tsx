// src/context/AragonSDK.tsx
'use client';

import { Client, Context, ContextParams } from '@aragon/sdk-client';

import * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { useEthersSigner } from '~/core/wallet/ethers-adapters';

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

// src/context/AragonSDK.tsx

export interface AragonSDKContextValue {
  context?: Context;
  baseClient?: Client;
}

const AragonSDKContext = createContext({});

export const AragonSDKProvider = ({ children }: { children: React.ReactNode }) => {
  const [context, setContext] = useState<Context | undefined>(undefined);
  const ethersSigner = useEthersSigner({ chainId: 5 });

  useEffect(() => {
    const aragonSDKContextParams: ContextParams = {
      network: 'goerli', // mainnet, mumbai, etc
      signer: ethersSigner,
      daoFactoryAddress: '0x1E4350A3c9aFbDbd70FA30B9B2350B9E8182449a',
      web3Providers: ['https://rpc.ankr.com/eth_goerli'], // feel free to use the provider of your choosing: Alchemy, Infura, etc.
      ipfsNodes: [
        {
          url: 'https://testing-ipfs-0.aragon.network/api/v0',
          // headers: { 'X-API-KEY': process.env.NEXT_PUBLIC_IPFS_KEY || '' }, // make sure you have the key for your IPFS node within your .env file
          headers: { 'X-API-KEY': 'b477RhECf8s8sdM7XrkLBs2wHc4kCMwpbcFC55Kt' },
        },
      ],
      graphqlNodes: [
        {
          url: 'https://subgraph.satsuma-prod.com/aragon/osx-goerli/api', // this will change based on the chain you're using (osx-mainnet alternatively)
        },
      ],
    };

    setContext(new Context(aragonSDKContextParams));
  }, [ethersSigner]);

  console.log('aragon context', context);

  return <AragonSDKContext.Provider value={{ context }}>{children}</AragonSDKContext.Provider>;
};

export const useAragonSDKContext = () => {
  const value = useContext(AragonSDKContext);
  if (!value) {
    throw new Error('useAragonSDKContext must be used within a AragonSDKProvider');
  }
  return useContext(AragonSDKContext);
};
