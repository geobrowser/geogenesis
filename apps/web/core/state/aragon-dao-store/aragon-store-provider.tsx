'use client';

import { Client, Context, ContextParams } from '@aragon/sdk-client';

import * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { useNetwork } from 'wagmi';

import { GeoPluginContext } from '~/core/governance-space-plugin';
import { GeoPluginClient } from '~/core/governance-space-plugin/client';
import { useEthersSigner } from '~/core/wallet/ethers-adapters';

export interface AragonSDKContextValue {
  context?: Context;
  geoPluginContext?: GeoPluginContext;
  baseClient?: Client;
  geoPluginClient?: GeoPluginClient;
}

const AragonSDKContext = createContext<AragonSDKContextValue | undefined>(undefined);

// const geoPluginClientInstance = new GeoPluginClient(geoPluginContextInstance);

export const AragonSDKProvider = ({ children }: { children: React.ReactNode }) => {
  const [context, setContext] = useState<Context | undefined>(undefined);
  const [geoPluginContext, setGeoPluginContext] = useState<GeoPluginContext | undefined>(undefined);
  const [geoPluginClient, setGeoPluginClient] = useState<GeoPluginClient | undefined>(undefined);
  const { chain } = useNetwork();
  const ethersSigner = useEthersSigner({ chainId: chain?.id || 80001 });

  // @TODO use our Environment.options here once we finalize
  useEffect(() => {
    const aragonSDKContextParams: ContextParams = {
      network: 'maticmum',
      signer: ethersSigner,
      daoFactoryAddress: '0xc715336B5E7F10294F36CA09f19A0493070E2eFB', // mumbai dao factory address
      web3Providers: ['https://rpc.ankr.com/eth_goerli'], // feel free to use the provider of your choosing: Alchemy, Infura, etc.
      ipfsNodes: [
        {
          url: 'https://testing-ipfs-0.aragon.network/api/v0',
          headers: { 'X-API-KEY': process.env.NEXT_PUBLIC_IPFS_KEY || '' }, // make sure you have the key for your IPFS node within your .env file
        },
      ],
      graphqlNodes: [
        {
          url: 'https://subgraph.satsuma-prod.com/aragon/osx-mumbai/api', // this'll be the subgraph for the dao
        },
      ],
    };
    const contextInstance = new Context(aragonSDKContextParams);
    console.log('geoPluginClient', geoPluginClient);
    setContext(contextInstance);
  }, [ethersSigner]);

  return (
    <AragonSDKContext.Provider value={{ context, geoPluginContext, geoPluginClient }}>
      {children}
    </AragonSDKContext.Provider>
  );
};

export const useAragonSDKContext = () => {
  const value = useContext(AragonSDKContext);

  if (!value) {
    throw new Error('useAragonSDKContext must be used within a AragonSDKProvider');
  }
  return useContext(AragonSDKContext);
};
