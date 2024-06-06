'use client';

import { SupportedNetworks } from '@aragon/osx-commons-configs';
import { ContextParams } from '@aragon/sdk-client-common';
import { DAO_FACTORY_ADDRESS, ENS_REGISTRY_ADDRESS } from '@geogenesis/sdk/contracts';
import { providers } from 'ethers';

import * as React from 'react';

import { Environment } from '../environment';
import { useEthersSigner } from '../wallet/ethers-adapters';

export function useAragon() {
  const ethersSigner = useEthersSigner();

  const sdkContextParams: ContextParams = React.useMemo(
    () => ({
      network: SupportedNetworks.LOCAL, // I don't think this matters
      signer: ethersSigner,
      web3Providers: new providers.JsonRpcProvider(Environment.variables.rpcEndpoint),
      DAOFactory: DAO_FACTORY_ADDRESS,
      ENSRegistry: ENS_REGISTRY_ADDRESS,
    }),
    [ethersSigner]
  );

  return sdkContextParams;
}
