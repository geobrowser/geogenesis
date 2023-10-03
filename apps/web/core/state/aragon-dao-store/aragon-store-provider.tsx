import { Client, ContextParams } from '@aragon/sdk-client';

import * as React from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// import { useNetwork } from 'wagmi';
import { GeoPluginContext as GeoPluginBaseContext } from '~/core/io/governance-space-plugin';
import { GeoPluginClient } from '~/core/io/governance-space-plugin/client';

// import { useEthersSigner } from '~/core/wallet/ethers-adapters';

export interface AragonSDKContextValue {
  geoPluginContext?: GeoPluginBaseContext;
  baseClient?: Client;
  geoPluginClient?: GeoPluginClient;
}

const AragonSDKContext = createContext<AragonSDKContextValue | undefined>(undefined);

export const AragonSDKProvider = ({ children }: { children: React.ReactNode }) => {
  const [geoPluginContext, setGeoPluginContext] = useState<GeoPluginBaseContext | undefined>(undefined);
  const [geoPluginClient, setGeoPluginClient] = useState<GeoPluginClient | undefined>(undefined);

  const aragonSDKContextParams: ContextParams = useMemo(
    () => ({
      network: 'maticmum',
      daoFactoryAddress: '0xc715336B5E7F10294F36CA09f19A0493070E2eFB', // mumbai dao factory address
      web3Providers: ['https://rpc.ankr.com/eth_goerli'],
      ipfsNodes: [
        {
          url: 'https://testing-ipfs-0.aragon.network/api/v0',
          headers: { 'X-API-KEY': process.env.NEXT_PUBLIC_IPFS_KEY || '' },
        },
      ],
      graphqlNodes: [
        {
          url: 'https://subgraph.satsuma-prod.com/aragon/osx-mumbai/api',
        },
      ],
    }),
    []
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

  console.log('geoPluginContext', geoPluginContext);
  console.log('geoPluginClient', geoPluginClient);
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
