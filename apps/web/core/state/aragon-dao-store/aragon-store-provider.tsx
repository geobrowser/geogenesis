import { Client, ContextParams } from '@aragon/sdk-client';
import { SupportedNetwork } from '@aragon/sdk-client-common';

import * as React from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { GeoPluginContext as GeoPluginBaseContext } from '~/core/io/governance-space-plugin';
import { GeoPluginClient } from '~/core/io/governance-space-plugin/client';
import { useEthersSigner } from '~/core/wallet/ethers-adapters';

export interface AragonSDKContextValue {
  geoPluginContext?: GeoPluginBaseContext;
  baseClient?: Client;
  geoPluginClient?: GeoPluginClient;
}

const AragonSDKContext = createContext<AragonSDKContextValue | undefined>(undefined);

export const AragonSDKProvider = ({ children }: { children: React.ReactNode }) => {
  const [geoPluginContext, setGeoPluginContext] = useState<GeoPluginBaseContext | undefined>(undefined);
  const [geoPluginClient, setGeoPluginClient] = useState<GeoPluginClient | undefined>(undefined);
  const ethersSigner = useEthersSigner();

  const aragonSDKContextParams: ContextParams = useMemo(
    () => ({
      network: SupportedNetwork.POLYGON,
      signer: ethersSigner,
      // daoFactoryAddress: '0xc715336B5E7F10294F36CA09f19A0493070E2eFB', // mumbai dao factory address
      daoFactoryAddress: '0x51Ead12DEcD31ea75e1046EdFAda14dd639789b8', // polygon mainnet dao factory address
      ensRegistryAddress: '0x96E54098317631641703404C06A5afAD89da7373',
      web3Providers: 'https://polygon-mainnet.g.alchemy.com/v2/Qu7BVFD8_NIRN7eTsGus0GW7LneRT4u_',
      // web3Providers: process.env.NEXT_PUBLIC_RPC_URL,
      // ipfsNodes: [
      // {
      // url: 'https://testing-ipfs-0.aragon.network/api/v0',
      // headers: { 'X-API-KEY': process.env.NEXT_PUBLIC_IPFS_KEY || '' },
      //   },
      // ],
      // graphqlNodes: [
      //   {
      //     url: 'https://subgraph.satsuma-prod.com/aragon/osx-mumbai/api',
      //   },
      // ],
    }),
    [ethersSigner]
  );

  useEffect(() => {
    const geoPluginContextInstance = new GeoPluginBaseContext(aragonSDKContextParams);
    setGeoPluginContext(geoPluginContextInstance);
  }, [aragonSDKContextParams]);

  useEffect(() => {
    if (geoPluginContext) {
      const geoPluginClientInstance = new GeoPluginClient(geoPluginContext);
      setGeoPluginClient(geoPluginClientInstance);
    }
  }, [geoPluginContext]);

  return (
    <AragonSDKContext.Provider value={{ geoPluginContext, geoPluginClient }}>{children}</AragonSDKContext.Provider>
  );
};

export const useAragonSDKContext = () => {
  const value = useContext(AragonSDKContext);
  if (!value) {
    throw new Error('useAragonSDKContext must be used within a AragonSDKProvider');
  }
  return value;
};
