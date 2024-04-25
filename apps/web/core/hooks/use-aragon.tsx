'use client';

import { SupportedNetworks } from '@aragon/osx-commons-configs';
import { ContextParams } from '@aragon/sdk-client-common';
import { providers } from 'ethers';

import * as React from 'react';

import { useEthersSigner } from '../wallet/ethers-adapters';
import { DAO_FACTORY_ADDRESS, ENS_REGISTRY_ADDRESS } from '@geogenesis/sdk/contracts';

export function useAragon() {
  const ethersSigner = useEthersSigner();

  const sdkContextParams: ContextParams = React.useMemo(
    () => ({
      network: SupportedNetworks.LOCAL, // I don't think this matters
      signer: ethersSigner,
      web3Providers: new providers.JsonRpcProvider(process.env.NEXT_PUBLIC_CONDUIT_TESTNET_RPC),
      // DAOFactory: activeContractsList.polygon.DAOFactory, // polygon mainnet dao factory address
      // ENSRegistry: activeContractsList.polygon.ENSRegistry,
      DAOFactory: DAO_FACTORY_ADDRESS,
      ENSRegistry: ENS_REGISTRY_ADDRESS
    }),
    [ethersSigner]
  );

  return sdkContextParams;
}
