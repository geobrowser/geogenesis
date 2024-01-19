import { Client, ContextParams } from '@aragon/sdk-client';
import { SupportedNetwork } from '@aragon/sdk-client-common';
import { ethers } from 'ethers';

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

  // console.log('ethers signer', ethersSigner);

  const aragonSDKContextParams: ContextParams = useMemo(
    () => ({
      network: SupportedNetwork.POLYGON,
      signer: ethersSigner,
      web3Providers: new ethers.providers.AlchemyProvider(137, 'Qu7BVFD8_NIRN7eTsGus0GW7LneRT4u_'),
      daoFactoryAddress: '0x392f0FdfF3283b9f026CfFeC7f9c2De443af3E7C', // polygon mainnet dao factory address
      ensRegistryAddress: '0x57bf333951967a0cC0afcD58FC7959Ca0Eae6905',
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
