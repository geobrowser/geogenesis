'use client';

import { SupportedNetworks } from '@aragon/osx-commons-configs';
import { activeContractsList } from '@aragon/osx-ethers';
import { ContextParams } from '@aragon/sdk-client-common';
import { providers } from 'ethers';

import * as React from 'react';

import { useEthersSigner } from '../wallet/ethers-adapters';

export function useAragon() {
  const ethersSigner = useEthersSigner();

  const sdkContextParams: ContextParams = React.useMemo(
    () => ({
      network: SupportedNetworks.POLYGON,
      signer: ethersSigner,
      web3Providers: new providers.AlchemyProvider(137, 'Qu7BVFD8_NIRN7eTsGus0GW7LneRT4u_'),
      DAOFactory: activeContractsList.polygon.DAOFactory, // polygon mainnet dao factory address
      ENSRegistry: activeContractsList.polygon.ENSRegistry,
    }),
    [ethersSigner]
  );

  return sdkContextParams;
}
