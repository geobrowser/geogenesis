import { SupportedNetworks } from '@aragon/osx-commons-configs';
import { activeContractsList } from '@aragon/osx-ethers';
import { ContextParams } from '@aragon/sdk-client';
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
      network: SupportedNetworks.POLYGON,
      signer: ethersSigner,
      web3Providers: new ethers.providers.AlchemyProvider(137, 'Qu7BVFD8_NIRN7eTsGus0GW7LneRT4u_'),
      DAOFactory: activeContractsList.polygon.DAOFactory, // polygon mainnet dao factory address
      ENSRegistry: activeContractsList.polygon.ENSRegistry,
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
