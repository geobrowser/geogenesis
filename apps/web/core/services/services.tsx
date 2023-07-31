'use client';

import * as React from 'react';
import { ReactNode, createContext, useContext, useMemo } from 'react';

import { useNetwork } from 'wagmi';

import { Environment } from '~/core/environment';
import { Publish, Storage, Subgraph } from '~/core/io';

type Services = {
  storageClient: Storage.IStorageClient;
  subgraph: Subgraph.ISubgraph;
  config: Environment.AppConfig;
  publish: Publish.IPublish;
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
    const storageClient = new Storage.StorageClient(config.ipfs);

    return {
      config,
      storageClient,
      subgraph: Subgraph,
      publish: Publish,
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
