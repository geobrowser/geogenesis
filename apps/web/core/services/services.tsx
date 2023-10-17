'use client';

import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';

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

export const secondarySubgraph$ = observable<boolean>(false);
export const setSecondarySubgraphAsMain = (value: boolean) => {
  secondarySubgraph$.set(value);
};

export function ServicesProvider({ children }: Props) {
  const { chain } = useNetwork();
  const secondarySubgraph = useSelector(secondarySubgraph$);

  // Default to production chain
  const chainId = chain ? String(chain.id) : Environment.options.production.chainId;

  const services = useMemo((): Services => {
    let config = Environment.getConfig(chainId);
    const storageClient = new Storage.StorageClient(config.ipfs);

    if (secondarySubgraph) {
      config = {
        ...config,
        subgraph: config.permissionlessSubgraph,
      };
    }

    return {
      config,
      storageClient,
      subgraph: Subgraph,
      publish: Publish,
    };
  }, [chainId, secondarySubgraph]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const value = useContext(ServicesContext);

  if (!value) {
    throw new Error(`Missing ServicesProvider`);
  }

  return value;
}
