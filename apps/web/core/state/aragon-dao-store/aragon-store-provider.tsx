import { ContextParams } from '@aragon/sdk-client';
import { SupportedNetwork } from '@aragon/sdk-client-common';
import { ethers } from 'ethers';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { useEthersSigner } from '~/core/wallet/ethers-adapters';

export interface AragonSDKContextValue {
  sdkContextParams?: ContextParams;
}

const AragonSDKContext = createContext<AragonSDKContextValue | undefined>(undefined);

export const AragonSDKProvider = ({ children }: { children: React.ReactNode }) => {
  const ethersSigner = useEthersSigner();

  const sdkContextParams: ContextParams = useMemo(
    () => ({
      network: SupportedNetwork.POLYGON,
      signer: ethersSigner,
      web3Providers: new ethers.providers.AlchemyProvider(137, 'Qu7BVFD8_NIRN7eTsGus0GW7LneRT4u_'),
      daoFactoryAddress: '0x392f0FdfF3283b9f026CfFeC7f9c2De443af3E7C', // polygon mainnet dao factory address
      ensRegistryAddress: '0x57bf333951967a0cC0afcD58FC7959Ca0Eae6905',
    }),
    [ethersSigner]
  );

  return <AragonSDKContext.Provider value={{ sdkContextParams }}>{children}</AragonSDKContext.Provider>;
};

export const useAragonSDKContext = () => {
  const value = useContext(AragonSDKContext);
  if (!value) {
    throw new Error('useAragonSDKContext must be used within a AragonSDKProvider');
  }
  return value;
};
