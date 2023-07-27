'use client';

import * as React from 'react';
import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useNetwork } from 'wagmi';

import { Environment } from '~/core/environment';
import { Network } from '~/core/io';
import { StorageClient } from '~/core/io';
import { SpaceStore } from '~/core/state/spaces-store/space-store';

type Services = {
  network: Network.INetwork;
  spaceStore: SpaceStore;
};

const ServicesContext = createContext<Services | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function ServicesProvider({ children }: Props) {
  const { chain } = useNetwork();

  // Default to production chain
  const chainId = chain ? String(chain.id) : Environment.options.production.chainId;

  const services = useMemo((): Services => {
    const config = Environment.getConfig(chainId);
    const storageClient = new StorageClient(config.ipfs);
    const network = new Network.NetworkClient(storageClient, config.subgraph);

    return {
      network,
      spaceStore: new SpaceStore({
        api: network,
      }),
    };
  }, [chainId]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const value = useContext(ServicesContext);

  if (!value) {
    throw new Error(`Missing ServicesProvider`);
  }

  return value;
}
