'use client';

import * as React from 'react';
import { ReactNode, createContext, useContext, useMemo } from 'react';

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
  const services = useMemo((): Services => {
    let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
    const storageClient = new Storage.StorageClient(config.ipfs);

    return {
      config,
      storageClient,
      subgraph: Subgraph,
      publish: Publish,
    };
  }, []);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const value = useContext(ServicesContext);

  if (!value) {
    throw new Error(`Missing ServicesProvider`);
  }

  return value;
}
